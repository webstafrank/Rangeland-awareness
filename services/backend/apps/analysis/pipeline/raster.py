"""Raster operations for the flood-risk weighted overlay.

Every criterion layer in the overlay (elevation, slope, distance to river,
rainfall, soil, land cover) arrives in a different CRS, at a different
resolution, on a different origin. A weighted overlay is pixel arithmetic, so
before any weight is applied every layer has to sit on one grid, pixel for
pixel. That grid is a :class:`Grid`, and every function here either produces
one, writes onto one, or reads from one.

The module deliberately depends on nothing but ``osgeo`` (GDAL 3.12), numpy and
the standard library. rasterio and scipy are not installed on the deployment
host and cannot be, so the GDAL Python bindings are the whole toolbox.

GDAL's Python API is full of edges that fail quietly rather than loudly, and a
quiet failure in a risk map is a wrong answer somebody acts on. The ones that
bite here are handled and explained at the point they are handled:

* a warp without ``dstNodata`` fills the outside of the source with 0, and 0 is
  a legitimate rainfall or slope value;
* ``ComputeProximity`` counts pixels unless told otherwise, so "300" can mean
  300 m or 9 km depending on a flag nobody set;
* ``DEMProcessing`` slope is only in degrees if the vertical and horizontal
  units match, which they do not in a geographic CRS;
* a dataset that is not closed is a truncated file on disk;
* ``gdal.Open(p).GetRasterBand(1)`` frees the dataset before the band is used.
"""

from __future__ import annotations

import json
import math
import os
import uuid
from collections.abc import Iterator, Mapping, Sequence
from contextlib import contextmanager
from dataclasses import dataclass
from typing import Any, Final

import numpy as np
from osgeo import gdal, gdal_array, ogr, osr

# GDAL 4 turns exceptions on by default and 3.x prints a deprecation warning on
# every import that leaves them off. More to the point, with exceptions off a
# failed Warp returns None and the next line raises AttributeError somewhere
# unrelated, which is how a bad CRS ends up reported as a numpy bug.
gdal.UseExceptions()
ogr.UseExceptions()
osr.UseExceptions()

__all__ = [
    "Grid",
    "RasterError",
    "ZoneStats",
    "NODATA",
    "reference_grid",
    "warp_to_grid",
    "slope_degrees",
    "proximity_metres",
    "rasterize_geometry",
    "read_band",
    "write_array",
    "zonal_stats",
]

#: Written into every float output. -9999 is outside the range of every
#: criterion the pipeline carries (metres, degrees, mm, class codes), which is
#: the only property a nodata value needs. 0 and NaN both fail that test: 0 is
#: real data, and NaN cannot be stored in the integer bands the class rasters
#: use.
NODATA: Final[float] = -9999.0

_CREATION_OPTIONS: Final[tuple[str, ...]] = (
    "COMPRESS=LZW",
    "TILED=YES",
    "BLOCKXSIZE=256",
    "BLOCKYSIZE=256",
    # A 4 GB TIFF is reachable for a national grid at 30 m; IF_SAFER switches to
    # BigTIFF only when it has to, so small outputs stay readable by old tools.
    "BIGTIFF=IF_SAFER",
)

# LZW on its own barely compresses continuous rasters. The horizontal
# differencer does the actual work, and it needs a different setting for
# integers (2) than for floats (3); applying the integer predictor to a float
# band inflates the file instead of shrinking it.
_PREDICTOR_INT: Final[str] = "PREDICTOR=2"
_PREDICTOR_FLOAT: Final[str] = "PREDICTOR=3"

_RESAMPLE_ALGORITHMS: Final[dict[str, int]] = {
    # Categorical data (soil class, land cover) must never be averaged: the mean
    # of class 2 and class 4 is class 3, which is a different soil.
    "nearest": gdal.GRA_NearestNeighbour,
    "mode": gdal.GRA_Mode,
    # Continuous data (elevation, rainfall, distance).
    "bilinear": gdal.GRA_Bilinear,
    "cubic": gdal.GRA_Cubic,
    "cubicspline": gdal.GRA_CubicSpline,
    "lanczos": gdal.GRA_Lanczos,
    "average": gdal.GRA_Average,
    "min": gdal.GRA_Min,
    "max": gdal.GRA_Max,
    "median": gdal.GRA_Med,
}


class RasterError(RuntimeError):
    """Anything this module refuses to do, with a message naming the fix.

    One exception type, not a hierarchy: every caller in the pipeline reacts the
    same way (fail the job, show the message), so branching on the subclass
    would be dead code. The message carries the detail instead.
    """


@dataclass(frozen=True, slots=True)
class Grid:
    """The one north-up grid every layer in a run is resampled onto.

    Frozen because it is the pipeline's shared contract: a dozen functions read
    it and a grid that changed halfway through a run would silently misalign the
    layers written before the change against the ones written after.

    Only ``pixel_size`` is stored, not separate x and y sizes. Square pixels are
    an assumption several operations here depend on rather than a convenience:
    ``ComputeProximity`` in georeferenced units scales by the x size alone and
    warns (does not fail) on rectangular pixels, and slope from a 3x3 kernel is
    only comparable in both directions when the kernel is square.

    ``origin_x``/``origin_y`` are the top-left corner of the top-left pixel, not
    its centre, matching GDAL's geotransform convention. Half a pixel of offset
    here is half a pixel of offset in every layer.
    """

    crs: str
    """The CRS as the caller named it, e.g. ``"EPSG:32637"``. Kept for logs and
    error messages; :attr:`wkt` is what GDAL is actually given."""

    wkt: str
    origin_x: float
    origin_y: float
    pixel_size: float
    width: int
    height: int

    @property
    def geotransform(self) -> tuple[float, float, float, float, float, float]:
        """GDAL's ``(originX, pixelW, rowRot, originY, colRot, pixelH)``.

        The fourth term is negative on purpose. GDAL counts rows downward from
        the top-left while projected northings increase upward, so a north-up
        raster has a negative y step. A positive one produces a file that opens
        without complaint and draws upside down.
        """
        return (
            self.origin_x,
            self.pixel_size,
            0.0,
            self.origin_y,
            0.0,
            -self.pixel_size,
        )

    @property
    def bounds(self) -> tuple[float, float, float, float]:
        """``(minx, miny, maxx, maxy)`` in the grid's CRS, outer pixel edges.

        This is the order ``gdal.Warp(outputBounds=...)`` wants. GDAL elsewhere
        uses ``(minx, maxx, miny, maxy)`` (``Layer.GetExtent``), which is the
        kind of difference that produces a plausible-looking empty raster.
        """
        return (
            self.origin_x,
            self.origin_y - self.height * self.pixel_size,
            self.origin_x + self.width * self.pixel_size,
            self.origin_y,
        )

    @property
    def shape(self) -> tuple[int, int]:
        """``(rows, cols)``, i.e. numpy order, which is the reverse of GDAL's."""
        return (self.height, self.width)

    def spatial_reference(self) -> osr.SpatialReference:
        """A fresh SRS object with traditional axis order forced on.

        Rebuilt per call rather than cached on the instance: an
        ``osr.SpatialReference`` is a mutable C++ object, so a shared one could
        have its axis strategy changed by any caller and break every later user
        of the same grid.
        """
        return _srs_from_user_input(self.wkt)

    def matches(self, other: "Grid", *, tolerance: float = 1e-6) -> bool:
        """True when two grids are pixel-for-pixel the same.

        Compares origins with a tolerance because a geotransform that has been
        through a GeoTIFF round-trip differs in the last bits of the double.
        """
        return (
            self.width == other.width
            and self.height == other.height
            and math.isclose(self.pixel_size, other.pixel_size, rel_tol=tolerance)
            and math.isclose(self.origin_x, other.origin_x, abs_tol=tolerance)
            and math.isclose(self.origin_y, other.origin_y, abs_tol=tolerance)
        )


@dataclass(frozen=True, slots=True)
class ZoneStats:
    """Per-zone summary of a value raster. See :func:`zonal_stats`."""

    zone: int
    count: int
    """Pixels belonging to the zone, valid or not. ``count - valid_count`` is
    how much of the zone the value raster failed to cover, which is the number
    that tells you whether the mean below is worth reporting."""

    valid_count: int
    total: float
    mean: float | None
    minimum: float | None
    maximum: float | None


def reference_grid(
    geojson: Mapping[str, Any],
    crs: str,
    resolution_m: float,
    *,
    margin_m: float = 0.0,
) -> Grid:
    """Derive the snapped analysis grid for an area of interest.

    ``geojson`` is a GeoJSON geometry, Feature or FeatureCollection in WGS84
    (RFC 7946 allows no other CRS, which is why the CRS is not a parameter).
    ``crs`` is the projected CRS the analysis runs in — for Kenya that is
    ``"EPSG:32637"`` (UTM 37N) or ``"EPSG:21037"``; the maths below assumes its
    units are metres, because ``resolution_m`` is.

    The origin is snapped down to a whole multiple of ``resolution_m`` and the
    far edge up. That is the whole point of this function: two runs over
    overlapping areas then land on the same lattice, so a pixel in one output
    covers exactly one pixel in the other and the two can be added. Without the
    snap the grids differ by whatever sub-pixel offset the two envelopes happen
    to have, and every later comparison needs a resample that smears values
    across the boundaries the classification depends on.

    ``margin_m`` widens the envelope before snapping. Give it a few pixels when
    the result feeds a focal operation: slope and proximity both read a
    neighbourhood, so the outermost ring of a tightly-cropped grid is computed
    from data that is not there. It is also the way to accept an area that is
    otherwise thinner than one pixel, which is refused (see below).
    """
    if resolution_m <= 0:
        raise RasterError(f"resolution_m must be positive, got {resolution_m!r}")
    if margin_m < 0:
        raise RasterError(f"margin_m must not be negative, got {margin_m!r}")

    target = _srs_from_user_input(crs)
    if target.IsGeographic():
        raise RasterError(
            f"{crs!r} is a geographic CRS, so a resolution in metres is "
            "meaningless. Use a projected CRS in metres, e.g. 'EPSG:32637' "
            "(UTM 37N) for Kenya."
        )

    geometry = _geometry_from_geojson(geojson)
    minx, maxx, miny, maxy = _projected_envelope(geometry, target)

    minx -= margin_m
    miny -= margin_m
    maxx += margin_m
    maxy += margin_m

    res = float(resolution_m)
    # Checked before snapping, not after. Snapping rounds outward, so an area
    # a metre across still produces a 1x1 or 2x2 grid rather than a 0x0 one —
    # a raster that is technically valid and analytically meaningless. The
    # complaint belongs here, where the numbers still say why.
    if (maxx - minx) < res or (maxy - miny) < res:
        raise RasterError(
            f"area of interest is {maxx - minx:.1f} m by {maxy - miny:.1f} m, "
            f"thinner than one {res:g} m pixel in at least one direction. Use "
            "a finer resolution, a larger area, or margin_m to pad it."
        )

    snapped_minx = math.floor(minx / res) * res
    snapped_miny = math.floor(miny / res) * res
    snapped_maxx = math.ceil(maxx / res) * res
    snapped_maxy = math.ceil(maxy / res) * res

    # round(), not int(): (snapped_maxx - snapped_minx) / res is an integer in
    # exact arithmetic but can land on 223.99999999999997, and int() would
    # truncate a whole column off the east edge of the grid.
    width = int(round((snapped_maxx - snapped_minx) / res))
    height = int(round((snapped_maxy - snapped_miny) / res))
    if width < 1 or height < 1:  # pragma: no cover - the check above precedes it
        raise RasterError(
            f"area of interest snapped to a {width}x{height} grid at {res:g} m"
        )

    return Grid(
        crs=crs,
        wkt=target.ExportToWkt(),
        origin_x=snapped_minx,
        origin_y=snapped_maxy,
        pixel_size=res,
        width=width,
        height=height,
    )


def warp_to_grid(
    src_path: str | os.PathLike[str],
    out_path: str | os.PathLike[str],
    grid: Grid,
    *,
    resample: str = "bilinear",
    clip_geojson: Mapping[str, Any] | None = None,
    src_nodata: float | None = None,
    nodata: float = NODATA,
    dtype: int | None = None,
) -> str:
    """Reproject and clip ``src_path`` onto exactly ``grid``.

    ``resample`` names the algorithm (see ``_RESAMPLE_ALGORITHMS``) and the
    caller has to choose knowingly: ``"nearest"`` for anything categorical,
    ``"bilinear"`` or ``"cubic"`` for anything continuous. There is no safe
    default that covers both, and ``"bilinear"`` is only the default here
    because most criterion layers in this pipeline are continuous.

    ``clip_geojson`` is the area of interest, again in WGS84. When given it is
    used as a **cutline**, so pixels outside the polygon become nodata. A
    bounding-box clip is not equivalent: Kenyan county and basin boundaries are
    nothing like rectangles, and the corner of the box can be a different
    catchment entirely, which then contributes real values to the zonal
    statistics.

    Four GDAL behaviours are handled here rather than left to the caller:

    1. ``dstNodata`` is always set. Without it, GDAL initialises the output to
       0 and leaves the band's nodata unset, so every pixel outside the source
       footprint or outside the cutline reads as a real 0. For rainfall or
       elevation that is a plausible value, and the error survives all the way
       into the risk score.
    2. ``dstNodata`` is checked against the output data type first. Warping a
       Byte land-cover raster with the module default of -9999 does not fail:
       GDAL prints ``destination nodata value has been clamped to 0`` at warning
       level and carries on, so the outside of the cutline becomes land-cover
       class 0. Here that is an error naming a value that fits.
    3. The cutline needs an OGR **datasource**, not a geometry. It is built
       in-memory (see :func:`_vsimem_vector`) so nothing touches disk and
       nothing has to be cleaned up by the caller.
    4. ``cropToCutline`` is deliberately *not* used. It would shrink the output
       to the cutline's envelope and throw away the snapped origin computed by
       :func:`reference_grid`, which is exactly the alignment this module
       exists to preserve.

    ``dtype`` is a ``gdal.GDT_*`` constant; by default the source's type is
    kept, which matters for class rasters — promoting land cover to Float32
    quadruples the file and invites somebody to interpolate it later.

    ``src_nodata`` overrides the source's declared nodata, for the common case
    of a DEM that uses -32768 as a sentinel without recording it in the file.
    """
    src_path = os.fspath(src_path)
    out_path = os.fspath(out_path)
    algorithm = _resample_algorithm(resample)
    _ensure_readable(src_path)

    source = gdal.Open(src_path, gdal.GA_ReadOnly)
    try:
        if not source.GetProjectionRef() and source.GetGCPCount() == 0:
            raise RasterError(
                f"{src_path} declares no CRS, so it cannot be reprojected. "
                "Assign one first (gdal_edit.py -a_srs) — guessing here would "
                "silently misplace the layer."
            )
        out_type = dtype if dtype is not None else source.GetRasterBand(1).DataType
    finally:
        source = None

    _check_nodata_fits(out_type, nodata, out_path)

    with _vsimem_vector(clip_geojson) as cutline:
        options: dict[str, Any] = {
            "format": "GTiff",
            "dstSRS": grid.wkt,
            "outputBounds": grid.bounds,
            "xRes": grid.pixel_size,
            "yRes": grid.pixel_size,
            "resampleAlg": algorithm,
            "outputType": out_type,
            "dstNodata": nodata,
            "srcNodata": src_nodata,
            "multithread": True,
            "creationOptions": list(_creation_options(out_type)),
        }
        if cutline is not None:
            options["cutlineDSName"] = cutline.path
            options["cutlineLayer"] = cutline.layer
        warped = gdal.Warp(out_path, src_path, **options)

    if warped is None:
        raise RasterError(f"gdal.Warp produced nothing for {src_path}")

    written = (warped.RasterXSize, warped.RasterYSize)
    # Assert rather than trust: Warp reconciles outputBounds against xRes/yRes
    # itself, and a bounds/resolution pair that is off by a rounding error comes
    # back one row short. Every later operation assumes a shared shape, so a
    # silent off-by-one here surfaces as a broadcast error three functions away.
    warped = None
    if written != (grid.width, grid.height):
        raise RasterError(
            f"warp of {src_path} produced {written[0]}x{written[1]} but the "
            f"grid is {grid.width}x{grid.height}; the grid bounds are probably "
            "not a whole multiple of the pixel size"
        )
    return out_path


def slope_degrees(
    dem_path: str | os.PathLike[str],
    out_path: str | os.PathLike[str],
    *,
    compute_edges: bool = True,
    nodata: float = NODATA,
) -> str:
    """Slope in degrees from a DEM already sitting on the analysis grid.

    ``gdal.DEMProcessing`` computes rise over run from a 3x3 Horn kernel, so it
    is only in degrees when the rise and the run are in the same unit. Here they
    are: the DEM is in metres above sea level and, after :func:`warp_to_grid`,
    its pixels are metres too. That is why ``scale=1``.

    ``scale`` is the trap. In a geographic CRS the run is in degrees while the
    rise is still in metres, and GDAL has no way to know, so it happily returns
    a slope that is wrong by a factor of about 111 320 (metres per degree at the
    equator — and it varies with latitude, so no single number fixes it). Rather
    than apply an approximate correction, this function refuses: the pipeline
    warps every layer to a projected grid before it gets here, so a geographic
    DEM at this point means a stage was skipped.

    ``compute_edges`` trades one error for another and there is no third option.
    With it off, the outermost ring is nodata, and on a tightly cropped grid
    that is the boundary of the study area. With it on, GDAL replicates the edge
    row/column to fill the kernel, which biases the border downward — a constant
    45-degree ramp reads 26.57 degrees in the corners. Default on, because a
    slightly wrong border beats a hole in the overlay; pass ``False`` and a
    margin on the grid when the border values matter.
    """
    dem_path = os.fspath(dem_path)
    out_path = os.fspath(out_path)
    _ensure_readable(dem_path)

    dem = gdal.Open(dem_path, gdal.GA_ReadOnly)
    srs = dem.GetSpatialRef()
    geotransform = dem.GetGeoTransform()
    dem = None

    if srs is None:
        raise RasterError(
            f"{dem_path} declares no CRS, so slope units cannot be determined. "
            "Run warp_to_grid first."
        )
    if srs.IsGeographic():
        raise RasterError(
            f"{dem_path} is in a geographic CRS ({srs.GetName()}). Slope from "
            "degrees of longitude is wrong by a latitude-dependent factor of "
            "roughly 111320. Run warp_to_grid onto a metric projected grid "
            "(e.g. EPSG:32637) first."
        )

    pixel_w, pixel_h = abs(geotransform[1]), abs(geotransform[5])
    if not math.isclose(pixel_w, pixel_h, rel_tol=1e-6):
        raise RasterError(
            f"{dem_path} has {pixel_w} x {pixel_h} m pixels. A 3x3 slope kernel "
            "on rectangular pixels mixes two different run lengths; warp to a "
            "square grid first."
        )

    result = gdal.DEMProcessing(
        out_path,
        dem_path,
        "slope",
        format="GTiff",
        slopeFormat="degree",
        # 1 because the DEM's vertical unit (metres) already matches its
        # horizontal unit (metres); see the docstring for why this is checked
        # rather than assumed.
        scale=1.0,
        alg="Horn",
        computeEdges=compute_edges,
        creationOptions=list(_creation_options(gdal.GDT_Float32)),
    )
    if result is None:
        raise RasterError(f"gdal.DEMProcessing produced no slope for {dem_path}")
    band = result.GetRasterBand(1)
    # DEMProcessing writes -9999 into unreachable pixels but does not always
    # record it as the band's nodata, so a reader sees -9999 as a real slope.
    band.SetNoDataValue(float(nodata))
    band = None
    result = None
    return out_path


def proximity_metres(
    src_path: str | os.PathLike[str],
    out_path: str | os.PathLike[str],
    *,
    target_values: Sequence[int] | None = None,
    max_distance_m: float | None = None,
    band: int = 1,
    nodata: float = NODATA,
) -> str:
    """Euclidean distance, in metres, from every pixel to the nearest target.

    Targets are non-zero pixels by default — a river raster burned as 1 on 0 —
    or exactly the pixel values in ``target_values`` when given, which is how
    you get "distance to perennial rivers only" out of a stream-order raster.

    **The unit trap.** ``GDALComputeProximity`` defaults to ``DISTUNITS=PIXEL``
    and returns a count of pixels. On this pipeline's 30 m grid that is a factor
    of 30 between what the function returns and what the criterion table expects
    — and both numbers are plausible distances, so nothing looks wrong. Passing
    ``DISTUNITS=GEO`` makes GDAL multiply the pixel distance by the pixel size
    internally, giving metres directly, which is what this function always does.

    ``DISTUNITS=GEO`` scales by the *x* pixel size alone and only warns on
    rectangular pixels, so the y distances come out wrong by the aspect ratio.
    The squareness check below turns that warning into a refusal.

    ``max_distance_m`` caps the search. Beyond it pixels get ``nodata`` rather
    than a distance. Worth setting: the flood criterion saturates a few
    kilometres from a river, and the unbounded search is the expensive part of
    the call.

    The output has to be created and handed to GDAL as an existing band — unlike
    Warp or DEMProcessing, ``ComputeProximity`` writes into a band rather than
    creating a file — which is also the chance to give it the source's exact
    geotransform, so the result is guaranteed to stay on the grid.
    """
    src_path = os.fspath(src_path)
    out_path = os.fspath(out_path)
    _ensure_readable(src_path)
    # Validated before anything is opened or created, so no failure path below
    # has to unwind a half-built GeoTIFF.
    if max_distance_m is not None and max_distance_m <= 0:
        raise RasterError(f"max_distance_m must be positive, got {max_distance_m!r}")

    source = gdal.Open(src_path, gdal.GA_ReadOnly)
    geotransform = source.GetGeoTransform()
    pixel_w, pixel_h = abs(geotransform[1]), abs(geotransform[5])
    if not math.isclose(pixel_w, pixel_h, rel_tol=1e-6):
        source = None
        raise RasterError(
            f"{src_path} has {pixel_w} x {pixel_h} m pixels. GDAL's "
            "georeferenced proximity scales by the x size only, so y distances "
            "would be wrong by the aspect ratio. Warp to a square grid first."
        )
    if band < 1 or band > source.RasterCount:
        count = source.RasterCount
        source = None
        raise RasterError(f"band {band} requested but {src_path} has {count}")

    width, height = source.RasterXSize, source.RasterYSize
    projection = source.GetProjection()

    driver = gdal.GetDriverByName("GTiff")
    destination = driver.Create(
        out_path,
        width,
        height,
        1,
        gdal.GDT_Float32,
        options=list(_creation_options(gdal.GDT_Float32)),
    )
    destination.SetGeoTransform(geotransform)
    destination.SetProjection(projection)
    target_band = destination.GetRasterBand(1)
    target_band.SetNoDataValue(float(nodata))

    options = [
        "DISTUNITS=GEO",
        f"NODATA={nodata}",
    ]
    if target_values:
        options.append("VALUES=" + ",".join(str(int(v)) for v in target_values))
    if max_distance_m is not None:
        # MAXDIST is read in the DISTUNITS just set, so this is metres too.
        # Left in pixels it would cap the search 30x too close.
        options.append(f"MAXDIST={max_distance_m}")

    try:
        gdal.ComputeProximity(source.GetRasterBand(band), target_band, options)
    finally:
        # Order matters: the band wrapper must go before the dataset it borrows
        # from, and the dataset must go before the function returns or the
        # GeoTIFF's directory is never written and the file reads as truncated.
        target_band = None
        destination = None
        source = None
    return out_path


def rasterize_geometry(
    geojson: Mapping[str, Any],
    grid: Grid,
    out_path: str | os.PathLike[str],
    *,
    burn_value: int = 1,
    background: int = 0,
    all_touched: bool = False,
    nodata: float | None = None,
) -> str:
    """Burn a WGS84 GeoJSON polygon onto ``grid`` as an integer mask.

    The output is Byte when the values fit and Int32 otherwise, so a mask of a
    national grid costs a byte a pixel rather than four.

    The destination is created here at the grid's exact size and geotransform
    and then passed to ``gdal.Rasterize`` as a dataset. Letting Rasterize create
    the file from ``outputBounds`` plus ``xRes`` instead re-derives the size
    from floating-point bounds, which is the same off-by-one row that
    :func:`warp_to_grid` guards against.

    The geometry is reprojected on the way in: the in-memory GeoJSON carries
    OGC:CRS84 and the grid carries a projected CRS, and Rasterize builds the
    transform between them. Feeding it metre coordinates in a file tagged as
    lon/lat is the classic version of this bug — GDAL does not complain, it just
    burns nothing, because the reprojected polygon lands in the Gulf of Guinea.

    ``all_touched`` burns every pixel the polygon boundary crosses instead of
    only those whose centre falls inside. Use it for thin features (a river
    line, a narrow floodplain) that would otherwise vanish between pixel
    centres; leave it off for area masks, where it inflates the area by a ring
    one pixel wide.
    """
    out_path = os.fspath(out_path)
    values = (burn_value, background)
    gdal_type = (
        gdal.GDT_Byte
        if all(0 <= v <= 255 for v in values)
        else gdal.GDT_Int32
    )
    if nodata is not None:
        _check_nodata_fits(gdal_type, nodata, out_path)

    driver = gdal.GetDriverByName("GTiff")
    destination = driver.Create(
        out_path,
        grid.width,
        grid.height,
        1,
        gdal_type,
        options=list(_creation_options(gdal_type)),
    )
    destination.SetGeoTransform(grid.geotransform)
    destination.SetProjection(grid.wkt)
    mask_band = destination.GetRasterBand(1)
    mask_band.Fill(float(background))
    if nodata is not None:
        mask_band.SetNoDataValue(float(nodata))
    mask_band = None

    with _vsimem_vector(geojson) as vector:
        if vector is None:
            destination = None
            raise RasterError("rasterize_geometry needs a geometry, got none")
        try:
            gdal.Rasterize(
                destination,
                vector.path,
                layers=[vector.layer],
                burnValues=[burn_value],
                allTouched=all_touched,
            )
        finally:
            destination = None
    return out_path


def read_band(
    path: str | os.PathLike[str],
    band: int = 1,
    *,
    as_nan: bool = True,
) -> tuple[np.ndarray, float | None]:
    """Read one band into a numpy array, with its nodata value.

    Returns ``(array, nodata)``. The nodata is returned even when ``as_nan``
    has already applied it, because :func:`write_array` needs it to put the
    sentinel back when the array is written out again.

    With ``as_nan`` (the default) the array comes back as float32 or float64
    with nodata replaced by ``np.nan``, so ``np.nanmean`` and friends do the
    right thing and, more importantly, so that arithmetic on it cannot quietly
    average a -9999 into a risk score. Pass ``as_nan=False`` for class rasters,
    where the integer codes are the point and NaN would force a float dtype
    that cannot represent them exactly above 2**24.

    The nodata comparison is done after casting the sentinel to the array's
    dtype. -9999.0 as a Python float is a float64; the band stores a float32; on
    a direct ``==`` numpy promotes the array to float64 and the values still
    match here, but for a sentinel like 1e30 or 0.1 the two differ in the last
    bits and the mask comes back empty for no visible reason.
    """
    path = os.fspath(path)
    _ensure_readable(path)
    dataset = gdal.Open(path, gdal.GA_ReadOnly)
    try:
        if band < 1 or band > dataset.RasterCount:
            raise RasterError(
                f"band {band} requested but {path} has {dataset.RasterCount}"
            )
        # The band is a view onto the dataset. `gdal.Open(p).GetRasterBand(1)`
        # on one line frees the dataset as soon as the expression ends and the
        # band raises a SWIG TypeError on first use, so the dataset is held in a
        # local for as long as the band is touched.
        raster_band = dataset.GetRasterBand(band)
        array = raster_band.ReadAsArray()
        nodata = raster_band.GetNoDataValue()
        raster_band = None
    finally:
        dataset = None

    if array is None:
        raise RasterError(f"could not read band {band} of {path}")

    if as_nan and nodata is not None:
        if not np.issubdtype(array.dtype, np.floating):
            array = array.astype(np.float32)
        array = array.copy()
        array[array == array.dtype.type(nodata)] = np.nan
    return array, nodata


def write_array(
    array: np.ndarray,
    grid: Grid,
    out_path: str | os.PathLike[str],
    *,
    nodata: float | None = NODATA,
    dtype: int | None = None,
) -> str:
    """Write ``array`` as a tiled, LZW-compressed GeoTIFF on ``grid``.

    ``dtype`` is a ``gdal.GDT_*`` constant; when omitted it is inferred from the
    numpy dtype, so ``float32`` in gives Float32 out and no precision is
    invented or lost.

    NaN is translated to ``nodata`` on the way out. Leaving NaN in the file
    would technically work for float bands, but the criterion rasters are read
    back by GeoServer and by QGIS styling, and both treat the declared nodata
    value as the transparent one while NaN renders as a black hole.

    The dataset is set to ``None`` before returning. GDAL writes the GeoTIFF
    header and directory on close, so a function that returns without closing
    leaves a file whose size is right and whose content is unreadable — and
    Python's garbage collector will usually close it a moment later, which makes
    the bug intermittent and dependent on how much memory is free.
    """
    out_path = os.fspath(out_path)
    array = np.asarray(array)
    if array.ndim != 2:
        raise RasterError(
            f"write_array expects a 2-D array, got shape {array.shape}"
        )
    if array.shape != grid.shape:
        raise RasterError(
            f"array is {array.shape[0]}x{array.shape[1]} but the grid is "
            f"{grid.height}x{grid.width} (rows x cols); the array was probably "
            "built from a different grid"
        )

    if array.dtype == np.bool_:
        # GDAL has no 1-bit array type in the Python bindings; a bool array
        # reaches WriteArray as an unsupported dtype and fails with a message
        # about the buffer, not about the mask the caller actually built.
        array = array.astype(np.uint8)

    if dtype is None:
        dtype = gdal_array.NumericTypeCodeToGDALTypeCode(array.dtype.type)
        if dtype is None:
            raise RasterError(
                f"numpy dtype {array.dtype} has no GDAL equivalent; cast to "
                "float32 or int32 before writing"
            )
    if nodata is not None:
        _check_nodata_fits(dtype, nodata, out_path)

    if np.issubdtype(array.dtype, np.floating) and np.isnan(array).any():
        if nodata is None:
            raise RasterError(
                f"{out_path}: the array contains NaN but nodata is None, so "
                "the gaps would be written as NaN and read back as data"
            )
        array = np.where(np.isnan(array), nodata, array)

    driver = gdal.GetDriverByName("GTiff")
    dataset = driver.Create(
        out_path,
        grid.width,
        grid.height,
        1,
        dtype,
        options=list(_creation_options(dtype)),
    )
    try:
        dataset.SetGeoTransform(grid.geotransform)
        dataset.SetProjection(grid.wkt)
        raster_band = dataset.GetRasterBand(1)
        if nodata is not None:
            raster_band.SetNoDataValue(float(nodata))
        raster_band.WriteArray(array)
        raster_band.FlushCache()
        raster_band = None
    finally:
        dataset = None
    return out_path


def zonal_stats(
    value_path: str | os.PathLike[str],
    zone_path: str | os.PathLike[str],
    *,
    value_band: int = 1,
    zone_band: int = 1,
    background: int | None = 0,
) -> dict[int, ZoneStats]:
    """Summarise a value raster per zone of an integer zone/mask raster.

    ``zone_path`` is either a binary mask from :func:`rasterize_geometry` (one
    zone, 1) or a class raster from the risk classification (zones 1..5). The
    two rasters must be on the same grid; they are not resampled here, because
    a resample inside a statistics function is a silent change to the numbers it
    reports. Build both with :func:`warp_to_grid` or :func:`write_array` on the
    same :class:`Grid` and this never comes up.

    ``background`` is the zone code to ignore, 0 by default, so a mask's outside
    does not come back as a zone. Pass ``None`` to keep it.

    Statistics use only pixels that are valid in **both** rasters: a zone pixel
    where the value raster has nodata contributes to ``count`` but not to
    ``valid_count`` or the mean. Folding nodata into the mean is the quiet way
    a clipped-off corner of a catchment drags a mean rainfall down by 40%.
    """
    values, _ = read_band(value_path, value_band, as_nan=True)
    zones, zone_nodata = read_band(zone_path, zone_band, as_nan=False)

    if values.shape != zones.shape:
        raise RasterError(
            f"value raster is {values.shape} and zone raster is {zones.shape}; "
            "warp both onto the same Grid before computing zonal statistics"
        )

    zone_ints = zones.astype(np.int64, copy=False)
    considered = np.ones(zone_ints.shape, dtype=bool)
    if zone_nodata is not None:
        considered &= zone_ints != np.int64(zone_nodata)
    if background is not None:
        considered &= zone_ints != np.int64(background)

    value_floats = values.astype(np.float64, copy=False)
    valid_values = np.isfinite(value_floats)

    results: dict[int, ZoneStats] = {}
    # One pass per zone. The class rasters this runs on have a handful of zones,
    # so the O(zones x pixels) masking is cheaper in wall clock and far cheaper
    # in reader effort than a bincount over a remapped index.
    for code in np.unique(zone_ints[considered]):
        in_zone = considered & (zone_ints == code)
        usable = in_zone & valid_values
        selected = value_floats[usable]
        count = int(in_zone.sum())
        valid_count = int(selected.size)
        results[int(code)] = ZoneStats(
            zone=int(code),
            count=count,
            valid_count=valid_count,
            total=float(selected.sum()) if valid_count else 0.0,
            mean=float(selected.mean()) if valid_count else None,
            minimum=float(selected.min()) if valid_count else None,
            maximum=float(selected.max()) if valid_count else None,
        )
    return results


# --------------------------------------------------------------------------
# internals
# --------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class _VsimemVector:
    path: str
    layer: str


def _creation_options(gdal_type: int) -> tuple[str, ...]:
    predictor = (
        _PREDICTOR_FLOAT
        if gdal_type in (gdal.GDT_Float32, gdal.GDT_Float64)
        else _PREDICTOR_INT
    )
    return _CREATION_OPTIONS + (predictor,)


#: Inclusive value range of every GDAL integer type this module writes. Used to
#: turn GDAL's "clamped to 0" warning into a refusal; floats are absent because
#: any sentinel fits in them.
_INTEGER_RANGES: Final[dict[int, tuple[int, int]]] = {
    gdal.GDT_Byte: (0, 255),
    gdal.GDT_Int8: (-128, 127),
    gdal.GDT_UInt16: (0, 65535),
    gdal.GDT_Int16: (-32768, 32767),
    gdal.GDT_UInt32: (0, 4294967295),
    gdal.GDT_Int32: (-2147483648, 2147483647),
}


def _check_nodata_fits(gdal_type: int, nodata: float, out_path: str) -> None:
    bounds = _INTEGER_RANGES.get(gdal_type)
    if bounds is None:
        return
    low, high = bounds
    if not (low <= nodata <= high) or nodata != int(nodata):
        raise RasterError(
            f"{out_path}: nodata {nodata} does not fit "
            f"{gdal.GetDataTypeName(gdal_type)} ({low}..{high}). GDAL would "
            f"clamp it to {min(max(nodata, low), high):g} with only a warning, "
            "and that value is a real class code. Pass a nodata inside the "
            "range, or dtype=gdal.GDT_Float32."
        )


def _resample_algorithm(name: str) -> int:
    try:
        return _RESAMPLE_ALGORITHMS[name.lower()]
    except KeyError:
        raise RasterError(
            f"unknown resampling {name!r}; choose one of "
            f"{', '.join(sorted(_RESAMPLE_ALGORITHMS))}. Use 'nearest' or "
            "'mode' for class rasters and 'bilinear' or 'cubic' for "
            "continuous ones."
        ) from None


def _ensure_readable(path: str) -> None:
    """Fail with the path rather than with GDAL's 'not recognized as a
    supported file format', which says nothing about which file."""
    if not os.path.exists(path):
        raise RasterError(f"raster not found: {path}")


def _srs_from_user_input(definition: str) -> osr.SpatialReference:
    """Build an SRS from ``"EPSG:32637"``, a WKT string, a PROJ string or a
    ``.prj`` path, with lon/lat axis order forced.

    The axis-order call is not optional. Since GDAL 3, an SRS built from
    EPSG:4326 honours the authority's declared order, which for 4326 is
    *latitude first*. GeoJSON, ``outputBounds``, and every coordinate in this
    module are lon/lat, so without this every transform silently swaps x and y
    and puts Kenya in the Indian Ocean south of Somalia.
    """
    srs = osr.SpatialReference()
    try:
        srs.SetFromUserInput(definition)
    except RuntimeError as exc:
        raise RasterError(f"unrecognised CRS {definition!r}: {exc}") from exc
    srs.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    return srs


def _geometry_from_geojson(geojson: Mapping[str, Any]) -> ogr.Geometry:
    """Accept a geometry, a Feature or a FeatureCollection and return one
    OGR geometry, because the app posts whichever of the three its map widget
    happened to produce."""
    if not isinstance(geojson, Mapping):
        raise RasterError(
            f"expected a GeoJSON mapping, got {type(geojson).__name__}"
        )

    kind = geojson.get("type")
    if kind == "FeatureCollection":
        features = geojson.get("features") or []
        if not features:
            raise RasterError("GeoJSON FeatureCollection has no features")
        merged: ogr.Geometry | None = None
        for feature in features:
            part = _geometry_from_geojson(feature)
            # Dissolved pairwise rather than with UnionCascaded, which raises
            # "must be a MultiPolygon" on a heterogeneous collection — and a
            # FeatureCollection from the app can mix a drawn polygon with a
            # selected county's multipolygon. Feature counts here are single
            # digits, so the quadratic cost of pairwise union is irrelevant.
            # Dissolving at all matters: separate overlapping rings would
            # double-count their shared area in the zonal statistics.
            merged = part.Clone() if merged is None else merged.Union(part)
        if merged is None or merged.IsEmpty():
            raise RasterError("GeoJSON FeatureCollection dissolved to nothing")
        return merged
    if kind == "Feature":
        geometry = geojson.get("geometry")
        if geometry is None:
            raise RasterError("GeoJSON Feature has no geometry")
        return _geometry_from_geojson(geometry)

    try:
        geometry = ogr.CreateGeometryFromJson(json.dumps(dict(geojson)))
    except (RuntimeError, TypeError, ValueError) as exc:
        raise RasterError(f"invalid GeoJSON geometry: {exc}") from exc
    if geometry is None:
        raise RasterError(f"invalid GeoJSON geometry of type {kind!r}")
    if geometry.IsEmpty():
        raise RasterError("GeoJSON geometry is empty")
    return geometry


def _projected_envelope(
    geometry: ogr.Geometry,
    target: osr.SpatialReference,
) -> tuple[float, float, float, float]:
    """Envelope of a WGS84 geometry in ``target``, as ``(minx, maxx, miny,
    maxy)`` — OGR's order, not Warp's.

    The geometry is densified before it is transformed. A straight line in
    lon/lat is a curve in UTM, so transforming only the four corners of a
    polygon underestimates the envelope by however much the edges bow — tens of
    metres for a Kenyan county, and the missing strip is exactly the boundary
    the cutline will later clip against.
    """
    source = _srs_from_user_input("EPSG:4326")
    working = geometry.Clone()
    working.AssignSpatialReference(source)

    minx, maxx, miny, maxy = working.GetEnvelope()
    span = max(maxx - minx, maxy - miny)
    # ~1% of the extent, floored so a tiny AOI is not densified into millions of
    # vertices and capped so a national polygon still gets enough of them.
    working.Segmentize(max(min(span / 100.0, 0.05), 1e-4))

    try:
        working.TransformTo(target)
    except RuntimeError as exc:
        raise RasterError(
            f"could not reproject the area of interest into "
            f"{target.GetName()!r}: {exc}. Check the geometry is WGS84 "
            "lon/lat and inside the CRS's area of use."
        ) from exc
    return working.GetEnvelope()


@contextmanager
def _vsimem_vector(
    geojson: Mapping[str, Any] | None,
) -> Iterator[_VsimemVector | None]:
    """Expose a GeoJSON geometry as an OGR datasource GDAL can open by name.

    ``gdal.Warp(cutlineDSName=...)`` and ``gdal.Rasterize`` take a *path*, not a
    geometry, so the geometry has to become a file. ``/vsimem`` makes that file
    live in RAM, which keeps a concurrent pipeline off the disk and means there
    is nothing to clean up if the process dies.

    The name carries a uuid because ``/vsimem`` is process-global: two overlay
    jobs running in the same worker would otherwise open each other's cutline,
    and the symptom is one job's output clipped to the other job's county.

    The layer name is read back from the datasource rather than assumed from the
    filename. The GeoJSON driver derives it from the basename today, but pinning
    the behaviour is one line and a wrong layer name yields an empty cutline,
    which looks exactly like a geometry that misses the raster.
    """
    if geojson is None:
        yield None
        return

    geometry = _geometry_from_geojson(geojson)
    feature_collection = {
        "type": "FeatureCollection",
        # RFC 7946 fixes GeoJSON to WGS84 lon/lat, and the GeoJSON driver tags
        # the layer OGC:CRS84 accordingly. Warp and Rasterize then build the
        # transform into the grid's CRS themselves — which is why the cutline is
        # not pre-projected here.
        "features": [
            {
                "type": "Feature",
                "properties": {},
                "geometry": json.loads(geometry.ExportToJson()),
            }
        ],
    }
    path = f"/vsimem/aoi_{uuid.uuid4().hex}.geojson"
    gdal.FileFromMemBuffer(path, json.dumps(feature_collection).encode("utf-8"))
    try:
        source = ogr.Open(path)
        if source is None or source.GetLayerCount() == 0:
            raise RasterError(
                "the area geometry did not produce a usable OGR layer; it is "
                "probably not a valid GeoJSON polygon"
            )
        layer_name = source.GetLayer(0).GetName()
        source = None
        yield _VsimemVector(path=path, layer=layer_name)
    finally:
        # Unlink rather than leak: /vsimem is a process-lifetime heap, so a
        # long-running worker that forgets this grows by one geometry per job.
        gdal.Unlink(path)


def transform_bounds(
    bounds: tuple[float, float, float, float],
    source_crs: str,
    target_crs: str,
) -> tuple[float, float, float, float]:
    """Reproject an axis-aligned extent, corner by corner.

    All four corners, not two. A rectangle in one projection is not a rectangle
    in another — its edges bow — so transforming only the lower-left and
    upper-right corners and calling that the extent clips off whatever bulges
    past them. Over a small area the error is metres; over a UTM zone it is
    kilometres, and it silently removes data from the edge of the study area.

    Axis order is forced to x,y with ``OAMS_TRADITIONAL_GIS_ORDER``. Without it
    PROJ 6+ honours the CRS's declared order and EPSG:4326 comes back as
    (latitude, longitude), which reads as a valid extent in completely the
    wrong hemisphere.
    """
    if source_crs == target_crs:
        return bounds

    source = _srs_from_user_input(source_crs)
    target = _srs_from_user_input(target_crs)
    source.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    target.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)

    try:
        transform = osr.CoordinateTransformation(source, target)
    except RuntimeError as exc:
        raise RasterError(
            f"cannot transform from {source_crs} to {target_crs}: {exc}"
        ) from exc

    minx, miny, maxx, maxy = bounds
    corners = [(minx, miny), (minx, maxy), (maxx, miny), (maxx, maxy)]
    xs: list[float] = []
    ys: list[float] = []
    for x, y in corners:
        tx, ty, *_ = transform.TransformPoint(x, y)
        xs.append(tx)
        ys.append(ty)

    return (min(xs), min(ys), max(xs), max(ys))
