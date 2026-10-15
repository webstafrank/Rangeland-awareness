"""Result maps: what a finished run can draw, and the pixels behind it.

A run leaves GeoTIFFs in its workspace (`rasters` in the stored result). This
module turns them into three things the app can use without knowing what
produced them, per `contracts/prediction.md` "Result maps":

  maps        the list of drawable maps, each with a legend, a tile URL and a
              download URL, built from `rasters` alone
  tiles       a transparent PNG of one map for one EPSG:3857 box, warped and
              coloured here with the same legend the app draws its key from
  downloads   the GeoTIFF itself, resolved inside the run's workspace only

One legend table drives both the `maps` JSON and the tile colours. Two copies
(one in the app, one here) would be the classic way to ship a key that does not
match the map, and nobody notices that until a decision has been made off it.

The tiles are rendered here rather than published to GeoServer because this
deployment has no GeoServer write credentials (the `publish` stage is always
skipped). The run's rasters never change after it succeeds, so a tile is
cacheable for a day.

What a tile costs depends entirely on overviews. A 30 m county result is about
9000x11000 pixels; without overviews a zoomed-out 256x256 tile makes the warper
read and decode every one of those ~100M source pixels, which was measured at
3-4 s and ~550 MB per tile, and 11 s for the nine tiles of one opening view.
With overviews the warper reads the level closest to the tile's resolution and
the same tile is tens of milliseconds. So every raster drawn here gets
overviews (`build_overviews`): the pipeline builds them right after writing,
and a tile request builds them first if a raster somehow has none (results
written before this existed).
"""

from __future__ import annotations

import fcntl
import logging
import math
import os
import re
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
from django.conf import settings
from osgeo import gdal

gdal.UseExceptions()

log = logging.getLogger(__name__)

#: Half the width of the Web Mercator world, in metres. A BBOX beyond this (plus
#: a metre of slack for clients that round outwards) is not a place on Earth,
#: and the contract answers 400 for it rather than an empty tile.
MERCATOR_LIMIT = 20037508.342789244 + 1.0

#: What a BBOX coordinate and a tile size may look like. Python's `float` and
#: `int` are far more lenient than a query string should be: they take Arabic
#: and Devanagari digits, `+256`, `1_000`, surrounding spaces, `inf` and `nan`.
#: Each of those reaching GDAL is a request no real map client sends, so the
#: grammar is written down, in ASCII, rather than inherited from Python.
_NUMBER = re.compile(r"-?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][-+]?[0-9]+)?", re.ASCII)
_SIZE = re.compile(r"[0-9]{1,4}", re.ASCII)

#: A raster at most this many pixels on its longer side gets no overviews: the
#: warper reads all of it in a few milliseconds anyway, and the prediction
#: example (920x1210) is just above it, so real prediction rasters still get
#: them.
OVERVIEW_MIN_SIZE = 1024

#: Overviews stop once the coarsest level fits in one tile.
OVERVIEW_TARGET = 256

#: The largest tile edge, in pixels. Leaflet asks for 256 (512 on a retina
#: screen); 1024 leaves room for a print export. Without a cap one request for
#: 30000x30000 makes this process allocate 3.6GB of RGBA.
MAX_TILE_SIZE = 1024

#: A day. A succeeded run's rasters are immutable, and a run id is a hash of
#: its configuration, so the same URL can never mean different pixels.
TILE_MAX_AGE = 86400

#: The probability ramp, exactly as the contract states it. ColorBrewer RdYlBu,
#: reversed so that blue is safe and red is at risk: the convention a risk map
#: is read with, and distinguishable for the common colour-vision deficiencies.
PROBABILITY_STOPS: tuple[tuple[float, str], ...] = (
    (0.0, "#2c7bb6"),
    (0.25, "#abd9e9"),
    (0.5, "#ffffbf"),
    (0.75, "#fdae61"),
    (1.0, "#d7191c"),
)

#: The five class colours are the five probability stops. That is ColorBrewer's
#: own five-class RdYlBu, and it means "Very high" on the classes map is the
#: same red as probability 1.0 on the probability map, so switching between the
#: two never changes what a colour means.
CLASS_COLORS: tuple[str, ...] = tuple(color for _, color in PROBABILITY_STOPS)

#: The labels a class raster gets when the stored result has no `classes`
#: table to name them. Both pipelines use these words today; the stored table
#: wins when present so a result is always read in its own vocabulary.
DEFAULT_CLASS_LABELS: tuple[str, ...] = ("Very low", "Low", "Moderate", "High", "Very high")

#: Disagreement is |RF - XGBoost|, not a risk, so it must not borrow the risk
#: ramp: a red patch would read as danger when it means "the models argue".
#: A single-hue purple sequential ramp (ColorBrewer Purples) says "more of
#: something" without saying "worse".
DISAGREEMENT_STOPS: tuple[tuple[float, str], ...] = (
    (0.0, "#f2f0f7"),
    (0.25, "#cbc9e2"),
    (0.5, "#9e9ac8"),
    (0.75, "#756bb1"),
    (1.0, "#54278f"),
)


@dataclass(frozen=True)
class MapSpec:
    """One drawable map: the raster it reads and how its values become colour."""

    id: str
    label: str
    legend: dict[str, Any]

    @property
    def is_classes(self) -> bool:
        return self.legend["type"] == "classes"


class MapError(Exception):
    """A request the map endpoints refuse, with the HTTP status that says why."""

    def __init__(self, message: str, status: int) -> None:
        super().__init__(message)
        self.message = message
        self.status = status


# ------------------------------------------------------------------ the list


def result_kind(result: dict[str, Any]) -> str:
    """`prediction` or `overlay`. A result stored before `kind` existed is an
    overlay, because the overlay was the only kind there was."""
    kind = result.get("kind")
    return kind if isinstance(kind, str) and kind else "overlay"


def _continuous(stops: tuple[tuple[float, str], ...], unit: str) -> dict[str, Any]:
    return {
        "type": "continuous",
        "min": 0,
        "max": 1,
        "unit": unit,
        "stops": [[value, color] for value, color in stops],
    }


def _class_labels(result: dict[str, Any]) -> list[str]:
    """Class labels from the result's own `classes` table, by class value.

    Read by `class` number, not by list position: a table that omits an empty
    class, or lists them in another order, must still label class 5 as class
    5's label. Anything missing or malformed falls back to the default word.
    """
    labels = list(DEFAULT_CLASS_LABELS)
    for row in result.get("classes") or []:
        if not isinstance(row, dict):
            continue
        value, label = row.get("class"), row.get("label")
        if isinstance(value, int) and 1 <= value <= len(labels) and isinstance(label, str) and label:
            labels[value - 1] = label
    return labels


def map_specs(result: dict[str, Any]) -> list[MapSpec]:
    """The maps a result can draw, in the order the app should offer them.

    Only maps whose raster the result lists. A raster that is listed but not
    one of the known maps (the overlay's continuous `index`, which is on a 1..5
    scale and has no agreed legend) is downloadable but not drawn: a legend
    invented here for it would be a claim about its meaning the contract does
    not make.
    """
    rasters = valid_rasters(result)
    specs: list[MapSpec] = []
    if "probability" in rasters:
        specs.append(MapSpec("probability", "Probability", _continuous(PROBABILITY_STOPS, "probability")))
    for member, label in (("random-forest", "Random Forest probability"), ("xgboost", "XGBoost probability")):
        if f"probability-{member}" in rasters:
            specs.append(
                MapSpec(f"probability-{member}", label, _continuous(PROBABILITY_STOPS, "probability"))
            )
    if "classes" in rasters:
        labels = _class_labels(result)
        specs.append(
            MapSpec(
                "classes",
                "Probability classes" if result_kind(result) == "prediction" else "Index classes",
                {
                    "type": "classes",
                    "items": [
                        {"value": i + 1, "label": labels[i], "color": CLASS_COLORS[i]}
                        for i in range(len(CLASS_COLORS))
                    ],
                },
            )
        )
    if "disagreement" in rasters:
        specs.append(
            MapSpec(
                "disagreement",
                "Model disagreement",
                _continuous(DISAGREEMENT_STOPS, "absolute probability difference"),
            )
        )
    return specs


def maps_json(run_id: str, result: dict[str, Any]) -> list[dict[str, Any]]:
    """`maps` for the result response. Paths are relative to the backend base
    URL; `{bbox-epsg-3857}` is the literal placeholder OpenLayers and Leaflet
    WMS sources substitute."""
    return [
        {
            "id": spec.id,
            "label": spec.label,
            "tiles": (
                f"/api/v1/runs/{run_id}/tiles/{spec.id}"
                "?BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256"
            ),
            "download": f"/api/v1/runs/{run_id}/rasters/{spec.id}.tif",
            "legend": spec.legend,
        }
        for spec in map_specs(result)
    ]


def valid_rasters(result: dict[str, Any]) -> dict[str, str]:
    """`rasters` reduced to the entries that can name a file: key to file name.

    The single sanitised view that `maps`, the `rasters` echoed in the result,
    the tile endpoint and the download endpoint all read. Deriving each from the
    raw dict separately is how a result with `{"classes": 5}` once offered a
    classes map whose tiles and download were both 404.

    Stored values are reduced to their basename. A result stored before the
    change holds absolute paths like `/tmp/rangeland-workspace/r_.../classes.tif`;
    echoing those tells any caller the server's directory layout, and the file
    is only ever looked for in the run's own workspace anyway (`raster_path`).
    """
    rasters = result.get("rasters")
    if not isinstance(rasters, dict):
        return {}
    clean: dict[str, str] = {}
    for key, value in rasters.items():
        if not isinstance(key, str) or not key or not isinstance(value, str) or not value:
            continue
        filename = Path(value.replace("\\", "/")).name
        if filename in ("", ".", ".."):
            continue
        clean[key] = filename
    return clean


def public_rasters(result: dict[str, Any]) -> dict[str, str]:
    """`rasters` as the contract shows it: file names, not server paths."""
    return valid_rasters(result)


# -------------------------------------------------------------- the raster


def workspace_dir(run: Any) -> Path:
    """The run's workspace. The stored one when the runner recorded it, else
    where the runner would have put it. Not created: a read must not make
    directories."""
    if getattr(run, "workspace", ""):
        return Path(run.workspace)
    return Path(settings.WORKSPACE_DIR) / run.run_id


def raster_path(run: Any, result: dict[str, Any], name: str) -> Path:
    """The file behind `rasters[name]`, proven to be inside the run's workspace.

    `name` is looked up as a key, never used as a path, so a URL cannot name a
    file the result does not list. The stored value is then reduced to its
    basename, which is what makes legacy absolute paths work (the file is
    looked for in the workspace, never at the stored path) and what stops a
    tampered value like `../../etc/passwd` from leaving it. Finally the fully
    resolved path, symlinks followed, must still be under the resolved
    workspace: a symlink planted in the workspace pointing outside it is
    refused here rather than served.
    """
    filename = valid_rasters(result).get(name)
    if filename is None:
        raise MapError(f'This run has no raster "{name}".', 404)

    workspace = workspace_dir(run)
    try:
        root = workspace.resolve(strict=True)
        candidate = (workspace / filename).resolve(strict=True)
    except (FileNotFoundError, RuntimeError, OSError):
        raise MapError(f'The raster "{name}" is no longer on this server.', 404) from None
    if not candidate.is_relative_to(root) or not candidate.is_file():
        raise MapError(f'This run has no raster "{name}".', 404)
    return candidate


# ------------------------------------------------------------------ tiles


def parse_tile_request(params: Any) -> tuple[tuple[float, float, float, float], int, int]:
    """BBOX, WIDTH and HEIGHT from a query string, or a 400 saying which is bad.

    Upper and lower case both accepted, the same leniency as the layer tile
    proxy, because WMS clients disagree about which to send.
    """

    def get(key: str) -> str | None:
        return params.get(key, params.get(key.lower()))

    raw_bbox = get("BBOX")
    if not raw_bbox:
        raise MapError("BBOX is required (EPSG:3857 metres, minx,miny,maxx,maxy).", 400)
    texts = raw_bbox.split(",")
    if len(texts) != 4 or not all(_NUMBER.fullmatch(t) for t in texts):
        raise MapError("BBOX must be four numbers: minx,miny,maxx,maxy.", 400)
    parts = [float(t) for t in texts]
    if not all(math.isfinite(p) and abs(p) <= MERCATOR_LIMIT for p in parts):
        # Finite is not enough: 1e300 is finite and is not on Earth.
        raise MapError(
            "BBOX must lie within the Web Mercator world (EPSG:3857, "
            "about +-20037508 metres).",
            400,
        )
    minx, miny, maxx, maxy = parts
    if not (minx < maxx and miny < maxy):
        raise MapError("BBOX must have minx < maxx and miny < maxy.", 400)

    def size(key: str) -> int:
        raw = get(key)
        if raw is None:
            # Absent means the default. Present but empty (`WIDTH=`) is a
            # client bug, and silently drawing 256 would hide it.
            return 256
        if not _SIZE.fullmatch(raw):
            raise MapError("WIDTH and HEIGHT must be whole numbers in ASCII digits.", 400)
        return int(raw)

    width, height = size("WIDTH"), size("HEIGHT")
    if not (1 <= width <= MAX_TILE_SIZE and 1 <= height <= MAX_TILE_SIZE):
        raise MapError(f"WIDTH and HEIGHT must be between 1 and {MAX_TILE_SIZE}.", 400)
    return (minx, miny, maxx, maxy), width, height


def _hex_rgb(color: str) -> tuple[int, int, int]:
    color = color.lstrip("#")
    return int(color[0:2], 16), int(color[2:4], 16), int(color[4:6], 16)


def colorize(values: np.ndarray, spec: MapSpec) -> np.ndarray:
    """RGBA (height, width, 4) uint8 for a 2-D array of raster values.

    NaN is transparent, and so is anything a legend has no colour for: a class
    value outside 1..5, or a continuous value outside min..max. Clamping an
    out-of-range value to the end colour would paint a pipeline bug as "very
    high risk", which is the one direction a risk map must never err in.
    """
    rgba = np.zeros(values.shape + (4,), dtype=np.uint8)
    finite = np.isfinite(values)

    if spec.is_classes:
        rounded = np.where(finite, np.rint(np.where(finite, values, 0)), 0).astype(np.int64)
        for item in spec.legend["items"]:
            hit = finite & (rounded == item["value"])
            rgba[hit, :3] = _hex_rgb(item["color"])
            rgba[hit, 3] = 255
        return rgba

    low, high = float(spec.legend["min"]), float(spec.legend["max"])
    # A tolerance on the range so bilinear rounding (0.9999999 vs 1.0000001)
    # at the ends is drawn rather than dropped.
    eps = 1e-6
    valid = finite & (values >= low - eps) & (values <= high + eps)
    stops = spec.legend["stops"]
    xs = np.array([s[0] for s in stops], dtype=np.float64)
    channels = np.array([_hex_rgb(s[1]) for s in stops], dtype=np.float64)
    v = np.clip(np.where(valid, values, low), low, high).astype(np.float64)
    for c in range(3):
        rgba[..., c] = np.rint(np.interp(v, xs, channels[:, c])).astype(np.uint8)
    rgba[..., 3] = np.where(valid, 255, 0).astype(np.uint8)
    rgba[~valid, :3] = 0
    return rgba


def warp_tile(
    path: Path, bbox: tuple[float, float, float, float], width: int, height: int, *, nearest: bool
) -> np.ndarray:
    """The raster resampled onto an EPSG:3857 box, as float64 with NaN for no data.

    Nearest for classes (bilinear would invent class 2.5 between a 2 and a 3)
    and bilinear for continuous values. The source nodata is honoured by the
    warper, so a nodata pixel never bleeds into its neighbours' interpolation,
    and everything outside the raster's footprint comes back as the
    destination nodata, which is NaN here.

    A raster with no coordinate system is refused rather than drawn. The
    warper cannot place it, so it would answer a fully transparent tile, which
    says "no data here" when the truth is "this file is broken".

    The warper reads overviews on its own when the tile is coarser than the
    raster (gdalwarp's `-ovr AUTO`), which is what makes `build_overviews`
    pay off without anything here asking for them.

    GDAL raises RuntimeError (UseExceptions is on) for an unreadable file; the
    caller turns that into a JSON answer.
    """
    source = gdal.Open(str(path))
    if source.GetSpatialRef() is None or source.GetGeoTransform(can_return_null=True) is None:
        raise MapError("The raster for this map has no coordinate system, so it cannot be placed.", 500)
    band = source.GetRasterBand(1)
    extra: dict[str, Any] = {}
    if band.GetNoDataValue() is None and band.DataType in (gdal.GDT_Float32, gdal.GDT_Float64):
        # A float raster that marks missing pixels with NaN but never declared
        # it: without this, bilinear smears each NaN over its neighbours and
        # the hole in the tile is about four times the missing pixel.
        extra["srcNodata"] = float("nan")

    # MEM, so the warped tile never touches a file; the name is ignored.
    dataset = gdal.Warp(
        "",
        source,
        options=gdal.WarpOptions(
            format="MEM",
            dstSRS="EPSG:3857",
            outputBounds=bbox,
            width=width,
            height=height,
            resampleAlg="near" if nearest else "bilinear",
            outputType=gdal.GDT_Float32,
            dstNodata=float("nan"),
            **extra,
        ),
    )
    values = dataset.GetRasterBand(1).ReadAsArray().astype(np.float64)
    dataset = None
    source = None
    return values


# -------------------------------------------------------------- overviews


def overview_levels(width: int, height: int) -> list[int]:
    """2, 4, 8, ... until the coarsest level fits in one 256 px tile, or an
    empty list for a raster small enough to need none."""
    longest = max(width, height)
    if longest <= OVERVIEW_MIN_SIZE:
        return []
    levels, factor = [], 2
    while True:
        levels.append(factor)
        if longest / factor <= OVERVIEW_TARGET:
            return levels
        factor *= 2


def overview_resampling(kind: str) -> str:
    """NEAREST for a class raster, AVERAGE for anything continuous.

    Averaging classes 1 and 5 would invent a 3 that no pixel has. NEAREST rather
    than MODE because the tile warp itself samples classes with nearest: a
    zoomed-out tile then shows the same kind of sample as a zoomed-in one, and
    NEAREST builds in a fraction of MODE's time on a 100M pixel raster.
    AVERAGE skips nodata, so a hole does not darken its neighbours' average.
    """
    return "NEAREST" if kind == "classes" else "AVERAGE"


def _overview_count(path: Path) -> tuple[int, list[int]]:
    dataset = gdal.Open(str(path))
    try:
        band = dataset.GetRasterBand(1)
        return band.GetOverviewCount(), overview_levels(dataset.RasterXSize, dataset.RasterYSize)
    finally:
        dataset = None


def build_overviews(path: str | os.PathLike[str], kind: str) -> bool:
    """Give a raster overviews, once, safely under concurrent callers.

    `kind` is `"classes"` for a class raster and anything else (`"continuous"`,
    or the map id) for continuous values; see `overview_resampling`. The
    pipeline calls this right after writing each drawable raster, and the tile
    endpoint calls it before the first tile of a raster that has none. Returns
    whether the raster has overviews afterwards (False only for a raster too
    small to need them).

    External `.ovr`, not internal overviews, and that is what makes the lazy
    build safe. Internal overviews mean rewriting the GeoTIFF in place while
    other requests may be reading it, and a download could stream a file
    mid-rewrite. An `.ovr` is a separate file GDAL finds beside the raster on
    open, so it can be built under a temporary name and moved into place with
    one atomic rename: a reader sees either no overviews or complete ones, and
    the raster the download serves is never touched.

    The temporary name is a symlink to the raster. GDAL writes overviews for a
    read-only dataset to `<the name it was opened as>.ovr`, so opening the
    raster through `.<name>.<random>.tmp.tif` puts the half-built file there,
    beside the real one on the same filesystem, where `os.replace` is atomic.

    An exclusive `flock` on a lock file beside the raster serialises builders
    across threads and across worker processes (flock locks conflict between
    separate open file descriptions, even within one process). A caller that
    waited re-checks after taking the lock and finds the work done.
    """
    path = Path(path)
    count, levels = _overview_count(path)
    if not levels:
        return False
    if count > 0:
        return True

    lock_path = path.parent / f".{path.name}.ovr.lock"
    with open(lock_path, "a") as lock:
        fcntl.flock(lock.fileno(), fcntl.LOCK_EX)
        try:
            if _overview_count(path)[0] > 0:
                return True
            _build_ovr_file(path, levels, overview_resampling(kind))
        finally:
            fcntl.flock(lock.fileno(), fcntl.LOCK_UN)
    return True


def build_overviews_quietly(path: str | os.PathLike[str], kind: str) -> None:
    """`build_overviews` for a pipeline that has just written a raster.

    A run whose numbers are computed must not fail because a speed-up could not
    be built (a full disk, a read-only mount): the tile endpoint builds them
    lazily later, or draws slowly without them. So the failure is logged and
    the run goes on.
    """
    try:
        build_overviews(path, kind)
    except (OSError, RuntimeError):
        log.warning("Could not build overviews for %s", path, exc_info=True)


def _build_ovr_file(path: Path, levels: list[int], resampling: str) -> None:
    """Build `<path>.ovr` under a temporary name and rename it into place."""
    temp = path.parent / f".{path.name}.{uuid.uuid4().hex}.tmp.tif"
    temp_ovr = Path(f"{temp}.ovr")
    os.symlink(path.name, temp)
    try:
        options = {
            "COMPRESS_OVERVIEW": "LZW",
            # A 9000x11000 Float32 raster's overviews are ~130 MB; BigTIFF only
            # when they could pass 4 GB, so the common case stays plain TIFF.
            "BIGTIFF_OVERVIEW": "IF_SAFER",
        }
        with gdal.config_options(options, thread_local=True):
            dataset = gdal.Open(str(temp))
            dataset.BuildOverviews(resampling, levels)
            dataset = None
        os.replace(temp_ovr, f"{path}.ovr")
    finally:
        for leftover in (temp, temp_ovr, Path(f"{temp}.aux.xml")):
            try:
                os.unlink(leftover)
            except FileNotFoundError:
                pass


def encode_png(rgba: np.ndarray) -> bytes:
    """PNG bytes for an RGBA array, through GDAL rather than Pillow.

    GDAL is already a dependency and has a PNG writer; adding Pillow for one
    encoder is a second imaging stack to install and keep patched. MEM holds
    the bands, the PNG driver's CreateCopy writes into /vsimem, and the bytes
    are read back and the virtual file removed.
    """
    height, width = rgba.shape[:2]
    mem = gdal.GetDriverByName("MEM").Create("", width, height, 4, gdal.GDT_Byte)
    for band in range(4):
        mem.GetRasterBand(band + 1).WriteArray(rgba[..., band])
    name = f"/vsimem/tile-{uuid.uuid4().hex}.png"
    try:
        out = gdal.GetDriverByName("PNG").CreateCopy(name, mem, strict=0)
        out = None
        mem = None
        handle = gdal.VSIFOpenL(name, "rb")
        try:
            gdal.VSIFSeekL(handle, 0, 2)
            size = gdal.VSIFTellL(handle)
            gdal.VSIFSeekL(handle, 0, 0)
            data = gdal.VSIFReadL(1, size, handle)
        finally:
            gdal.VSIFCloseL(handle)
    finally:
        for leftover in (name, name + ".aux.xml"):
            if gdal.VSIStatL(leftover):
                gdal.Unlink(leftover)
    return bytes(data)


def render_tile(
    path: Path, spec: MapSpec, bbox: tuple[float, float, float, float], width: int, height: int
) -> bytes:
    """One map tile as PNG bytes, or a MapError the view answers as JSON.

    A GDAL failure (a truncated or non-TIFF file) is a 500 with a fixed
    message: the result lists this raster, so it is not "not found" (404), and
    the caller cannot fix it by asking differently (4xx); the stored artifact is
    broken, which is the server's fault. The GDAL message names the server path,
    so it goes to the log and not into the body.
    """
    try:
        try:
            build_overviews(path, "classes" if spec.is_classes else "continuous")
        except (OSError, RuntimeError):
            # Overviews are a speed-up, never a reason to refuse a tile: a
            # read-only or full workspace still draws, just slowly. A raster
            # that is actually unreadable fails again in the warp below, and
            # that is where it is answered.
            log.warning("Could not build overviews for %s", path, exc_info=True)
        values = warp_tile(path, bbox, width, height, nearest=spec.is_classes)
        return encode_png(colorize(values, spec))
    except RuntimeError:
        log.exception("GDAL could not render a tile from %s", path)
        raise MapError("The raster for this map could not be read.", 500) from None


def spec_for(result: dict[str, Any], map_id: str) -> MapSpec:
    for spec in map_specs(result):
        if spec.id == map_id:
            return spec
    raise MapError(f'This run has no map "{map_id}".', 404)
