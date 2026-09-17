/**
 * Conformance against the shared fixtures.
 *
 * `contracts/ahp-fixtures.json` is imported by BOTH implementations: this one
 * and the Python one in services/backend/apps/analysis/domain/ahp.py. Weights
 * derived in the browser to
 * keep the pairwise form responsive, and weights the service re-derives before
 * it will accept a run, have to be the same numbers. Two AHP implementations
 * that quietly disagree would mean the map was computed with weights the
 * analyst never saw.
 *
 * The fixture file is read from disk rather than imported, so it stays plain
 * JSON that a Python test reads the same way, with no bundler or import
 * assertion involved on either side.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { assessMatrix, matrixProblems } from "@/lib/ahp/pairwise";

interface Expectation {
  weights?: number[];
  lambdaMax?: number;
  consistencyIndex?: number;
  consistencyRatio?: number;
  consistencyRatioAtLeast?: number;
  consistencyRatioAtMost?: number;
  acceptable?: boolean;
  weightOrder?: string[];
}

interface Case {
  name: string;
  why?: string;
  criteria: string[];
  matrix: number[][];
  expect: Expectation;
}

interface Fixtures {
  tolerance: number;
  cases: Case[];
  invalid: { name: string; matrix: number[][] }[];
}

const fixturesPath = fileURLToPath(
  new URL("../../../../contracts/ahp-fixtures.json", import.meta.url),
);
const fixtures = JSON.parse(readFileSync(fixturesPath, "utf8")) as Fixtures;

describe("shared AHP fixtures", () => {
  it("loads, and is not silently empty", () => {
    // A path typo would otherwise make every case below vacuously pass.
    expect(fixtures.cases.length).toBeGreaterThan(5);
    expect(fixtures.invalid.length).toBeGreaterThan(3);
    expect(fixtures.tolerance).toBeGreaterThan(0);
  });
});

describe.each(fixtures.cases)("case: $name", (testCase) => {
  const tolerance = fixtures.tolerance;

  it("is a valid matrix", () => {
    expect(matrixProblems(testCase.matrix)).toEqual([]);
  });

  it("matches the expected result", () => {
    const result = assessMatrix(testCase.matrix);
    const want = testCase.expect;

    if (want.weights) {
      expect(result.weights.length).toBe(want.weights.length);
      for (const [i, expected] of want.weights.entries()) {
        expect(
          Math.abs(result.weights[i] - expected),
          `weight[${i}] ${result.weights[i]} vs ${expected}`,
        ).toBeLessThanOrEqual(tolerance);
      }
    }
    if (want.lambdaMax !== undefined) {
      expect(Math.abs(result.lambdaMax - want.lambdaMax)).toBeLessThanOrEqual(tolerance);
    }
    if (want.consistencyIndex !== undefined) {
      expect(
        Math.abs(result.consistencyIndex - want.consistencyIndex),
      ).toBeLessThanOrEqual(tolerance);
    }
    if (want.consistencyRatio !== undefined) {
      expect(
        Math.abs(result.consistencyRatio - want.consistencyRatio),
      ).toBeLessThanOrEqual(tolerance);
    }
    if (want.consistencyRatioAtLeast !== undefined) {
      expect(result.consistencyRatio).toBeGreaterThanOrEqual(want.consistencyRatioAtLeast);
    }
    if (want.consistencyRatioAtMost !== undefined) {
      expect(result.consistencyRatio).toBeLessThanOrEqual(want.consistencyRatioAtMost);
    }
    if (want.acceptable !== undefined) {
      expect(result.acceptable).toBe(want.acceptable);
    }
    if (want.weightOrder) {
      const ranked = testCase.criteria
        .map((id, i) => ({ id, weight: result.weights[i] }))
        .sort((a, b) => b.weight - a.weight)
        .map((entry) => entry.id);
      expect(ranked).toEqual(want.weightOrder);
    }
  });

  it("always returns weights that sum to one", () => {
    const total = assessMatrix(testCase.matrix).weights.reduce((a, b) => a + b, 0);
    expect(Math.abs(total - 1)).toBeLessThanOrEqual(1e-9);
  });
});

describe.each(fixtures.invalid)("invalid matrix: $name", (badCase) => {
  it("is reported as invalid rather than weighted", () => {
    expect(matrixProblems(badCase.matrix).length).toBeGreaterThan(0);
    expect(() => assessMatrix(badCase.matrix)).toThrow();
  });
});
