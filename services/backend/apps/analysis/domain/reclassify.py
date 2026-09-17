"""Turn a measured raster into a 1..5 risk raster, per its own class table.

This is where the science is applied, and it is the step with the highest ratio
of consequence to code. The tables come from `contracts/criteria.json`, authored
once in TypeScript, so nothing here decides what a slope of 12 degrees means —
it only applies what was decided. That separation is the entire reason the
artifact exists: a table that disagrees with itself maps susceptibility upside
down while looking completely plausible.

Three scale kinds, three different failure modes, all handled explicitly:

    continuous   ordered bands with exclusive upper bounds. The trap is the
                 boundary value and the open-ended last band.
    categorical  land-cover codes to risk. The trap is a code the table has
                 never heard of, which is a coding mismatch and not a low risk.
    percentile   bands by position in this raster's own distribution rather
                 than by absolute value. The trap is computing the percentiles
                 over nodata.

Pure numpy over arrays. No GDAL, no I/O.
"""

from __future__ import annotations

import numpy as np

from apps.analysis.domain.criteria import Criterion, ScaleKind

#: The risk scale every criterion reclassifies onto. 1 is least, 5 is most.
RISK_MIN = 1
RISK_MAX = 5


class ReclassifyError(ValueError):
    """A criterion cannot be applied to this raster."""


def reclassify(values: np.ndarray, criterion: Criterion) -> np.ndarray:
    """Apply a criterion's class table to an array of measurements.

    Returns float32 rather than an integer type so nodata can stay NaN. An
    integer risk raster has no value that means "no data" — every one of 1..5 is
    a real risk — so the usual trick of a sentinel like 0 or 255 has to be
    remembered by every consumer, and the first one that forgets averages it
    into a mean.
    """
    if not criterion.is_filled:
        # Lithology is the live case: its codes belong to whatever geology layer
        # the GeoServer publishes, so it ships empty. Producing a blank raster
        # here would put an all-nodata criterion into the weighted sum and
        # quietly drag every result toward zero.
        raise ReclassifyError(
            f'The class table for "{criterion.id}" is empty, so it cannot be '
            "applied. Fill it against the published layer's codes, or drop the "
            "criterion from the run."
        )

    array = np.asarray(values, dtype=np.float64)
    if criterion.scale.kind == ScaleKind.CONTINUOUS:
        risk = _continuous(array, criterion)
    elif criterion.scale.kind == ScaleKind.CATEGORICAL:
        risk = _categorical(array, criterion)
    else:
        risk = _percentile(array, criterion)

    risk[~np.isfinite(array)] = np.nan
    return risk.astype(np.float32)


def _continuous(values: np.ndarray, criterion: Criterion) -> np.ndarray:
    """Ordered bands, each with an exclusive upper bound.

    The bands are applied from the top down so that the first matching band
    wins and the open-ended final band (`max is None`) catches everything above
    the last bound. Going bottom-up would need the bounds to be sorted and would
    silently mis-assign if they were not.
    """
    bands = criterion.scale.continuous
    if bands[-1].max is not None:
        # An open-ended last band is what makes the table total. Without it,
        # a rainfall value above the highest bound has no class at all and
        # becomes nodata — a hole in the middle of the study area.
        raise ReclassifyError(
            f'The last band of "{criterion.id}" has an upper bound, so values '
            "above it would be unclassified. The final band must be open-ended."
        )

    risk = np.full(values.shape, np.nan, dtype=np.float64)
    # Reverse order: assign the widest (last) band first, then overwrite with
    # narrower lower bands, so each pixel ends on the lowest band it satisfies.
    for band in reversed(bands):
        if band.max is None:
            risk[:] = float(band.risk)
        else:
            risk[values < band.max] = float(band.risk)
    return risk


def _categorical(values: np.ndarray, criterion: Criterion) -> np.ndarray:
    """Land-cover style codes mapped to risk.

    Codes are compared as integers after rounding, because a categorical raster
    read as float32 gives 3.0000001 for class 3 and an equality test against 3
    then matches nothing at all. Rounding first is the difference between a
    correct map and an empty one.
    """
    lookup: dict[int, int] = {}
    for klass in criterion.scale.categorical:
        for code in klass.codes:
            if code in lookup and lookup[code] != klass.risk:
                raise ReclassifyError(
                    f'Code {code} appears twice in "{criterion.id}" with '
                    f"different risks ({lookup[code]} and {klass.risk})."
                )
            lookup[code] = klass.risk

    codes = np.where(np.isfinite(values), np.round(values), np.nan)
    risk = np.full(values.shape, np.nan, dtype=np.float64)

    for code, value in lookup.items():
        risk[codes == code] = float(value)

    unlisted = criterion.scale.unlisted
    if unlisted is not None:
        unmatched = np.isfinite(codes) & np.isnan(risk)
        risk[unmatched] = float(unlisted)
    # When `unlisted` is None the artifact said "nodata", and an unrecognised
    # code stays NaN. That is deliberate: an unlisted code means the layer and
    # the table disagree about the coding, which is a configuration error, and
    # painting it risk 1 would clear the map without anyone noticing.
    return risk


def _percentile(values: np.ndarray, criterion: Criterion) -> np.ndarray:
    """Bands by position within this raster's own distribution.

    Used where an absolute threshold has no meaning across regions — a rainfall
    anomaly that is extreme in Turkana is unremarkable in Kericho. The breaks
    are computed over the FINITE values only; including nodata would drag every
    percentile toward whatever sentinel the source used.

    `ascending=False` inverts the mapping for a criterion where a low value is
    the risky one (distance to a river being the obvious case).
    """
    finite = values[np.isfinite(values)]
    if finite.size == 0:
        raise ReclassifyError(
            f'"{criterion.id}" has no valid pixels in this area, so its '
            "percentile bands cannot be computed."
        )

    breaks = criterion.scale.breaks
    if not breaks:
        raise ReclassifyError(f'"{criterion.id}" declares no percentile breaks.')

    thresholds = [float(np.percentile(finite, p)) for p in breaks]
    # digitize needs a non-decreasing sequence. A flat distribution can produce
    # equal thresholds, which is legal and simply means an empty class, but a
    # decreasing one would mean the breaks were authored out of order.
    if any(b < a for a, b in zip(thresholds, thresholds[1:])):
        raise ReclassifyError(
            f'The percentile breaks for "{criterion.id}" are not in ascending '
            "order."
        )

    band = np.digitize(values, thresholds, right=False) + 1
    risk = band.astype(np.float64)
    if not criterion.scale.ascending:
        # Mirror around the scale: the lowest band becomes the highest risk.
        top = len(thresholds) + 1
        risk = (top + 1) - risk
    return risk


def weighted_overlay(
    layers: dict[str, np.ndarray], weights: dict[str, float]
) -> np.ndarray:
    """`sum(risk_i * weight_i)`, the whole model in one line of arithmetic.

    Every layer must already be reclassified to the same 1..5 scale and warped
    onto the same grid; this function checks the second and trusts the first,
    because shape is cheap to verify and "is this on a risk scale" is not.

    A pixel that is nodata in ANY criterion is nodata in the result. The
    tempting alternative — treat it as zero, or renormalise the weights over
    the layers that do have data — produces a number that looks like a low risk
    but means "we did not know", and there is no way to tell the two apart
    downstream.
    """
    if not layers:
        raise ReclassifyError("No criterion layers to overlay.")

    missing = sorted(set(weights) - set(layers))
    if missing:
        raise ReclassifyError(f"No layer supplied for: {', '.join(missing)}.")
    extra = sorted(set(layers) - set(weights))
    if extra:
        raise ReclassifyError(f"No weight supplied for: {', '.join(extra)}.")

    total = sum(weights.values())
    if abs(total - 1.0) > 1e-6:
        raise ReclassifyError(f"Weights sum to {total:.6f}, not 1.0.")

    shapes = {layer.shape for layer in layers.values()}
    if len(shapes) > 1:
        raise ReclassifyError(
            f"Criterion layers have different shapes: {sorted(shapes)}. "
            "They must all be warped onto the run's reference grid first."
        )

    result = np.zeros(next(iter(layers.values())).shape, dtype=np.float64)
    valid = np.ones(result.shape, dtype=bool)
    for name, array in layers.items():
        result += np.nan_to_num(array, nan=0.0) * weights[name]
        valid &= np.isfinite(array)

    result[~valid] = np.nan
    return result.astype(np.float32)


def contribution(
    layers: dict[str, np.ndarray], weights: dict[str, float]
) -> dict[str, float]:
    """Each criterion's mean share of the final index, as a fraction.

    This is the one per-criterion statistic a weighted overlay can honestly
    report. It is not feature importance and it is not a sensitivity analysis:
    it is `mean(risk_i) * weight_i` normalised, which is exactly "how much of
    the score, on average, came from this criterion" and is checkable by hand.
    """
    valid = None
    for array in layers.values():
        finite = np.isfinite(array)
        valid = finite if valid is None else (valid & finite)
    if valid is None or not valid.any():
        return {name: 0.0 for name in layers}

    means = {
        name: float(np.mean(array[valid])) * weights[name]
        for name, array in layers.items()
    }
    total = sum(means.values())
    if total == 0:
        return {name: 0.0 for name in layers}
    return {name: value / total for name, value in means.items()}
