"""An area with no data under it is refused before the run exists.

The regression: a flood run drawn over western Kenya (lon 34.5, lat 0.1) was
accepted, then failed at `fetch` with GeoServer's raw WCS 404 XML, because the
flood rasters cover Tana River County only. Everything here uses a fake
GeoServer client; the suite needs no network.
"""

from __future__ import annotations

import json
import tempfile
from pathlib import Path
from unittest import mock

from django.test import SimpleTestCase, TestCase

from apps.analysis import coverage
from apps.analysis.bindings import binding_for
from apps.analysis.pipeline import raster
from apps.analysis.pipeline.overlay import PipelineError, _fetch
from apps.layers.geoserver import CoverageGrid, GeoServerError

#: The live flood rasters' extent, as DescribeCoverage reports it, in EPSG:4326.
TANA = (38.43, -3.07, 40.73, -0.02)


def area(name, minx, miny, maxx, maxy):
    return {
        "type": "Feature",
        "properties": {"name": name},
        "geometry": {
            "type": "Polygon",
            "coordinates": [[[minx, miny], [maxx, miny], [maxx, maxy], [minx, maxy], [minx, miny]]],
        },
    }


INSIDE = area("Garissa", 39.6, -1.3, 39.8, -1.1)
OUTSIDE = area("Kakamega", 34.52, 0.09, 34.61, 0.19)
STRADDLING = area("Edge", 38.3, -1.3, 38.6, -1.1)


def config(*areas, **overrides):
    body = {
        "topic": "flood-risk",
        "areas": list(areas),
        "weights": {"slope": 0.22, "dist_to_river": 0.49, "rainfall": 0.29},
        "targetCrs": "EPSG:32637",
        "resolution": 30.0,
    }
    body.update(overrides)
    return body


def fake_client(extent=TANA):
    client = mock.Mock()
    client.describe_coverage.side_effect = lambda layer: CoverageGrid(
        coverage_id=layer.replace(":", "__"), crs="EPSG:4326", size=(1000, 1000), extent=extent,
    )
    return client


class CoverageCheckTests(SimpleTestCase):
    def setUp(self) -> None:
        coverage._extents.clear()
        self.addCleanup(coverage._extents.clear)

    def test_an_area_outside_every_layer_is_named_with_where_the_data_is(self) -> None:
        problems = coverage.areas_outside_coverage(config(OUTSIDE), fake_client())
        self.assertEqual(len(problems), 1)
        self.assertIn('"Kakamega"', problems[0])
        self.assertIn("lon 34.52 to 34.61", problems[0])
        self.assertIn("lon 38.43 to 40.73, lat -3.07 to -0.02", problems[0])
        # Raster criteria only: the river network is vector and reaches everywhere.
        self.assertIn("TanaRiver_Slope", problems[0])
        self.assertNotIn("Rivers", problems[0])

    def test_an_area_inside_or_straddling_the_edge_is_accepted(self) -> None:
        self.assertEqual(coverage.areas_outside_coverage(config(INSIDE), fake_client()), [])
        # Half in: the outside part is nodata, which the overlay handles.
        self.assertEqual(coverage.areas_outside_coverage(config(STRADDLING), fake_client()), [])

    def test_only_the_offending_area_of_several_is_reported(self) -> None:
        problems = coverage.areas_outside_coverage(config(INSIDE, OUTSIDE), fake_client())
        self.assertEqual(len(problems), 1)
        self.assertIn('"Kakamega"', problems[0])

    def test_a_prediction_run_is_not_checked(self) -> None:
        client = fake_client()
        self.assertEqual(
            coverage.areas_outside_coverage(config(OUTSIDE, model="xgboost"), client), []
        )
        client.describe_coverage.assert_not_called()

    def test_an_unreachable_geoserver_does_not_block_the_run(self) -> None:
        client = mock.Mock()
        client.describe_coverage.side_effect = GeoServerError("connection refused")
        self.assertEqual(coverage.areas_outside_coverage(config(OUTSIDE), client), [])

    def test_an_unreadable_extent_does_not_turn_every_post_into_a_500(self) -> None:
        # Not only GeoServerError: a CRS GDAL cannot read, or an envelope that
        # does not parse, must also leave the decision to the pipeline.
        for failure in (ValueError("could not convert string to float"), RuntimeError("bad CRS")):
            coverage._extents.clear()
            client = mock.Mock()
            client.describe_coverage.side_effect = failure
            self.assertEqual(coverage.areas_outside_coverage(config(OUTSIDE), client), [])

    def test_the_live_client_waits_seconds_not_the_default_thirty(self) -> None:
        with mock.patch("apps.analysis.coverage.GeoServerClient") as client_class:
            client_class.return_value = fake_client()
            coverage.areas_outside_coverage(config(INSIDE))
        client_class.assert_called_with(timeout=coverage.DESCRIBE_TIMEOUT_S)
        self.assertLess(coverage.DESCRIBE_TIMEOUT_S, 15 / 3)

    def test_extents_are_described_once_and_reused(self) -> None:
        client = fake_client()
        coverage.areas_outside_coverage(config(INSIDE), client)
        coverage.areas_outside_coverage(config(OUTSIDE), client)
        described = [c.args[0] for c in client.describe_coverage.call_args_list]
        self.assertEqual(len(described), len(set(described)))


class RunEndpointCoverageTests(TestCase):
    def setUp(self) -> None:
        coverage._extents.clear()
        self.addCleanup(coverage._extents.clear)
        patches = [
            mock.patch("apps.analysis.views.submit"),
            mock.patch("apps.analysis.coverage.GeoServerClient", return_value=fake_client()),
        ]
        self.submit = patches[0].start()
        patches[1].start()
        for p in patches:
            self.addCleanup(p.stop)

    def post(self, body):
        return self.client.post("/api/v1/runs", json.dumps(body), content_type="application/json")

    def test_an_area_outside_the_data_is_refused_before_a_run_exists(self) -> None:
        response = self.post(config(OUTSIDE))
        self.assertEqual(response.status_code, 400)
        self.assertIn("Kakamega", response.json()["fieldErrors"]["areas"][0])
        self.submit.assert_not_called()

    def test_an_area_inside_the_data_is_queued(self) -> None:
        response = self.post(config(INSIDE))
        self.assertEqual(response.status_code, 202)
        self.submit.assert_called_once()

    def test_replaying_an_existing_run_is_not_checked_again(self) -> None:
        # A run that exists is returned from the cache before the check, so a
        # replay costs no GeoServer round trip and is never refused after the
        # fact (say a layer is later republished over a smaller extent).
        self.assertEqual(self.post(config(INSIDE)).status_code, 202)
        with mock.patch("apps.analysis.views.areas_outside_coverage") as check:
            replay = self.post(config(INSIDE))
        self.assertEqual(replay.status_code, 200)
        self.assertTrue(replay.json()["cached"])
        check.assert_not_called()


class OverlayFetchBackstopTests(SimpleTestCase):
    """If a run gets past the endpoint anyway, `fetch` fails in words."""

    def grid_for(self, feature):
        return raster.reference_grid(feature["geometry"], "EPSG:32637", 90)

    def test_a_window_outside_the_coverage_fails_in_words_without_asking_geoserver(self) -> None:
        client = fake_client()
        with tempfile.TemporaryDirectory() as workspace:
            with self.assertRaises(PipelineError) as caught:
                _fetch(client, binding_for("slope"), self.grid_for(OUTSIDE), Path(workspace))
        self.assertIn("covers only lon 38.43 to 40.73", str(caught.exception))
        self.assertNotIn("<?xml", str(caught.exception))
        client.get_coverage.assert_not_called()

    def test_a_straddling_window_is_clipped_to_the_coverage(self) -> None:
        client = fake_client()
        client.get_coverage.return_value = b"tiff"
        with tempfile.TemporaryDirectory() as workspace:
            _fetch(client, binding_for("slope"), self.grid_for(STRADDLING), Path(workspace))
        subset = client.get_coverage.call_args.kwargs["subset"]
        self.assertGreaterEqual(subset[0], TANA[0])
        self.assertLess(subset[2], TANA[2])
