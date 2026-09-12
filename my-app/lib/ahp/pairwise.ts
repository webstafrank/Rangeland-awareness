/**
 * Analytic Hierarchy Process: deriving criterion weights from pairwise
 * comparisons, and refusing the ones that are not self-consistent.
 *
 * Saaty, T.L. (1980), The Analytic Hierarchy Process, McGraw-Hill.
 *
 * Why the app does this rather than shipping a table of numbers: a weight
 * typed straight into a config is a number nobody can defend. A weight derived
 * from pairwise judgements carries its own audit trail — which comparisons
 * produced it, and whether those comparisons contradict each other. The
 * consistency ratio is the part that matters. Someone who says drainage
 * proximity is 5x elevation, elevation is 3x slope, and slope is 3x drainage
 * proximity has stated something impossible, and AHP is the only step in this
 * pipeline that can notice.
 *
 * All pure, no React, no IO, so every claim below is gate-tested in node.
 */

/**
 * Saaty's fundamental scale. The intermediate even values are legal and
 * deliberately unlabelled: they are compromises between the odd anchors, and
 * inventing prose for them would suggest a precision the scale does not have.
 */
export const SAATY_VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;
export type SaatyValue = (typeof SAATY_VALUES)[number];

export const SAATY_LABELS: Readonly<Record<number, string>> = {
  1: "Equally important",
  3: "Moderately more important",
  5: "Strongly more important",
  7: "Very strongly more important",
  9: "Extremely more important",
};

/**
 * Saaty's Random Index: the average consistency index of randomly generated
 * reciprocal matrices of each order. The consistency ratio is measured against
 * this, so that "inconsistent" means "worse than a matrix filled in at random
 * would typically be", not merely "not perfect".
 *
 * Index is the matrix order n. Orders 1 and 2 are 0 because a matrix that
 * small cannot be inconsistent: with one comparison there is nothing to
 * contradict. That zero is also why `consistencyRatio` special-cases them
 * rather than dividing.
 *
 * Values from Saaty (1980). Beyond 10 criteria AHP is not advisable anyway —
 * the number of comparisons grows as n(n-1)/2 and people stop being able to
 * hold the problem in their head — so an order above the table is refused
 * rather than extrapolated.
 */
export const RANDOM_INDEX: readonly number[] = [
  0, 0, 0, 0.58, 0.9, 1.12, 1.24, 1.32, 1.41, 1.45, 1.49,
];

export const MAX_CRITERIA = RANDOM_INDEX.length - 1; // 10

/**
 * The threshold Saaty proposed and the literature has used since: a matrix
 * whose ratio reaches 0.1 is rejected and the judgements revisited.
 */
export const MAX_ACCEPTABLE_CR = 0.1;

/** A square reciprocal matrix: a[i][j] is how much more important i is than j. */
export type PairwiseMatrix = readonly (readonly number[])[];

export interface MatrixProblem {
  /** Which cell is wrong, when the problem is about one cell. */
  row?: number;
  column?: number;
  message: string;
}

export interface AhpResult {
  /** Normalised principal eigenvector: the weights, summing to 1. */
  weights: readonly number[];
  /** Principal eigenvalue. Equals n exactly for a perfectly consistent matrix. */
  lambdaMax: number;
  /** Consistency index, (lambdaMax - n) / (n - 1). Zero when consistent. */
  consistencyIndex: number;
  /**
   * Consistency ratio, CI / RI(n). Zero for orders 1 and 2, which cannot be
   * inconsistent.
   */
  consistencyRatio: number;
  /** Whether the ratio is below the threshold, so the weights may be used. */
  acceptable: boolean;
  /** How many power iterations were needed. Diagnostic only. */
  iterations: number;
}

/**
 * Check a matrix before trusting it.
 *
 * Every problem, not the first: a UI showing one broken cell at a time makes
 * the user fix, submit, and discover the next one.
 */
export function matrixProblems(matrix: PairwiseMatrix): MatrixProblem[] {
  const problems: MatrixProblem[] = [];
  const n = matrix.length;

  if (n === 0) {
    problems.push({ message: "The comparison matrix is empty." });
    return problems;
  }
  if (n > MAX_CRITERIA) {
    problems.push({
      message:
        `AHP is defined here for at most ${MAX_CRITERIA} criteria; this matrix ` +
        `has ${n}. Beyond that the random index is not tabulated and the ` +
        `number of comparisons stops being answerable.`,
    });
  }

  for (let i = 0; i < n; i += 1) {
    if (matrix[i].length !== n) {
      problems.push({
        row: i,
        message: `Row ${i + 1} has ${matrix[i].length} entries, expected ${n}.`,
      });
      continue;
    }
    for (let j = 0; j < n; j += 1) {
      const value = matrix[i][j];
      if (!Number.isFinite(value) || value <= 0) {
        problems.push({
          row: i,
          column: j,
          // A zero or a negative is not a weak preference, it is a broken
          // matrix: the eigenvector of it means nothing.
          message: `Every comparison must be a positive number; found ${value}.`,
        });
        continue;
      }
      if (i === j && Math.abs(value - 1) > 1e-9) {
        problems.push({
          row: i,
          column: j,
          message: "A criterion compared with itself must be 1.",
        });
      }
      // Reciprocity is what makes the matrix an AHP matrix at all. Checked
      // with a relative tolerance because 1/3 does not round-trip in binary.
      const mirror = matrix[j]?.[i];
      if (typeof mirror === "number" && Number.isFinite(mirror) && mirror > 0) {
        const product = value * mirror;
        if (Math.abs(product - 1) > 1e-6) {
          problems.push({
            row: i,
            column: j,
            message:
              `Cells [${i + 1},${j + 1}] and [${j + 1},${i + 1}] must be ` +
              `reciprocals; their product is ${product.toFixed(4)}, not 1.`,
          });
        }
      }
    }
  }

  return problems;
}

/**
 * Build a full reciprocal matrix from just the comparisons above the diagonal.
 *
 * That upper triangle is what a person actually answers — n(n-1)/2 questions —
 * and deriving the rest here means the reciprocals cannot be entered wrong.
 * `comparisons` is keyed "i,j" with i < j.
 */
export function matrixFromUpperTriangle(
  size: number,
  comparisons: Readonly<Record<string, number>>,
): number[][] {
  const matrix: number[][] = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => 1),
  );
  for (let i = 0; i < size; i += 1) {
    for (let j = i + 1; j < size; j += 1) {
      // Unanswered pairs default to 1, "equally important", so a half-filled
      // matrix still yields a usable preview rather than an error.
      const value = comparisons[`${i},${j}`] ?? 1;
      matrix[i][j] = value;
      matrix[j][i] = 1 / value;
    }
  }
  return matrix;
}

/**
 * The principal eigenvector, by power iteration.
 *
 * Saaty defines the weights as the principal eigenvector, and this computes
 * that rather than the geometric-mean approximation. The two agree exactly on
 * a consistent matrix and diverge on an inconsistent one, which is precisely
 * the case the consistency ratio exists to judge — so approximating here would
 * blur the thing being measured.
 *
 * A positive reciprocal matrix is irreducible and non-negative, so Perron
 * Frobenius guarantees a unique positive dominant eigenvalue and power
 * iteration converges to it. The iteration cap is a guard against a caller
 * that skipped validation, not an expected path.
 */
function principalEigenvector(
  matrix: PairwiseMatrix,
  tolerance = 1e-12,
  maxIterations = 1000,
): { vector: number[]; iterations: number } {
  const n = matrix.length;
  let vector = Array.from({ length: n }, () => 1 / n);

  for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
    const next = Array.from({ length: n }, (_unused, i) => {
      let sum = 0;
      for (let j = 0; j < n; j += 1) sum += matrix[i][j] * vector[j];
      return sum;
    });

    const total = next.reduce((a, b) => a + b, 0);
    // Cannot happen for a validated matrix: every entry is positive, so every
    // row sum is positive. Guarded anyway because dividing by it would turn a
    // bad input into NaN weights that render as blanks.
    if (total === 0) return { vector, iterations: iteration };

    const normalised = next.map((value) => value / total);
    const delta = normalised.reduce(
      (worst, value, i) => Math.max(worst, Math.abs(value - vector[i])),
      0,
    );
    vector = normalised;
    if (delta < tolerance) return { vector, iterations: iteration };
  }

  return { vector, iterations: maxIterations };
}

/**
 * Weights, consistency, and whether the judgements may be used.
 *
 * Throws only for a matrix that failed `matrixProblems`; every caller in the
 * app validates first and renders the problems, so reaching the throw is a
 * programming error rather than a user one.
 */
export function assessMatrix(matrix: PairwiseMatrix): AhpResult {
  const problems = matrixProblems(matrix);
  if (problems.length > 0) {
    throw new Error(
      `ahp: refusing to weight an invalid matrix (${problems[0].message})`,
    );
  }

  const n = matrix.length;
  const { vector: weights, iterations } = principalEigenvector(matrix);

  // lambdaMax as the mean of (Aw)_i / w_i. Equals n exactly when consistent.
  let lambdaMax = 0;
  for (let i = 0; i < n; i += 1) {
    let row = 0;
    for (let j = 0; j < n; j += 1) row += matrix[i][j] * weights[j];
    lambdaMax += row / weights[i];
  }
  lambdaMax /= n;

  // Floating point can put lambdaMax a hair under n on a consistent matrix,
  // which would print a negative consistency index. Clamped, because a
  // negative CI is not a real state, it is rounding.
  const consistencyIndex = n > 1 ? Math.max(0, (lambdaMax - n) / (n - 1)) : 0;

  // Orders 1 and 2 have RI = 0 and cannot be inconsistent. Dividing would give
  // Infinity or NaN and reject a matrix that is correct by construction.
  const randomIndex = RANDOM_INDEX[n] ?? 0;
  const consistencyRatio = randomIndex === 0 ? 0 : consistencyIndex / randomIndex;

  return {
    weights,
    lambdaMax,
    consistencyIndex,
    consistencyRatio,
    acceptable: consistencyRatio < MAX_ACCEPTABLE_CR,
    iterations,
  };
}

/**
 * Round weights to a fixed number of decimals while keeping the sum at exactly
 * 1.
 *
 * The overlay multiplies each criterion's risk by its weight and the result is
 * read as a 1..5 index, so weights that sum to 0.9999 quietly shrink every
 * value. Rounding each independently does exactly that, so the largest weight
 * absorbs the residual — it is the one where a 0.001 shift is least visible,
 * and it keeps the displayed numbers adding up, which is what anyone checking
 * the table by hand will do first.
 */
export function roundWeights(
  weights: readonly number[],
  decimals = 3,
): number[] {
  if (weights.length === 0) return [];
  const factor = 10 ** decimals;
  const rounded = weights.map((w) => Math.round(w * factor) / factor);
  const residual = 1 - rounded.reduce((a, b) => a + b, 0);

  let largest = 0;
  for (let i = 1; i < rounded.length; i += 1) {
    if (rounded[i] > rounded[largest]) largest = i;
  }
  rounded[largest] = Math.round((rounded[largest] + residual) * factor) / factor;
  return rounded;
}

/** How many pairwise questions an order-n matrix asks. */
export function comparisonCount(size: number): number {
  return size < 2 ? 0 : (size * (size - 1)) / 2;
}
