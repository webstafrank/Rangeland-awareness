"""Run persistence.

A run is minutes of raster work, so it cannot be a request. It is created,
executed on a worker, and polled — which means its state has to outlive the
request that started it and survive the process restarting. That is the whole
reason there is a database here at all.

The id is a hash of the normalised configuration rather than a UUID, and that
single decision is what makes re-posting an identical configuration return the
existing run instead of recomputing it. A 30m overlay over a Kenyan county is
expensive enough that an accidental double submit must not cost twice.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any

from django.db import models

from apps.analysis.jobs.stages import Stage, StageState, progress_of, status_of


def config_hash(config: dict[str, Any]) -> str:
    """A stable id for a run configuration.

    `sort_keys` and `separators` matter: the same configuration must hash the
    same whatever order the client serialised it in and whatever whitespace it
    used, or the cache never hits and every resubmit recomputes.

    Floats are a real hazard here — 0.35 and 0.3500000000000001 are different
    strings and would be different runs — so weights are rounded before
    hashing. Six places is far finer than any weight a person sets and far
    coarser than float noise.
    """
    normalised = json.loads(json.dumps(config, sort_keys=True))
    weights = normalised.get("weights")
    if isinstance(weights, dict):
        normalised["weights"] = {
            key: round(float(value), 6) for key, value in sorted(weights.items())
        }
    payload = json.dumps(normalised, sort_keys=True, separators=(",", ":"))
    return "r_" + hashlib.sha256(payload.encode("utf-8")).hexdigest()[:12]


class Run(models.Model):
    """One analysis run and everything known about it."""

    class Status(models.TextChoices):
        QUEUED = "queued"
        RUNNING = "running"
        SUCCEEDED = "succeeded"
        FAILED = "failed"
        CANCELLED = "cancelled"

    run_id = models.CharField(max_length=32, primary_key=True)
    topic = models.CharField(max_length=64, db_index=True)

    #: The validated configuration, exactly as the run was created with. Stored
    #: whole rather than as columns because it is a contract payload: it is
    #: echoed back in the result so a saved result can be read years later
    #: without this schema being available to interpret it.
    config = models.JSONField()

    status = models.CharField(
        max_length=16, choices=Status.choices, default=Status.QUEUED, db_index=True
    )
    #: The stage list, serialised. Its shape is fixed at creation so the app
    #: never sees the list reflow mid-run.
    stages = models.JSONField(default=list)
    progress = models.FloatField(default=0.0)

    result = models.JSONField(null=True, blank=True)
    #: `{"stage": "fetch", "message": "..."}`. Which stage failed is the useful
    #: half: it distinguishes "GeoServer went away" from "your geometry is
    #: invalid" without reading a log.
    error = models.JSONField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    started_at = models.DateTimeField(null=True, blank=True)
    ended_at = models.DateTimeField(null=True, blank=True)

    #: Where this run's rasters were written. Not in the database as bytes:
    #: a result is hundreds of megabytes of GeoTIFF.
    workspace = models.CharField(max_length=512, blank=True, default="")

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.run_id} ({self.topic}, {self.status})"

    # ------------------------------------------------------------------ stages

    def stage_objects(self) -> list[Stage]:
        return [
            Stage(
                id=s["id"],
                label=s["label"],
                weight=s["weight"],
                state=StageState(s["state"]),
                started_at=s.get("startedAt"),
                ended_at=s.get("endedAt"),
                detail=s.get("detail"),
            )
            for s in self.stages
        ]

    def set_stages(self, stages: list[Stage]) -> None:
        """Write the stage list back, and derive status and progress from it.

        Derived rather than set separately, so the three can never disagree.
        A run whose stages are all done but whose status still says running is
        the kind of inconsistency that makes a poller hang forever.
        """
        self.stages = [
            {
                "id": s.id,
                "label": s.label,
                "weight": s.weight,
                "state": str(s.state),
                "startedAt": s.started_at,
                "endedAt": s.ended_at,
                "detail": s.detail,
            }
            for s in stages
        ]
        self.progress = progress_of(stages)
        derived = status_of(stages)
        # A cancelled run stays cancelled: the stages cannot know that a human
        # asked it to stop, so the stored status wins over the derived one.
        if self.status != self.Status.CANCELLED:
            self.status = str(derived)

    # ------------------------------------------------------------------- json

    def as_status_json(self) -> dict[str, Any]:
        """The poll response. Cheap: no computation, no file access."""
        return {
            "runId": self.run_id,
            "topic": self.topic,
            "status": self.status,
            "stages": [
                {
                    "id": s["id"],
                    "label": s["label"],
                    "state": s["state"],
                    "startedAt": s.get("startedAt"),
                    "endedAt": s.get("endedAt"),
                    "detail": s.get("detail"),
                }
                for s in self.stages
            ],
            "progress": round(self.progress, 4),
            "startedAt": self.started_at.isoformat() if self.started_at else None,
            "endedAt": self.ended_at.isoformat() if self.ended_at else None,
            "error": self.error,
        }
