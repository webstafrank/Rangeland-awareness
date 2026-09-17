"""The criteria artifact loads, and the stage plan behaves.

This is the other half of the cross-language contract. The TypeScript side
proves the artifact matches its registry; this proves the service can read that
artifact and gets the same tables out, including the slope inversion that is the
whole reason the tables are not shared.
"""

from __future__ import annotations

import unittest

from apps.analysis.domain.criteria import (
    Calibration,
    CriterionSourceKind,
    ScaleKind,
    classify_categorical,
    classify_continuous,
    criteria_for,
    is_overlay_topic,
    method_for,
    unfilled_criteria,
)
from apps.analysis.jobs.stages import (
    STAGE_SCRIPT,
    RunStatus,
    StageState,
    advance,
    plan_stages,
    progress_of,
    status_of,
)

AT = "2026-09-09T13:04:11Z"


def criterion(topic: str, cid: str):
    found = next((c for c in criteria_for(topic) if c.id == cid), None)
    assert found is not None, f"missing {topic}/{cid}"
    return found


class ArtifactTest(unittest.TestCase):
    def test_both_overlay_topics_load(self) -> None:
        self.assertTrue(is_overlay_topic("flood-risk"))
        self.assertTrue(is_overlay_topic("landslide"))
        self.assertEqual(len(criteria_for("flood-risk")), 5)
        self.assertEqual(len(criteria_for("landslide")), 7)

    def test_model_topics_are_not_overlays(self) -> None:
        for topic in ("drought-monitoring", "rangeland-dynamics", "food-security"):
            self.assertFalse(is_overlay_topic(topic), topic)
            self.assertEqual(method_for(topic).kind, "model")

    def test_unknown_topic_is_a_model_topic_not_an_error(self) -> None:
        self.assertEqual(method_for("not-a-topic").kind, "model")
        self.assertEqual(criteria_for("not-a-topic"), ())

    def test_flood_carries_the_notebook_weights(self) -> None:
        weights = method_for("flood-risk").default_weights
        self.assertEqual(
            weights,
            {
                "elevation": 0.25,
                "slope": 0.15,
                "dist_to_river": 0.35,
                "rainfall": 0.20,
                "landcover": 0.05,
            },
        )
        self.assertAlmostEqual(sum(weights.values()), 1.0, places=12)

    def test_landslide_ships_no_default_weights(self) -> None:
        # They are derived from pairwise comparison; a default set would defeat
        # the reason the AHP module exists.
        self.assertIsNone(method_for("landslide").default_weights)


class SlopeInversionTest(unittest.TestCase):
    """The guard, re-asserted on the Python side of the boundary."""

    def test_flat_ground_means_opposite_things(self) -> None:
        flood = criterion("flood-risk", "slope").scale.continuous
        slide = criterion("landslide", "slope").scale.continuous
        self.assertEqual(classify_continuous(flood, 1.0), 5)
        self.assertEqual(classify_continuous(slide, 1.0), 1)

    def test_steep_ground_means_opposite_things(self) -> None:
        flood = criterion("flood-risk", "slope").scale.continuous
        slide = criterion("landslide", "slope").scale.continuous
        self.assertEqual(classify_continuous(flood, 40.0), 1)
        self.assertEqual(classify_continuous(slide, 40.0), 5)

    def test_the_two_run_in_opposite_directions(self) -> None:
        flood = criterion("flood-risk", "slope").scale.continuous
        slide = criterion("landslide", "slope").scale.continuous
        samples = [0, 1, 3, 8, 12, 18, 22, 30, 45, 70]
        f = [classify_continuous(flood, s) for s in samples]
        s = [classify_continuous(slide, s) for s in samples]
        for i in range(1, len(samples)):
            self.assertLessEqual(f[i], f[i - 1], f"flood at {samples[i]}")
            self.assertGreaterEqual(s[i], s[i - 1], f"landslide at {samples[i]}")


class NotebookFidelityTest(unittest.TestCase):
    """The flood tables, restated independently of the artifact."""

    def test_elevation(self) -> None:
        c = criterion("flood-risk", "elevation").scale.continuous
        for value, risk in [(0, 5), (50, 5), (51, 4), (150, 4), (151, 3),
                            (300, 3), (301, 2), (500, 2), (501, 1)]:
            self.assertEqual(classify_continuous(c, value), risk, f"{value} m")

    def test_distance_to_river(self) -> None:
        c = criterion("flood-risk", "dist_to_river").scale.continuous
        for value, risk in [(0, 5), (1000, 5), (1001, 4), (3000, 4), (3001, 3),
                            (7000, 3), (7001, 2), (15000, 2), (15001, 1)]:
            self.assertEqual(classify_continuous(c, value), risk, f"{value} m")

    def test_landcover_codes(self) -> None:
        scale = criterion("flood-risk", "landcover").scale
        notebook = {10: 1, 20: 2, 30: 3, 40: 5, 50: 4, 60: 5,
                    70: 1, 80: 5, 90: 5, 95: 3, 100: 3}
        for code, risk in notebook.items():
            self.assertEqual(classify_categorical(scale, code), risk, f"code {code}")

    def test_the_gaussian_smoothing_survived_the_port(self) -> None:
        # Only the SECOND copy of the notebook has it; the first leaves ring
        # artifacts in the distance transform.
        source = criterion("flood-risk", "dist_to_river").source
        self.assertEqual(source.kind, CriterionSourceKind.DISTANCE)
        self.assertEqual(source.smooth_sigma_px, 3)

    def test_rainfall_is_percentile_scored(self) -> None:
        scale = criterion("flood-risk", "rainfall").scale
        self.assertEqual(scale.kind, ScaleKind.PERCENTILE)
        self.assertEqual(scale.breaks, (20, 40, 60, 80))


class LithologyTest(unittest.TestCase):
    def test_ships_empty_and_is_reported_unfilled(self) -> None:
        lithology = criterion("landslide", "lithology")
        self.assertEqual(lithology.calibration, Calibration.REQUIRED)
        self.assertFalse(lithology.is_filled)
        self.assertEqual([c.id for c in unfilled_criteria("landslide")], ["lithology"])

    def test_every_code_is_nodata_until_filled(self) -> None:
        scale = criterion("landslide", "lithology").scale
        for code in (0, 1, 7, 42, 999):
            self.assertIsNone(classify_categorical(scale, code), f"code {code}")

    def test_flood_has_nothing_unfilled(self) -> None:
        self.assertEqual(unfilled_criteria("flood-risk"), ())


class ClassifyEdgeTest(unittest.TestCase):
    def test_nan_is_rejected_not_clamped(self) -> None:
        c = criterion("flood-risk", "elevation").scale.continuous
        self.assertIsNone(classify_continuous(c, float("nan")))
        self.assertIsNone(classify_continuous(c, float("inf")))


class StagePlanTest(unittest.TestCase):
    def test_flood_plan_runs_derive_and_distance(self) -> None:
        stages = plan_stages(list(criteria_for("flood-risk")))
        by_id = {s.id: s for s in stages}
        # Flood derives slope from the DEM and computes distance to river.
        self.assertEqual(by_id["derive"].state, StageState.PENDING)
        self.assertEqual(by_id["distance"].state, StageState.PENDING)

    def test_publish_is_skipped_when_not_publishing(self) -> None:
        stages = plan_stages(list(criteria_for("flood-risk")), publish_layers=False)
        by_id = {s.id: s for s in stages}
        self.assertEqual(by_id["publish"].state, StageState.SKIPPED)

    def test_the_plan_always_has_the_same_shape(self) -> None:
        # A list that changes length mid-run makes the UI reflow under the
        # reader, so inapplicable stages are marked, never dropped.
        for publish in (True, False):
            for topic in ("flood-risk", "landslide"):
                stages = plan_stages(list(criteria_for(topic)), publish_layers=publish)
                self.assertEqual(len(stages), len(STAGE_SCRIPT))
                self.assertEqual(
                    [s.id for s in stages], [t.id for t in STAGE_SCRIPT]
                )


class ProgressTest(unittest.TestCase):
    def setUp(self) -> None:
        self.stages = plan_stages(list(criteria_for("flood-risk")))

    def test_starts_at_zero_and_is_queued(self) -> None:
        self.assertEqual(progress_of(self.stages), 0.0)
        self.assertEqual(status_of(self.stages), RunStatus.QUEUED)

    def test_is_monotonic_through_a_whole_run(self) -> None:
        # A bar that goes backwards is worse than no bar.
        stages = self.stages
        last = progress_of(stages)
        for template in STAGE_SCRIPT:
            stages = advance(stages, template.id, StageState.RUNNING, at=AT)
            running = progress_of(stages)
            self.assertGreaterEqual(running, last, f"{template.id} running")
            stages = advance(stages, template.id, StageState.DONE, at=AT)
            done = progress_of(stages)
            self.assertGreaterEqual(done, running, f"{template.id} done")
            last = done

    def test_reaches_exactly_one_when_everything_finishes(self) -> None:
        stages = self.stages
        for template in STAGE_SCRIPT:
            stages = advance(stages, template.id, StageState.DONE, at=AT)
        self.assertAlmostEqual(progress_of(stages), 1.0, places=9)
        self.assertEqual(status_of(stages), RunStatus.SUCCEEDED)

    def test_reaches_one_even_when_stages_are_skipped(self) -> None:
        # Skipped counts as finished. Leaving it out of the numerator would cap
        # the bar below 1 for the whole run and it would never reach the end.
        stages = plan_stages(list(criteria_for("flood-risk")), publish_layers=False)
        for stage in stages:
            if stage.state != StageState.SKIPPED:
                stages = advance(stages, stage.id, StageState.DONE, at=AT)
        self.assertAlmostEqual(progress_of(stages), 1.0, places=9)
        self.assertEqual(status_of(stages), RunStatus.SUCCEEDED)

    def test_never_exceeds_one(self) -> None:
        stages = [s for s in self.stages]
        for template in STAGE_SCRIPT:
            stages = advance(stages, template.id, StageState.DONE, at=AT)
        self.assertLessEqual(progress_of(stages), 1.0)

    def test_a_failed_stage_fails_the_run(self) -> None:
        stages = advance(self.stages, "fetch", StageState.FAILED, at=AT)
        self.assertEqual(status_of(stages), RunStatus.FAILED)

    def test_advance_does_not_mutate_the_input(self) -> None:
        # A caller must not be able to mutate a list another thread is
        # serialising mid-poll and emit a half-updated status.
        before = self.stages
        advance(before, "resolve", StageState.DONE, at=AT)
        self.assertTrue(all(s.state != StageState.DONE for s in before))


if __name__ == "__main__":
    unittest.main(verbosity=2)
