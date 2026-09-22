"""The stages a run moves through, and the progress derived from them.

These are the pipeline's real steps, in the order the overlay actually performs
them. That matters: the app's processing screen currently animates a fabricated
script with invented durations, and against this service it reports what has
genuinely finished. "Loading..." teaches a user nothing; "Computing distance to
drainage" teaches them what an analysis of this kind involves, which is part of
what the product is for.

Two rules the API contract fixes and this module enforces:

Progress is monotonic and derived from completed stage WEIGHTS, never from a
clock. A bar that goes backwards is worse than no bar, and a clock-driven one
does exactly that whenever a stage runs slower than its estimate.

Stages that do not apply are reported ``skipped``, never dropped. A list that
changes length mid-run makes the UI reflow under the reader.
"""

from __future__ import annotations

from dataclasses import dataclass, replace
from enum import StrEnum

from apps.analysis.domain.criteria import Criterion, CriterionSourceKind


class StageState(StrEnum):
    PENDING = "pending"
    RUNNING = "running"
    DONE = "done"
    SKIPPED = "skipped"
    FAILED = "failed"


class RunStatus(StrEnum):
    QUEUED = "queued"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    CANCELLED = "cancelled"


@dataclass(frozen=True)
class Stage:
    id: str
    label: str
    #: Share of the total run. The weights across a plan sum to 1.
    weight: float
    state: StageState = StageState.PENDING
    started_at: str | None = None
    ended_at: str | None = None
    detail: str | None = None


@dataclass(frozen=True)
class StageTemplate:
    id: str
    label: str
    weight: float


#: The pipeline, in execution order.
#:
#: Weights are rough shares of wall-clock measured on the notebook's own run
#: over Tana River: fetching and reprojecting dominate, the arithmetic itself is
#: fast, and publishing is a single upload. They are estimates used only to
#: shape the progress bar, never to decide when a stage ends.
STAGE_SCRIPT: tuple[StageTemplate, ...] = (
    StageTemplate("resolve", "Resolving area geometry", 0.04),
    StageTemplate("fetch", "Fetching criterion layers", 0.24),
    StageTemplate("reproject", "Reprojecting and clipping to the area", 0.18),
    StageTemplate("derive", "Deriving slope and aspect", 0.10),
    StageTemplate("distance", "Computing distance to drainage", 0.12),
    StageTemplate("reclassify", "Reclassifying each criterion to risk", 0.08),
    StageTemplate("overlay", "Weighted overlay", 0.05),
    StageTemplate("classify", "Jenks natural breaks", 0.07),
    StageTemplate("statistics", "Per-class and per-area statistics", 0.06),
    StageTemplate("publish", "Publishing layers to GeoServer", 0.06),
)


def plan_stages(
    criteria: list[Criterion], *, publish_layers: bool = True
) -> list[Stage]:
    """The stage list for a run, with the inapplicable ones pre-marked skipped.

    Skipping is decided up front rather than discovered mid-run so the app
    receives one stable list at creation time and never reflows it. A topic
    whose criteria include no derived layer does no ``derive`` work; one with no
    distance criterion does no ``distance`` work; ``publish`` is skipped when
    the caller only wants numbers.
    """
    kinds = {criterion.source.kind for criterion in criteria}
    inapplicable: dict[str, bool] = {
        "derive": CriterionSourceKind.DERIVED not in kinds,
        "distance": CriterionSourceKind.DISTANCE not in kinds,
        "publish": not publish_layers,
    }

    return [
        Stage(
            id=template.id,
            label=template.label,
            weight=template.weight,
            state=(
                StageState.SKIPPED
                if inapplicable.get(template.id, False)
                else StageState.PENDING
            ),
        )
        for template in STAGE_SCRIPT
    ]


def progress_of(stages: list[Stage]) -> float:
    """Fraction complete, from finished stage weights.

    Skipped counts as finished: its work is genuinely not going to happen, so
    leaving it out of the numerator would cap the bar below 1 for the whole run
    and it would never reach the end.

    A running stage contributes half its weight. Not a guess dressed up as
    precision, just an admission that a stage in flight is somewhere between
    started and done, and it stops the bar sitting still through the longest
    step.
    """
    total = sum(stage.weight for stage in stages)
    if total <= 0:
        return 0.0

    done = 0.0
    for stage in stages:
        if stage.state in (StageState.DONE, StageState.SKIPPED):
            done += stage.weight
        elif stage.state == StageState.RUNNING:
            done += stage.weight * 0.5

    # Clamped because the weights are estimates and a plan whose weights do not
    # quite sum to 1 must not report 1.02.
    return max(0.0, min(1.0, done / total))


def advance(stages: list[Stage], stage_id: str, state: StageState, *, at: str,
            detail: str | None = None) -> list[Stage]:
    """Return a new stage list with one stage moved to a new state.

    Immutable so a caller cannot mutate a list another thread is serialising
    mid-poll and emit a half-updated status.
    """
    updated: list[Stage] = []
    for stage in stages:
        if stage.id != stage_id:
            updated.append(stage)
            continue
        if state == StageState.RUNNING:
            updated.append(replace(stage, state=state, started_at=at, detail=detail))
        else:
            updated.append(replace(stage, state=state, ended_at=at, detail=detail))
    return updated


def status_of(stages: list[Stage]) -> RunStatus:
    """The run's status implied by its stages."""
    if any(stage.state == StageState.FAILED for stage in stages):
        return RunStatus.FAILED
    if all(
        stage.state in (StageState.DONE, StageState.SKIPPED) for stage in stages
    ):
        return RunStatus.SUCCEEDED
    if any(
        stage.state in (StageState.RUNNING, StageState.DONE) for stage in stages
    ):
        return RunStatus.RUNNING
    return RunStatus.QUEUED
