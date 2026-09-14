"""Jenks, reclassification and the overlay: the arithmetic the map is made of.

Every number asserted here is one a person can check by hand, which is the
standard for this layer. A weighted overlay has no ground truth to validate
against — it is a stated model, not a fit — so the only defence against a
silently wrong map is that each step does exactly the arithmetic it claims.
"""

from __future__ import annotations

import numpy as np
from django.test import SimpleTestCase

from apps.analysis.domain import criteria
from apps.analysis.domain.jenks import (
    ClassificationError,
    classify,
    natural_breaks,
)
from apps.analysis.domain.reclassify import (
    ReclassifyError,
    contribution,
    reclassify,
    weighted_overlay,
)


class JenksTests(SimpleTestCase):
    def test_finds_the_gaps_between_clusters(self) -> None:
        # Three obvious clusters. Any correct implementation puts the breaks in
        # the two empty stretches and nowhere else.
        data = np.array([1, 2, 3, 50, 51, 52, 100, 101, 102], dtype=float)
        self.assertEqual(natural_breaks(data, 3), [50.0, 100.0])

    def test_every_member_lands_in_its_own_cluster(self) -> None:
        """The off-by-one regression, stated as behaviour.

        The first version returned the LAST value of each lower class as the
        break. With `classify` using right=False that put the boundary value one
        class too high: on this data, 3 and 52 — each the top of its own cluster
        — came back in the cluster above. On a flood map that is the worst
        direction to be wrong in, and it is invisible in a rendered image.
        """
        data = np.array([1, 2, 3, 50, 51, 52, 100, 101, 102], dtype=float)
        breaks = natural_breaks(data, 3)
        self.assertEqual(
            classify(data, breaks).tolist(),
            [1.0, 1.0, 1.0, 2.0, 2.0, 2.0, 3.0, 3.0, 3.0],
        )

    def test_returns_interior_breaks_only(self) -> None:
        # Not the min and max. Including the extremes invites an off-by-one in
        # every consumer that then has to decide what the list contains.
        data = np.arange(100, dtype=float)
        self.assertEqual(len(natural_breaks(data, 5)), 4)

    def test_nodata_is_not_classified_as_the_highest_risk(self) -> None:
        """`np.digitize` sorts NaN above every break if it is not excluded."""
        values = np.array([1.0, np.nan, 100.0])
        result = classify(values, [50.0])
        self.assertEqual(result[0], 1.0)
        self.assertTrue(np.isnan(result[1]))
        self.assertEqual(result[2], 2.0)

    def test_nan_is_dropped_rather_than_treated_as_a_value(self) -> None:
        with_nan = np.array([1, 2, 3, np.nan, 50, 51, 52, 100, 101, 102])
        without = np.array([1, 2, 3, 50, 51, 52, 100, 101, 102], dtype=float)
        self.assertEqual(natural_breaks(with_nan, 3), natural_breaks(without, 3))

    def test_a_uniform_raster_is_a_result_not_an_error(self) -> None:
        self.assertEqual(natural_breaks(np.full(100, 7.0), 5), [])

    def test_fewer_distinct_values_than_classes(self) -> None:
        self.assertEqual(natural_breaks(np.array([1.0, 2.0, 1.0, 2.0]), 5), [1.0])

    def test_refuses_an_all_nodata_raster(self) -> None:
        with self.assertRaises(ClassificationError):
            natural_breaks(np.full(10, np.nan), 5)

    def test_refuses_fewer_than_two_classes(self) -> None:
        with self.assertRaises(ClassificationError):
            natural_breaks(np.arange(10, dtype=float), 1)

    def test_separates_two_clouds_in_a_raster_sized_input(self) -> None:
        """A raster is millions of pixels and the dynamic program is quadratic.

        Sampling by quantile preserves the shape of the distribution, which is
        the only thing Jenks reads.

        Asserted as a separation property rather than a numeric range, which is
        what the first version got wrong. A break is the FIRST value of the
        upper class, so with an empty gap between the clouds it lands at the
        bottom edge of the upper one (about 86 here), not in the middle of the
        gap. Every break inside an empty gap is equally optimal, so pinning a
        range would be testing an arbitrary tie-break.
        """
        # Many pixels, but few DISTINCT values, so `_sample` returns them all
        # and no approximation enters. That distinction is the point of this
        # test: with more distinct values than MAX_SAMPLE the breaks come from
        # 5000 quantiles, and a break can then land a hair above the true edge
        # of the upper cluster — on 120,000 uniform draws it sat at 90.002 and
        # left about two genuine upper-cluster pixels one class low. That is the
        # accepted cost of sampling, not a property to assert, so it is tested
        # where sampling is exact and documented where it is not.
        rng = np.random.default_rng(1234)
        low = rng.integers(0, 10, 60000).astype(float)
        high = rng.integers(90, 100, 60000).astype(float)
        breaks = natural_breaks(np.concatenate([low, high]), 2)
        self.assertEqual(breaks, [90.0])

        # The property that matters: no member of either cloud is on the wrong
        # side of the break.
        self.assertEqual(set(classify(low, breaks).tolist()), {1.0})
        self.assertEqual(set(classify(high, breaks).tolist()), {2.0})

    def test_sampling_keeps_the_break_inside_the_gap(self) -> None:
        """With more distinct values than MAX_SAMPLE the break is approximate.

        It stays inside the empty stretch between the clusters, which is what
        makes the classification usable; it is simply not guaranteed to be the
        exact minimum of the upper cluster.
        """
        rng = np.random.default_rng(1234)
        data = np.concatenate(
            [rng.uniform(0.0, 10.0, 60000), rng.uniform(90.0, 100.0, 60000)]
        )
        breaks = natural_breaks(data, 2)
        self.assertEqual(len(breaks), 1)
        self.assertGreater(breaks[0], 10.0)
        self.assertLess(breaks[0], 91.0)

    def test_classifies_a_raster_sized_input_quickly(self) -> None:
        """The gate-lane budget, as a test rather than a hope.

        The textbook three-loop form took about fifteen seconds on this input
        for two classes; five classes would have been minutes, which is not a
        classification step but an outage. The vectorised recurrence does it in
        well under a second, and this fails if someone reintroduces the
        interpreted inner loop.
        """
        import time

        rng = np.random.default_rng(99)
        data = np.concatenate([rng.normal(10, 1, 60000), rng.normal(90, 1, 60000)])
        started = time.monotonic()
        natural_breaks(data, 5)
        self.assertLess(time.monotonic() - started, 5.0)

    def test_is_deterministic_when_partitions_tie(self) -> None:
        """Ties are real, and the same raster must classify the same way twice.

        On this set into five classes, breaks at 45 and at 40 both give a
        within-class sum of squares of exactly 61.5. Either is a correct Jenks
        answer; which one comes out must not wander.
        """
        data = np.array(
            [2.0, 3, 5, 6, 8, 9, 10, 11, 13, 15, 35, 40, 45, 60, 61, 62, 63]
        )
        first = natural_breaks(data, 5)
        self.assertEqual(first, natural_breaks(data.copy(), 5))
        self.assertEqual(first, [8.0, 35.0, 40.0, 60.0])


class ContinuousReclassifyTests(SimpleTestCase):
    def setUp(self) -> None:
        method = criteria.method_for("flood-risk")
        self.slope = next(c for c in method.criteria if c.id == "slope")

    def test_applies_the_shipped_slope_table(self) -> None:
        # Flat ground is high flood risk: this table runs 5 for <2 degrees down
        # to 1 for 20 and above, which is the opposite of a landslide table and
        # is exactly why the tables are keyed by topic-criterion pair.
        values = np.array([0.5, 3.0, 8.0, 15.0, 45.0])
        self.assertEqual(
            reclassify(values, self.slope).tolist(), [5.0, 4.0, 3.0, 2.0, 1.0]
        )

    def test_the_upper_bound_is_exclusive(self) -> None:
        """A value exactly on a bound belongs to the band above it.

        The tables are authored with `max` as an exclusive upper bound, and
        `jenks.classify` uses right=False for the same reason. The two must
        agree or a slope of exactly 5.0 is risk 4 in one place and 3 in another.
        """
        bounds = [b.max for b in self.slope.scale.continuous if b.max is not None]
        on_bound = np.array(bounds, dtype=float)
        below = on_bound - 1e-9
        risk_on = reclassify(on_bound, self.slope)
        risk_below = reclassify(below, self.slope)
        for i, bound in enumerate(bounds):
            self.assertLess(
                risk_on[i], risk_below[i], f"value exactly {bound} changed band"
            )

    def test_the_open_ended_band_catches_everything_above(self) -> None:
        huge = np.array([1e6])
        self.assertEqual(reclassify(huge, self.slope).tolist(), [1.0])

    def test_nodata_stays_nodata(self) -> None:
        result = reclassify(np.array([np.nan, 3.0]), self.slope)
        self.assertTrue(np.isnan(result[0]))
        self.assertEqual(result[1], 4.0)


class CategoricalReclassifyTests(SimpleTestCase):
    def setUp(self) -> None:
        method = criteria.method_for("flood-risk")
        self.landcover = next(c for c in method.criteria if c.id == "landcover")

    def test_an_unlisted_code_becomes_nodata_not_low_risk(self) -> None:
        """A code the table has never seen is a coding mismatch.

        The layer and the table disagree about what the numbers mean, which is a
        configuration error. Painting it risk 1 would clear the map and nobody
        would know to look.
        """
        result = reclassify(np.array([999.0]), self.landcover)
        self.assertTrue(np.isnan(result[0]))

    def test_float_codes_are_rounded_before_comparison(self) -> None:
        """A categorical raster read as float32 gives 3.0000001 for class 3.

        An equality test against the integer then matches nothing at all and the
        whole criterion comes back empty.
        """
        listed = self.landcover.scale.categorical[0].codes[0]
        exact = reclassify(np.array([float(listed)]), self.landcover)
        wobbly = reclassify(np.array([float(listed) + 1e-7]), self.landcover)
        self.assertEqual(exact.tolist(), wobbly.tolist())
        self.assertFalse(np.isnan(exact[0]))

    def test_refuses_an_unfilled_table(self) -> None:
        """Lithology ships empty; a run naming it must be refused, not blank.

        An all-nodata criterion inside a weighted sum drags every result toward
        zero while looking like a computed answer.
        """
        landslide = criteria.method_for("landslide")
        unfilled = [c for c in landslide.criteria if not c.is_filled]
        if not unfilled:
            self.skipTest("no unfilled criterion is shipped any more")
        with self.assertRaises(ReclassifyError) as caught:
            reclassify(np.array([1.0]), unfilled[0])
        self.assertIn("empty", str(caught.exception))


class WeightedOverlayTests(SimpleTestCase):
    def setUp(self) -> None:
        self.layers = {
            "a": np.array([[5.0, 1.0], [3.0, np.nan]]),
            "b": np.array([[1.0, 5.0], [3.0, 2.0]]),
        }
        self.weights = {"a": 0.75, "b": 0.25}

    def test_is_the_arithmetic_it_claims(self) -> None:
        # 5*0.75 + 1*0.25 = 4.0 and 1*0.75 + 5*0.25 = 2.0, by hand.
        result = weighted_overlay(self.layers, self.weights)
        self.assertEqual(result[0].tolist(), [4.0, 2.0])
        self.assertEqual(result[1][0], 3.0)

    def test_nodata_in_any_criterion_is_nodata_in_the_result(self) -> None:
        """The alternative produces a number that means "we did not know".

        Treating a missing criterion as zero, or renormalising the weights over
        the layers that do have data, yields a low-looking score that is
        indistinguishable downstream from a genuinely low risk.
        """
        result = weighted_overlay(self.layers, self.weights)
        self.assertTrue(np.isnan(result[1][1]))

    def test_refuses_weights_that_do_not_sum_to_one(self) -> None:
        with self.assertRaises(ReclassifyError) as caught:
            weighted_overlay(self.layers, {"a": 0.5, "b": 0.4})
        self.assertIn("0.900000", str(caught.exception))

    def test_refuses_a_missing_or_extra_weight(self) -> None:
        with self.assertRaises(ReclassifyError):
            weighted_overlay(self.layers, {"a": 1.0})
        with self.assertRaises(ReclassifyError):
            weighted_overlay({"a": self.layers["a"]}, {"a": 0.5, "b": 0.5})

    def test_refuses_layers_that_are_not_on_the_same_grid(self) -> None:
        # Two rasters of different shapes have not been warped onto the run's
        # reference grid, and numpy would broadcast some of those combinations
        # into a silently wrong answer rather than raising.
        with self.assertRaises(ReclassifyError) as caught:
            weighted_overlay(
                {"a": np.ones((2, 2)), "b": np.ones((3, 3))},
                {"a": 0.5, "b": 0.5},
            )
        self.assertIn("different shapes", str(caught.exception))

    def test_contribution_sums_to_one(self) -> None:
        shares = contribution(self.layers, self.weights)
        self.assertAlmostEqual(sum(shares.values()), 1.0, places=6)

    def test_contribution_of_equal_layers_is_the_weights(self) -> None:
        # With identical means, each criterion's share is its weight. This is
        # the honest statistic a weighted overlay can report, and it is
        # checkable by hand, which is the whole reason it is the one reported.
        layers = {"a": np.full((4, 4), 3.0), "b": np.full((4, 4), 3.0)}
        shares = contribution(layers, {"a": 0.7, "b": 0.3})
        self.assertAlmostEqual(shares["a"], 0.7, places=6)
        self.assertAlmostEqual(shares["b"], 0.3, places=6)
