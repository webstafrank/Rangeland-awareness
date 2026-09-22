"""Gate tests for apps.analysis.pipeline.raster.

Every test builds real GeoTIFFs with GDAL in a temporary directory and asserts
on numbers that can be worked out by hand. Nothing is mocked: the point of this
module is that GDAL's defaults are wrong for this pipeline, and a mocked GDAL
would happily agree with whatever the code asked it.

No Django, no network, no fixtures on disk. Run with:

    cd services/backend && python3 -m unittest apps.analysis.tests.test_raster -v
"""

from __future__ import annotations

import math
import os
import tempfile
import unittest
from typing import Any

import numpy as np
from osgeo import gdal, osr

from apps.analysis.pipeline.raster import (
    NODATA,
    Grid,
    RasterError,
    proximity_metres,
    rasterize_geometry,
    read_band,
    reference_grid,
    slope_degrees,
    warp_to_grid,
    write_array,
    zonal_stats,
)

gdal.UseExceptions()

UTM37N = "EPSG:32637"

# A small block of Laikipia, Kenya. Inside UTM 37N's area of use and close
# enough to the equator that the northings stay small and easy to read.
AOI: dict[str, Any] = {
    "type": "Polygon",
    "coordinates": [
        [
            [36.08, 0.92],
            [36.22, 0.92],
            [36.22, 0.78],
            [36.08, 0.78],
            [36.08, 0.92],
        ]
    ],
}


def _srs(definition: str) -> osr.SpatialReference:
    srs = osr.SpatialReference()
    srs.SetFromUserInput(definition)
    srs.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    return srs


def _make_raster(
    path: str,
    array: np.ndarray,
    geotransform: tuple[float, float, float, float, float, float],
    crs: str | None = UTM37N,
    gdal_type: int = gdal.GDT_Float32,
    nodata: float | None = None,
) -> str:
    """Write a bare GeoTIFF straight through GDAL, bypassing the module.

    Deliberately not written with write_array: a test whose fixture uses the
    code under test cannot fail when that code is wrong in a self-consistent
    way.
    """
    driver = gdal.GetDriverByName("GTiff")
    dataset = driver.Create(path, array.shape[1], array.shape[0], 1, gdal_type)
    dataset.SetGeoTransform(geotransform)
    if crs is not None:
        dataset.SetProjection(_srs(crs).ExportToWkt())
    band = dataset.GetRasterBand(1)
    if nodata is not None:
        band.SetNoDataValue(float(nodata))
    band.WriteArray(array)
    band = None
    dataset = None
    return path


def _open_stats(
    path: str,
) -> tuple[np.ndarray, float | None, tuple[float, ...], int, int]:
    """Read a raster with plain GDAL, again to keep the fixture independent."""
    dataset = gdal.Open(path)
    band = dataset.GetRasterBand(1)
    array = band.ReadAsArray()
    nodata = band.GetNoDataValue()
    geotransform = dataset.GetGeoTransform()
    size = (dataset.RasterXSize, dataset.RasterYSize)
    band = None
    dataset = None
    return array, nodata, geotransform, size[0], size[1]


class TempDirTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.tmp = self._tmp.name
        self.addCleanup(self._tmp.cleanup)

    def path(self, name: str) -> str:
        return os.path.join(self.tmp, name)


class ReferenceGridTest(TempDirTestCase):
    def test_origin_snaps_to_a_multiple_of_the_resolution(self) -> None:
        grid = reference_grid(AOI, UTM37N, 100.0)
        self.assertEqual(grid.origin_x % 100.0, 0.0)
        self.assertEqual(grid.origin_y % 100.0, 0.0)
        self.assertEqual(grid.pixel_size, 100.0)
        self.assertEqual(grid.crs, UTM37N)

    def test_overlapping_areas_land_on_the_same_lattice(self) -> None:
        """The reason the snap exists: two runs must be addable pixel for
        pixel, so their origins must differ by a whole number of pixels."""
        shifted = {
            "type": "Polygon",
            "coordinates": [
                [
                    [36.11, 0.95],
                    [36.27, 0.95],
                    [36.27, 0.81],
                    [36.11, 0.81],
                    [36.11, 0.95],
                ]
            ],
        }
        a = reference_grid(AOI, UTM37N, 30.0)
        b = reference_grid(shifted, UTM37N, 30.0)
        self.assertAlmostEqual((b.origin_x - a.origin_x) % 30.0, 0.0, places=9)
        self.assertAlmostEqual((b.origin_y - a.origin_y) % 30.0, 0.0, places=9)

    def test_geotransform_and_bounds_are_consistent(self) -> None:
        grid = reference_grid(AOI, UTM37N, 100.0)
        gt = grid.geotransform
        self.assertEqual(gt[0], grid.origin_x)
        self.assertEqual(gt[1], 100.0)
        self.assertEqual(gt[5], -100.0)
        minx, miny, maxx, maxy = grid.bounds
        self.assertEqual(maxx - minx, grid.width * 100.0)
        self.assertEqual(maxy - miny, grid.height * 100.0)
        self.assertEqual(grid.shape, (grid.height, grid.width))

    def test_margin_grows_the_grid_by_whole_pixels(self) -> None:
        tight = reference_grid(AOI, UTM37N, 100.0)
        padded = reference_grid(AOI, UTM37N, 100.0, margin_m=300.0)
        self.assertEqual(padded.width, tight.width + 6)
        self.assertEqual(padded.height, tight.height + 6)
        self.assertEqual(padded.origin_x, tight.origin_x - 300.0)
        self.assertEqual(padded.origin_y, tight.origin_y + 300.0)

    def test_densified_envelope_is_not_smaller_than_the_corner_envelope(self) -> None:
        """A straight lon/lat edge bows in UTM, so transforming only the four
        corners underestimates the envelope. The grid must cover the bow."""
        transform = osr.CoordinateTransformation(_srs("EPSG:4326"), _srs(UTM37N))
        corners = [transform.TransformPoint(x, y)[:2] for x, y in AOI["coordinates"][0]]
        naive_maxy = max(p[1] for p in corners)
        naive_miny = min(p[1] for p in corners)
        grid = reference_grid(AOI, UTM37N, 10.0)
        self.assertGreaterEqual(grid.origin_y, naive_maxy)
        self.assertLessEqual(grid.bounds[1], naive_miny)

    def test_accepts_feature_and_feature_collection(self) -> None:
        feature = {"type": "Feature", "properties": {}, "geometry": AOI}
        collection = {"type": "FeatureCollection", "features": [feature]}
        base = reference_grid(AOI, UTM37N, 100.0)
        self.assertTrue(base.matches(reference_grid(feature, UTM37N, 100.0)))
        self.assertTrue(base.matches(reference_grid(collection, UTM37N, 100.0)))

    def test_feature_collection_of_several_polygons_is_dissolved(self) -> None:
        """Two touching blocks, one drawn as a Polygon and one as a
        MultiPolygon. UnionCascaded refuses that mix, so the code unions
        pairwise; the grid must span both."""
        west = AOI
        east = {
            "type": "MultiPolygon",
            "coordinates": [
                [
                    [
                        [36.22, 0.92],
                        [36.36, 0.92],
                        [36.36, 0.78],
                        [36.22, 0.78],
                        [36.22, 0.92],
                    ]
                ]
            ],
        }
        collection = {
            "type": "FeatureCollection",
            "features": [
                {"type": "Feature", "properties": {}, "geometry": west},
                {"type": "Feature", "properties": {}, "geometry": east},
            ],
        }
        both = reference_grid(collection, UTM37N, 100.0)
        west_only = reference_grid(west, UTM37N, 100.0)
        self.assertGreater(both.width, west_only.width * 1.8)
        self.assertEqual(both.height, west_only.height)
        self.assertEqual(both.origin_x, west_only.origin_x)

    def test_rejects_a_geographic_target_crs(self) -> None:
        with self.assertRaises(RasterError) as caught:
            reference_grid(AOI, "EPSG:4326", 30.0)
        self.assertIn("geographic", str(caught.exception))

    def test_rejects_a_non_positive_resolution(self) -> None:
        with self.assertRaises(RasterError):
            reference_grid(AOI, UTM37N, 0.0)

    def test_rejects_an_area_smaller_than_a_pixel(self) -> None:
        speck = {
            "type": "Polygon",
            "coordinates": [
                [
                    [36.0800000, 0.7800000],
                    [36.0800001, 0.7800000],
                    [36.0800001, 0.7800001],
                    [36.0800000, 0.7800001],
                    [36.0800000, 0.7800000],
                ]
            ],
        }
        # ~11 m across. Snapping rounds outward, so without an explicit check
        # this would quietly succeed as a 1x1 grid.
        with self.assertRaises(RasterError) as caught:
            reference_grid(speck, UTM37N, 100.0)
        self.assertIn("thinner than one 100 m pixel", str(caught.exception))
        # margin_m is the documented escape hatch.
        grid = reference_grid(speck, UTM37N, 100.0, margin_m=500.0)
        self.assertGreaterEqual(grid.width, 10)

    def test_rejects_garbage_input(self) -> None:
        with self.assertRaises(RasterError):
            reference_grid({"type": "Polygon"}, UTM37N, 100.0)
        with self.assertRaises(RasterError):
            reference_grid({"type": "FeatureCollection", "features": []},
                           UTM37N, 100.0)


class WriteReadRoundTripTest(TempDirTestCase):
    def setUp(self) -> None:
        super().setUp()
        self.grid = Grid(
            crs=UTM37N,
            wkt=_srs(UTM37N).ExportToWkt(),
            origin_x=200000.0,
            origin_y=100000.0,
            pixel_size=30.0,
            width=3,
            height=3,
        )

    def test_known_3x3_array_round_trips_exactly(self) -> None:
        values = np.array(
            [[1.5, 2.5, 3.5], [4.5, 5.5, 6.5], [7.5, 8.5, 9.5]],
            dtype=np.float32,
        )
        out = write_array(values, self.grid, self.path("rt.tif"))

        array, nodata, geotransform, width, height = _open_stats(out)
        self.assertEqual((width, height), (3, 3))
        self.assertEqual(geotransform, self.grid.geotransform)
        self.assertEqual(nodata, NODATA)
        np.testing.assert_array_equal(array, values)

        back, back_nodata = read_band(out)
        np.testing.assert_array_equal(back, values)
        self.assertEqual(back_nodata, NODATA)
        self.assertEqual(back.dtype, np.float32)

    def test_nan_is_stored_as_nodata_and_read_back_as_nan(self) -> None:
        values = np.array(
            [[1.0, np.nan, 3.0], [4.0, 5.0, 6.0], [7.0, 8.0, np.nan]],
            dtype=np.float32,
        )
        out = write_array(values, self.grid, self.path("nan.tif"))

        raw, _, _, _, _ = _open_stats(out)
        self.assertEqual(raw[0, 1], NODATA)
        self.assertEqual(raw[2, 2], NODATA)
        self.assertFalse(np.isnan(raw).any())

        back, back_nodata = read_band(out, as_nan=True)
        self.assertEqual(back_nodata, NODATA)
        self.assertTrue(math.isnan(float(back[0, 1])))
        self.assertTrue(math.isnan(float(back[2, 2])))
        self.assertEqual(float(back[1, 1]), 5.0)

        untouched, _ = read_band(out, as_nan=False)
        self.assertEqual(float(untouched[0, 1]), NODATA)

    def test_integer_arrays_keep_their_type_and_values(self) -> None:
        classes = np.array([[1, 2, 3], [4, 5, 4], [3, 2, 1]], dtype=np.uint8)
        out = write_array(classes, self.grid, self.path("cls.tif"), nodata=255)

        array, nodata, _, _, _ = _open_stats(out)
        self.assertEqual(array.dtype, np.uint8)
        self.assertEqual(nodata, 255)
        np.testing.assert_array_equal(array, classes)

        back, _ = read_band(out, as_nan=False)
        np.testing.assert_array_equal(back, classes)

    def test_output_is_tiled_and_lzw_compressed(self) -> None:
        values = np.zeros(self.grid.shape, dtype=np.float32)
        out = write_array(values, self.grid, self.path("comp.tif"))
        dataset = gdal.Open(out)
        structure = dataset.GetMetadata("IMAGE_STRUCTURE")
        block = dataset.GetRasterBand(1).GetBlockSize()
        dataset = None
        self.assertEqual(structure.get("COMPRESSION"), "LZW")
        self.assertEqual(block, [256, 256])

    def test_boolean_masks_are_written_as_bytes(self) -> None:
        mask = np.array(
            [[True, False, True], [False, True, False], [True, True, False]]
        )
        out = write_array(mask, self.grid, self.path("mask.tif"), nodata=None)
        array, nodata, _, _, _ = _open_stats(out)
        self.assertIsNone(nodata)
        np.testing.assert_array_equal(array, mask.astype(np.uint8))

    def test_shape_mismatch_is_refused(self) -> None:
        with self.assertRaises(RasterError) as caught:
            write_array(np.zeros((4, 3), np.float32), self.grid,
                        self.path("bad.tif"))
        self.assertIn("grid", str(caught.exception))

    def test_nodata_outside_the_integer_range_is_refused(self) -> None:
        """GDAL clamps an out-of-range nodata to 0 with only a warning, and 0
        is a real land-cover class."""
        with self.assertRaises(RasterError) as caught:
            write_array(np.zeros((3, 3), np.uint8), self.grid,
                        self.path("clamp.tif"), nodata=NODATA)
        self.assertIn("clamp", str(caught.exception).lower())

    def test_missing_file_names_the_path(self) -> None:
        with self.assertRaises(RasterError) as caught:
            read_band(self.path("absent.tif"))
        self.assertIn("absent.tif", str(caught.exception))


class WarpToGridTest(TempDirTestCase):
    def setUp(self) -> None:
        super().setUp()
        self.grid = reference_grid(AOI, UTM37N, 100.0)
        # A WGS84 raster generously covering the AOI, valued so that any pixel
        # that survives the warp is distinguishable from a nodata fill of 0.
        self.source = _make_raster(
            self.path("src4326.tif"),
            np.full((40, 40), 7.0, dtype=np.float32),
            (36.00, 0.01, 0.0, 1.00, 0.0, -0.01),
            crs="EPSG:4326",
        )

    def test_warp_lands_on_exactly_the_requested_grid(self) -> None:
        out = warp_to_grid(self.source, self.path("warped.tif"), self.grid)
        array, nodata, geotransform, width, height = _open_stats(out)
        self.assertEqual((width, height), (self.grid.width, self.grid.height))
        self.assertEqual(geotransform, self.grid.geotransform)
        self.assertEqual(nodata, NODATA)
        # The source blankets the AOI, so with no cutline everything is data.
        self.assertFalse((array == NODATA).any())
        np.testing.assert_allclose(array, 7.0, rtol=0, atol=1e-5)

    def test_cutline_makes_the_outside_nodata(self) -> None:
        """The grid is the AOI's snapped envelope, so its corners fall outside
        a polygon inset from that envelope. Those corners must be nodata."""
        inner = {
            "type": "Polygon",
            "coordinates": [
                [
                    [36.11, 0.89],
                    [36.19, 0.89],
                    [36.19, 0.81],
                    [36.11, 0.81],
                    [36.11, 0.89],
                ]
            ],
        }
        out = warp_to_grid(
            self.source,
            self.path("cut.tif"),
            self.grid,
            clip_geojson=inner,
        )
        array, nodata, geotransform, width, height = _open_stats(out)
        self.assertEqual((width, height), (self.grid.width, self.grid.height))
        self.assertEqual(geotransform, self.grid.geotransform)
        self.assertEqual(nodata, NODATA)

        for corner in (array[0, 0], array[0, -1], array[-1, 0], array[-1, -1]):
            self.assertEqual(float(corner), NODATA)
        self.assertEqual(float(array[height // 2, width // 2]), 7.0)

        inside = float((array != NODATA).sum())
        outside = float((array == NODATA).sum())
        self.assertGreater(inside, 0.0)
        self.assertGreater(outside, 0.0)
        # The inset polygon is 0.08 x 0.08 degrees against a 0.14 x 0.14 AOI,
        # so it covers roughly a third of the grid. A bounding-box clip would
        # pass this too, which is why the corner assertions above are the real
        # test; this one only catches a cutline that clipped everything or
        # nothing.
        self.assertLess(inside / (inside + outside), 0.6)

    def test_nearest_neighbour_preserves_class_codes(self) -> None:
        classes = np.tile(np.array([[1, 2, 3, 4]], dtype=np.uint8), (40, 10))
        source = _make_raster(
            self.path("classes.tif"),
            classes,
            (36.00, 0.01, 0.0, 1.00, 0.0, -0.01),
            crs="EPSG:4326",
            gdal_type=gdal.GDT_Byte,
        )
        out = warp_to_grid(
            source,
            self.path("classes_utm.tif"),
            self.grid,
            resample="nearest",
            nodata=0,
        )
        array, nodata, _, _, _ = _open_stats(out)
        self.assertEqual(array.dtype, np.uint8)
        self.assertEqual(nodata, 0)
        present = set(np.unique(array).tolist()) - {0}
        self.assertTrue(present.issubset({1, 2, 3, 4}), present)

    def test_byte_output_refuses_the_default_float_nodata(self) -> None:
        with self.assertRaises(RasterError) as caught:
            warp_to_grid(
                self.source,
                self.path("byte.tif"),
                self.grid,
                dtype=gdal.GDT_Byte,
            )
        self.assertIn("Byte", str(caught.exception))

    def test_unknown_resampling_lists_the_valid_names(self) -> None:
        with self.assertRaises(RasterError) as caught:
            warp_to_grid(self.source, self.path("x.tif"), self.grid,
                         resample="magic")
        message = str(caught.exception)
        self.assertIn("nearest", message)
        self.assertIn("bilinear", message)

    def test_source_without_a_crs_is_refused(self) -> None:
        rogue = _make_raster(
            self.path("nocrs.tif"),
            np.ones((5, 5), np.float32),
            (0.0, 1.0, 0.0, 0.0, 0.0, -1.0),
            crs=None,
        )
        with self.assertRaises(RasterError) as caught:
            warp_to_grid(rogue, self.path("y.tif"), self.grid)
        self.assertIn("CRS", str(caught.exception))


class SlopeTest(TempDirTestCase):
    """Slope on a synthetic ramp, where the answer is trigonometry.

    A 30 m pixel that rises 30 m per pixel is a 1:1 gradient, which is 45
    degrees exactly. If this test ever reads 89.9, 0.0004 or 111320-ish, the
    scale factor has gone wrong.
    """

    def _ramp(self, rise_per_pixel: float, pixel: float = 30.0,
              size: int = 9, crs: str = UTM37N) -> str:
        columns = np.arange(size, dtype=np.float32) * rise_per_pixel
        elevation = np.repeat(columns[None, :], size, axis=0)
        step = pixel if crs != "EPSG:4326" else pixel / 111320.0
        name = f"ramp_{rise_per_pixel}_{crs.replace(':', '')}.tif"
        return _make_raster(
            self.path(name),
            elevation,
            (200000.0 if crs != "EPSG:4326" else 36.0, step, 0.0,
             100000.0 if crs != "EPSG:4326" else 1.0, 0.0, -step),
            crs=crs,
        )

    def test_one_to_one_gradient_is_45_degrees(self) -> None:
        out = slope_degrees(self._ramp(30.0), self.path("slope45.tif"))
        array, nodata, _, _, _ = _open_stats(out)
        self.assertEqual(nodata, NODATA)
        interior = array[1:-1, 1:-1]
        np.testing.assert_allclose(interior, 45.0, rtol=0, atol=1e-4)

    def test_one_to_two_gradient_is_arctan_one_half(self) -> None:
        out = slope_degrees(self._ramp(15.0), self.path("slope27.tif"))
        array, _, _, _, _ = _open_stats(out)
        expected = math.degrees(math.atan(15.0 / 30.0))
        self.assertAlmostEqual(expected, 26.565051177, places=6)
        np.testing.assert_allclose(array[1:-1, 1:-1], expected,
                                   rtol=0, atol=1e-4)

    def test_flat_ground_is_zero(self) -> None:
        out = slope_degrees(self._ramp(0.0), self.path("flat.tif"))
        array, _, _, _, _ = _open_stats(out)
        np.testing.assert_allclose(array[1:-1, 1:-1], 0.0, rtol=0, atol=1e-6)

    def test_compute_edges_off_leaves_a_nodata_border(self) -> None:
        out = slope_degrees(self._ramp(30.0), self.path("noedge.tif"),
                            compute_edges=False)
        array, _, _, _, _ = _open_stats(out)
        self.assertEqual(float(array[0, 0]), NODATA)
        self.assertEqual(float(array[0, 4]), NODATA)
        np.testing.assert_allclose(array[1:-1, 1:-1], 45.0, rtol=0, atol=1e-4)

    def test_compute_edges_on_fills_the_border_but_biases_it(self) -> None:
        """Documented, not desired: replicating the edge row halves the run at
        the border, so the corner of a 45-degree ramp reads 26.57."""
        out = slope_degrees(self._ramp(30.0), self.path("edge.tif"),
                            compute_edges=True)
        array, _, _, _, _ = _open_stats(out)
        self.assertNotEqual(float(array[0, 0]), NODATA)
        self.assertAlmostEqual(float(array[0, 0]), 26.5651, places=3)
        self.assertAlmostEqual(float(array[0, 4]), 45.0, places=4)

    def test_geographic_dem_is_refused(self) -> None:
        geographic = self._ramp(30.0, crs="EPSG:4326")
        with self.assertRaises(RasterError) as caught:
            slope_degrees(geographic, self.path("geo.tif"))
        message = str(caught.exception)
        self.assertIn("geographic", message)
        self.assertIn("111320", message)

    def test_rectangular_pixels_are_refused(self) -> None:
        oblong = _make_raster(
            self.path("oblong.tif"),
            np.zeros((5, 5), np.float32),
            (200000.0, 30.0, 0.0, 100000.0, 0.0, -10.0),
        )
        with self.assertRaises(RasterError) as caught:
            slope_degrees(oblong, self.path("oblong_slope.tif"))
        self.assertIn("square", str(caught.exception))


class ProximityTest(TempDirTestCase):
    """Distance must come back in metres, not in pixels.

    On a 30 m grid the two differ by a factor of 30 and both look like
    plausible distances, which is exactly why this is asserted rather than
    eyeballed.
    """

    def setUp(self) -> None:
        super().setUp()
        self.pixel = 30.0
        rivers = np.zeros((9, 9), dtype=np.uint8)
        rivers[4, 4] = 1
        self.source = _make_raster(
            self.path("river.tif"),
            rivers,
            (200000.0, self.pixel, 0.0, 100000.0, 0.0, -self.pixel),
            gdal_type=gdal.GDT_Byte,
        )

    def test_three_pixels_away_is_ninety_metres(self) -> None:
        out = proximity_metres(self.source, self.path("prox.tif"))
        array, nodata, geotransform, width, height = _open_stats(out)
        self.assertEqual((width, height), (9, 9))
        self.assertEqual(geotransform,
                         (200000.0, 30.0, 0.0, 100000.0, 0.0, -30.0))
        self.assertEqual(nodata, NODATA)

        self.assertEqual(float(array[4, 4]), 0.0)
        self.assertAlmostEqual(float(array[4, 1]), 90.0, places=4)
        self.assertAlmostEqual(float(array[4, 7]), 90.0, places=4)
        self.assertAlmostEqual(float(array[1, 4]), 90.0, places=4)
        self.assertAlmostEqual(float(array[7, 4]), 90.0, places=4)
        # If DISTUNITS had defaulted to PIXEL this would read 3.0.
        self.assertGreater(float(array[4, 1]), 10.0)

    def test_diagonals_are_euclidean_not_chessboard(self) -> None:
        out = proximity_metres(self.source, self.path("diag.tif"))
        array, _, _, _, _ = _open_stats(out)
        expected = 4.0 * math.sqrt(2.0) * self.pixel
        self.assertAlmostEqual(expected, 169.7056, places=3)
        self.assertAlmostEqual(float(array[0, 0]), expected, places=2)

    def test_max_distance_writes_nodata_beyond_the_cap(self) -> None:
        out = proximity_metres(self.source, self.path("capped.tif"),
                               max_distance_m=60.0)
        array, _, _, _, _ = _open_stats(out)
        self.assertAlmostEqual(float(array[4, 2]), 60.0, places=4)
        self.assertEqual(float(array[4, 1]), NODATA)
        self.assertEqual(float(array[0, 0]), NODATA)

    def test_target_values_select_which_pixels_count(self) -> None:
        stream_order = np.zeros((5, 5), dtype=np.uint8)
        stream_order[0, 0] = 3
        stream_order[4, 4] = 7
        source = _make_raster(
            self.path("orders.tif"),
            stream_order,
            (200000.0, self.pixel, 0.0, 100000.0, 0.0, -self.pixel),
            gdal_type=gdal.GDT_Byte,
        )
        out = proximity_metres(source, self.path("order7.tif"),
                               target_values=[7])
        array, _, _, _, _ = _open_stats(out)
        self.assertEqual(float(array[4, 4]), 0.0)
        # The order-3 pixel is not a target, so it is 4 diagonal steps from the
        # only target there is.
        self.assertAlmostEqual(float(array[0, 0]),
                               4.0 * math.sqrt(2.0) * self.pixel, places=2)

    def test_rectangular_pixels_are_refused(self) -> None:
        oblong = _make_raster(
            self.path("oblong.tif"),
            np.zeros((5, 5), np.uint8),
            (200000.0, 30.0, 0.0, 100000.0, 0.0, -10.0),
            gdal_type=gdal.GDT_Byte,
        )
        with self.assertRaises(RasterError) as caught:
            proximity_metres(oblong, self.path("oblong_prox.tif"))
        self.assertIn("square", str(caught.exception))

    def test_bad_band_is_refused(self) -> None:
        with self.assertRaises(RasterError):
            proximity_metres(self.source, self.path("b.tif"), band=4)

    def test_bad_arguments_leave_no_half_built_file(self) -> None:
        out = self.path("never.tif")
        with self.assertRaises(RasterError):
            proximity_metres(self.source, out, max_distance_m=-1.0)
        self.assertFalse(os.path.exists(out))


class RasterizeTest(TempDirTestCase):
    def setUp(self) -> None:
        super().setUp()
        self.grid = reference_grid(AOI, UTM37N, 100.0)

    def test_burns_the_polygon_and_only_the_polygon(self) -> None:
        inner = {
            "type": "Polygon",
            "coordinates": [
                [
                    [36.11, 0.89],
                    [36.19, 0.89],
                    [36.19, 0.81],
                    [36.11, 0.81],
                    [36.11, 0.89],
                ]
            ],
        }
        out = rasterize_geometry(inner, self.grid, self.path("mask.tif"))
        array, _, geotransform, width, height = _open_stats(out)
        self.assertEqual((width, height), (self.grid.width, self.grid.height))
        self.assertEqual(geotransform, self.grid.geotransform)
        self.assertEqual(array.dtype, np.uint8)
        self.assertEqual(set(np.unique(array).tolist()), {0, 1})

        for corner in (array[0, 0], array[0, -1], array[-1, 0], array[-1, -1]):
            self.assertEqual(int(corner), 0)
        self.assertEqual(int(array[height // 2, width // 2]), 1)

        # 0.08 deg of longitude at the equator is ~8.9 km, and 0.08 deg of
        # latitude ~8.8 km, so the mask is roughly 89 x 88 pixels of 100 m.
        burned = int(array.sum())
        self.assertGreater(burned, 7000)
        self.assertLess(burned, 8500)

    def test_all_touched_burns_at_least_as_many_pixels(self) -> None:
        centred = rasterize_geometry(AOI, self.grid, self.path("centre.tif"))
        touched = rasterize_geometry(AOI, self.grid, self.path("touch.tif"),
                                     all_touched=True)
        a, _, _, _, _ = _open_stats(centred)
        b, _, _, _, _ = _open_stats(touched)
        self.assertGreaterEqual(int(b.sum()), int(a.sum()))

    def test_burn_value_and_background_are_honoured(self) -> None:
        out = rasterize_geometry(AOI, self.grid, self.path("codes.tif"),
                                 burn_value=5, background=9)
        array, _, _, _, _ = _open_stats(out)
        self.assertEqual(set(np.unique(array).tolist()), {5, 9})

    def test_large_codes_widen_the_data_type(self) -> None:
        out = rasterize_geometry(AOI, self.grid, self.path("wide.tif"),
                                 burn_value=100000, background=0)
        array, _, _, _, _ = _open_stats(out)
        self.assertEqual(array.dtype, np.int32)
        self.assertEqual(int(array.max()), 100000)


class ZonalStatsTest(TempDirTestCase):
    """Hand-computed on purpose: the arithmetic below is the specification.

    values                        zones
      1   2   3   4                1 1 2 2
      5   6   7   8                1 1 2 2
      9  10  ND  12                0 0 2 2
     13  14  15  16                0 0 0 0

    zone 1 -> 1, 2, 5, 6              count 4, valid 4, sum 14, mean 3.5
    zone 2 -> 3, 4, 7, 8, ND, 12      count 6, valid 5, sum 34, mean 6.8
    """

    def setUp(self) -> None:
        super().setUp()
        self.grid = Grid(
            crs=UTM37N,
            wkt=_srs(UTM37N).ExportToWkt(),
            origin_x=200000.0,
            origin_y=100000.0,
            pixel_size=30.0,
            width=4,
            height=4,
        )
        values = np.array(
            [
                [1.0, 2.0, 3.0, 4.0],
                [5.0, 6.0, 7.0, 8.0],
                [9.0, 10.0, np.nan, 12.0],
                [13.0, 14.0, 15.0, 16.0],
            ],
            dtype=np.float32,
        )
        zones = np.array(
            [
                [1, 1, 2, 2],
                [1, 1, 2, 2],
                [0, 0, 2, 2],
                [0, 0, 0, 0],
            ],
            dtype=np.uint8,
        )
        self.values = write_array(values, self.grid, self.path("values.tif"))
        self.zones = write_array(zones, self.grid, self.path("zones.tif"),
                                 nodata=None)

    def test_hand_computed_means(self) -> None:
        stats = zonal_stats(self.values, self.zones)
        self.assertEqual(sorted(stats), [1, 2])

        one = stats[1]
        self.assertEqual(one.count, 4)
        self.assertEqual(one.valid_count, 4)
        self.assertEqual(one.total, 14.0)
        self.assertEqual(one.mean, 3.5)
        self.assertEqual(one.minimum, 1.0)
        self.assertEqual(one.maximum, 6.0)

        two = stats[2]
        self.assertEqual(two.count, 6)
        self.assertEqual(two.valid_count, 5)
        self.assertEqual(two.total, 34.0)
        self.assertAlmostEqual(two.mean, 6.8, places=9)
        self.assertEqual(two.minimum, 3.0)
        self.assertEqual(two.maximum, 12.0)

    def test_nodata_pixels_are_counted_but_not_averaged(self) -> None:
        """6.8 is the mean of five values. Folding the -9999 sentinel in would
        give -1659.2, and averaging it as a zero would give 5.666..."""
        two = zonal_stats(self.values, self.zones)[2]
        self.assertEqual(two.count - two.valid_count, 1)
        self.assertNotAlmostEqual(two.mean, 34.0 / 6.0, places=3)

    def test_background_can_be_kept(self) -> None:
        stats = zonal_stats(self.values, self.zones, background=None)
        self.assertEqual(sorted(stats), [0, 1, 2])
        zero = stats[0]
        self.assertEqual(zero.count, 6)
        self.assertEqual(zero.total, 9.0 + 10.0 + 13.0 + 14.0 + 15.0 + 16.0)
        self.assertAlmostEqual(zero.mean, 77.0 / 6.0, places=9)

    def test_a_binary_mask_gives_one_zone(self) -> None:
        mask = np.zeros(self.grid.shape, dtype=np.uint8)
        mask[0, 0] = 1
        mask[3, 3] = 1
        mask_path = write_array(mask, self.grid, self.path("binary.tif"),
                                nodata=None)
        stats = zonal_stats(self.values, mask_path)
        self.assertEqual(list(stats), [1])
        self.assertEqual(stats[1].count, 2)
        self.assertEqual(stats[1].mean, (1.0 + 16.0) / 2.0)

    def test_mismatched_shapes_are_refused(self) -> None:
        other = Grid(
            crs=UTM37N,
            wkt=self.grid.wkt,
            origin_x=200000.0,
            origin_y=100000.0,
            pixel_size=30.0,
            width=3,
            height=3,
        )
        small = write_array(np.zeros((3, 3), np.uint8), other,
                            self.path("small.tif"), nodata=None)
        with self.assertRaises(RasterError) as caught:
            zonal_stats(self.values, small)
        self.assertIn("same Grid", str(caught.exception))


class EndToEndTest(TempDirTestCase):
    """One pass of the shape the overlay actually runs: grid, warp, derive,
    mask, summarise. Catches the alignment bugs that only appear when the
    outputs of one function become the inputs of the next."""

    def test_layers_stay_aligned_through_the_whole_chain(self) -> None:
        grid = reference_grid(AOI, UTM37N, 100.0)

        # A DEM in WGS84 that rises eastward, as the source data would be.
        columns = np.arange(40, dtype=np.float32) * 50.0
        dem4326 = _make_raster(
            self.path("dem4326.tif"),
            np.repeat(columns[None, :], 40, axis=0),
            (36.00, 0.01, 0.0, 1.00, 0.0, -0.01),
            crs="EPSG:4326",
        )
        dem = warp_to_grid(dem4326, self.path("dem.tif"), grid,
                           resample="bilinear", clip_geojson=AOI)
        slope = slope_degrees(dem, self.path("slope.tif"))

        rivers = np.zeros(grid.shape, dtype=np.uint8)
        rivers[grid.height // 2, :] = 1
        river_path = write_array(rivers, grid, self.path("rivers.tif"),
                                 nodata=None)
        distance = proximity_metres(river_path, self.path("distance.tif"),
                                    max_distance_m=5000.0)

        mask = rasterize_geometry(AOI, grid, self.path("aoi.tif"))

        for path in (dem, slope, distance, mask):
            _, _, geotransform, width, height = _open_stats(path)
            self.assertEqual((width, height), (grid.width, grid.height), path)
            self.assertEqual(geotransform, grid.geotransform, path)

        slope_stats = zonal_stats(slope, mask)
        self.assertEqual(list(slope_stats), [1])
        self.assertGreater(slope_stats[1].valid_count, 0)
        self.assertGreaterEqual(slope_stats[1].minimum, 0.0)
        self.assertLessEqual(slope_stats[1].maximum, 90.0)

        distance_stats = zonal_stats(distance, mask)
        # The river row is inside the mask, so the nearest distance is 0 and
        # the farthest is bounded by half the grid height in metres.
        self.assertEqual(distance_stats[1].minimum, 0.0)
        self.assertLessEqual(distance_stats[1].maximum,
                             grid.height * grid.pixel_size)


if __name__ == "__main__":
    unittest.main()
