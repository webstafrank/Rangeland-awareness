"""Criteria, loaded from the shared artifact rather than written twice.

``contracts/criteria.json`` is generated from ``my-app/lib/criteria`` and read
here. There is exactly one authored copy of every class table, in TypeScript,
and a test on that side fails if the artifact goes stale.

The alternative was a second hand-written copy of every table in Python. The
whole point of the criteria work is that a slope table which disagrees with
itself maps landslide susceptibility upside down while looking entirely
plausible, so a second copy is precisely the thing not to have.

Reading a generated file at import time is a deliberate trade: the service
cannot start without the artifact, which is correct, because it cannot compute
anything meaningful without it either.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from enum import StrEnum
from functools import lru_cache
from pathlib import Path

def _find_artifact() -> Path:
    """Locate ``contracts/criteria.json`` by walking up from this file.

    This used to be `parents[4]`, a fixed hop count from
    ``services/analysis/app/domain/``. Moving the module into the Django service
    made that path point at ``services/`` instead of the repo root, and the
    failure mode of a wrong hop count is a `FileNotFoundError` at import time
    that names a path nobody recognises.

    Walking up for the directory is immune to the layout: the module can move
    anywhere under the repo and still find the one artifact. ``CONTRACTS_DIR``
    overrides it for a deployment that ships the contracts elsewhere.
    """
    override = os.environ.get("CONTRACTS_DIR")
    if override:
        return Path(override) / "criteria.json"

    here = Path(__file__).resolve()
    for parent in here.parents:
        candidate = parent / "contracts" / "criteria.json"
        if candidate.is_file():
            return candidate
    # Nothing found: report the search rather than a single wrong guess, since
    # the usual cause is running from a checkout where the artifact was never
    # generated (`npx vite-node ... scripts/export-criteria.ts`).
    raise FileNotFoundError(
        "contracts/criteria.json not found in any parent of "
        f"{here}. Generate it from my-app, or set CONTRACTS_DIR."
    )


ARTIFACT = _find_artifact()


class Calibration(StrEnum):
    ESTABLISHED = "established"
    REGIONAL = "regional"
    REQUIRED = "required"


class CriterionSourceKind(StrEnum):
    LAYER = "layer"
    DERIVED = "derived"
    DISTANCE = "distance"


class ScaleKind(StrEnum):
    CONTINUOUS = "continuous"
    CATEGORICAL = "categorical"
    PERCENTILE = "percentile"


@dataclass(frozen=True)
class CriterionSource:
    kind: CriterionSourceKind
    hint: str | None = None
    derived_from: str | None = None
    how: str | None = None
    distance_from: str | None = None
    smooth_sigma_px: int | None = None


@dataclass(frozen=True)
class ContinuousClass:
    risk: int
    label: str
    #: Exclusive upper bound. ``None`` is open-ended and must be the last band.
    max: float | None


@dataclass(frozen=True)
class CategoricalClass:
    risk: int
    label: str
    codes: tuple[int, ...]


@dataclass(frozen=True)
class Scale:
    kind: ScaleKind
    continuous: tuple[ContinuousClass, ...] = ()
    categorical: tuple[CategoricalClass, ...] = ()
    #: Categorical only. ``None`` means an unlisted code becomes nodata.
    unlisted: int | None = None
    #: Percentile only.
    breaks: tuple[float, ...] = ()
    ascending: bool = True


@dataclass(frozen=True)
class Criterion:
    id: str
    label: str
    unit: str
    source: CriterionSource
    scale: Scale
    calibration: Calibration
    direction: str
    reference: str

    @property
    def is_filled(self) -> bool:
        """False when the table cannot be used as shipped.

        Lithology is the case: its codes belong to whatever geology layer the
        GeoServer publishes, so it ships empty and every pixel is nodata until
        someone fills it. A run naming an unfilled criterion is refused at
        creation rather than producing an empty map.
        """
        if self.scale.kind == ScaleKind.CATEGORICAL:
            return len(self.scale.categorical) > 0
        if self.scale.kind == ScaleKind.CONTINUOUS:
            return len(self.scale.continuous) > 0
        return True


@dataclass(frozen=True)
class TopicMethod:
    kind: str
    criteria: tuple[Criterion, ...] = ()
    default_weights: dict[str, float] | None = None


def _parse_source(raw: dict) -> CriterionSource:
    kind = CriterionSourceKind(raw["kind"])
    return CriterionSource(
        kind=kind,
        hint=raw.get("hint"),
        derived_from=raw.get("from") if kind == CriterionSourceKind.DERIVED else None,
        how=raw.get("how"),
        distance_from=raw.get("from") if kind == CriterionSourceKind.DISTANCE else None,
        smooth_sigma_px=raw.get("smoothSigmaPx"),
    )


def _parse_scale(raw: dict) -> Scale:
    kind = ScaleKind(raw["kind"])
    if kind == ScaleKind.CONTINUOUS:
        return Scale(
            kind=kind,
            continuous=tuple(
                ContinuousClass(risk=c["risk"], label=c["label"], max=c["max"])
                for c in raw["classes"]
            ),
        )
    if kind == ScaleKind.CATEGORICAL:
        unlisted = raw.get("unlisted")
        return Scale(
            kind=kind,
            categorical=tuple(
                CategoricalClass(
                    risk=c["risk"], label=c["label"], codes=tuple(c["codes"])
                )
                for c in raw["classes"]
            ),
            # "nodata" in the artifact becomes None here: an unlisted code is a
            # coding mismatch between the layer and the table, not a low-risk
            # pixel, and painting it 1 would quietly clear the map.
            unlisted=None if unlisted == "nodata" else unlisted,
        )
    return Scale(
        kind=kind,
        breaks=tuple(raw["breaks"]),
        ascending=raw.get("ascending", True),
    )


def _parse_criterion(raw: dict) -> Criterion:
    return Criterion(
        id=raw["id"],
        label=raw["label"],
        unit=raw["unit"],
        source=_parse_source(raw["source"]),
        scale=_parse_scale(raw["scale"]),
        calibration=Calibration(raw["calibration"]),
        direction=raw["direction"],
        reference=raw["reference"],
    )


@lru_cache(maxsize=1)
def _load() -> dict[str, TopicMethod]:
    if not ARTIFACT.exists():
        raise RuntimeError(
            f"criteria artifact missing at {ARTIFACT}. Generate it with: "
            "cd my-app && npx vite-node -c vitest.config.mts scripts/export-criteria.ts"
        )
    with ARTIFACT.open(encoding="utf-8") as handle:
        data = json.load(handle)

    methods: dict[str, TopicMethod] = {}
    for topic, entry in data["topics"].items():
        methods[topic] = TopicMethod(
            kind=entry["method"],
            criteria=tuple(_parse_criterion(c) for c in entry["criteria"]),
            default_weights=entry.get("defaultWeights"),
        )
    return methods


def method_for(topic: str) -> TopicMethod:
    """A topic absent from the artifact runs a model, which is not an error.

    Three topics are on the ML track and get their methods when a backend
    exists; until then they are simply not overlay topics.
    """
    return _load().get(topic, TopicMethod(kind="model"))


def criteria_for(topic: str) -> tuple[Criterion, ...]:
    return method_for(topic).criteria


def is_overlay_topic(topic: str) -> bool:
    return method_for(topic).kind == "weighted-overlay"


def unfilled_criteria(topic: str) -> tuple[Criterion, ...]:
    """Criteria that cannot run as configured.

    The weighted sum drops any pixel where a criterion is missing, so an
    unfilled table produces an empty map rather than a wrong one. Better to
    refuse the run and say which criterion than to hand back a blank raster.
    """
    return tuple(c for c in criteria_for(topic) if not c.is_filled)


def classify_continuous(classes: tuple[ContinuousClass, ...], value: float) -> int | None:
    """Risk for a raw value. ``None`` for a value that is not finite.

    NaN is rejected rather than clamped, the same rule the indicator bands
    follow: a missing pixel painted with a real risk is the failure this cannot
    afford.
    """
    if value != value or value in (float("inf"), float("-inf")):
        return None
    for band in classes:
        if band.max is None or value <= band.max:
            return band.risk
    return classes[-1].risk if classes else None


def classify_categorical(scale: Scale, code: int) -> int | None:
    for band in scale.categorical:
        if code in band.codes:
            return band.risk
    return scale.unlisted
