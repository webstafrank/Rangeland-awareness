"""Analytic Hierarchy Process: weights from pairwise comparisons.

Saaty, T.L. (1980), The Analytic Hierarchy Process, McGraw-Hill.

This is the second implementation of the same maths. The first is in
``my-app/lib/ahp/pairwise.ts``, and it exists because the pairwise form has to
respond without a round trip to this service. The duplication is deliberate and
it is fenced: both are tested against ``contracts/ahp-fixtures.json``, so they
cannot disagree about a weight or a consistency ratio.

They must not disagree. The app shows the analyst a set of weights; this service
re-derives them before it will accept a run. If the two drifted, the map would
be computed with weights the analyst never saw, and nothing downstream would
notice.

Pure functions over plain lists. No numpy dependency here on purpose: the whole
module is small, and keeping it dependency-free means the API can validate a
matrix on a machine where the geospatial stack has not been installed.
"""

from __future__ import annotations

from dataclasses import dataclass, field

#: Saaty's fundamental scale. Even values are legal intermediates between the
#: odd anchors and are deliberately unlabelled.
SAATY_VALUES: tuple[int, ...] = (1, 2, 3, 4, 5, 6, 7, 8, 9)

SAATY_LABELS: dict[int, str] = {
    1: "Equally important",
    3: "Moderately more important",
    5: "Strongly more important",
    7: "Very strongly more important",
    9: "Extremely more important",
}

#: Average consistency index of randomly generated reciprocal matrices, by
#: order. Indexed by n, so index 0 is unused padding.
#:
#: Orders 1 and 2 are 0 because a matrix that small cannot be inconsistent:
#: with one comparison there is nothing to contradict. That zero is why
#: ``assess`` special-cases them instead of dividing.
RANDOM_INDEX: tuple[float, ...] = (
    0.0, 0.0, 0.0, 0.58, 0.90, 1.12, 1.24, 1.32, 1.41, 1.45, 1.49,
)

MAX_CRITERIA: int = len(RANDOM_INDEX) - 1  # 10

#: Saaty's threshold. At or above this the judgements are revisited.
MAX_ACCEPTABLE_CR: float = 0.1

Matrix = list[list[float]]


class InvalidMatrix(ValueError):
    """Raised when a matrix is not a valid reciprocal comparison matrix."""

    def __init__(self, problems: list[MatrixProblem]) -> None:
        self.problems = problems
        super().__init__(problems[0].message if problems else "invalid matrix")


@dataclass(frozen=True)
class MatrixProblem:
    message: str
    row: int | None = None
    column: int | None = None


@dataclass(frozen=True)
class AhpResult:
    weights: list[float]
    lambda_max: float
    consistency_index: float
    consistency_ratio: float
    acceptable: bool
    iterations: int = field(default=0)


def matrix_problems(matrix: Matrix) -> list[MatrixProblem]:
    """Every problem with a matrix, not just the first.

    A UI that reveals one broken cell at a time makes the user fix, submit and
    discover the next one.
    """
    problems: list[MatrixProblem] = []
    n = len(matrix)

    if n == 0:
        return [MatrixProblem("The comparison matrix is empty.")]

    if n > MAX_CRITERIA:
        problems.append(
            MatrixProblem(
                f"AHP is defined here for at most {MAX_CRITERIA} criteria; this "
                f"matrix has {n}. Beyond that the random index is not tabulated "
                f"and the number of comparisons stops being answerable."
            )
        )

    for i in range(n):
        if len(matrix[i]) != n:
            problems.append(
                MatrixProblem(
                    f"Row {i + 1} has {len(matrix[i])} entries, expected {n}.",
                    row=i,
                )
            )
            continue

        for j in range(n):
            value = matrix[i][j]
            if not isinstance(value, (int, float)) or isinstance(value, bool):
                problems.append(
                    MatrixProblem("Every comparison must be a number.", row=i, column=j)
                )
                continue
            if value != value or value in (float("inf"), float("-inf")) or value <= 0:
                # A zero or a negative is not a weak preference, it is a broken
                # matrix, and its eigenvector means nothing.
                problems.append(
                    MatrixProblem(
                        f"Every comparison must be a positive number; found {value}.",
                        row=i,
                        column=j,
                    )
                )
                continue
            if i == j and abs(value - 1.0) > 1e-9:
                problems.append(
                    MatrixProblem(
                        "A criterion compared with itself must be 1.", row=i, column=j
                    )
                )

            # Reciprocity is what makes it an AHP matrix at all. Relative
            # tolerance because 1/3 does not round-trip in binary.
            if j < len(matrix) and i < len(matrix[j]):
                mirror = matrix[j][i]
                if isinstance(mirror, (int, float)) and not isinstance(mirror, bool):
                    if mirror > 0 and mirror == mirror:
                        product = value * mirror
                        if abs(product - 1.0) > 1e-6:
                            problems.append(
                                MatrixProblem(
                                    f"Cells [{i + 1},{j + 1}] and [{j + 1},{i + 1}] "
                                    f"must be reciprocals; their product is "
                                    f"{product:.4f}, not 1.",
                                    row=i,
                                    column=j,
                                )
                            )

    return problems


def matrix_from_upper_triangle(size: int, comparisons: dict[str, float]) -> Matrix:
    """Build the full matrix from the ``"i,j"`` answers above the diagonal.

    The upper triangle is what a person actually answers, n(n-1)/2 questions.
    Deriving the rest here means the reciprocals cannot be entered wrong.
    Unanswered pairs default to 1, so a half-filled form still previews.
    """
    matrix: Matrix = [[1.0] * size for _ in range(size)]
    for i in range(size):
        for j in range(i + 1, size):
            value = float(comparisons.get(f"{i},{j}", 1.0))
            matrix[i][j] = value
            matrix[j][i] = 1.0 / value
    return matrix


def _principal_eigenvector(
    matrix: Matrix, tolerance: float = 1e-12, max_iterations: int = 1000
) -> tuple[list[float], int]:
    """Power iteration.

    Saaty defines the weights as the principal eigenvector, and this computes
    that rather than the geometric-mean approximation. The two agree exactly on
    a consistent matrix and diverge on an inconsistent one, which is precisely
    the case the consistency ratio exists to judge, so approximating would blur
    the thing being measured.

    A positive reciprocal matrix is irreducible and non-negative, so
    Perron-Frobenius guarantees a unique positive dominant eigenvalue and this
    converges. The cap guards a caller that skipped validation.
    """
    n = len(matrix)
    vector = [1.0 / n] * n

    for iteration in range(1, max_iterations + 1):
        nxt = [sum(matrix[i][j] * vector[j] for j in range(n)) for i in range(n)]
        total = sum(nxt)
        if total == 0:
            # Impossible for a validated matrix; guarded because dividing would
            # turn a bad input into NaN weights that render as blanks.
            return vector, iteration
        normalised = [value / total for value in nxt]
        delta = max(abs(normalised[i] - vector[i]) for i in range(n))
        vector = normalised
        if delta < tolerance:
            return vector, iteration

    return vector, max_iterations


def assess(matrix: Matrix) -> AhpResult:
    """Weights, consistency, and whether the judgements may be used.

    Raises :class:`InvalidMatrix` rather than returning nonsense. Every caller
    validates first and renders the problems, so reaching the raise is a
    programming error rather than a user one.
    """
    problems = matrix_problems(matrix)
    if problems:
        raise InvalidMatrix(problems)

    n = len(matrix)
    weights, iterations = _principal_eigenvector(matrix)

    # lambda_max as the mean of (Aw)_i / w_i. Equals n exactly when consistent.
    lambda_max = 0.0
    for i in range(n):
        row = sum(matrix[i][j] * weights[j] for j in range(n))
        lambda_max += row / weights[i]
    lambda_max /= n

    # Floating point can put lambda_max a hair under n on a consistent matrix,
    # which would print a negative index. Clamped: a negative CI is rounding,
    # not a state.
    consistency_index = max(0.0, (lambda_max - n) / (n - 1)) if n > 1 else 0.0

    # Orders 1 and 2 have RI = 0 and cannot be inconsistent. Dividing gives
    # inf or nan and rejects a matrix correct by construction.
    random_index = RANDOM_INDEX[n] if n < len(RANDOM_INDEX) else 0.0
    consistency_ratio = 0.0 if random_index == 0 else consistency_index / random_index

    return AhpResult(
        weights=weights,
        lambda_max=lambda_max,
        consistency_index=consistency_index,
        consistency_ratio=consistency_ratio,
        acceptable=consistency_ratio < MAX_ACCEPTABLE_CR,
        iterations=iterations,
    )


def round_weights(weights: list[float], decimals: int = 3) -> list[float]:
    """Round while keeping the sum at exactly 1.

    The overlay multiplies each criterion's risk by its weight and reads the
    result as a 1..5 index, so weights summing to 0.999 quietly shrink every
    value. Rounding each independently does exactly that, so the largest weight
    absorbs the residual: it is where a 0.001 shift is least visible, and it
    keeps the displayed table adding up, which is the first thing anyone
    checking by hand will do.
    """
    if not weights:
        return []
    factor = 10**decimals
    rounded = [round(w * factor) / factor for w in weights]
    residual = 1.0 - sum(rounded)
    largest = max(range(len(rounded)), key=lambda i: rounded[i])
    rounded[largest] = round((rounded[largest] + residual) * factor) / factor
    return rounded


def comparison_count(size: int) -> int:
    """How many pairwise questions an order-n matrix asks."""
    return 0 if size < 2 else size * (size - 1) // 2
