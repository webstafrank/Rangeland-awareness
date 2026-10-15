"""The GIBS client: what times exist, and the decoded values for one of them.

Two GIBS services, each for the one thing it does well:

    WMTS GetCapabilities   the time dimension of every layer, as ISO periods
                           ("2000-03-01/2025-03-01/P1M"), so "latest month on or
                           before asOf" is answered from what GIBS says it has
    WMS GetMap             one PNG for an arbitrary box and time, so a request
                           is one call rather than a mosaic of 512px tiles

WMS 1.1.1, not 1.3.0, on purpose. 1.3.0 with EPSG:4326 takes the bounding box
latitude first; 1.1.1 takes it longitude first, like every other coordinate in
this service. Asking 1.3.0 for "39.9,-1.6,40.1,-1.4" returns a valid,
plausible image of somewhere off the coast of Somalia.

**A missing time is not an error at GIBS.** Asking for MODIS NDVI on 2025-04-01
(a month GIBS does not have) answers 200 with a fully transparent PNG. That is
why availability comes from the capabilities document and never from "did the
request succeed", and why an all-transparent answer is reported as no data.

**The cache.** A forecast run reads about 400 PNGs (four layers, 99 months),
roughly 1s each from GIBS. Published months never change, so each PNG is kept
on disk under ``WORKSPACE_DIR/gibs-cache``, keyed by (layer, time, bbox, size),
and a second run over the same area reads none of them over the network. Boxes
are snapped outward to the layer's own pixel lattice before keying (see
`catalog.TMS_DEGREES`), which both makes GIBS return unresampled pixels and
makes two runs over nearby areas share files. The capabilities document is
cached for `CAPABILITIES_TTL_S`, because new months do appear.
"""

from __future__ import annotations

import hashlib
import logging
import math
import os
import re
import tempfile
import threading
import time
import uuid
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Iterable

import numpy as np
import requests

from apps.analysis.satellite.catalog import SatelliteLayer
from apps.analysis.satellite.colormap import Colormap, parse_colormap

log = logging.getLogger(__name__)

GIBS_BASE = "https://gibs.earthdata.nasa.gov"
WMTS_CAPABILITIES = f"{GIBS_BASE}/wmts/epsg4326/best/1.0.0/WMTSCapabilities.xml"
WMS_ENDPOINT = f"{GIBS_BASE}/wms/epsg4326/best/wms.cgi"

CAPABILITIES_TTL_S = 6 * 3600
#: A GetMap larger than this in either direction is coarsened rather than sent:
#: GIBS refuses very large WMS requests, and a county at 1km is ~300px anyway.
MAX_REQUEST_PX = 4096
REQUEST_TIMEOUT_S = 60
RETRIES = 3

_WMTS_NS = {
    "wmts": "http://www.opengis.net/wmts/1.0",
    "ows": "http://www.opengis.net/ows/1.1",
}
_PERIOD = re.compile(r"^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)D)?$")


class GibsError(RuntimeError):
    """GIBS could not be reached or answered something unusable."""


@dataclass(frozen=True)
class Snapshot:
    """One layer at one time over one box, decoded."""

    layer: SatelliteLayer
    when: date
    #: (minlon, minlat, maxlon, maxlat), the snapped box the values cover.
    bbox: tuple[float, float, float, float]
    #: float32, rows north to south, NaN where there is no value.
    values: np.ndarray
    #: Opaque pixels whose colour is in no colormap entry (see colormap.py).
    unknown_colours: int

    @property
    def empty(self) -> bool:
        return not np.isfinite(self.values).any()


# ------------------------------------------------------------------ the time

def expand_time_values(values: Iterable[str]) -> list[date]:
    """Every date a WMTS ``<Dimension>`` advertises, sorted.

    Each value is a single date or ``start/end/period``. A daily layer over 26
    years expands to ~9,500 dates, which is small enough that enumerating beats
    writing interval arithmetic for "latest on or before".
    """
    out: set[date] = set()
    for raw in values:
        text = raw.strip()
        if not text:
            continue
        parts = text.split("/")
        if len(parts) == 1:
            out.add(_parse_date(parts[0]))
            continue
        if len(parts) != 3:
            raise GibsError(f"unreadable time value {raw!r}")
        start, end = _parse_date(parts[0]), _parse_date(parts[1])
        years, months, days = _parse_period(parts[2])
        current = start
        while current <= end:
            out.add(current)
            current = _step(current, years, months, days)
    return sorted(out)


def latest_on_or_before(times: list[date], when: date) -> date | None:
    """The newest available date not after ``when``; None if there is none."""
    best = None
    for candidate in times:
        if candidate <= when:
            best = candidate
        else:
            break
    return best


def parse_time_dimensions(xml: bytes, layer_ids: Iterable[str]) -> dict[str, list[date]]:
    """The time dimension of each named layer in a WMTS capabilities document.

    A layer that is absent from the document maps to an empty list rather than
    raising: GIBS retires layers, and the caller turns "no times" into a dropped
    feature with a warning, which is the contract's rule for missing coverage.
    """
    wanted = set(layer_ids)
    found: dict[str, list[date]] = {layer: [] for layer in wanted}
    root = ET.fromstring(xml)
    for layer in root.iter(f"{{{_WMTS_NS['wmts']}}}Layer"):
        identifier = layer.find("ows:Identifier", _WMTS_NS)
        if identifier is None or identifier.text not in wanted:
            continue
        for dimension in layer.findall("wmts:Dimension", _WMTS_NS):
            ident = dimension.find("ows:Identifier", _WMTS_NS)
            if ident is None or (ident.text or "").lower() != "time":
                continue
            values = [v.text or "" for v in dimension.findall("wmts:Value", _WMTS_NS)]
            found[identifier.text] = expand_time_values(values)
    return found


def _parse_date(text: str) -> date:
    return date.fromisoformat(text.strip()[:10])


def _parse_period(text: str) -> tuple[int, int, int]:
    match = _PERIOD.match(text.strip())
    if match is None or not any(match.groups()):
        raise GibsError(f"unsupported period {text!r}")
    years, months, days = (int(g) if g else 0 for g in match.groups())
    return years, months, days


def _step(current: date, years: int, months: int, days: int) -> date:
    from datetime import timedelta

    if years or months:
        total = current.month - 1 + months + 12 * years
        year = current.year + total // 12
        month = total % 12 + 1
        # GIBS monthly and yearly periods start on day 1, so clamping the day is
        # never exercised in practice; it keeps a "2020-01-31/P1M" from raising.
        day = min(current.day, 28)
        current = date(year, month, day)
    if days:
        current = current + timedelta(days=days)
    return current


# ------------------------------------------------------------------ the box

def snap_bbox(
    bbox: tuple[float, float, float, float], degrees_per_pixel: float
) -> tuple[tuple[float, float, float, float], int, int]:
    """Snap a lon/lat box outward to the layer lattice; return it and its size.

    The lattice is anchored at (-180, 90), the top-left of GIBS's EPSG:4326
    tile matrix. If the box would exceed `MAX_REQUEST_PX`, the pixel size is
    doubled until it fits, which keeps it on a coarser level of the same
    lattice.
    """
    minx, miny, maxx, maxy = bbox
    step = degrees_per_pixel
    while True:
        snapped_minx = -180.0 + math.floor((minx + 180.0) / step) * step
        snapped_maxx = -180.0 + math.ceil((maxx + 180.0) / step) * step
        snapped_maxy = 90.0 - math.floor((90.0 - maxy) / step) * step
        snapped_miny = 90.0 - math.ceil((90.0 - miny) / step) * step
        width = max(1, int(round((snapped_maxx - snapped_minx) / step)))
        height = max(1, int(round((snapped_maxy - snapped_miny) / step)))
        if width <= MAX_REQUEST_PX and height <= MAX_REQUEST_PX:
            return (snapped_minx, snapped_miny, snapped_maxx, snapped_maxy), width, height
        step *= 2


# ---------------------------------------------------------------- the client

class GibsClient:
    """Reads GIBS. Constructed per run; the caches are on disk, not on it."""

    def __init__(self, cache_dir: Path | str, *, timeout: float = REQUEST_TIMEOUT_S):
        self.cache_dir = Path(cache_dir)
        self.timeout = timeout
        self._local = threading.local()
        self._times: dict[str, list[date]] | None = None
        self._colormaps: dict[str, Colormap] = {}
        self._lock = threading.Lock()

    # -------------------------------------------------------------- http

    def _session(self) -> requests.Session:
        # One session per thread: requests.Session shares a connection pool that
        # is not documented as thread-safe, and the fetches run in a pool.
        session = getattr(self._local, "session", None)
        if session is None:
            session = requests.Session()
            self._local.session = session
        return session

    def _get(self, url: str, params: dict | None = None) -> requests.Response:
        last: Exception | None = None
        for attempt in range(RETRIES):
            try:
                response = self._session().get(url, params=params, timeout=self.timeout)
            except requests.RequestException as exc:
                last = exc
            else:
                if response.status_code < 500:
                    if response.status_code >= 400:
                        raise GibsError(
                            f"{url} answered {response.status_code}: {response.text[:200]}"
                        )
                    return response
                last = GibsError(f"{url} answered {response.status_code}")
            # GIBS sits behind CloudFront and the occasional 502/503 is transient.
            time.sleep(1.5 * (attempt + 1))
        raise GibsError(f"GIBS is unreachable: {last}")

    # ------------------------------------------------------------- times

    def times(self, layer: SatelliteLayer) -> list[date]:
        with self._lock:
            if self._times is None:
                from apps.analysis.satellite.catalog import ALL

                xml = self._capabilities()
                self._times = parse_time_dimensions(
                    xml, [entry.gibs_layer for entry in ALL.values()]
                )
            return self._times.get(layer.gibs_layer, [])

    def _capabilities(self) -> bytes:
        path = self.cache_dir / "WMTSCapabilities.xml"
        if path.exists() and time.time() - path.stat().st_mtime < CAPABILITIES_TTL_S:
            return path.read_bytes()
        try:
            data = self._get(WMTS_CAPABILITIES).content
        except GibsError:
            if path.exists():
                # A stale list of months beats no run at all, and the months it
                # names are still there: GIBS adds months, it does not remove them.
                log.warning("GIBS capabilities unreachable; using the cached copy")
                return path.read_bytes()
            raise
        _atomic_write(path, data)
        return data

    # ---------------------------------------------------------- colormaps

    def colormap(self, layer: SatelliteLayer) -> Colormap:
        with self._lock:
            cached = self._colormaps.get(layer.colormap)
        if cached is not None:
            return cached
        path = self.cache_dir / "colormaps" / f"{layer.colormap}.xml"
        if path.exists():
            data = path.read_bytes()
        else:
            data = self._get(layer.colormap_url).content
            _atomic_write(path, data)
        parsed = parse_colormap(data, layer.colormap)
        with self._lock:
            self._colormaps[layer.colormap] = parsed
        return parsed

    # ------------------------------------------------------------- pixels

    def png(self, layer: SatelliteLayer, when: date, bbox, width: int, height: int) -> bytes:
        key = hashlib.sha256(
            f"{layer.gibs_layer}|{when.isoformat()}|"
            f"{','.join(f'{v:.6f}' for v in bbox)}|{width}x{height}".encode()
        ).hexdigest()[:20]
        path = self.cache_dir / layer.gibs_layer / when.isoformat() / f"{key}.png"
        if path.exists():
            return path.read_bytes()

        response = self._get(
            WMS_ENDPOINT,
            {
                "SERVICE": "WMS",
                "VERSION": "1.1.1",
                "REQUEST": "GetMap",
                "LAYERS": layer.gibs_layer,
                "STYLES": "",
                "SRS": "EPSG:4326",
                "BBOX": ",".join(f"{v:.10f}" for v in bbox),
                "WIDTH": width,
                "HEIGHT": height,
                "FORMAT": "image/png",
                "TRANSPARENT": "TRUE",
                "TIME": when.isoformat(),
            },
        )
        content_type = response.headers.get("Content-Type", "")
        if "png" not in content_type:
            # WMS reports errors as a 200 with an XML body, like GeoServer.
            raise GibsError(
                f"GIBS refused {layer.gibs_layer} {when}: {response.text[:200]}"
            )
        _atomic_write(path, response.content)
        return response.content

    def snapshot(self, layer: SatelliteLayer, when: date, bbox) -> Snapshot:
        """Fetch (or read from cache) and decode one layer at one time."""
        snapped, width, height = snap_bbox(bbox, layer.degrees_per_pixel)
        data = self.png(layer, when, snapped, width, height)
        rgba = decode_png(data)
        values, unknown = self.colormap(layer).decode(rgba)
        if layer.convert is not None:
            # The converters are plain arithmetic, so they apply to an array as
            # well as to a float; NaN stays NaN through both.
            values = np.asarray(
                layer.convert(values.astype(np.float64)), dtype=np.float32
            )
        return Snapshot(
            layer=layer, when=when, bbox=snapped, values=values, unknown_colours=unknown
        )


def decode_png(data: bytes) -> np.ndarray:
    """PNG bytes -> (rows, cols, 4) uint8 RGBA, via GDAL's PNG driver.

    GDAL rather than Pillow because GDAL is already the whole raster toolbox
    here and Pillow is not installed. A palette PNG is expanded to RGBA by
    asking GDAL for the colour table, which is how GIBS sometimes encodes
    classification layers.
    """
    from osgeo import gdal

    gdal.UseExceptions()
    path = f"/vsimem/gibs_{uuid.uuid4().hex}.png"
    gdal.FileFromMemBuffer(path, data)
    try:
        dataset = gdal.Open(path)
        try:
            bands = dataset.RasterCount
            first = dataset.GetRasterBand(1)
            table = first.GetColorTable()
            if bands == 1 and table is not None:
                indices = first.ReadAsArray()
                lut = np.array(
                    [table.GetColorEntry(i) for i in range(table.GetCount())],
                    dtype=np.uint8,
                )
                rgba = lut[indices]
            else:
                planes = [dataset.GetRasterBand(i + 1).ReadAsArray() for i in range(bands)]
                if bands == 1:
                    planes = planes * 3
                if len(planes) == 3:
                    planes.append(np.full_like(planes[0], 255))
                rgba = np.stack(planes[:4], axis=-1).astype(np.uint8)
            first = None
        finally:
            dataset = None
    finally:
        gdal.Unlink(path)
    return rgba


def _atomic_write(path: Path, data: bytes) -> None:
    """Write via a temporary file and rename, so a crash never leaves a half
    PNG in the cache that every later run would decode as garbage."""
    path.parent.mkdir(parents=True, exist_ok=True)
    handle, temporary = tempfile.mkstemp(dir=path.parent, suffix=".part")
    try:
        with os.fdopen(handle, "wb") as stream:
            stream.write(data)
        os.replace(temporary, path)
    except BaseException:
        if os.path.exists(temporary):
            os.unlink(temporary)
        raise
