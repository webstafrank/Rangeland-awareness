"""The analysis endpoints.

Everything here answers a question the browser must not answer for itself. The
class tables decide what a slope of 12 degrees means, the AHP check decides
whether a set of weights is coherent enough to use, and the pipeline decides the
numbers. Shipping any of that to the client would mean two implementations that
can disagree, and the failure mode of a disagreement is a map that looks right
and is wrong.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from django.http import HttpRequest, HttpResponseNotAllowed, JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_GET

from apps.analysis.domain import ahp, criteria
from apps.analysis.jobs.runner import submit
from apps.analysis.jobs.stages import plan_stages
from apps.analysis.models import Run, config_hash
from apps.analysis.validation import validate_run_config

log = logging.getLogger(__name__)


def _problem(message: str, status: int, **extra: Any) -> JsonResponse:
    return JsonResponse({"error": message, **extra}, status=status)


def _read_json(request: HttpRequest) -> tuple[dict[str, Any] | None, JsonResponse | None]:
    """Parse a JSON body, or return the response explaining why not.

    A tuple rather than an exception because every caller wants to return the
    problem verbatim, and a custom exception class plus a handler would be more
    machinery than two lines of unpacking.
    """
    if request.content_type and "json" not in request.content_type:
        return None, _problem(
            f'Expected application/json, got "{request.content_type}".', status=415
        )
    try:
        body = json.loads(request.body or b"{}")
    except json.JSONDecodeError as exc:
        return None, _problem(f"Body is not valid JSON: {exc}", status=400)
    if not isinstance(body, dict):
        return None, _problem("Body must be a JSON object.", status=400)
    return body, None


@require_GET
def topic_criteria(request: HttpRequest, topic: str) -> JsonResponse:
    """The criteria for a topic, their class tables, and what cannot run.

    **This service is authoritative**, not the app. `my-app/lib/criteria` is the
    type and the default; this endpoint overrides it. The tables decide the
    numbers, so a second copy in the browser that could drift is exactly the bug
    the shared artifact exists to prevent.
    """
    try:
        method = criteria.method_for(topic)
    except KeyError:
        return _problem(f'Unknown topic "{topic}".', status=404)

    if method.kind != "weighted-overlay":
        # A model topic is not an error and not a weighted overlay. Saying which
        # it is lets the app show the right screen rather than an empty form.
        return JsonResponse(
            {
                "topic": topic,
                "method": method.kind,
                "criteria": [],
                "defaultWeights": {},
                "unfilled": [],
                "detail": "This topic runs a model, not a weighted overlay.",
            }
        )

    unfilled = [c.id for c in method.criteria if not c.is_filled]
    return JsonResponse(
        {
            "topic": topic,
            "method": method.kind,
            "criteria": [_criterion_json(c) for c in method.criteria],
            "defaultWeights": method.default_weights or {},
            # Named rather than silently excluded: a run asking for one of these
            # is refused at creation with a reason, and the app can grey it out
            # before the analyst spends time on a configuration that cannot run.
            "unfilled": unfilled,
        }
    )


def _criterion_json(c: criteria.Criterion) -> dict[str, Any]:
    scale: dict[str, Any] = {"kind": str(c.scale.kind)}
    if c.scale.kind == criteria.ScaleKind.CONTINUOUS:
        scale["classes"] = [
            {"risk": k.risk, "label": k.label, "max": k.max} for k in c.scale.continuous
        ]
    elif c.scale.kind == criteria.ScaleKind.CATEGORICAL:
        scale["classes"] = [
            {"risk": k.risk, "label": k.label, "codes": list(k.codes)}
            for k in c.scale.categorical
        ]
        scale["unlisted"] = c.scale.unlisted
    else:
        scale["breaks"] = list(c.scale.breaks)
        scale["ascending"] = c.scale.ascending

    return {
        "id": c.id,
        "label": c.label,
        "unit": c.unit,
        "direction": c.direction,
        "calibration": str(c.calibration),
        "reference": c.reference,
        "filled": c.is_filled,
        "source": {
            "kind": str(c.source.kind),
            "hint": c.source.hint,
            "from": c.source.derived_from or c.source.distance_from,
            "how": c.source.how,
            "smoothSigmaPx": c.source.smooth_sigma_px,
        },
        "scale": scale,
    }


@csrf_exempt
def derive_weights(request: HttpRequest) -> JsonResponse:
    """AHP: pairwise comparisons in, weights and a consistency ratio out.

    Implemented here even though `my-app/lib/ahp` implements it too. The
    duplication is deliberate and fenced: the form must respond without a round
    trip, and this service must not accept weights it has not itself checked.
    Both are tested against `contracts/ahp-fixtures.json`, so they cannot
    disagree about a weight or a ratio.

    csrf_exempt because this API has no cookies and no sessions: there is no
    ambient authority for a forged request to ride on, so a CSRF token would be
    ceremony rather than protection. The day sessions arrive, this comes off.
    """
    if request.method != "POST":
        return HttpResponseNotAllowed(["POST"])

    body, problem = _read_json(request)
    if problem is not None:
        return problem
    assert body is not None

    matrix = body.get("matrix")
    if not isinstance(matrix, list):
        return _problem(
            "Invalid comparison matrix", status=400,
            fieldErrors={"matrix": ["A square matrix of numbers is required."]},
        )

    try:
        assessment = ahp.assess(matrix)
    except ahp.InvalidMatrix as exc:
        # Every problem at once, keyed by cell, so the form marks all of them
        # rather than revealing one per submit.
        return _problem(
            "Invalid comparison matrix",
            status=400,
            fieldErrors={"matrix": [p.message for p in exc.problems]},
            problems=[
                {"row": p.row, "column": p.column, "message": p.message}
                for p in exc.problems
            ],
        )

    return JsonResponse(
        {
            "weights": [round(w, 6) for w in assessment.weights],
            "lambdaMax": round(assessment.lambda_max, 6),
            "consistencyIndex": round(assessment.consistency_index, 6),
            "consistencyRatio": round(assessment.consistency_ratio, 6),
            "acceptable": assessment.acceptable,
            "maxAcceptableRatio": ahp.MAX_ACCEPTABLE_CR,
        }
    )


# ---------------------------------------------------------------------- runs


@csrf_exempt
def create_run(request: HttpRequest) -> JsonResponse:
    """Create a run, or return the one an identical configuration already made.

    202 for new work, 200 for a cache hit. The distinction is worth two status
    codes: a client resubmitting after a dropped connection wants to know it did
    not just start a second four-minute computation.
    """
    if request.method != "POST":
        return HttpResponseNotAllowed(["POST"])

    body, problem = _read_json(request)
    if problem is not None:
        return problem
    assert body is not None

    config, errors = validate_run_config(body)
    if errors:
        # Every problem at once, keyed by field. Revealing them one submit at a
        # time makes the analyst click, read, fix and click again, for checks
        # that are all independent and all cheap.
        return _problem(
            "Invalid run configuration", status=400, fieldErrors=dict(errors)
        )

    run_id = config_hash(config)
    existing = Run.objects.filter(pk=run_id).first()
    if existing is not None:
        return JsonResponse(
            {
                "runId": existing.run_id,
                "statusUrl": f"/api/v1/runs/{existing.run_id}",
                "status": existing.status,
                "cached": True,
                "stages": existing.as_status_json()["stages"],
            },
            status=200,
        )

    method = criteria.method_for(config["topic"])
    used = [c for c in method.criteria if c.id in config["weights"]]
    run = Run(
        run_id=run_id,
        topic=config["topic"],
        config=config,
        status=Run.Status.QUEUED,
    )
    run.set_stages(plan_stages(used, publish_layers=config["publishLayers"]))
    # Re-asserted after set_stages, which derives status from the stage list.
    # An all-pending plan derives as queued anyway; saying so here means a
    # reader does not have to know that to follow the code.
    run.status = Run.Status.QUEUED
    run.save()

    submit(run)

    return JsonResponse(
        {
            "runId": run.run_id,
            "statusUrl": f"/api/v1/runs/{run.run_id}",
            "status": run.status,
            "cached": False,
            "stages": run.as_status_json()["stages"],
        },
        status=202,
    )


@require_GET
def run_status(request: HttpRequest, run_id: str) -> JsonResponse:
    """Poll this. Cheap by construction: one row read, no computation."""
    run = Run.objects.filter(pk=run_id).first()
    if run is None:
        return _problem(f'No run "{run_id}".', status=404)

    response = JsonResponse(run.as_status_json())
    if run.status in (Run.Status.QUEUED, Run.Status.RUNNING):
        # Told, not guessed. A client polling as fast as it can manage is how a
        # long run becomes a denial of service against its own backend.
        response["Retry-After"] = "2"
    return response


@require_GET
def run_result(request: HttpRequest, run_id: str) -> JsonResponse:
    """The numbers, once the run has succeeded.

    409 rather than 404 while it is still running: the run exists, it simply has
    no result yet, and a 404 would send the client looking for a wrong id.
    """
    run = Run.objects.filter(pk=run_id).first()
    if run is None:
        return _problem(f'No run "{run_id}".', status=404)

    if run.status != Run.Status.SUCCEEDED:
        return _problem(
            f'Run "{run_id}" has not succeeded; it is {run.status}.',
            status=409,
            runStatus=run.status,
            runError=run.error,
            statusUrl=f"/api/v1/runs/{run_id}",
        )

    return JsonResponse(
        {
            "runId": run.run_id,
            "config": run.config,
            "generatedAt": run.ended_at.isoformat() if run.ended_at else None,
            **(run.result or {}),
        }
    )
