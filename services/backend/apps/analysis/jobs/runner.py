"""Executing a run, and reporting honestly while it happens.

A 30m overlay over a Kenyan county is minutes of raster work. That cannot be a
request: a synchronous POST would sit past every sensible proxy timeout and give
the browser a blank screen with no way to tell "still working" from "died". So a
run is created, executed on a worker, and polled.

**Why a thread pool and not Celery.** Celery is the right answer for real
concurrency and it is what this becomes. It is not here yet because it needs a
broker, and a broker is a second service to install, run and monitor for a
deployment that today is one analyst on one machine. The seam is this module: a
Celery task would call the same `execute` and the rest of the service would not
notice. What the thread pool costs is stated rather than hidden, in
`MAX_CONCURRENT_RUNS` below.

**Why state lives in the database and not in the pool.** A run that finished
must still be readable after a restart, and a run that was interrupted by one
must not poll forever as "running". The worker owns the computation; the row
owns the truth.
"""

from __future__ import annotations

import logging
import threading
import traceback
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from pathlib import Path
from typing import Callable

from django.conf import settings
from django.db import close_old_connections

from apps.analysis.jobs.stages import Stage, StageState, advance
from apps.analysis.models import Run

log = logging.getLogger(__name__)

#: One raster run at a time, deliberately.
#:
#: Each run holds whole criterion rasters in memory — a 8514x11266 float32 band
#: is 384MB, and a five-criterion overlay holds several at once. Two concurrent
#: runs on a machine with ordinary RAM do not go faster, they swap. Queueing is
#: the honest behaviour, and the queue is visible: a run sits in `queued` and
#: says so.
MAX_CONCURRENT_RUNS = 1

_executor: ThreadPoolExecutor | None = None
_executor_lock = threading.Lock()


def _pool() -> ThreadPoolExecutor:
    global _executor
    with _executor_lock:
        if _executor is None:
            _executor = ThreadPoolExecutor(
                max_workers=MAX_CONCURRENT_RUNS, thread_name_prefix="run"
            )
        return _executor


def now_iso() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds").replace("+00:00", "Z")


def workspace_for(run_id: str) -> Path:
    path = Path(settings.WORKSPACE_DIR) / run_id
    path.mkdir(parents=True, exist_ok=True)
    return path


def submit(run: Run) -> None:
    """Queue a run for execution. Returns immediately."""
    _pool().submit(_execute_guarded, run.run_id)


def _execute_guarded(run_id: str) -> None:
    """Run the pipeline, and make sure the row never lies about what happened.

    Every exception ends up on the row. A worker thread that dies with a
    traceback in a log and a row still reading `running` is the worst outcome
    here: the app polls forever and the analyst waits for something that stopped
    minutes ago.
    """
    # Threads get their own connections, and a pooled thread outlives a request.
    # Without this the second run on a worker uses a connection Django already
    # considers closed.
    close_old_connections()
    try:
        run = Run.objects.get(pk=run_id)
    except Run.DoesNotExist:
        log.error("run %s vanished before execution", run_id)
        return

    try:
        execute(run)
    except Exception as exc:  # noqa: BLE001 - the whole point is to catch all
        log.exception("run %s failed", run_id)
        _fail(run, stage_id=_current_stage_id(run), message=str(exc))
    finally:
        close_old_connections()


def _current_stage_id(run: Run) -> str:
    for stage in run.stages:
        if stage["state"] == str(StageState.RUNNING):
            return stage["id"]
    return "resolve"


def _fail(run: Run, *, stage_id: str, message: str) -> None:
    stages = advance(
        run.stage_objects(), stage_id, StageState.FAILED, at=now_iso(),
        detail=message[:300],
    )
    run.set_stages(stages)
    run.status = Run.Status.FAILED
    # Which stage failed is the useful half: it tells "GeoServer went away"
    # apart from "your geometry is invalid" without anybody reading a log.
    run.error = {"stage": stage_id, "message": message[:1000]}
    run.ended_at = datetime.now(UTC)
    run.save()


def execute(run: Run) -> None:
    """Walk the stage plan, doing each stage's work.

    The pipeline itself is imported lazily, inside the function. GDAL is a large
    native import and the web process should not pay for it just to answer a
    poll; only a worker actually executing a run needs it.
    """
    from apps.analysis.pipeline.overlay import run_weighted_overlay

    run.started_at = datetime.now(UTC)
    run.status = Run.Status.RUNNING
    run.save(update_fields=["started_at", "status"])

    def report(stage_id: str, state: StageState, detail: str | None = None) -> None:
        """Persist a stage transition immediately.

        Written on every transition rather than batched at the end, because the
        entire purpose of the stage list is that a poll mid-run can see it. A
        batched write would make the progress bar jump from 0 to 1.
        """
        run.set_stages(
            advance(run.stage_objects(), stage_id, state, at=now_iso(), detail=detail)
        )
        run.save(update_fields=["stages", "progress", "status"])

    result = run_weighted_overlay(
        config=run.config,
        workspace=workspace_for(run.run_id),
        report=report,
    )

    run.result = result
    run.ended_at = datetime.now(UTC)
    run.workspace = str(workspace_for(run.run_id))
    # Status and progress are derived from the stages, never set here, so they
    # cannot disagree with the list the app is reading.
    run.set_stages(run.stage_objects())
    run.save()


StageReporter = Callable[[str, StageState, str | None], None]
