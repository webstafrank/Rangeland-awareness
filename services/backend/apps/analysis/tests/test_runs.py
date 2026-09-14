"""Run configuration, identity, and the run endpoints.

The pipeline itself is not exercised here — it needs GeoServer and minutes of
raster work. What is exercised is everything that decides whether the pipeline
should start at all, which is where a bad run is cheap to stop and expensive to
discover.
"""

from __future__ import annotations

import json
from unittest import mock

from django.test import SimpleTestCase, TestCase

from apps.analysis.bindings import DEFAULT_BINDINGS, binding_for, unbound
from apps.analysis.jobs.stages import StageState
from apps.analysis.models import Run, config_hash
from apps.analysis.validation import validate_run_config

POLYGON = {
    "type": "Feature",
    "geometry": {
        "type": "Polygon",
        "coordinates": [
            [[39.6, -1.3], [39.8, -1.3], [39.8, -1.1], [39.6, -1.1], [39.6, -1.3]]
        ],
    },
}

# Three criteria this deployment can actually supply. `elevation` is absent on
# purpose: no DEM is published, which is a fact about the server and is what
# the binding tests below pin.
GOOD_WEIGHTS = {"slope": 0.22, "dist_to_river": 0.49, "rainfall": 0.29}


def config(**overrides):
    body = {
        "topic": "flood-risk",
        "areas": [POLYGON],
        "weights": dict(GOOD_WEIGHTS),
        "targetCrs": "EPSG:32637",
        "resolution": 90,
        "publishLayers": False,
    }
    body.update(overrides)
    return body


class BindingTests(SimpleTestCase):
    def test_no_dem_is_published_so_elevation_is_unbound(self) -> None:
        """A deployment fact, pinned so it cannot be assumed away.

        Every other criterion has a layer on this GeoServer; elevation does
        not. A run including it is refused at creation rather than failing four
        minutes into a fetch that was never going to find anything.
        """
        self.assertIsNone(binding_for("elevation"))
        self.assertEqual(unbound(["elevation", "slope"]), ["elevation"])

    def test_slope_is_published_ready_made(self) -> None:
        # The criteria artifact calls slope a derived criterion computed from a
        # DEM. This server publishes the result instead, so the derive stage
        # does no work and must report `skipped` rather than pretend.
        bound = binding_for("slope")
        assert bound is not None
        self.assertTrue(bound.precomputed)

    def test_the_river_network_is_vector(self) -> None:
        bound = binding_for("dist_to_river")
        assert bound is not None
        self.assertTrue(bound.vector)

    def test_every_binding_names_a_qualified_layer(self) -> None:
        # An unqualified name resolves against the default workspace, which is
        # a different layer on a different deployment.
        for bound in DEFAULT_BINDINGS.values():
            self.assertIn(":", bound.layer, bound.criterion)


class ValidationTests(SimpleTestCase):
    def test_accepts_a_good_configuration(self) -> None:
        _, errors = validate_run_config(config())
        self.assertEqual(dict(errors), {})

    def test_collects_every_problem_at_once(self) -> None:
        """Independent, cheap checks must not be revealed one submit at a time."""
        _, errors = validate_run_config(
            config(
                areas=[{"type": "Feature", "geometry": {"type": "Point",
                                                        "coordinates": [39, -1]}}],
                weights={"slope": 0.5, "rainfall": 0.4},
                targetCrs="EPSG:4326",
                resolution=5000,
            )
        )
        self.assertEqual(
            sorted(errors), ["areas", "resolution", "targetCrs", "weights"]
        )

    def test_refuses_a_geographic_target_crs(self) -> None:
        """Not pedantry: the pipeline computes a Euclidean distance transform.

        In EPSG:4326 that distance is in degrees, where one unit is 111km at
        the equator and 0km at the pole, so "distance to river" is meaningless
        and looks entirely normal.
        """
        _, errors = validate_run_config(config(targetCrs="EPSG:4326"))
        self.assertIn("degrees", errors["targetCrs"][0])

    def test_refuses_a_criterion_with_no_layer(self) -> None:
        weights = {"elevation": 0.25, **{k: round(v * 0.75, 4) for k, v in
                                         GOOD_WEIGHTS.items()}}
        weights["slope"] = round(1.0 - 0.25 - weights["dist_to_river"]
                                 - weights["rainfall"], 6)
        _, errors = validate_run_config(config(weights=weights))
        self.assertTrue(
            any("No layer" in m for m in errors["weights"]), errors["weights"]
        )

    def test_allows_a_subset_of_the_topics_criteria(self) -> None:
        """Choosing which criteria enter the overlay is part of the method.

        It is also the difference between a service that runs and one that
        cannot: no DEM is published here, so demanding all five criteria would
        make every flood-risk run impossible.
        """
        _, errors = validate_run_config(config(weights=GOOD_WEIGHTS))
        self.assertEqual(dict(errors), {})

    def test_refuses_fewer_than_two_criteria(self) -> None:
        _, errors = validate_run_config(config(weights={"slope": 1.0}))
        self.assertIn("At least two criteria", errors["weights"][0])

    def test_refuses_a_zero_weight_rather_than_computing_it(self) -> None:
        # A zero-weighted criterion cannot affect the answer, so fetching and
        # warping it is minutes of work for nothing.
        weights = {**GOOD_WEIGHTS, "landcover": 0.0}
        _, errors = validate_run_config(config(weights=weights))
        self.assertTrue(any("remove the criterion" in m for m in errors["weights"]))

    def test_refuses_weights_that_do_not_sum_to_one(self) -> None:
        _, errors = validate_run_config(
            config(weights={"slope": 0.2, "rainfall": 0.2})
        )
        self.assertTrue(any("sum to" in m for m in errors["weights"]))

    def test_refuses_a_name_that_is_not_a_criterion(self) -> None:
        weights = {**GOOD_WEIGHTS, "wind": 0.0}
        _, errors = validate_run_config(config(weights=weights))
        self.assertTrue(any("not a criterion" in m for m in errors["weights"]))

    def test_refuses_non_polygon_areas(self) -> None:
        # A point has no area to clip to and a line has no interior; both would
        # produce an empty raster rather than an error, several minutes later.
        for kind, coords in (("Point", [39, -1]), ("LineString", [[39, -1], [40, 0]])):
            _, errors = validate_run_config(
                config(areas=[{"type": kind, "coordinates": coords}])
            )
            self.assertIn("polygons only", errors["areas"][0], kind)

    def test_refuses_a_backwards_or_tiny_date_window(self) -> None:
        _, errors = validate_run_config(
            config(dateWindow={"start": "2024-06-01", "end": "2024-01-01"})
        )
        self.assertIn("after it ends", errors["dateWindow"][0])
        _, errors = validate_run_config(
            config(dateWindow={"start": "2024-01-01", "end": "2024-01-05"})
        )
        self.assertIn("at least", errors["dateWindow"][0])


class ConfigHashTests(SimpleTestCase):
    def test_is_stable_across_key_order(self) -> None:
        """The cache depends on this: the same run must hash the same."""
        a = config()
        b = {k: a[k] for k in reversed(list(a))}
        self.assertEqual(config_hash(a), config_hash(b))

    def test_is_stable_across_float_noise(self) -> None:
        # 0.35 and 0.3500000000000001 are different strings and would be
        # different runs, so a resubmit would recompute for nothing.
        a = config(weights={"slope": 0.22, "dist_to_river": 0.49, "rainfall": 0.29})
        b = config(
            weights={
                "slope": 0.22000000000000003,
                "dist_to_river": 0.49,
                "rainfall": 0.29,
            }
        )
        self.assertEqual(config_hash(a), config_hash(b))

    def test_differs_when_the_run_differs(self) -> None:
        self.assertNotEqual(config_hash(config()), config_hash(config(resolution=30)))
        self.assertNotEqual(
            config_hash(config()),
            config_hash(config(weights={"slope": 0.5, "rainfall": 0.5})),
        )


class RunEndpointTests(TestCase):
    def setUp(self) -> None:
        # The pipeline needs GeoServer and minutes of raster work; these tests
        # are about the endpoints around it.
        patcher = mock.patch("apps.analysis.views.submit")
        self.submit = patcher.start()
        self.addCleanup(patcher.stop)

    def post(self, body):
        return self.client.post(
            "/api/v1/runs", data=json.dumps(body), content_type="application/json"
        )

    def test_creates_a_run_and_queues_it(self) -> None:
        response = self.post(config())
        self.assertEqual(response.status_code, 202)
        body = response.json()
        self.assertFalse(body["cached"])
        self.assertEqual(body["status"], "queued")
        self.submit.assert_called_once()

        # The stage list is fixed at creation so the app never sees it reflow.
        states = {s["id"]: s["state"] for s in body["stages"]}
        self.assertEqual(len(states), 10)
        self.assertEqual(states["publish"], str(StageState.SKIPPED))

    def test_an_identical_configuration_returns_the_existing_run(self) -> None:
        """A resubmit after a dropped connection must not recompute."""
        first = self.post(config())
        second = self.post(config())
        self.assertEqual(first.status_code, 202)
        self.assertEqual(second.status_code, 200)
        self.assertTrue(second.json()["cached"])
        self.assertEqual(first.json()["runId"], second.json()["runId"])
        self.submit.assert_called_once()

    def test_refuses_an_invalid_configuration_with_every_problem(self) -> None:
        response = self.post(config(targetCrs="EPSG:4326", resolution=9999))
        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            sorted(response.json()["fieldErrors"]), ["resolution", "targetCrs"]
        )
        self.submit.assert_not_called()

    def test_polling_an_unknown_run_is_404(self) -> None:
        self.assertEqual(self.client.get("/api/v1/runs/r_nope").status_code, 404)

    def test_polling_a_queued_run_asks_the_client_to_wait(self) -> None:
        run_id = self.post(config()).json()["runId"]
        response = self.client.get(f"/api/v1/runs/{run_id}")
        self.assertEqual(response.status_code, 200)
        # Told, not guessed: a client polling flat out is how a long run becomes
        # a denial of service against its own backend.
        self.assertEqual(response["Retry-After"], "2")

    def test_the_result_is_409_until_the_run_succeeds(self) -> None:
        """409, not 404: the run exists, it simply has no result yet."""
        run_id = self.post(config()).json()["runId"]
        response = self.client.get(f"/api/v1/runs/{run_id}/result")
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["runStatus"], "queued")

    def test_the_result_carries_the_config_and_the_numbers(self) -> None:
        run_id = self.post(config()).json()["runId"]
        run = Run.objects.get(pk=run_id)
        run.status = Run.Status.SUCCEEDED
        run.result = {"breaks": [1.0, 2.0], "classes": []}
        run.save()

        body = self.client.get(f"/api/v1/runs/{run_id}/result").json()
        self.assertEqual(body["breaks"], [1.0, 2.0])
        # The configuration is echoed whole, so a saved result can be read
        # later without this service being available to interpret it.
        self.assertEqual(body["config"]["topic"], "flood-risk")

    def test_progress_and_status_are_derived_from_the_stages(self) -> None:
        """They cannot disagree, because only one of them is written.

        A run whose stages are all done but whose status still reads running is
        the kind of inconsistency that makes a poller hang forever.
        """
        run_id = self.post(config()).json()["runId"]
        run = Run.objects.get(pk=run_id)
        stages = run.stage_objects()
        done = [
            s.__class__(**{**s.__dict__, "state": StageState.DONE}) for s in stages
        ]
        run.set_stages(done)
        self.assertEqual(run.status, "succeeded")
        self.assertAlmostEqual(run.progress, 1.0, places=6)
