"""Jenks natural breaks.

Fisher, W.D. (1958) and Jenks, G.F. (1967). The classification every choropleth
of a continuous surface wants: it picks class boundaries that minimise variance
inside each class and maximise it between them, so the breaks land in the gaps
the data actually has rather than at round numbers a human chose.

Written here rather than taken from `jenkspy` because `jenkspy` is a compiled
wheel that does not build on this machine's Python 3.14, and because the whole
algorithm is the sixty lines below. The dynamic program is the standard one;
what makes it usable on a raster is the sampling in `natural_breaks`, without
which an 8514x11266 image would ask for a 96-million-row matrix.

Pure numpy. No GDAL, no I/O, no Django: this is arithmetic and is tested as
arithmetic.
"""

from __future__ import annotations

import numpy as np

#: Above this many distinct values the input is sampled rather than used whole.
#:
#: The dynamic program is O(n * k) in memory and O(n^2 * k) in time. At n=5000
#: and k=5 that is a 25k-cell table and runs in about half a second; at
#: n=1,000,000 it is neither. The breaks depend on the shape of the
#: distribution rather than on any individual pixel, so a quantile sample gives
#: the same answer for any real surface.
#:
#: The one measured cost, stated because it is invisible otherwise: a sampled
#: break can land a hair above the true edge of a class. On 120,000 uniform
#: draws in two clusters the break came out at 90.002 rather than 90.000, which
#: put roughly two pixels of 120,000 one class low. That is the accepted price
#: of not spending minutes per classification, and it is why the boundary tests
#: use inputs with fewer distinct values than this, where no sampling happens.
MAX_SAMPLE = 5000


class ClassificationError(ValueError):
    """The data cannot be classified into the requested number of classes."""


def natural_breaks(values: np.ndarray, classes: int = 5) -> list[float]:
    """Class boundaries for `values`, as `classes - 1` interior breaks.

    Returns the interior breaks only — not the minimum and maximum — because
    that is what a reclassification needs and because including the extremes
    invites an off-by-one in every consumer that then has to decide whether the
    list is edges or boundaries.

    NaN is dropped rather than treated as a value: it is nodata, and a nodata
    pixel is outside the study area rather than a low reading.
    """
    if classes < 2:
        raise ClassificationError("At least two classes are required.")

    finite = values[np.isfinite(values)]
    if finite.size == 0:
        raise ClassificationError("No finite values to classify.")

    distinct = np.unique(finite)
    if distinct.size < classes:
        # Fewer distinct values than classes: every value becomes its own class
        # and the caller gets fewer breaks than asked for. Raising would be
        # worse — a uniform raster is a real, if boring, result.
        return [float(v) for v in distinct[:-1]]

    sample = _sample(distinct, finite)
    return _jenks_breaks(sample, classes)


def _sample(distinct: np.ndarray, finite: np.ndarray) -> np.ndarray:
    """A sorted sample small enough for the dynamic program.

    Quantiles, not a random draw. A random sample of a skewed surface can miss
    the tail entirely and move the top break a long way; quantiles are
    reproducible and preserve the shape of the distribution, which is the only
    thing Jenks reads.
    """
    if distinct.size <= MAX_SAMPLE:
        return np.sort(distinct)
    quantiles = np.linspace(0.0, 1.0, MAX_SAMPLE)
    return np.unique(np.quantile(finite, quantiles))


def _jenks_breaks(data: np.ndarray, classes: int) -> list[float]:
    """The Fisher-Jenks dynamic program over sorted `data`, vectorised.

    Two tables, both (n+1) x (k+1), indexed from 1 so the recurrence needs no
    special case for the empty prefix:

        variance[i][j]  the smallest within-class sum of squared deviations
                        achievable for the first i values in j classes
        start[i][j]     where the last of those j classes begins, so the breaks
                        can be walked back out at the end

    The textbook form has three nested Python loops and is O(n^2 * k) in the
    interpreter. Measured here at n=5000, k=2 it took about fifteen seconds; a
    real five-class run would have been minutes, which is not a classification
    step, it is an outage.

    So the inner loop over candidate class starts is numpy instead. Prefix sums
    give the sum and sum-of-squares of any window in constant time, so the
    deviations for every candidate start are one vector, and the recurrence
    becomes one `argmin` per (i, j). That is n*k numpy calls on arrays of length
    at most n, rather than n^2*k interpreted iterations.
    """
    n = data.size
    # Prefix sums with a leading zero, so the sums over data[a:b] are
    # prefix[b] - prefix[a] with no branch for a == 0.
    prefix = np.concatenate(([0.0], np.cumsum(data, dtype=np.float64)))
    prefix_squares = np.concatenate(
        ([0.0], np.cumsum(np.square(data, dtype=np.float64)))
    )

    variance = np.full((n + 1, classes + 1), np.inf)
    start = np.zeros((n + 1, classes + 1), dtype=np.int64)
    variance[0, 0] = 0.0

    for i in range(1, n + 1):
        # `lower` is every possible start index of the class ending at i.
        lower = np.arange(0, i)
        counts = i - lower
        totals = prefix[i] - prefix[lower]
        total_squares = prefix_squares[i] - prefix_squares[lower]
        # Sum of squared deviations, from the computational formula. It is the
        # numerically shakier form, but the inputs are raster values in a
        # bounded physical range, not the magnitudes where it loses precision.
        deviations = total_squares - (totals * totals) / counts

        for j in range(1, classes + 1):
            candidates = variance[lower, j - 1] + deviations
            # `argmin` takes the FIRST minimum, so ties resolve to the earliest
            # class start. Ties are real and common: on [2,3,5,6,8,9,10,11,13,
            # 15,35,40,45,60,61,62,63] into 5 classes, breaks at 45 and at 40
            # both give a within-class sum of squares of exactly 61.5. Either is
            # a correct Jenks answer; fixing which one comes out is what makes
            # the same raster classify the same way twice.
            best = int(np.argmin(candidates))
            if candidates[best] < variance[i, j]:
                variance[i, j] = candidates[best]
                start[i, j] = lower[best]

    if variance[n, classes] == np.inf:
        raise ClassificationError(
            f"Cannot split {n} values into {classes} classes."
        )

    # Walk the classes back out. `start[i][j]` is where the j-th class begins,
    # so a break is the FIRST value of the upper class, not the last of the
    # lower one.
    #
    # That distinction is a real off-by-one and it was wrong here first. With
    # `classify` using `right=False`, a break of "last value of the lower class"
    # puts that value into the higher class: on the clustered set
    # [1,2,3 | 50,51,52 | 100,101,102] it returned breaks [3, 52], and 3 and 52
    # — the top of their own clusters — came back one class too high. Returning
    # the first value of the upper class gives [50, 100], and every member
    # classifies into the cluster it belongs to.
    breaks: list[float] = []
    index = n
    for j in range(classes, 1, -1):
        index = int(start[index, j])
        breaks.append(float(data[index]))
    breaks.reverse()
    return breaks


def classify(values: np.ndarray, breaks: list[float]) -> np.ndarray:
    """Assign each value a 1-based class from interior `breaks`.

    `np.digitize` with the default `right=False` puts a value exactly on a break
    into the HIGHER class, which is the convention the class tables in
    `criteria.py` use ("max" is an exclusive upper bound). The two agreeing
    matters: a slope of exactly 5.0 must not be risk 2 in one place and risk 3
    in another.

    NaN stays NaN. `np.digitize` would otherwise sort it above every break and
    silently label nodata as the highest risk class, which on a flood map is the
    worst possible direction to be wrong in.
    """
    result = np.digitize(values, breaks, right=False).astype(np.float32) + 1.0
    result[~np.isfinite(values)] = np.nan
    return result
