"""Targets and the time-series features beside them, as pure numpy.

Nothing here touches GDAL, the network or a grid. Inputs are monthly stacks,
``(months, rows, cols)`` float32 with NaN for no data, and month index ``i``
always means "the month the features describe". That makes every rule in the
contract's target table testable on a 3x3 synthetic stack, which is where the
tests check it.

## The one rule that matters most: no circular labels

A label for feature month ``i`` reads month ``i + 1`` and nothing else from the
future. Every feature for month ``i`` reads months ``<= i`` only. The test suite
perturbs every month after ``i`` and asserts the features at ``i`` do not move;
if a feature ever peeked at the target month, a model would score a near-
perfect AUC by reading the answer, and nothing on screen would look wrong.

## Climatology, and where it is allowed to come from

"This pixel's own 20th percentile for that calendar month" and every anomaly
need a per-pixel, per-calendar-month baseline. It is computed from a set of
months the caller chooses, and the caller chooses the TRAINING months only when
it scores the held-out year: if the held-out months fed the baseline, the
thresholds that define the test labels would have been tuned on the test labels.
The final model, which predicts a month nobody has observed yet, uses the whole
history.

A calendar month needs at least `MIN_YEARS` observed years at a pixel before its
baseline exists. With fewer, the 20th percentile of two values is one of them,
and a label built on it is noise; the pixel-month is left NaN and drops out.
"""

from __future__ import annotations

import warnings
from dataclasses import dataclass
from datetime import date

import numpy as np

MIN_YEARS = 3
QUINTILE = 20.0
ANOMALY_DROP_SD = 0.5


@dataclass(frozen=True)
class Climatology:
    """Per calendar month (index 0 = January) and pixel: mean, spread, P20."""

    mean: np.ndarray
    std: np.ndarray
    p20: np.ndarray | None
    #: Floor under `std`; see catalog.SatelliteLayer.precision.
    precision: float


def month_numbers(months: list[date]) -> np.ndarray:
    return np.array([m.month for m in months], dtype=np.int64)


def add_months(when: date, count: int) -> date:
    total = when.year * 12 + (when.month - 1) + count
    return date(total // 12, total % 12 + 1, 1)


def month_range(first: date, last: date) -> list[date]:
    out = []
    current = date(first.year, first.month, 1)
    while current <= last:
        out.append(current)
        current = add_months(current, 1)
    return out


def climatology(
    stack: np.ndarray,
    months: list[date],
    use: np.ndarray,
    *,
    precision: float,
    percentile: bool = False,
) -> Climatology:
    """Baselines from the months where ``use`` is True."""
    calendar = month_numbers(months)
    _, rows, cols = stack.shape
    mean = np.full((12, rows, cols), np.nan, dtype=np.float32)
    std = np.full((12, rows, cols), np.nan, dtype=np.float32)
    p20 = np.full((12, rows, cols), np.nan, dtype=np.float32) if percentile else None

    with warnings.catch_warnings():
        # All-NaN slices are expected (a pixel never observed in some month) and
        # are exactly what the MIN_YEARS mask below turns into NaN.
        warnings.simplefilter("ignore", category=RuntimeWarning)
        for month in range(1, 13):
            chosen = stack[(calendar == month) & use]
            if chosen.shape[0] == 0:
                continue
            years = np.isfinite(chosen).sum(axis=0)
            enough = years >= MIN_YEARS
            mean[month - 1] = np.where(enough, np.nanmean(chosen, axis=0), np.nan)
            std[month - 1] = np.where(enough, np.nanstd(chosen, axis=0), np.nan)
            if p20 is not None:
                p20[month - 1] = np.where(
                    enough, np.nanpercentile(chosen, QUINTILE, axis=0), np.nan
                )
    return Climatology(mean=mean, std=std, p20=p20, precision=precision)


def anomaly(values: np.ndarray, month: int, clim: Climatology) -> np.ndarray:
    """Standard deviations from this pixel's own calendar-month mean."""
    spread = np.maximum(clim.std[month - 1], clim.precision)
    with np.errstate(invalid="ignore"):
        return ((values - clim.mean[month - 1]) / spread).astype(np.float32)


def trailing_mean(stack: np.ndarray, window: int) -> np.ndarray:
    """``out[i]`` = mean of months ``i-window+1 .. i``, needing at least two of
    them observed. Months before the window fills are NaN."""
    out = np.full(stack.shape, np.nan, dtype=np.float32)
    for i in range(window - 1, stack.shape[0]):
        block = stack[i - window + 1 : i + 1]
        count = np.isfinite(block).sum(axis=0)
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", category=RuntimeWarning)
            mean = np.nanmean(block, axis=0)
        out[i] = np.where(count >= 2, mean, np.nan)
    return out


# --------------------------------------------------------------------- labels

def label_low_quintile(
    ndvi: np.ndarray, months: list[date], i: int, clim: Climatology
) -> np.ndarray:
    """1 where NDVI at month ``i+1`` is below that pixel's P20 for its calendar
    month, 0 where it is not, NaN where either side is unknown."""
    target_month = months[i + 1].month
    nxt = ndvi[i + 1]
    threshold = clim.p20[target_month - 1]
    known = np.isfinite(nxt) & np.isfinite(threshold)
    out = np.full(nxt.shape, np.nan, dtype=np.float32)
    out[known] = (nxt[known] < threshold[known]).astype(np.float32)
    return out


def label_anomaly_drop(
    ndvi: np.ndarray, months: list[date], i: int, clim: Climatology
) -> np.ndarray:
    """1 where the NDVI anomaly falls by more than 0.5 SD from month ``i`` to
    ``i+1``; 0 where it does not; NaN where either anomaly is unknown."""
    now = anomaly(ndvi[i], months[i].month, clim)
    nxt = anomaly(ndvi[i + 1], months[i + 1].month, clim)
    known = np.isfinite(now) & np.isfinite(nxt)
    out = np.full(now.shape, np.nan, dtype=np.float32)
    out[known] = ((nxt[known] - now[known]) < -ANOMALY_DROP_SD).astype(np.float32)
    return out


LABEL_RULES = {
    "low-quintile": label_low_quintile,
    "anomaly-drop": label_anomaly_drop,
}


# ------------------------------------------------------------------- features

#: (id, label, unit, the catalog layer it is derived from). The order is the
#: column order of the sample table.
TEMPORAL_FEATURES: tuple[tuple[str, str, str, str], ...] = (
    ("ndvi", "NDVI", "NDVI", "ndvi"),
    ("ndvi_anomaly", "NDVI anomaly", "standard deviations", "ndvi"),
    ("ndvi_change_1m", "NDVI change from last month", "NDVI", "ndvi"),
    ("ndvi_anomaly_lag1", "NDVI anomaly last month", "standard deviations", "ndvi"),
    ("precipitation", "Precipitation", "mm/day", "precipitation"),
    ("precip_3m_anomaly", "Precipitation, 3-month anomaly", "standard deviations", "precipitation"),
    ("soil_moisture", "Root-zone soil moisture", "m3/m3", "soil_moisture"),
    ("soil_moisture_anomaly", "Soil moisture anomaly", "standard deviations", "soil_moisture"),
    ("lst", "Land surface temperature (day)", "degrees C", "lst"),
    ("lst_anomaly", "Land surface temperature anomaly", "standard deviations", "lst"),
)


@dataclass
class Baselines:
    """Every climatology one forecast needs, from one choice of months."""

    by_layer: dict[str, Climatology]
    precip_3m: Climatology | None


def baselines(
    stacks: dict[str, np.ndarray],
    precision: dict[str, float],
    months: list[date],
    use: np.ndarray,
    precip_3m: np.ndarray | None,
) -> Baselines:
    by_layer = {
        layer: climatology(
            stack, months, use, precision=precision[layer], percentile=(layer == "ndvi")
        )
        for layer, stack in stacks.items()
    }
    p3 = (
        climatology(precip_3m, months, use, precision=precision["precipitation"])
        if precip_3m is not None
        else None
    )
    return Baselines(by_layer=by_layer, precip_3m=p3)


def forecast_features(
    stacks: dict[str, np.ndarray],
    months: list[date],
    i: int,
    base: Baselines,
    precip_3m: np.ndarray | None,
    *,
    source_index: dict[str, int] | None = None,
) -> dict[str, np.ndarray]:
    """Every temporal feature for feature month ``i``, from months ``<= i``.

    ``source_index`` lets a layer be read from an earlier month than ``i``: at
    prediction time MERRA-2 may not yet have published month ``i``, and the
    newest month it has is used instead (the pipeline warns when it does).
    Anomalies are still taken against the calendar month actually read, so a
    July value is compared with Julys.
    """
    out: dict[str, np.ndarray] = {}
    index = dict(source_index or {})

    def at(layer: str) -> tuple[np.ndarray, int]:
        j = index.get(layer, i)
        if j > i:
            raise ValueError(f"{layer} would be read from month {j} > {i}")
        return stacks[layer][j], j

    if "ndvi" in stacks:
        ndvi, j = at("ndvi")
        clim = base.by_layer["ndvi"]
        out["ndvi"] = ndvi
        out["ndvi_anomaly"] = anomaly(ndvi, months[j].month, clim)
        if j >= 1:
            previous = stacks["ndvi"][j - 1]
            out["ndvi_change_1m"] = (ndvi - previous).astype(np.float32)
            out["ndvi_anomaly_lag1"] = anomaly(previous, months[j - 1].month, clim)
        else:
            out["ndvi_change_1m"] = np.full(ndvi.shape, np.nan, np.float32)
            out["ndvi_anomaly_lag1"] = np.full(ndvi.shape, np.nan, np.float32)

    if "precipitation" in stacks:
        value, j = at("precipitation")
        out["precipitation"] = value
        if precip_3m is not None and base.precip_3m is not None:
            out["precip_3m_anomaly"] = anomaly(precip_3m[j], months[j].month, base.precip_3m)

    for layer in ("soil_moisture", "lst"):
        if layer in stacks:
            value, j = at(layer)
            out[layer] = value
            out[f"{layer}_anomaly"] = anomaly(value, months[j].month, base.by_layer[layer])
    return out
