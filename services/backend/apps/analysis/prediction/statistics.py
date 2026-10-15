"""The numbers in a prediction result, each one a rule from the contract.

Every function takes the probability raster and a validity mask and nothing
else, so the rules are testable on a hand-built 4x4 array:

- classes are FIXED probability bands of width 0.2, not Jenks. A probability
  already means something on its own scale, fixed bands keep that meaning, and
  two runs stay comparable band for band.
- shares are over valid pixels only, and sum to 1 within 1e-6. They are not
  rounded for that reason: twenty shares each rounded to six places can miss 1
  by 1e-5.
- ``areaKm2 = pixels * resolution^2 / 1e6``.
- ``shareAtRisk`` is the share of valid pixels with probability >= 0.5.

Band membership is ``[low, high)`` for the first four bands and ``[0.8, 1.0]``
for the last, so a probability of exactly 1.0 is Very high rather than lost,
and exactly 0.2 is Low, matching how the histogram's own edges work.
"""

from __future__ import annotations

from typing import Any

import numpy as np

from apps.analysis.prediction.recipes import AT_RISK_THRESHOLD

CLASS_LABELS = ("Very low", "Low", "Moderate", "High", "Very high")
CLASS_EDGES = (0.0, 0.2, 0.4, 0.6, 0.8, 1.0)
HISTOGRAM_BINS = 20
#: Written into classes.tif outside the valid pixels. 0 is not a class.
CLASS_NODATA = 0


def classify(probability: np.ndarray) -> np.ndarray:
    """1..5 by fixed band; `CLASS_NODATA` where the probability is not finite."""
    out = np.zeros(probability.shape, dtype=np.uint8)
    finite = np.isfinite(probability)
    clipped = np.clip(np.where(finite, probability, 0.0), 0.0, 1.0)
    # floor(p / 0.2) + 1, with 1.0 folded into the top band. Computed on the
    # edges rather than by division so 0.6000000001 and 0.6 cannot land apart
    # through float error.
    bands = np.searchsorted(np.asarray(CLASS_EDGES[1:-1]), clipped, side="right") + 1
    out[finite] = bands[finite].astype(np.uint8)
    return out


def km2(pixels: int, resolution: float) -> float:
    return pixels * resolution * resolution / 1e6


def summary(probability: np.ndarray, valid: np.ndarray, resolution: float) -> dict[str, Any]:
    values = probability[valid].astype(np.float64)
    count = values.size
    at_risk = int((values >= AT_RISK_THRESHOLD).sum())
    return {
        "meanProbability": round(float(values.mean()), 6) if count else None,
        "medianProbability": round(float(np.median(values)), 6) if count else None,
        "p10": round(float(np.percentile(values, 10)), 6) if count else None,
        "p90": round(float(np.percentile(values, 90)), 6) if count else None,
        "atRiskThreshold": AT_RISK_THRESHOLD,
        "areaAtRiskKm2": round(km2(at_risk, resolution), 4),
        "shareAtRisk": at_risk / count if count else 0.0,
    }


def histogram(probability: np.ndarray, valid: np.ndarray) -> dict[str, Any]:
    edges = np.linspace(0.0, 1.0, HISTOGRAM_BINS + 1)
    values = np.clip(probability[valid].astype(np.float64), 0.0, 1.0)
    # np.histogram's last bin is closed, so 1.0 is counted rather than dropped.
    counts, _ = np.histogram(values, bins=edges)
    total = int(counts.sum())
    return {
        "edges": [round(float(e), 4) for e in edges],
        "counts": [int(c) for c in counts],
        "shares": [float(c) / total if total else 0.0 for c in counts],
    }


def classes(probability: np.ndarray, valid: np.ndarray, resolution: float) -> list[dict[str, Any]]:
    banded = classify(probability)
    selected = banded[valid]
    total = int(selected.size)
    out = []
    for value in range(1, 6):
        count = int((selected == value).sum())
        out.append(
            {
                "class": value,
                "label": CLASS_LABELS[value - 1],
                "range": [CLASS_EDGES[value - 1], CLASS_EDGES[value]],
                "pixels": count,
                "areaKm2": round(km2(count, resolution), 4),
                "share": count / total if total else 0.0,
            }
        )
    return out


def area_rows(
    probability: np.ndarray,
    valid: np.ndarray,
    area_masks: list[np.ndarray],
    names: list[str],
    resolution: float,
) -> list[dict[str, Any]]:
    """One row per config area, in config order.

    ``areaKm2`` is the area's own footprint on the grid (every pixel inside its
    polygon), and ``validPixels`` how many of those carry a probability; the
    difference is what a mask (rangeland only, cropland only) or missing data
    took out, and showing both is what lets a reader see that. Areas may
    overlap; each row is computed on its own polygon, so an overlap is counted
    in both rows and once in the run-wide numbers.
    """
    banded = classify(probability)
    rows = []
    for index, (mask, name) in enumerate(zip(area_masks, names)):
        inside = mask.astype(bool)
        usable = inside & valid
        count = int(usable.sum())
        values = probability[usable].astype(np.float64)
        selected = banded[usable]
        rows.append(
            {
                "index": index,
                "name": name,
                "areaKm2": round(km2(int(inside.sum()), resolution), 4),
                "validPixels": count,
                "meanProbability": round(float(values.mean()), 6) if count else None,
                "shareAtRisk": float((values >= AT_RISK_THRESHOLD).sum()) / count if count else None,
                "classShares": [
                    float((selected == value).sum()) / count if count else 0.0
                    for value in range(1, 6)
                ],
            }
        )
    return rows


def area_names(areas: list[dict[str, Any]]) -> list[str]:
    """``properties.name`` when the area has one, else "Area 1", "Area 2"."""
    names = []
    for index, area in enumerate(areas):
        name = None
        if isinstance(area, dict) and area.get("type") == "Feature":
            properties = area.get("properties") or {}
            candidate = properties.get("name") if isinstance(properties, dict) else None
            if isinstance(candidate, str) and candidate.strip():
                name = candidate.strip()
        names.append(name or f"Area {index + 1}")
    return names
