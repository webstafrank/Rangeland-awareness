"""Does each selected area reach the data an overlay run needs?

The flood criterion rasters on the live GeoServer cover Tana River County and
nothing else (lon 38.43..40.73, lat -3.07..0.00). An area drawn anywhere else
used to be accepted, queued, and then failed a second later at `fetch` with
GeoServer's raw WCS 404 XML as the only explanation. Checked here, at
`POST /api/v1/runs`, the analyst is told before a run exists which area misses
which layer and where the data actually is.

Only raster criteria are checked. A vector criterion (the river network) is
fetched whole and turned into a distance surface, so it reaches every area by
construction. Prediction runs are not checked: their pipeline already handles
an area outside the labelled extent by training there and saying it
extrapolated (prediction/pipeline.py).

The test is bounding box against coverage extent, so it refuses only an area
that cannot overlap the layer at all. An area that straddles the edge is
accepted and the outside part comes back as nodata, which the overlay already
handles. If GeoServer cannot be asked, or answers with an extent that cannot be
read, the check steps aside rather than blocking every run: the pipeline's own
fetch is the backstop (overlay._fetch). It runs only when a new run is about
to be created, never for a replay of one that already exists.
"""

from __future__ import annotations

import logging
import threading
import time
from typing import Any

from apps.analysis.bindings import binding_for
from apps.layers.geoserver import GeoServerClient

log = logging.getLogger(__name__)

#: Seconds to wait for one DescribeCoverage before giving up on the check. The
#: app's POST times out at 15s; GEOSERVER_TIMEOUT (30s) would let a hung
#: GeoServer outlast it, so the browser reported a failure while the run was
#: created behind it. DescribeCoverage answers in ~0.4s on the live server.
DESCRIBE_TIMEOUT_S = 4.0

#: Seconds a layer's extent is reused. Extents change only when someone
#: republishes a layer; an hour keeps every POST after the first off the
#: network without making a republish wait long.
EXTENT_TTL_S = 3600

Box = tuple[float, float, float, float]

_extents: dict[str, tuple[float, Box]] = {}
_lock = threading.Lock()


def layer_extent(layer: str, client: GeoServerClient | None = None) -> Box:
    """A coverage's extent as a lon/lat box, cached for `EXTENT_TTL_S`.

    Raises when GeoServer cannot describe the layer or its extent cannot be
    read; the caller treats any of that as "cannot check".
    """
    now = time.monotonic()
    with _lock:
        cached = _extents.get(layer)
    if cached is not None and now - cached[0] < EXTENT_TTL_S:
        return cached[1]
    # GDAL only here, so the web process imports it the first time a run is
    # checked, not at startup (jobs/runner.py has the same concern).
    from apps.analysis.pipeline import raster

    described = (client or GeoServerClient(timeout=DESCRIBE_TIMEOUT_S)).describe_coverage(layer)
    box = raster.transform_bounds(described.extent, described.crs, "EPSG:4326")
    with _lock:
        _extents[layer] = (now, box)
    return box


def area_box(area: dict[str, Any]) -> Box | None:
    """The lon/lat bounding box of a Feature, Polygon or MultiPolygon."""
    geometry = area.get("geometry") if area.get("type") == "Feature" else area
    if not isinstance(geometry, dict):
        return None
    coordinates = geometry.get("coordinates")
    if geometry.get("type") == "Polygon":
        rings = coordinates or []
    elif geometry.get("type") == "MultiPolygon":
        rings = [ring for polygon in coordinates or [] for ring in polygon]
    else:
        return None
    points = [point for ring in rings for point in ring]
    if not points:
        return None
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    return (min(xs), min(ys), max(xs), max(ys))


def overlaps(a: Box, b: Box) -> bool:
    return a[0] < b[2] and b[0] < a[2] and a[1] < b[3] and b[1] < a[3]


def describe_box(box: Box) -> str:
    return (
        f"lon {box[0]:.2f} to {box[2]:.2f}, lat {box[1]:.2f} to {box[3]:.2f}"
    )


def areas_outside_coverage(
    config: dict[str, Any], client: GeoServerClient | None = None
) -> list[str]:
    """One message per area that misses a raster layer the run needs.

    Empty when every area overlaps every layer, when the run is a prediction,
    or when GeoServer could not be asked (logged; the pipeline decides then).
    """
    if config.get("model"):
        return []
    from apps.analysis.prediction.statistics import area_names

    areas = config.get("areas") or []
    names = area_names(areas)
    layers = []
    for criterion in config.get("weights") or {}:
        bound = binding_for(criterion)
        if bound is not None and not bound.vector:
            layers.append(bound.layer)

    problems = []
    for name, area in zip(names, areas):
        box = area_box(area)
        if box is None:
            continue
        missed: dict[str, Box] = {}
        for layer in layers:
            try:
                extent = layer_extent(layer, client)
            except Exception as exc:  # noqa: BLE001 - see the module docstring
                # Unreachable, slow, or answering with an envelope or CRS that
                # cannot be read: none of these says the area is wrong, so the
                # check steps aside and the pipeline decides.
                log.warning("coverage check skipped: cannot describe %s: %s", layer, exc)
                return []
            if not overlaps(box, extent):
                missed[layer] = extent
        if missed:
            # One box for all of them: a topic's layers are published over one
            # county (on the live server they differ by 0.01 degrees at most).
            extents = list(missed.values())
            union = (
                min(e[0] for e in extents), min(e[1] for e in extents),
                max(e[2] for e in extents), max(e[3] for e in extents),
            )
            layer_names = ", ".join(sorted(layer.split(":")[-1] for layer in missed))
            problems.append(
                f'"{name}" ({describe_box(box)}) is outside the data for this topic. '
                f"{layer_names} cover only {describe_box(union)}. "
                "Choose an area inside it."
            )
    return problems
