import { describe, expect, it } from "vitest";
import {
  MAX_ACCEPTABLE_CR,
  MAX_CRITERIA,
  RANDOM_INDEX,
  assessMatrix,
  comparisonCount,
  matrixFromUpperTriangle,
  matrixProblems,
  roundWeights,
} from "@/services/ahp/pairwise";

/**
 * A perfectly consistent matrix, built from a known weight vector by
 * a[i][j] = w[i] / w[j]. Recovering `w` from it is the ground truth for the
 * eigenvector: there is exactly one right answer and it is known in advance.
 */
function consistentFrom(weights: readonly number[]): number[][] {
  return weights.map((wi) => weights.map((wj) => wi / wj));
}

describe("assessMatrix on a perfectly consistent matrix", () => {
  it("recovers the weights it was built from", () => {
    const truth = [0.25, 0.15, 0.35, 0.2, 0.05]; // the notebook's AHP weights
    const result = assessMatrix(consistentFrom(truth));

    for (const [i, expected] of truth.entries()) {
      expect(result.weights[i]).toBeCloseTo(expected, 9);
    }
  });

  it("reports lambdaMax equal to n, so the consistency index is zero", () => {
    const truth = [0.25, 0.15, 0.35, 0.2, 0.05];
    const result = assessMatrix(consistentFrom(truth));

    expect(result.lambdaMax).toBeCloseTo(5, 8);
    expect(result.consistencyIndex).toBeCloseTo(0, 8);
    expect(result.consistencyRatio).toBeCloseTo(0, 8);
    expect(result.acceptable).toBe(true);
  });

  it("produces weights that sum to one", () => {
    const result = assessMatrix(consistentFrom([0.4, 0.3, 0.2, 0.1]));
    expect(result.weights.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
  });

  it("gives every criterion the same weight when all comparisons are equal", () => {
    const result = assessMatrix([
      [1, 1, 1],
      [1, 1, 1],
      [1, 1, 1],
    ]);
    for (const w of result.weights) expect(w).toBeCloseTo(1 / 3, 12);
    expect(result.consistencyRatio).toBeCloseTo(0, 12);
  });
});

describe("assessMatrix on a real, mildly inconsistent matrix", () => {
  // Saaty's textbook shape: A moderately over B, B moderately over C, and A
  // strongly over C. Slightly inconsistent, comfortably inside the threshold.
  const matrix = [
    [1, 3, 5],
    [1 / 3, 1, 3],
    [1 / 5, 1 / 3, 1],
  ];

  it("orders the weights the way the judgements do", () => {
    const { weights } = assessMatrix(matrix);
    expect(weights[0]).toBeGreaterThan(weights[1]);
    expect(weights[1]).toBeGreaterThan(weights[2]);
  });

  it("is accepted, with lambdaMax just above n", () => {
    const result = assessMatrix(matrix);
    expect(result.lambdaMax).toBeGreaterThan(3);
    expect(result.lambdaMax).toBeLessThan(3.1);
    expect(result.consistencyRatio).toBeLessThan(MAX_ACCEPTABLE_CR);
    expect(result.acceptable).toBe(true);
  });
});

describe("assessMatrix rejects self-contradiction", () => {
  it("fails a cyclic preference, where each criterion beats the next", () => {
    // A strongly over B, B strongly over C, and C strongly over A. This is not
    // a close call, it is impossible, and catching it is the entire reason the
    // consistency ratio is computed rather than the weights taken on trust.
    const cyclic = [
      [1, 9, 1 / 9],
      [1 / 9, 1, 9],
      [9, 1 / 9, 1],
    ];
    const result = assessMatrix(cyclic);
    expect(result.consistencyRatio).toBeGreaterThan(MAX_ACCEPTABLE_CR);
    expect(result.acceptable).toBe(false);
  });

  it("never reports a negative consistency index", () => {
    // Floating point can put lambdaMax a hair under n on a consistent matrix.
    // A negative CI is rounding noise, not a state, and printing one would
    // look like a defect.
    for (const size of [3, 4, 5, 6, 7]) {
      const equal = Array.from({ length: size }, () =>
        Array.from({ length: size }, () => 1),
      );
      expect(assessMatrix(equal).consistencyIndex).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("orders that cannot be inconsistent", () => {
  it("returns a ratio of zero for one criterion, not NaN", () => {
    // RI is 0 at these orders. Dividing by it would give NaN or Infinity and
    // reject a matrix that is correct by construction.
    const result = assessMatrix([[1]]);
    expect(result.consistencyRatio).toBe(0);
    expect(Number.isNaN(result.consistencyRatio)).toBe(false);
    expect(result.acceptable).toBe(true);
    expect(result.weights).toEqual([1]);
  });

  it("returns a ratio of zero for two criteria, not Infinity", () => {
    const result = assessMatrix([
      [1, 7],
      [1 / 7, 1],
    ]);
    expect(Number.isFinite(result.consistencyRatio)).toBe(true);
    expect(result.consistencyRatio).toBe(0);
    expect(result.acceptable).toBe(true);
    expect(result.weights[0]).toBeCloseTo(7 / 8, 10);
    expect(result.weights[1]).toBeCloseTo(1 / 8, 10);
  });
});

describe("matrixProblems", () => {
  it("passes a well-formed matrix", () => {
    expect(matrixProblems(consistentFrom([0.5, 0.3, 0.2]))).toEqual([]);
  });

  it("rejects an empty matrix", () => {
    expect(matrixProblems([]).length).toBe(1);
  });

  it("rejects a non-square matrix", () => {
    const problems = matrixProblems([
      [1, 2],
      [0.5],
    ]);
    expect(problems.some((p) => p.message.includes("expected 2"))).toBe(true);
  });

  it("rejects a zero or negative comparison", () => {
    for (const bad of [0, -3]) {
      const problems = matrixProblems([
        [1, bad],
        [1 / 3, 1],
      ]);
      expect(problems.some((p) => p.message.includes("positive"))).toBe(true);
    }
  });

  it("rejects a non-finite comparison", () => {
    const problems = matrixProblems([
      [1, Number.NaN],
      [1, 1],
    ]);
    expect(problems.some((p) => p.message.includes("positive"))).toBe(true);
  });

  it("rejects a diagonal that is not 1", () => {
    const problems = matrixProblems([
      [2, 1],
      [1, 1],
    ]);
    expect(problems.some((p) => p.message.includes("itself must be 1"))).toBe(true);
  });

  it("rejects cells that are not reciprocals", () => {
    // The property that makes it an AHP matrix at all.
    const problems = matrixProblems([
      [1, 3],
      [3, 1],
    ]);
    expect(problems.some((p) => p.message.includes("reciprocals"))).toBe(true);
  });

  it("tolerates the rounding in 1/3, which does not round-trip in binary", () => {
    expect(matrixProblems([
      [1, 3],
      [0.3333333333333333, 1],
    ])).toEqual([]);
  });

  it("refuses more criteria than the random index is tabulated for", () => {
    const size = MAX_CRITERIA + 1;
    const big = Array.from({ length: size }, () =>
      Array.from({ length: size }, () => 1),
    );
    expect(matrixProblems(big).some((p) => p.message.includes("at most"))).toBe(true);
  });

  it("reports every problem, not only the first", () => {
    const problems = matrixProblems([
      [1, 0],
      [5, 2],
    ]);
    expect(problems.length).toBeGreaterThan(1);
  });
});

describe("assessMatrix refuses an invalid matrix rather than returning nonsense", () => {
  it("throws instead of weighting a non-reciprocal matrix", () => {
    expect(() =>
      assessMatrix([
        [1, 3],
        [3, 1],
      ]),
    ).toThrow(/invalid matrix/);
  });
});

describe("matrixFromUpperTriangle", () => {
  it("fills the reciprocals so they cannot be entered wrong", () => {
    const matrix = matrixFromUpperTriangle(3, { "0,1": 3, "0,2": 5, "1,2": 3 });
    expect(matrix[1][0]).toBeCloseTo(1 / 3, 12);
    expect(matrix[2][0]).toBeCloseTo(1 / 5, 12);
    expect(matrix[2][1]).toBeCloseTo(1 / 3, 12);
    expect(matrixProblems(matrix)).toEqual([]);
  });

  it("puts 1 on the diagonal", () => {
    const matrix = matrixFromUpperTriangle(4, {});
    for (let i = 0; i < 4; i += 1) expect(matrix[i][i]).toBe(1);
  });

  it("treats an unanswered pair as equal importance, so a half-filled form still previews", () => {
    const matrix = matrixFromUpperTriangle(3, { "0,1": 5 });
    expect(matrix[0][2]).toBe(1);
    expect(matrix[1][2]).toBe(1);
    expect(matrixProblems(matrix)).toEqual([]);
  });

  it("round trips through assessMatrix for a consistent set of answers", () => {
    // 0 is 6x criterion 2, via 0 = 2x1 and 1 = 3x2.
    const matrix = matrixFromUpperTriangle(3, { "0,1": 2, "1,2": 3, "0,2": 6 });
    const result = assessMatrix(matrix);
    expect(result.consistencyRatio).toBeCloseTo(0, 9);
    expect(result.weights[0] / result.weights[2]).toBeCloseTo(6, 8);
  });
});

describe("roundWeights", () => {
  it("keeps the sum at exactly 1", () => {
    // Three weights that each round down leave the overlay quietly scaled.
    const rounded = roundWeights([1 / 3, 1 / 3, 1 / 3]);
    expect(rounded.reduce((a, b) => a + b, 0)).toBe(1);
  });

  it("puts the residual on the largest weight, where it shows least", () => {
    const rounded = roundWeights([0.5555, 0.2222, 0.2223]);
    expect(rounded.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
    expect(Math.max(...rounded)).toBeGreaterThan(0.55);
  });

  it("holds the sum across many random vectors", () => {
    for (let trial = 0; trial < 200; trial += 1) {
      const size = 3 + (trial % 6);
      const raw = Array.from({ length: size }, (_v, i) => (i + 1) * (trial + 1));
      const total = raw.reduce((a, b) => a + b, 0);
      const rounded = roundWeights(raw.map((v) => v / total));
      expect(rounded.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
    }
  });

  it("returns an empty array unchanged", () => {
    expect(roundWeights([])).toEqual([]);
  });
});

describe("comparisonCount", () => {
  it("is n(n-1)/2, and zero below two criteria", () => {
    expect(comparisonCount(0)).toBe(0);
    expect(comparisonCount(1)).toBe(0);
    expect(comparisonCount(2)).toBe(1);
    expect(comparisonCount(5)).toBe(10);
    expect(comparisonCount(10)).toBe(45);
  });
});

describe("the random index table", () => {
  it("is zero where a matrix cannot be inconsistent, positive after", () => {
    expect(RANDOM_INDEX[1]).toBe(0);
    expect(RANDOM_INDEX[2]).toBe(0);
    for (let n = 3; n <= MAX_CRITERIA; n += 1) {
      expect(RANDOM_INDEX[n], `RI(${n})`).toBeGreaterThan(0);
    }
  });

  it("increases with order, as larger random matrices are less consistent", () => {
    for (let n = 4; n <= MAX_CRITERIA; n += 1) {
      expect(RANDOM_INDEX[n], `RI(${n})`).toBeGreaterThanOrEqual(RANDOM_INDEX[n - 1]);
    }
  });
});
