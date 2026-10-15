"""Layers onto a grid, coverage checks, and the model's input columns.

Every feature ends up as one float32 GeoTIFF on the grid it is used on, with
-9999 as nodata, NaN once read. Kept on disk rather than in memory because the
contract allows a 20M-pixel grid, where one float32 layer is 80 MB and a
dozen of them would not fit beside the models on a 7 GB machine. Training
reads one layer at a time and keeps only the sampled pixels; prediction reads
`CHUNK_ROWS` rows of every layer at a time.

**A feature with no coverage is dropped, never zero-filled.** Coverage is the
share of the run's area pixels where the layer has a value, measured on every
grid the feature is used on. Below `MIN_COVERAGE` the feature is removed from
training and prediction alike and the result's `warnings` names it with the
number. Above it, the pixels it does not cover stay NaN: both members route a
missing value down a learned branch (scikit-learn >= 1.4, XGBoost natively),
which is the honest treatment of "no measurement here". A zero would be a
measurement, and a wrong one: zero rainfall, zero slope, zero NDVI.
"""

from __future__ import annotations

import logging
import uuid
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path
from typing import Any, Callable

import numpy as np
from osgeo import gdal

from apps.analysis.bindings import binding_for
from apps.analysis.pipeline import raster
from apps.analysis.prediction.recipes import StaticFeature
from apps.analysis.prediction.sources import Sources
from apps.analysis.satellite.catalog import SatelliteLayer
from apps.analysis.satellite.gibs import Snapshot

log = logging.getLogger(__name__)

MIN_COVERAGE = 0.5
CHUNK_ROWS = 256
#: Parallel GIBS requests. GIBS is CloudFront-fronted and comfortable with
#: this; more mostly queues behind the same four cores decoding PNGs.
FETCH_THREADS = 8


@dataclass
class Feature:
    """One model input as the result reports it, plus where its pixels are."""

    id: str
    label: str
    source: str
    layer: str | None
    time: str | None
    unit: str
    categorical: bool = False
    #: Category codes seen in training; the one-hot columns, in order.
    codes: tuple[int, ...] = ()
    #: Grid name -> float32 GeoTIFF of this feature on that grid.
    paths: dict[str, Path] = field(default_factory=dict)

    def as_json(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "label": self.label,
            "source": self.source,
            "layer": self.layer,
            "time": self.time,
            "unit": self.unit,
        }

    def columns(self) -> list[str]:
        if self.categorical:
            return [f"{self.id}={code}" for code in self.codes]
        return [self.id]


# ------------------------------------------------------------- grid helpers

def coarser_grid(grid: raster.Grid, factor: int) -> raster.Grid:
    """The same origin and CRS at ``factor`` times the pixel size."""
    factor = max(1, int(factor))
    if factor == 1:
        return grid
    return raster.Grid(
        crs=grid.crs,
        wkt=grid.wkt,
        origin_x=grid.origin_x,
        origin_y=grid.origin_y,
        pixel_size=grid.pixel_size * factor,
        width=-(-grid.width // factor),
        height=-(-grid.height // factor),
    )


def wgs84_box(grid: raster.Grid, margin_deg: float = 0.0) -> tuple[float, float, float, float]:
    minx, miny, maxx, maxy = raster.transform_bounds(grid.bounds, grid.crs, "EPSG:4326")
    return (minx - margin_deg, miny - margin_deg, maxx + margin_deg, maxy + margin_deg)


def area_mask(geometry: dict[str, Any], grid: raster.Grid, path: Path) -> np.ndarray:
    raster.rasterize_geometry(geometry, grid, str(path))
    values, _ = raster.read_band(str(path), as_nan=False)
    return values.astype(bool)


def coverage(values: np.ndarray, inside: np.ndarray) -> float:
    total = int(inside.sum())
    if total == 0:
        return 0.0
    return float(np.isfinite(values[inside]).sum()) / total


def write_float(values: np.ndarray, grid: raster.Grid, path: Path) -> Path:
    raster.write_array(values.astype(np.float32), grid, str(path))
    return path


def read(path: Path) -> np.ndarray:
    values, _ = raster.read_band(str(path))
    return values.astype(np.float32, copy=False)


def read_rows(path: Path, first: int, count: int) -> np.ndarray:
    """Rows ``first .. first+count`` of band 1, nodata as NaN."""
    dataset = gdal.Open(str(path), gdal.GA_ReadOnly)
    try:
        band = dataset.GetRasterBand(1)
        values = band.ReadAsArray(0, first, dataset.RasterXSize, count).astype(np.float32)
        nodata = band.GetNoDataValue()
        band = None
    finally:
        dataset = None
    if nodata is not None:
        values[values == np.float32(nodata)] = np.nan
    return values


# ------------------------------------------------------------ static layers

def static_feature(
    sources: Sources,
    spec: StaticFeature,
    grid: raster.Grid,
    geometry: dict[str, Any],
    workspace: Path,
    tag: str,
) -> Path | None:
    """One GeoServer criterion layer on ``grid``, clipped to the areas.

    None when no layer is bound to the criterion or the layer does not reach
    the grid. Network failures raise: "GeoServer is down" must fail the run at
    `fetch`, not quietly drop every layer and train on satellite data alone.
    """
    bound = binding_for(spec.id)
    if bound is None:
        return None
    out = workspace / f"{spec.id}.{tag}.tif"

    if bound.vector:
        collection = sources.vector(bound.layer)
        if collection is None:
            return None
        burned = workspace / f"{spec.id}.{tag}.burn.tif"
        geometry_collection = {
            "type": "GeometryCollection",
            "geometries": [f["geometry"] for f in collection["features"]],
        }
        # all_touched: a river is a line, and a line narrower than a 250 m pixel
        # passes between pixel centres and burns nothing.
        raster.rasterize_geometry(geometry_collection, grid, str(burned), all_touched=True)
        burned_values, _ = raster.read_band(str(burned), as_nan=False)
        if not burned_values.any():
            # No river pixel on this grid: every distance would be nodata.
            return None
        distance = workspace / f"{spec.id}.{tag}.distance.tif"
        raster.proximity_metres(str(burned), str(distance))
        raster.warp_to_grid(
            str(distance), str(out), grid, resample="nearest",
            clip_geojson=geometry, dtype=gdal.GDT_Float32,
        )
        return out

    source = sources.raster(bound.layer, grid, workspace / f"{spec.id}.{tag}.source.tif")
    if source is None:
        return None
    raster.warp_to_grid(
        str(source),
        str(out),
        grid,
        # Categorical codes are never averaged (class 3 and 4 do not make a
        # 3.5); the mode keeps the most common code in each grid cell. Continuous
        # layers arrive at about twice the grid's resolution (sources.py), so an
        # average is the faithful downsample.
        resample="mode" if spec.categorical else "average",
        clip_geojson=geometry,
        src_nodata=source_nodata(source),
        dtype=gdal.GDT_Float32,
    )
    return out


def source_nodata(path: Path) -> float | None:
    """The nodata to tell the warp about, when the file does not say.

    TanaRiver_Rainfall and the flood hotspot index declare no nodata at all;
    DescribeCoverage names NaN as their nil value, and the GeoTIFF is NaN
    outside the county. Declared explicitly so an `average` warp skips those
    pixels rather than letting one NaN poison a whole output cell, or a
    `mode` count them as a class. A file that declares its own nodata (slope's
    -9999, LULC's 0) keeps it: None means "use what the file says".
    """
    dataset = gdal.Open(str(path), gdal.GA_ReadOnly)
    try:
        band = dataset.GetRasterBand(1)
        declared = band.GetNoDataValue()
        floating = band.DataType in (gdal.GDT_Float32, gdal.GDT_Float64)
        band = None
    finally:
        dataset = None
    if declared is None and floating:
        return float("nan")
    return None


# --------------------------------------------------------------- satellite

def snapshot_to_geotiff(snapshot: Snapshot, path: Path) -> Path:
    rows, cols = snapshot.values.shape
    minx, miny, maxx, maxy = snapshot.bbox
    driver = gdal.GetDriverByName("GTiff")
    dataset = driver.Create(str(path), cols, rows, 1, gdal.GDT_Float32)
    try:
        dataset.SetGeoTransform(
            (minx, (maxx - minx) / cols, 0.0, maxy, 0.0, -(maxy - miny) / rows)
        )
        dataset.SetProjection(raster._srs_from_user_input("EPSG:4326").ExportToWkt())
        band = dataset.GetRasterBand(1)
        band.SetNoDataValue(raster.NODATA)
        band.WriteArray(np.where(np.isfinite(snapshot.values), snapshot.values, raster.NODATA))
        band = None
    finally:
        dataset = None
    return path


def snapshot_on_grid(
    snapshot: Snapshot,
    grid: raster.Grid,
    geometry: dict[str, Any] | None,
    scratch: Path,
) -> np.ndarray:
    """A decoded GIBS snapshot warped onto ``grid`` and clipped."""
    scratch.mkdir(parents=True, exist_ok=True)
    name = uuid.uuid4().hex
    source = snapshot_to_geotiff(snapshot, scratch / f"{name}.src.tif")
    out = scratch / f"{name}.grid.tif"
    try:
        raster.warp_to_grid(
            str(source),
            str(out),
            grid,
            resample="nearest" if snapshot.layer.categorical else "bilinear",
            clip_geojson=geometry,
            dtype=gdal.GDT_Float32,
        )
        return read(out)
    finally:
        for path in (source, out):
            path.unlink(missing_ok=True)


def fetch_snapshots(
    sources: Sources,
    requests: list[tuple[SatelliteLayer, date]],
    bbox: tuple[float, float, float, float],
    *,
    progress: Callable[[int, int], None] | None = None,
) -> dict[tuple[str, date], Snapshot]:
    """Fetch many (layer, time) pairs concurrently. Order of completion is not
    order of results; the dict is keyed so it does not matter."""
    out: dict[tuple[str, date], Snapshot] = {}
    if not requests:
        return out
    with ThreadPoolExecutor(max_workers=FETCH_THREADS, thread_name_prefix="gibs") as pool:
        futures = {
            pool.submit(sources.satellite, layer, when, bbox): (layer.id, when)
            for layer, when in requests
        }
        done = 0
        for future, key in futures.items():
            out[key] = future.result()
            done += 1
            if progress is not None:
                progress(done, len(requests))
    return out


# ------------------------------------------------------------- the columns

def one_hot(values: np.ndarray, codes: tuple[int, ...]) -> np.ndarray:
    """``(n,)`` codes -> ``(n, len(codes))``; NaN rows stay NaN, not zeros.

    A pixel whose land cover is unknown is not "none of the classes", which is
    what an all-zero row would say. It is unknown in every column.
    """
    out = np.zeros((values.size, len(codes)), dtype=np.float32)
    missing = ~np.isfinite(values)
    for j, code in enumerate(codes):
        out[:, j] = values == code
    out[missing] = np.nan
    return out


def observed_codes(values: np.ndarray, limit: int = 24) -> tuple[int, ...]:
    """The category codes present, the ``limit`` most common, sorted.

    Fill never reaches this: TanaRiver_LULC declares 0 as nodata, so the warp
    turns it into NaN, and GIBS fill is excluded by the colormap decode. A 0
    that does arrive is a real code (IGBP water) and gets its own column.
    """
    finite = values[np.isfinite(values)].astype(np.int64)
    if finite.size == 0:
        return ()
    codes, counts = np.unique(finite, return_counts=True)
    ordered = codes[np.argsort(-counts, kind="stable")][:limit]
    return tuple(sorted(int(c) for c in ordered))


def matrix(features: list[Feature], values: dict[str, np.ndarray]) -> np.ndarray:
    """The model's input table from per-feature value vectors of equal length."""
    blocks = []
    for feature in features:
        column = values[feature.id]
        if feature.categorical:
            blocks.append(one_hot(column, feature.codes))
        else:
            blocks.append(column.astype(np.float32).reshape(-1, 1))
    return np.hstack(blocks) if blocks else np.empty((0, 0), np.float32)


def column_groups(features: list[Feature]) -> tuple[list[str], dict[str, str]]:
    columns: list[str] = []
    groups: dict[str, str] = {}
    for feature in features:
        for column in feature.columns():
            columns.append(column)
            groups[column] = feature.id
    return columns, groups
