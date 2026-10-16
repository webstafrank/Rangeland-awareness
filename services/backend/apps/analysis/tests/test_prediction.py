"""Prediction runs: the satellite decode, the labels, the splits, the numbers.

Everything here is offline. GIBS colormaps are recorded documents
(`fixtures/gibs/`, fetched from gibs.earthdata.nasa.gov on 2026-10-15), and the
end-to-end runs hand the real pipeline a `FakeSources` that answers the same
`Sources` interface as the live one with synthetic layers. Everything after the
interface (warping, masks, labels, training, validation, statistics, rasters)
is the production code path, which is the point: a mock of the pipeline would
test the mock.

The live check is `manage.py predict_smoke`, separate on purpose, the same split
as `check_geoserver` and the recorded capabilities fixture.
"""

from __future__ import annotations

import json
import math
import os
import tempfile
import time
from datetime import date
from pathlib import Path
from unittest import mock

import numpy as np
from django.test import SimpleTestCase, TestCase, override_settings
from osgeo import gdal

from apps.analysis.jobs.stages import PREDICTION_SCRIPT, StageState, plan_for_config
from apps.analysis.models import config_hash
from apps.analysis.pipeline import raster
from apps.analysis.prediction import labels as lab
from apps.analysis.prediction import models as mdl
from apps.analysis.prediction import statistics as stats
from apps.analysis.prediction.pipeline import run_prediction
from apps.analysis.prediction.sources import WCS_CACHE_TTL_S, LiveSources
from apps.analysis.satellite import catalog
from apps.analysis.satellite.colormap import parse_colormap
from apps.analysis.satellite.gibs import Snapshot, decode_png
from apps.analysis.validation import default_as_of, validate_run_config
from apps.layers.geoserver import CoverageGrid

FIXTURES = Path(__file__).parent / "fixtures" / "gibs"

#: About 11 x 11 km on the Tana River near Garissa, two named areas side by
#: side, so per-area rows have something to tell apart.
AREAS = [
    {
        "type": "Feature",
        "properties": {"name": "West"},
        "geometry": {
            "type": "Polygon",
            "coordinates": [[[39.90, -1.50], [39.95, -1.50], [39.95, -1.40], [39.90, -1.40], [39.90, -1.50]]],
        },
    },
    {
        "type": "Feature",
        "properties": {},
        "geometry": {
            "type": "Polygon",
            "coordinates": [[[39.95, -1.50], [40.00, -1.50], [40.00, -1.40], [39.95, -1.40], [39.95, -1.50]]],
        },
    },
]


def body(**overrides):
    payload = {
        "topic": "drought-monitoring",
        "model": "combined",
        "areas": AREAS,
        "targetCrs": "EPSG:32637",
        "resolution": 250,
        "asOf": "2026-08-01",
    }
    payload.update(overrides)
    return {k: v for k, v in payload.items() if v is not None}


def load_colormap(name: str):
    return parse_colormap((FIXTURES / f"{name}.xml").read_bytes(), name)


# =================================================================== decode


class ColormapDecodeTests(SimpleTestCase):
    """The PNG says 'somewhere in this range'; the decode must say exactly that."""

    def test_a_drawn_ndvi_colour_decodes_to_its_range_midpoint(self) -> None:
        cmap = load_colormap("MODIS_L3_NDVI")
        # An entry from the recorded document, read back from the XML rather
        # than typed in, so the test cannot drift from the fixture.
        entry = next(
            line for line in (FIXTURES / "MODIS_L3_NDVI.xml").read_text().splitlines()
            if 'transparent="false"' in line and 'value="[0.5' in line
        )
        rgb = [int(v) for v in entry.split('rgb="')[1].split('"')[0].split(",")]
        low, high = (float(v) for v in entry.split('value="[')[1].split(")")[0].split(","))
        rgba = np.array([[rgb + [255]]], dtype=np.uint8)
        values, unknown = cmap.decode(rgba)
        self.assertEqual(unknown, 0)
        self.assertAlmostEqual(float(values[0, 0]), (low + high) / 2, places=6)

    def test_transparent_and_nodata_entries_decode_to_nan_not_their_value(self) -> None:
        cmap = load_colormap("MODIS_L3_NDVI")
        # 225,225,225 is "[-0.2,-0.0999)", drawn transparent: water and bare
        # ground. Decoding it as -0.15 would put a value on every unobserved
        # pixel; it must be missing.
        rgba = np.array([[[225, 225, 225, 255], [0, 26, 105, 255]]], dtype=np.uint8)
        values, unknown = cmap.decode(rgba)
        self.assertTrue(np.isnan(values).all())
        self.assertEqual(unknown, 0)

    def test_alpha_zero_is_missing_whatever_its_rgb(self) -> None:
        cmap = load_colormap("MODIS_L3_NDVI")
        drawn = next(k for k, v in zip(cmap.keys.tolist(), cmap.values.tolist()) if np.isfinite(v))
        r, g, b = (drawn >> 16) & 255, (drawn >> 8) & 255, drawn & 255
        values, _ = cmap.decode(np.array([[[r, g, b, 0]]], dtype=np.uint8))
        self.assertTrue(np.isnan(values[0, 0]))

    def test_a_colour_in_no_entry_is_missing_and_counted(self) -> None:
        cmap = load_colormap("MODIS_L3_NDVI")
        values, unknown = cmap.decode(np.array([[[1, 2, 3, 255]]], dtype=np.uint8))
        self.assertTrue(np.isnan(values[0, 0]))
        self.assertEqual(unknown, 1)

    def test_shared_colours_decode_to_the_union_of_their_ranges(self) -> None:
        # MERRA-2 paints some adjacent ranges the same colour; the recorded
        # document has them, and the decode must not pick one arbitrarily.
        xml = (FIXTURES / "MERRA2_Precipitation_Bias_Corrected_Monthly.xml").read_text()
        seen: dict[str, list[tuple[float, float]]] = {}
        for line in xml.splitlines():
            if "ColorMapEntry" not in line or 'transparent="true"' in line or 'value="[' not in line:
                continue
            rgb = line.split('rgb="')[1].split('"')[0]
            raw = line.split('value="[')[1].split(")")[0]
            if "INF" in raw:
                continue
            low, high = (float(v) for v in raw.split(","))
            seen.setdefault(rgb, []).append((low, high))
        shared = {rgb: ranges for rgb, ranges in seen.items() if len(ranges) > 1}
        self.assertTrue(shared, "the recorded MERRA-2 colormap has shared colours")
        rgb, ranges = next(iter(shared.items()))
        cmap = load_colormap("MERRA2_Precipitation_Bias_Corrected_Monthly")
        pixel = [int(v) for v in rgb.split(",")] + [255]
        values, _ = cmap.decode(np.array([[pixel]], dtype=np.uint8))
        low, high = min(r[0] for r in ranges), max(r[1] for r in ranges)
        self.assertAlmostEqual(float(values[0, 0]), (low + high) / 2, places=9)

    def test_a_land_cover_code_list_decodes_to_a_code_not_a_midpoint(self) -> None:
        # IGBP water is sourceValue="0,17". 8.5 would be a class that does not
        # exist; the decode must answer a real code.
        cmap = load_colormap("MODIS_IGBP_Land_Cover_Type")
        values, _ = cmap.decode(np.array([[[134, 202, 227, 255]]], dtype=np.uint8))
        self.assertEqual(float(values[0, 0]), 0.0)

    def test_a_png_through_gdal_decodes_like_the_array(self) -> None:
        """The real path: PNG bytes, GDAL's PNG driver, then the colormap."""
        cmap = load_colormap("MODIS_L3_NDVI")
        finite = [k for k, v in zip(cmap.keys.tolist(), cmap.values.tolist()) if np.isfinite(v)]
        rgba = np.zeros((4, 4, 4), dtype=np.uint8)
        for i, key in enumerate(finite[:12]):
            rgba[i // 4, i % 4] = [(key >> 16) & 255, (key >> 8) & 255, key & 255, 255]
        mem = gdal.GetDriverByName("MEM").Create("", 4, 4, 4, gdal.GDT_Byte)
        for band in range(4):
            mem.GetRasterBand(band + 1).WriteArray(rgba[..., band])
        name = "/vsimem/decode-test.png"
        gdal.GetDriverByName("PNG").CreateCopy(name, mem)
        handle = gdal.VSIFOpenL(name, "rb")
        gdal.VSIFSeekL(handle, 0, 2)
        size = gdal.VSIFTellL(handle)
        gdal.VSIFSeekL(handle, 0, 0)
        data = bytes(gdal.VSIFReadL(1, size, handle))
        gdal.VSIFCloseL(handle)
        gdal.Unlink(name)

        from_png, unknown = cmap.decode(decode_png(data))
        from_array, _ = cmap.decode(rgba)
        self.assertEqual(unknown, 0)
        np.testing.assert_array_equal(np.isnan(from_png), np.isnan(from_array))
        np.testing.assert_allclose(from_png[~np.isnan(from_png)], from_array[~np.isnan(from_array)])
        self.assertEqual(int(np.isnan(from_png).sum()), 4, "the 4 alpha-0 pixels are missing")


# =================================================================== labels


def _months(first: date, count: int) -> list[date]:
    return [lab.add_months(first, i) for i in range(count)]


class LabelTests(SimpleTestCase):
    def test_low_quintile_is_against_the_pixels_own_calendar_month(self) -> None:
        months = _months(date(2015, 1, 1), 72)
        # Pixel 0 is always green in March, pixel 1 always dry: the same NDVI
        # can be a drought for one and normal for the other.
        stack = np.zeros((72, 1, 2), np.float32)
        for i, m in enumerate(months):
            stack[i, 0, 0] = 0.6 + 0.01 * (m.year - 2015)
            stack[i, 0, 1] = 0.2 + 0.01 * (m.year - 2015)
        use = np.ones(72, bool)
        clim = lab.climatology(stack, months, use, precision=0.0, percentile=True)
        # Feature month = Feb of the first year; target = that March, the
        # lowest March in the history, so it is below P20 for both pixels.
        i = months.index(date(2015, 2, 1))
        out = lab.label_low_quintile(stack, months, i, clim)
        np.testing.assert_array_equal(out, [[1.0, 1.0]])
        # The last March is the highest: not a drought for either.
        i = months.index(date(2020, 2, 1))
        np.testing.assert_array_equal(lab.label_low_quintile(stack, months, i, clim), [[0.0, 0.0]])

    def test_the_label_reads_the_next_month_never_the_feature_month(self) -> None:
        """No circular label: changing month i+1 changes the label, changing
        month i does not."""
        months = _months(date(2015, 1, 1), 60)
        rng = np.random.default_rng(1)
        stack = rng.uniform(0.2, 0.8, (60, 3, 3)).astype(np.float32)
        clim = lab.climatology(stack, months, np.ones(60, bool), precision=0.0, percentile=True)
        i = 30
        before = lab.label_low_quintile(stack, months, i, clim)
        changed_now = stack.copy()
        changed_now[i] = 0.0
        np.testing.assert_array_equal(lab.label_low_quintile(changed_now, months, i, clim), before)
        changed_next = stack.copy()
        changed_next[i + 1] = 0.0
        np.testing.assert_array_equal(
            lab.label_low_quintile(changed_next, months, i, clim), np.ones((3, 3), np.float32)
        )

    def test_anomaly_drop_needs_more_than_half_a_standard_deviation(self) -> None:
        months = _months(date(2015, 1, 1), 48)
        stack = np.zeros((48, 1, 1), np.float32)
        for i, m in enumerate(months):
            # Mean 0.5 every month, spread 0.1: a drop of 0.06 is 0.6 SD.
            stack[i, 0, 0] = 0.5 + (0.1 if m.year % 2 else -0.1)
        clim = lab.climatology(stack, months, np.ones(48, bool), precision=0.0)
        i = months.index(date(2016, 5, 1))
        stack[i, 0, 0] = 0.5
        stack[i + 1, 0, 0] = 0.44
        self.assertEqual(float(lab.label_anomaly_drop(stack, months, i, clim)[0, 0]), 1.0)
        stack[i + 1, 0, 0] = 0.46
        self.assertEqual(float(lab.label_anomaly_drop(stack, months, i, clim)[0, 0]), 0.0)

    def test_baselines_only_see_the_months_they_are_given(self) -> None:
        """The leak this design exists to prevent: a percentile computed over
        the held-out year would let the test labels shape the training labels."""
        months = _months(date(2015, 1, 1), 72)
        stack = np.full((72, 1, 1), 0.5, np.float32)
        last_year = np.array([m.year == 2020 for m in months])
        stack[last_year] = 0.0
        train_only = lab.climatology(stack, months, ~last_year, precision=0.0, percentile=True)
        everything = lab.climatology(stack, months, np.ones(72, bool), precision=0.0, percentile=True)
        self.assertEqual(float(train_only.mean[0, 0, 0]), 0.5)
        self.assertLess(float(everything.mean[0, 0, 0]), 0.5)

    def test_features_may_lag_the_month_but_never_lead_it(self) -> None:
        months = _months(date(2015, 1, 1), 40)
        stacks = {name: np.ones((40, 1, 1), np.float32) for name in ("ndvi", "precipitation")}
        base = lab.baselines(stacks, {"ndvi": 0.0, "precipitation": 0.0}, months, np.ones(40, bool), None)
        lab.forecast_features(stacks, months, 20, base, None, source_index={"precipitation": 19})
        with self.assertRaises(ValueError):
            lab.forecast_features(stacks, months, 20, base, None, source_index={"precipitation": 21})


# =================================================================== splits


class SplitTests(SimpleTestCase):
    def test_spatial_folds_never_split_a_block(self) -> None:
        rows, cols = np.divmod(np.arange(60 * 60), 60)
        blocks = mdl.spatial_blocks(rows, cols, 10)
        folds = mdl.block_folds(blocks)
        for block in np.unique(blocks):
            self.assertEqual(np.unique(folds[blocks == block]).size, 1)
        self.assertEqual(int(folds.max()) + 1, mdl.FOLDS)

    def test_folds_are_deterministic(self) -> None:
        rows, cols = np.divmod(np.arange(40 * 40), 40)
        blocks = mdl.spatial_blocks(rows, cols, 8)
        np.testing.assert_array_equal(mdl.block_folds(blocks), mdl.block_folds(blocks))

    def test_one_block_cannot_be_validated(self) -> None:
        with self.assertRaises(ValueError):
            mdl.block_folds(np.zeros(100, np.int64))

    def test_the_holdout_is_exactly_the_last_twelve_months(self) -> None:
        ordinals = np.repeat(np.arange(2018 * 12, 2026 * 12), 5)
        held = mdl.temporal_holdout(ordinals, 12)
        self.assertEqual(np.unique(ordinals[held]).tolist(), list(range(2025 * 12, 2026 * 12)))
        self.assertTrue((ordinals[~held] < 2025 * 12).all())

    def test_metrics_are_none_not_zero_when_the_test_set_is_one_class(self) -> None:
        out = mdl.metrics(np.zeros(10), np.linspace(0, 1, 10))
        self.assertIsNone(out["auc"])

    def test_prior_correction_restores_the_base_rate(self) -> None:
        # Balanced training says 0.5 for "no information"; at a 10% base rate
        # that must read as 10%, or every map is painted at coin-flip risk.
        self.assertAlmostEqual(float(mdl.correct_prior(np.array([0.5]), 0.1)[0]), 0.1, places=5)


# =============================================================== statistics


class StatisticsTests(SimpleTestCase):
    """Every number rule the contract states, asserted on known inputs."""

    def setUp(self) -> None:
        rng = np.random.default_rng(7)
        self.probability = rng.uniform(0, 1, (40, 50)).astype(np.float32)
        self.probability[0, :10] = np.nan
        self.probability[1, 0] = 1.0
        self.probability[1, 1] = 0.6
        self.valid = np.isfinite(self.probability)

    def test_classes_are_fixed_bands_of_point_two(self) -> None:
        out = stats.classify(np.array([0.0, 0.199, 0.2, 0.6, 0.799, 0.8, 1.0, np.nan], np.float32))
        self.assertEqual(out.tolist(), [1, 1, 2, 4, 4, 5, 5, stats.CLASS_NODATA])
        rows = stats.classes(self.probability, self.valid, 250)
        self.assertEqual([r["range"] for r in rows], [[0.0, 0.2], [0.2, 0.4], [0.4, 0.6], [0.6, 0.8], [0.8, 1.0]])
        self.assertEqual([r["label"] for r in rows], ["Very low", "Low", "Moderate", "High", "Very high"])

    def test_shares_sum_to_one_over_valid_pixels_only(self) -> None:
        rows = stats.classes(self.probability, self.valid, 250)
        self.assertAlmostEqual(sum(r["share"] for r in rows), 1.0, delta=1e-6)
        self.assertEqual(sum(r["pixels"] for r in rows), int(self.valid.sum()))
        hist = stats.histogram(self.probability, self.valid)
        self.assertEqual(len(hist["edges"]), 21)
        self.assertEqual(len(hist["counts"]), 20)
        self.assertAlmostEqual(sum(hist["shares"]), 1.0, delta=1e-6)
        self.assertEqual(sum(hist["counts"]), int(self.valid.sum()), "1.0 lands in the last bin")

    def test_area_is_pixels_times_resolution_squared(self) -> None:
        for row in stats.classes(self.probability, self.valid, 250):
            self.assertAlmostEqual(row["areaKm2"], row["pixels"] * 250 * 250 / 1e6, places=4)

    def test_share_at_risk_is_probability_at_or_above_one_half(self) -> None:
        out = stats.summary(self.probability, self.valid, 250)
        expected = float((self.probability[self.valid] >= 0.5).mean())
        self.assertAlmostEqual(out["shareAtRisk"], expected, places=9)
        self.assertEqual(out["atRiskThreshold"], 0.5)

    def test_one_area_row_per_area_in_order_with_names(self) -> None:
        left = np.zeros(self.probability.shape, bool)
        left[:, :25] = True
        rows = stats.area_rows(
            self.probability, self.valid, [left, ~left], stats.area_names(AREAS), 250
        )
        self.assertEqual([r["name"] for r in rows], ["West", "Area 2"])
        self.assertEqual([r["index"] for r in rows], [0, 1])
        for row in rows:
            self.assertAlmostEqual(sum(row["classShares"]), 1.0, delta=1e-6)

    def test_merged_importance_sums_to_one(self) -> None:
        merged = mdl.merged_importance([{"a": 0.7, "b": 0.3}, {"a": 0.1, "c": 0.9}])
        self.assertAlmostEqual(sum(merged.values()), 1.0, places=6)
        self.assertEqual(list(merged)[0], "c", "ordered most important first")


# =============================================================== validation


class PredictionValidationTests(SimpleTestCase):
    def test_a_model_topic_without_a_model_is_refused(self) -> None:
        _, errors = validate_run_config(body(model=None))
        self.assertIn("model", errors)

    def test_an_unknown_model_is_refused(self) -> None:
        _, errors = validate_run_config(body(model="neural-net"))
        self.assertIn("model", errors)

    def test_weights_on_a_prediction_run_are_refused_not_ignored(self) -> None:
        _, errors = validate_run_config(body(weights={"slope": 0.5, "rainfall": 0.5}))
        self.assertIn("weights", errors)

    def test_flood_without_a_model_is_still_the_overlay_with_the_same_id(self) -> None:
        overlay = {
            "topic": "flood-risk", "areas": AREAS[:1],
            "weights": {"slope": 0.22, "dist_to_river": 0.49, "rainfall": 0.29},
            "targetCrs": "EPSG:32637", "resolution": 90, "publishLayers": False,
        }
        config, errors = validate_run_config(dict(overlay, asOf="2026-08-01"))
        self.assertFalse(errors)
        self.assertNotIn("model", config)
        self.assertNotIn("asOf", config, "an overlay ignores asOf, so its run id is unchanged")
        self.assertEqual(plan_for_config(config)[0].id, "resolve")
        self.assertNotIn("satellite", [s.id for s in plan_for_config(config)])

    def test_flood_with_a_model_is_a_prediction(self) -> None:
        config, errors = validate_run_config(body(topic="flood-risk", model="random-forest"))
        self.assertFalse(errors)
        self.assertEqual([s.id for s in plan_for_config(config)], [t.id for t in PREDICTION_SCRIPT])

    def test_the_default_as_of_is_two_months_back_and_stored_before_hashing(self) -> None:
        self.assertEqual(default_as_of(date(2026, 10, 15)), date(2026, 8, 1))
        self.assertEqual(default_as_of(date(2026, 1, 31)), date(2025, 11, 1))
        with mock.patch("apps.analysis.validation.datetime") as clock:
            clock.now.return_value.date.return_value = date(2026, 10, 15)
            implicit, _ = validate_run_config(body(asOf=None))
        explicit, _ = validate_run_config(body(asOf="2026-08-17"))
        self.assertEqual(implicit["asOf"], "2026-08-01")
        self.assertEqual(config_hash(implicit), config_hash(explicit))

    def test_a_future_or_prehistoric_as_of_is_refused(self) -> None:
        self.assertIn("asOf", validate_run_config(body(asOf="2099-01-01"))[1])
        self.assertIn("asOf", validate_run_config(body(asOf="2001-01-01"))[1])
        self.assertIn("asOf", validate_run_config(body(asOf="last tuesday"))[1])

    def test_a_prediction_without_a_resolution_runs_at_250_m_not_30(self) -> None:
        # 30 m is the overlay's default. A prediction at 30 m is ~69x the
        # pixels of 250 m for inputs that are ~1 km, and was what an API
        # caller that named no resolution got.
        config, errors = validate_run_config(body(resolution=None))
        self.assertFalse(errors, errors)
        self.assertEqual(config["resolution"], 250)

    def test_over_twenty_million_pixels_is_refused_with_a_resolution_that_fits(self) -> None:
        big = [{
            "type": "Polygon",
            "coordinates": [[[37.0, -3.0], [41.0, -3.0], [41.0, 1.0], [37.0, 1.0], [37.0, -3.0]]],
        }]
        _, errors = validate_run_config(body(areas=big, resolution=30))
        self.assertIn("resolution", errors)
        self.assertIn("m fits", errors["resolution"][0])


class PredictionEndpointTests(TestCase):
    def setUp(self) -> None:
        patcher = mock.patch("apps.analysis.views.submit")
        self.submit = patcher.start()
        self.addCleanup(patcher.stop)

    def post(self, payload):
        return self.client.post("/api/v1/runs", json.dumps(payload), content_type="application/json")

    def test_refusals_are_400_field_errors(self) -> None:
        response = self.post(body(model=None, weights={"slope": 1.0}))
        self.assertEqual(response.status_code, 400)
        errors = response.json()["fieldErrors"]
        self.assertIn("model", errors)
        self.assertIn("weights", errors)
        self.submit.assert_not_called()

    def test_a_prediction_run_is_created_with_the_prediction_stages(self) -> None:
        response = self.post(body())
        self.assertEqual(response.status_code, 202)
        self.assertEqual([s["id"] for s in response.json()["stages"]], [t.id for t in PREDICTION_SCRIPT])
        self.assertEqual(response.json()["stages"][-1]["state"], StageState.SKIPPED)
        self.submit.assert_called_once()


# ====================================================== live sources


class LiveSourcesCacheTests(SimpleTestCase):
    """GeoServer windows are described once per run and fetched once per day."""

    def setUp(self) -> None:
        workspace = Path(tempfile.mkdtemp(prefix="sources-test-"))
        override = override_settings(WORKSPACE_DIR=workspace)
        override.enable()
        self.addCleanup(override.disable)
        self.cache = workspace / "wcs-cache"
        self.out = workspace / "out"
        self.out.mkdir()

        self.described = CoverageGrid(
            coverage_id="ws__TanaRiver_Slope", crs="EPSG:32637", size=(2000, 2000),
            # UTM 37N, so south of the equator the northings are negative.
            extent=(500_000.0, -300_000.0, 700_000.0, 0.0),
        )
        self.geoserver = mock.Mock(url="http://geoserver.test/geoserver")
        self.geoserver.describe_coverage.return_value = self.described
        self.geoserver.get_coverage.return_value = b"coverage bytes"
        self.sources = LiveSources(geoserver=self.geoserver, gibs=mock.Mock())
        self.grid = raster.reference_grid(AREAS[0]["geometry"], "EPSG:32637", 250)

    def fetch(self, name: str) -> Path | None:
        return self.sources.raster("ws:TanaRiver_Slope", self.grid, self.out / name)

    def test_a_second_fetch_of_the_same_window_reads_the_cache(self) -> None:
        first = self.fetch("a.tif")
        second = self.fetch("b.tif")
        self.assertEqual(first.read_bytes(), b"coverage bytes")
        self.assertEqual(second.read_bytes(), b"coverage bytes")
        self.geoserver.get_coverage.assert_called_once()
        self.geoserver.describe_coverage.assert_called_once()
        # The description already in hand goes along, so get_coverage does
        # not ask DescribeCoverage a second time for its axis names.
        self.assertIs(self.geoserver.get_coverage.call_args.kwargs["described"], self.described)

    def test_a_window_older_than_the_ttl_is_fetched_again(self) -> None:
        self.fetch("a.tif")
        stale = time.time() - WCS_CACHE_TTL_S - 60
        for cached in self.cache.iterdir():
            os.utime(cached, (stale, stale))
        self.fetch("b.tif")
        self.assertEqual(self.geoserver.get_coverage.call_count, 2)


# =========================================================== end to end


def _lonlat_grid(bbox, rows, cols):
    minx, miny, maxx, maxy = bbox
    lon = minx + (np.arange(cols) + 0.5) * (maxx - minx) / cols
    lat = maxy - (np.arange(rows) + 0.5) * (maxy - miny) / rows
    return np.meshgrid(lon, lat)


class FakeSources:
    """Synthetic GeoServer + GIBS with a learnable signal.

    NDVI next month follows this month's rainfall anomaly, so the forecast
    targets are predictable from the features and held-out AUC is meaningful;
    flood hotspots sit near the river and on low slope. Values depend only on
    lon/lat and the month, so every call for the same box answers the same.
    """

    MONTHS = _months(date(2014, 1, 1), 152)  # 2014-01 .. 2026-08

    def __init__(self, *, precipitation_lags: bool = False) -> None:
        self.precipitation_lags = precipitation_lags

    def satellite_times(self, layer):
        if layer.period == "P1Y":
            return [date(y, 1, 1) for y in range(2014, 2025)]
        if layer.id == "precipitation" and self.precipitation_lags:
            return self.MONTHS[:-1]
        return list(self.MONTHS)

    def _rain_anomaly(self, when, lon, lat):
        k = when.year * 12 + when.month
        return np.sin(k * 1.7 + lon * 40) * np.cos(k * 0.9 + lat * 30)

    def satellite(self, layer, when, bbox):
        lon, lat = _lonlat_grid(bbox, 24, 24)
        season = math.cos((when.month - 4) / 12 * 2 * math.pi)
        if layer.id == "ndvi":
            previous = lab.add_months(when, -1)
            values = 0.45 + 0.15 * season + 0.12 * self._rain_anomaly(previous, lon, lat)
        elif layer.id == "precipitation":
            values = 2.0 + 1.5 * season + self._rain_anomaly(when, lon, lat)
        elif layer.id == "soil_moisture":
            values = 0.2 + 0.05 * self._rain_anomaly(when, lon, lat)
        elif layer.id == "lst":
            values = 32 - 3 * season + 0 * lon
        else:  # IGBP: west half savanna (rangeland), east half cropland mosaic.
            values = np.where(lon < 39.95, 9.0, 14.0)
        return Snapshot(layer=layer, when=when, bbox=tuple(bbox),
                        values=np.asarray(values, np.float32), unknown_colours=0)

    def raster(self, layer, grid, out_path):
        bounds = raster.transform_bounds(grid.bounds, grid.crs, "EPSG:4326")
        lon, lat = _lonlat_grid(bounds, 60, 60)
        river = np.abs(lat + 1.45 - 0.2 * (lon - 39.95))
        if "Flood" in layer:
            values = 5.0 - 30 * river + 0.3 * np.sin(lon * 90)
        elif "Slope" in layer:
            values = 1.0 + 40 * river
        elif "Rainfall" in layer:
            values = 600 + 100 * (lon - 39.9)
        else:  # local 1..5 land cover
            values = 1 + (np.floor((lon - 39.9) * 400) % 5)
        driver = gdal.GetDriverByName("GTiff")
        dataset = driver.Create(str(out_path), 60, 60, 1, gdal.GDT_Float32)
        minx, miny, maxx, maxy = bounds
        dataset.SetGeoTransform((minx, (maxx - minx) / 60, 0, maxy, 0, -(maxy - miny) / 60))
        dataset.SetProjection(raster._srs_from_user_input("EPSG:4326").ExportToWkt())
        dataset.GetRasterBand(1).WriteArray(values.astype(np.float32))
        dataset = None
        return out_path

    def vector(self, layer):
        return {
            "type": "FeatureCollection",
            "features": [{
                "type": "Feature", "properties": {},
                "geometry": {"type": "LineString", "coordinates": [[39.85, -1.46], [40.05, -1.44]]},
            }],
        }

    def raster_extent(self, layer):
        return (39.85, -1.55, 40.05, -1.35)


@override_settings(WORKSPACE_DIR=tempfile.gettempdir())
class EndToEndTests(SimpleTestCase):
    """One real pipeline run per topic on `FakeSources`, checked against the
    contract field by field."""

    TOP_LEVEL = {
        "kind", "indicator", "model", "target", "asOf", "summary", "histogram",
        "classes", "areas", "metrics", "importance", "agreement", "features",
        "warnings", "bbox", "grid", "validPixels", "rasters", "layers",
    }

    def run_topic(self, topic, model, sources=None):
        config, errors = validate_run_config(body(topic=topic, model=model))
        self.assertFalse(errors, errors)
        reported = []
        workspace = Path(tempfile.mkdtemp(prefix="predict-test-"))
        result = run_prediction(
            config=config, workspace=workspace,
            report=lambda stage, state, detail=None: reported.append((stage, state)),
            sources=sources or FakeSources(),
        )
        return result, workspace, reported

    def check_contract(self, result, workspace, reported, model):
        self.assertLessEqual(self.TOP_LEVEL, set(result))
        self.assertEqual(result["kind"], "prediction")
        self.assertEqual(result["model"]["id"], model)
        # Every stage reported done (or skipped), in the contract's order.
        done = [s for s, state in reported if state in (StageState.DONE, StageState.SKIPPED)]
        self.assertEqual(done, [t.id for t in PREDICTION_SCRIPT])

        self.assertAlmostEqual(sum(c["share"] for c in result["classes"]), 1.0, delta=1e-6)
        self.assertAlmostEqual(sum(result["histogram"]["shares"]), 1.0, delta=1e-6)
        self.assertEqual(sum(c["pixels"] for c in result["classes"]), result["validPixels"])
        self.assertEqual([a["name"] for a in result["areas"]], ["West", "Area 2"])
        self.assertAlmostEqual(sum(result["importance"].values()), 1.0, places=5)
        for metric in result["metrics"]["members"].values():
            self.assertTrue(0.0 <= metric["auc"] <= 1.0)
        self.assertIn(result["metrics"]["validation"], ("spatial-block-cv", "temporal-holdout"))
        for feature in result["features"]:
            self.assertIn(feature["source"], ("gibs", "geoserver", "calendar"))

        # Rasters are file names, in the workspace, georeferenced, with
        # overviews built only when big enough to need them.
        for name, filename in result["rasters"].items():
            self.assertEqual(Path(filename).name, filename)
            dataset = gdal.Open(str(workspace / filename))
            self.assertIsNotNone(dataset.GetSpatialRef(), name)
            self.assertEqual((dataset.RasterXSize, dataset.RasterYSize),
                             (result["grid"]["width"], result["grid"]["height"]))
        # The dataset is kept in a name: a band outlives nothing in GDAL's
        # Python bindings, and one from a collected dataset is a dangling pointer.
        written = gdal.Open(str(workspace / "probability.tif"))
        band = written.GetRasterBand(1)
        probability = band.ReadAsArray()
        finite = probability[np.isfinite(probability) & (probability != band.GetNoDataValue())]
        self.assertTrue(((finite >= 0) & (finite <= 1)).all())
        self.assertEqual(int(finite.size), result["validPixels"])
        lon_min, lat_min, lon_max, lat_max = result["bbox"]
        self.assertTrue(39.8 < lon_min < lon_max < 40.1 and -1.6 < lat_min < lat_max < -1.3)

    def test_drought_combined(self) -> None:
        result, workspace, reported = self.run_topic(
            "drought-monitoring", "combined", FakeSources(precipitation_lags=True)
        )
        self.check_contract(result, workspace, reported, "combined")
        self.assertEqual(result["metrics"]["validation"], "temporal-holdout")
        self.assertEqual(set(result["metrics"]["members"]), {"random-forest", "xgboost", "combined"})
        self.assertIn("disagreement", result["rasters"])
        for member in ("random-forest", "xgboost"):
            self.assertTrue((workspace / result["rasters"][f"probability-{member}"]).exists())
        self.assertIsNotNone(result["agreement"])
        self.assertTrue(any("Precipitation is from" in w for w in result["warnings"]),
                        "a lagging satellite layer is named, not hidden")
        # The synthetic signal is learnable, so held-out skill is real.
        self.assertGreater(result["metrics"]["members"]["combined"]["auc"], 0.6)

    def test_rangeland_random_forest_masks_to_rangeland(self) -> None:
        result, workspace, reported = self.run_topic("rangeland-dynamics", "random-forest")
        self.check_contract(result, workspace, reported, "random-forest")
        self.assertIsNone(result["agreement"])
        self.assertNotIn("disagreement", result["rasters"])
        self.assertNotIn("probability-random-forest", result["rasters"])
        west, east = result["areas"]
        # Almost none rather than none: the land cover is ~1 km, so the one
        # column of 250 m pixels sharing a cell with the savanna inherits it.
        east_pixels = east["areaKm2"] / (0.25 * 0.25)
        self.assertGreater(west["validPixels"], 0.8 * west["areaKm2"] / (0.25 * 0.25))
        self.assertLess(east["validPixels"], 0.1 * east_pixels, "cropland is not rangeland")

    def test_food_security_xgboost_masks_to_cropland(self) -> None:
        result, workspace, reported = self.run_topic("food-security", "xgboost")
        self.check_contract(result, workspace, reported, "xgboost")
        west, east = result["areas"]
        west_pixels = west["areaKm2"] / (0.25 * 0.25)
        self.assertLess(west["validPixels"], 0.1 * west_pixels, "savanna is not cropland")
        self.assertGreater(east["validPixels"], 0.8 * east["areaKm2"] / (0.25 * 0.25))

    def test_flood_spatial_block_cv(self) -> None:
        result, workspace, reported = self.run_topic("flood-risk", "combined")
        self.check_contract(result, workspace, reported, "combined")
        self.assertEqual(result["metrics"]["validation"], "spatial-block-cv")
        self.assertTrue(result["target"]["labelSource"].startswith("geoserver:"))
        self.assertTrue(any("has not seen observed floods" in w for w in result["warnings"]))

    def test_the_same_run_twice_gives_the_same_numbers(self) -> None:
        first, _, _ = self.run_topic("rangeland-dynamics", "xgboost")
        second, _, _ = self.run_topic("rangeland-dynamics", "xgboost")
        self.assertEqual(first["summary"], second["summary"])
        self.assertEqual(first["metrics"], second["metrics"])
