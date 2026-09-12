"""Conformance against the shared AHP fixtures.

``contracts/ahp-fixtures.json`` is read by this suite and by
``my-app/lib/ahp/__tests__/conformance.test.ts``. Same file, same tolerance,
same expectations. That is the whole mechanism keeping the two implementations
honest: the app derives weights so the pairwise form is responsive, this service
re-derives them before accepting a run, and if they drifted the map would be
computed with weights the analyst never saw.

Written with unittest rather than pytest so it runs on a bare interpreter. The
geospatial stack is a heavy install and this module deliberately does not need
it.
"""

from __future__ import annotations

import json
import unittest
from pathlib import Path

from app.domain.ahp import (
    InvalidMatrix,
    assess,
    comparison_count,
    matrix_from_upper_triangle,
    matrix_problems,
    round_weights,
)

FIXTURES = Path(__file__).resolve().parents[3] / "contracts" / "ahp-fixtures.json"


def load_fixtures() -> dict:
    with FIXTURES.open(encoding="utf-8") as handle:
        return json.load(handle)


class FixtureFileTest(unittest.TestCase):
    def test_fixture_file_is_found_and_populated(self) -> None:
        # A path typo would otherwise make every generated case vacuously pass.
        self.assertTrue(FIXTURES.exists(), f"fixtures not found at {FIXTURES}")
        data = load_fixtures()
        self.assertGreater(len(data["cases"]), 5)
        self.assertGreater(len(data["invalid"]), 3)
        self.assertGreater(data["tolerance"], 0)


class ConformanceTest(unittest.TestCase):
    """One assertion set per fixture case, reported by name."""

    def test_valid_cases(self) -> None:
        data = load_fixtures()
        tolerance = data["tolerance"]

        for case in data["cases"]:
            with self.subTest(case=case["name"]):
                matrix = case["matrix"]
                self.assertEqual(
                    matrix_problems(matrix), [], f"{case['name']} should be valid"
                )

                result = assess(matrix)
                want = case["expect"]

                if "weights" in want:
                    self.assertEqual(len(result.weights), len(want["weights"]))
                    for i, expected in enumerate(want["weights"]):
                        self.assertLessEqual(
                            abs(result.weights[i] - expected),
                            tolerance,
                            f"weight[{i}] {result.weights[i]} vs {expected}",
                        )
                if "lambdaMax" in want:
                    self.assertLessEqual(
                        abs(result.lambda_max - want["lambdaMax"]), tolerance
                    )
                if "consistencyIndex" in want:
                    self.assertLessEqual(
                        abs(result.consistency_index - want["consistencyIndex"]),
                        tolerance,
                    )
                if "consistencyRatio" in want:
                    self.assertLessEqual(
                        abs(result.consistency_ratio - want["consistencyRatio"]),
                        tolerance,
                    )
                if "consistencyRatioAtLeast" in want:
                    self.assertGreaterEqual(
                        result.consistency_ratio, want["consistencyRatioAtLeast"]
                    )
                if "consistencyRatioAtMost" in want:
                    self.assertLessEqual(
                        result.consistency_ratio, want["consistencyRatioAtMost"]
                    )
                if "acceptable" in want:
                    self.assertEqual(result.acceptable, want["acceptable"])
                if "weightOrder" in want:
                    ranked = [
                        criterion
                        for criterion, _weight in sorted(
                            zip(case["criteria"], result.weights),
                            key=lambda pair: pair[1],
                            reverse=True,
                        )
                    ]
                    self.assertEqual(ranked, want["weightOrder"])

                self.assertLessEqual(abs(sum(result.weights) - 1.0), 1e-9)

    def test_invalid_cases_are_refused(self) -> None:
        data = load_fixtures()
        for case in data["invalid"]:
            with self.subTest(case=case["name"]):
                self.assertGreater(len(matrix_problems(case["matrix"])), 0)
                with self.assertRaises(InvalidMatrix):
                    assess(case["matrix"])


class EdgeCaseTest(unittest.TestCase):
    """The traps that are not in the shared fixtures because they are local."""

    def test_order_two_does_not_divide_by_zero(self) -> None:
        result = assess([[1.0, 7.0], [1 / 7, 1.0]])
        self.assertEqual(result.consistency_ratio, 0.0)
        self.assertTrue(result.acceptable)

    def test_consistency_index_is_never_negative(self) -> None:
        for size in (3, 4, 5, 6, 7):
            equal = [[1.0] * size for _ in range(size)]
            self.assertGreaterEqual(assess(equal).consistency_index, 0.0)

    def test_upper_triangle_fills_reciprocals(self) -> None:
        matrix = matrix_from_upper_triangle(3, {"0,1": 3, "0,2": 5, "1,2": 3})
        self.assertAlmostEqual(matrix[1][0], 1 / 3, places=12)
        self.assertAlmostEqual(matrix[2][1], 1 / 3, places=12)
        self.assertEqual(matrix_problems(matrix), [])

    def test_unanswered_pairs_default_to_equal(self) -> None:
        matrix = matrix_from_upper_triangle(3, {"0,1": 5})
        self.assertEqual(matrix[0][2], 1.0)
        self.assertEqual(matrix_problems(matrix), [])

    def test_round_weights_sums_to_one(self) -> None:
        self.assertEqual(sum(round_weights([1 / 3, 1 / 3, 1 / 3])), 1.0)
        for trial in range(50):
            size = 3 + (trial % 6)
            raw = [(i + 1) * (trial + 1) for i in range(size)]
            total = sum(raw)
            rounded = round_weights([v / total for v in raw])
            self.assertAlmostEqual(sum(rounded), 1.0, places=9)

    def test_booleans_are_not_accepted_as_comparisons(self) -> None:
        # bool is a subclass of int in Python, so True would otherwise sail
        # through as the value 1 and silently mean "equally important".
        problems = matrix_problems([[1.0, True], [1.0, 1.0]])
        self.assertGreater(len(problems), 0)

    def test_comparison_count(self) -> None:
        self.assertEqual(comparison_count(1), 0)
        self.assertEqual(comparison_count(5), 10)
        self.assertEqual(comparison_count(10), 45)


if __name__ == "__main__":
    unittest.main(verbosity=2)
