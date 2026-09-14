"""The weighted overlay, stage by stage.

This is the calculation the whole service exists for, and it is deliberately
thin: every hard thing it does is delegated. `raster.py` owns GDAL, `jenks.py`
owns the classification, `reclassify.py` owns the class tables, `geoserver.py`
owns the network. What lives here is the *order*, which is the part that has to
match the model rather than the part that has to be fast.

Ten stages, and the list is fixed at creation time so the app never sees it
reflow mid-run:

    resolve      the reference grid, from the areas and the target CRS
    fetch        each bound layer, over WCS (raster) or WFS (vector)
    reproject    warp everything onto that one grid, clipped to the areas
    derive       slope, where a DEM is published and slope is not
    distance     rasterise the river network, then Euclidean distance
    reclassify   each criterion to 1..5 risk, per its own table
    overlay      sum(risk_i * weight_i)
    classify     Jenks natural breaks into five classes
    statistics   per-class area and share, per-criterion contribution
    publish      write the result back to GeoServer

Everything is written into the run's own workspace directory and nothing is
held in memory longer than it has to be. A single criterion at 30m over the Tana
basin is 8514x11266 float32, which is 384MB; five of those at once is most of a
laptop.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any, Callable

import numpy as np
from osgeo import gdal

from apps.analysis.bindings import Binding, binding_for
from apps.analysis.domain import criteria as criteria_module
from apps.analysis.domain.jenks import classify, natural_breaks
from apps.analysis.domain.reclassify import (
    contribution,
    reclassify,
    weighted_overlay,
)
from apps.analysis.jobs.stages import StageState
from apps.analysis.pipeline import raster
from apps.layers.geoserver import GeoServerClient, GeoServerError

log = logging.getLogger(__name__)

Report = Callable[[str, StageState, str | None], None]

#: How many classes the final index is cut into. Five is the convention every
#: susceptibility map in this domain uses, and the class labels below assume it.
CLASS_COUNT = 5

CLASS_LABELS = ("Very low", "Low", "Moderate", "High", "Very high")


class PipelineError(RuntimeError):
    """A stage could not complete. The message is for a person."""


def run_weighted_overlay(
    *, config: dict[str, Any], workspace: Path, report: Report
) -> dict[str, Any]:
    """Execute a validated run configuration and return its result payload.

    `report` is called on every stage transition and persists immediately: the
    entire point of the stage list is that a poll mid-run can see it, so
    batching the writes would make the progress bar jump from nothing to done.
    """
    topic = config["topic"]
    weights: dict[str, float] = config["weights"]
    target_crs: str = config.get("targetCrs", "EPSG:32637")
    resolution: float = float(config.get("resolution", 30))
    areas: list[dict[str, Any]] = config["areas"]

    method = criteria_module.method_for(topic)
    used = [c for c in method.criteria if c.id in weights]

    client = GeoServerClient()

    # ------------------------------------------------------------- 1. resolve
    report("resolve", StageState.RUNNING, None)
    geometry = _merge_areas(areas)
    grid = raster.reference_grid(geometry, target_crs, resolution)
    if grid.width * grid.height > 200_000_000:
        # 200M pixels is 800MB per float32 band. Refusing with the number is
        # more use than an out-of-memory kill twenty minutes in.
        raise PipelineError(
            f"The requested area is {grid.width}x{grid.height} pixels at "
            f"{resolution:g}m. Use a coarser resolution or a smaller area."
        )
    report(
        "resolve",
        StageState.DONE,
        f"{grid.width}x{grid.height} px at {resolution:g}m, {grid.crs}",
    )

    # --------------------------------------------------------------- 2. fetch
    report("fetch", StageState.RUNNING, None)
    fetched: dict[str, tuple[Binding, Path]] = {}
    for criterion in used:
        bound = binding_for(criterion.id)
        if bound is None:
            raise PipelineError(
                f'No layer on this GeoServer supplies "{criterion.id}".'
            )
        fetched[criterion.id] = (
            bound,
            _fetch(client, bound, grid, workspace),
        )
    report("fetch", StageState.DONE, f"{len(fetched)} layers")

    # ----------------------------------------------------------- 3. reproject
    report("reproject", StageState.RUNNING, None)
    on_grid: dict[str, Path] = {}
    for name, (bound, path) in fetched.items():
        if bound.vector:
            # Vectors are burned straight onto the grid, so there is nothing to
            # warp: rasterize_geometry already writes in the grid's CRS.
            on_grid[name] = path
            continue
        out = workspace / f"{name}.grid.tif"
        criterion = next(c for c in used if c.id == name)
        raster.warp_to_grid(
            str(path),
            str(out),
            grid,
            # Nearest for categorical data, or land-cover class 3 and class 4
            # average to a 3.5 that belongs to neither and reclassifies to
            # whichever band happens to contain it.
            resample=(
                "nearest"
                if criterion.scale.kind == criteria_module.ScaleKind.CATEGORICAL
                else "bilinear"
            ),
            clip_geojson=geometry,
            # Float32 for every criterion, including the Byte ones.
            #
            # A land-cover raster arrives as Byte, and Byte has no spare value
            # for nodata: 0 is a real class code. GDAL would clamp a -9999
            # nodata to 0 with a warning and carry on, turning every pixel
            # outside the cutline into class 0 — which reclassifies to a real
            # risk and quietly enlarges the study area to the bounding box.
            # raster.py refuses that outright, which is how this was found.
            #
            # Four bytes a pixel instead of one is the price, and every
            # criterion is read as float for reclassification anyway.
            dtype=gdal.GDT_Float32,
        )
        on_grid[name] = out
    report("reproject", StageState.DONE, f"{len(on_grid)} layers on the grid")

    # -------------------------------------------------------------- 4. derive
    derived = [
        c
        for c in used
        if c.source.kind == criteria_module.CriterionSourceKind.DERIVED
        and not fetched[c.id][0].precomputed
    ]
    if derived:
        report("derive", StageState.RUNNING, None)
        for criterion in derived:
            out = workspace / f"{criterion.id}.derived.tif"
            raster.slope_degrees(str(on_grid[criterion.id]), str(out))
            on_grid[criterion.id] = out
        report("derive", StageState.DONE, f"{len(derived)} derived")
    else:
        # Nothing to derive is not a failure. On this deployment slope is
        # published ready-made, so the stage is genuinely not going to happen
        # and says `skipped` rather than sitting at `pending` forever.
        report("derive", StageState.SKIPPED, "slope is published ready-made")

    # ------------------------------------------------------------ 5. distance
    distance = [
        c
        for c in used
        if c.source.kind == criteria_module.CriterionSourceKind.DISTANCE
    ]
    if distance:
        report("distance", StageState.RUNNING, None)
        for criterion in distance:
            out = workspace / f"{criterion.id}.distance.tif"
            raster.proximity_metres(str(on_grid[criterion.id]), str(out))
            on_grid[criterion.id] = out
        report("distance", StageState.DONE, f"{len(distance)} distance surfaces")
    else:
        report("distance", StageState.SKIPPED, None)

    # ----------------------------------------------------------- 6. reclassify
    report("reclassify", StageState.RUNNING, None)
    risk: dict[str, np.ndarray] = {}
    for criterion in used:
        values, _ = raster.read_band(str(on_grid[criterion.id]))
        classified = reclassify(values, criterion)

        # Check each criterion as it is produced, not the overlay afterwards.
        #
        # The overlay propagates nodata from any input, so ONE empty criterion
        # empties the result — and the failure then surfaces at `classify` as
        # "every pixel is nodata", which points at the areas and is usually a
        # lie. It was here: the shipped land-cover table uses ESA WorldCover
        # codes (10, 20, ... 100) and this GeoServer publishes a local 1-5
        # scheme, so every pixel was unlisted. Naming the criterion and showing
        # both codings turns a dead end into a one-line fix.
        if not np.isfinite(classified).any():
            detail = ""
            if criterion.scale.kind == criteria_module.ScaleKind.CATEGORICAL:
                present = sorted(
                    {
                        int(v)
                        for v in np.unique(values[np.isfinite(values)]).tolist()
                    }
                )[:12]
                expected = sorted(
                    {code for k in criterion.scale.categorical for code in k.codes}
                )[:12]
                detail = (
                    f" The layer codes are {present} and the class table "
                    f"expects {expected}; they do not overlap."
                )
            raise PipelineError(
                f'No pixel of "{criterion.id}" could be classified from '
                f'"{fetched[criterion.id][0].layer}".{detail}'
            )

        risk[criterion.id] = classified
    report("reclassify", StageState.DONE, f"{len(risk)} criteria on the 1-5 scale")

    # -------------------------------------------------------------- 7. overlay
    report("overlay", StageState.RUNNING, None)
    index = weighted_overlay(risk, weights)
    index_path = workspace / "index.tif"
    raster.write_array(index, grid, str(index_path))
    report("overlay", StageState.DONE, None)

    # ------------------------------------------------------------- 8. classify
    report("classify", StageState.RUNNING, None)
    finite = index[np.isfinite(index)]
    if finite.size == 0:
        # Every pixel is nodata. Almost always the areas and the layers do not
        # actually overlap, which is worth saying rather than returning a table
        # of five empty classes.
        raise PipelineError(
            "Every pixel is nodata. The selected areas probably do not overlap "
            "the published layers."
        )
    breaks = natural_breaks(index, CLASS_COUNT)
    classed = classify(index, breaks)
    classed_path = workspace / "classes.tif"
    raster.write_array(classed, grid, str(classed_path))
    report("classify", StageState.DONE, f"{len(breaks)} breaks")

    # ----------------------------------------------------------- 9. statistics
    report("statistics", StageState.RUNNING, None)
    pixel_area_km2 = (grid.pixel_size * grid.pixel_size) / 1_000_000.0
    classes = []
    total_valid = int(np.isfinite(classed).sum())
    for value in range(1, CLASS_COUNT + 1):
        count = int((classed == value).sum())
        classes.append(
            {
                "class": value,
                "label": CLASS_LABELS[value - 1],
                "pixels": count,
                "areaKm2": round(count * pixel_area_km2, 4),
                "share": round(count / total_valid, 6) if total_valid else 0.0,
            }
        )
    shares = contribution(risk, weights)
    report("statistics", StageState.DONE, f"{total_valid} valid pixels")

    # -------------------------------------------------------------- 10. publish
    # Publishing needs write credentials and a target store, neither of which
    # this deployment has configured. Skipped rather than attempted-and-failed,
    # and the result is complete without it: the numbers are the answer, the
    # published layer is a convenience.
    report("publish", StageState.SKIPPED, "no GeoServer write credentials")

    return {
        "indicator": {
            "id": "fhi" if topic == "flood-risk" else f"{topic}-index",
            "label": f"{topic.replace('-', ' ').title()} Index",
        },
        "grid": {
            "crs": grid.crs,
            "resolution": grid.pixel_size,
            "width": grid.width,
            "height": grid.height,
        },
        "breaks": [round(b, 6) for b in breaks],
        "classes": classes,
        "contribution": {k: round(v, 6) for k, v in sorted(shares.items())},
        "validPixels": total_valid,
        "rasters": {
            "index": str(index_path),
            "classes": str(classed_path),
        },
        "layers": [],
    }


def _merge_areas(areas: list[dict[str, Any]]) -> dict[str, Any]:
    """One geometry from the run's areas, for the grid and the cutline.

    A GeometryCollection would be the obvious container and is exactly what not
    to build: GDAL's cutline refuses one, and `UnionCascaded` raises on it. A
    MultiPolygon of every ring is what both accept.
    """
    polygons: list[list] = []
    for area in areas:
        geometry = area.get("geometry") if area.get("type") == "Feature" else area
        if not isinstance(geometry, dict):
            continue
        kind = geometry.get("type")
        if kind == "Polygon":
            polygons.append(geometry["coordinates"])
        elif kind == "MultiPolygon":
            polygons.extend(geometry["coordinates"])

    if not polygons:
        raise PipelineError("No usable polygon in the selected areas.")
    if len(polygons) == 1:
        return {"type": "Polygon", "coordinates": polygons[0]}
    return {"type": "MultiPolygon", "coordinates": polygons}


def _fetch(
    client: GeoServerClient, bound: Binding, grid: raster.Grid, workspace: Path
) -> Path:
    """Pull one criterion's source from GeoServer into the workspace."""
    out = workspace / f"{bound.criterion}.source.tif"
    try:
        if bound.vector:
            # WGS84, not the grid's CRS, because `rasterize_geometry` takes
            # WGS84 GeoJSON and reprojects on the way in. Handing it UTM metres
            # made PROJ report "utm: Invalid latitude" several hundred times and
            # then fail the whole transform — the coordinates were fine, they
            # were simply being read as degrees.
            collection = client.get_feature_geojson(bound.layer, srs="EPSG:4326")
            features = collection.get("features") or []
            if not features:
                raise PipelineError(
                    f'"{bound.layer}" returned no features for this area.'
                )
            # A GeometryCollection, because a river network is LineStrings and
            # there is no "MultiLineString of everything" that also accepts a
            # mixed layer. The rasteriser burns whatever geometry types it is
            # given; what matters for a distance transform is only which pixels
            # the network touches.
            collection_geometry = {
                "type": "GeometryCollection",
                "geometries": [
                    f["geometry"] for f in features if f.get("geometry")
                ],
            }
            raster.rasterize_geometry(collection_geometry, grid, str(out))
            return out

        # Subset in the COVERAGE's own CRS, not the run's.
        #
        # WCS 2.0 names each axis, and the names belong to the coverage: a
        # projected one has E/N, a geographic one Lat/Long. Passing the run's
        # UTM bounds with `subsettingCRS` looked right and 404'd, because this
        # server publishes TanaRiver_LULC in EPSG:4326 while the run computes in
        # EPSG:32637, and metres do not validate against a latitude axis.
        #
        # Transforming here keeps `geoserver.py` free of GDAL and means the
        # request is always expressed in the terms the coverage itself declared.
        described = client.describe_coverage(bound.layer)
        subset = raster.transform_bounds(grid.bounds, grid.crs, described.crs)
        data = client.get_coverage(bound.layer, subset=subset)
        out.write_bytes(data)
        return out
    except GeoServerError as exc:
        raise PipelineError(f'Could not fetch "{bound.layer}": {exc}') from exc
