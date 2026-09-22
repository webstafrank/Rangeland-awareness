"use client";

/**
 * Creating the run, which is the one part of this flow that cannot happen on
 * the server.
 *
 * The configuration travels in the URL, but the areas do not: one drawn polygon
 * is kilobytes of coordinates, so they live in sessionStorage keyed by the
 * request id (see services/handoff/areas.ts). sessionStorage exists only in the
 * browser, so the POST that carries those areas to the service has to be made
 * from here rather than from the route above.
 *
 * What this component is NOT is the running screen. It does one thing, once,
 * and then hands over: read the areas, re-validate them, plan the run, POST it,
 * put the service's run id in the URL, and render RunningScreen with the stage
 * plan the POST answered with. Every refusal along the way is its own screen
 * with its own sentence, because "could not start the run" covers six different
 * problems with six different things to do about them.
 *
 * Why the URL is rewritten the moment the run id is known: without it, a reload
 * one second later would re-read sessionStorage and re-POST. That is survivable
 * (the service answers the identical configuration with a cache hit rather than
 * a second computation) but it is survivable by accident. With `?run=` in the
 * URL, a reload resumes watching the run that exists, which is rubric R7, and a
 * link copied mid-run is a link to the run rather than to a second attempt at
 * it.
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import RunningScreen from "@/components/run/RunningScreen";
import RunProblem from "@/components/run/RunProblem";
import { buildRequest } from "@/services/analysis/request";
import { requestId } from "@/services/analysis/request-id";
import { stepHref } from "@/services/analysis/steps";
import { HANDOFF_MESSAGE, readAreas } from "@/services/handoff/areas";
import { planRun } from "@/services/run-flow/plan";
import { receiptHref, resultHref, runningHref } from "@/services/run-flow/links";
import { createBackendClient, failureMessage } from "@/services/backend-api";
import type {
  BackendFailure,
  RunStatus,
  Stage,
  TopicCriteria,
} from "@/services/backend-api";
import type { PlanNote } from "@/services/run-flow/plan";
import type { Topic } from "@/services/analysis/topics";
import type { UrlSelection } from "@/services/analysis/url-state";

export interface StartRunProps {
  topic: Topic;
  initial: UrlSelection;
  /** The `?req=` id. The key the areas were filed under. */
  request: string;
  /**
   * The criteria, read on the server so this component starts with everything
   * it needs except the areas. Null when the service could not be reached,
   * which is a different screen from a service that answered and refused.
   */
  criteria: TopicCriteria | null;
  /** Why the criteria are null, when they are. */
  criteriaFailure: BackendFailure | null;
  /** The wizard query (`?type=..&model=..`), threaded through every link. */
  query: string;
}

/** What the starter is doing. Each state is a screen. */
type Phase =
  | { kind: "starting" }
  | {
      kind: "started";
      runId: string;
      status: RunStatus;
      stages: readonly Stage[];
      notes: PlanNote[];
    }
  | { kind: "refused"; title: string; message: string; showReceipt: boolean };

/**
 * Everything between "the analyst pressed Run" and "there is a run to watch",
 * as one async function of its inputs.
 *
 * Outside the component on purpose, and this is not tidiness. React's
 * set-state-in-effect rule is right about the shape it wants: an effect talks to
 * an external system and stores what comes back in the system's own callback,
 * rather than computing state in the effect body. Hoisting the decision here
 * makes that shape literal. It also makes every refusal reachable without
 * rendering anything, which is why the seven of them can be reasoned about at
 * all.
 *
 * Returns the phase to show. Never throws: the client it calls does not either.
 */
async function decide(input: {
  topicSlug: string;
  initial: UrlSelection;
  request: string;
  criteria: TopicCriteria | null;
  criteriaFailure: BackendFailure | null;
}): Promise<Phase> {
  const { topicSlug, initial, request, criteria, criteriaFailure } = input;

  if (criteria === null) {
    return {
      kind: "refused" as const,
      title: "The analysis service is not answering",
      message:
        (criteriaFailure
          ? failureMessage(criteriaFailure)
          : "No answer from the service.") +
        " Nothing has been submitted. Try again when the service is back, or " +
        "go back to review and take the request as a file.",
      showReceipt: true,
    };
  }

  // The areas, from the session. Absent is the ordinary case for a link
  // opened in a new tab, not an error in the app.
  const handoff = readAreas(request);
  if (!handoff.ok) {
    return {
      kind: "refused" as const,
      title: "The areas for this run are not in this browser session",
      message: `${HANDOFF_MESSAGE[handoff.reason]} Select the areas again to run it.`,
      showReceipt: false,
    };
  }

  // Re-validated rather than trusted. The areas came from storage a browser
  // extension can write to, and the type and model came from an editable
  // query string.
  const validation = buildRequest(topicSlug, {
    analysisType: initial.analysisType ?? "single",
    modelId: initial.modelId ?? "random-forest",
    areas: handoff.areas,
  });

  if (!validation.ok) {
    return {
      kind: "refused" as const,
      title: "This request is not complete",
      message: validation.problems.map((p) => p.message).join(" "),
      showReceipt: false,
    };
  }

  /*
   * The same check the results page makes, for the same reason. `readAreas`
   * proves the stored areas were filed under the id in `?req=`; it cannot see
   * the rest of the query. Editing `model=` in the address bar leaves the id
   * untouched, so without this the run would be started for a configuration
   * the areas were never chosen for, and it would look entirely correct.
   */
  if (requestId(validation.request) !== request) {
    return {
      kind: "refused" as const,
      title: "This link does not match the areas in this session",
      message:
        "The link describes a different configuration than the areas held in " +
        "this session, so the two cannot be paired. Go back to review and run it again.",
      showReceipt: false,
    };
  }

  const plan = planRun(validation.request, criteria);
  if (!plan.ok) {
    return {
      kind: "refused" as const,
      title:
        plan.reason === "model-topic"
          ? "This topic has no method behind it yet"
          : "This run cannot be started",
      message: plan.message,
      // A model topic has a real alternative to offer: the validated request.
      showReceipt: plan.reason === "model-topic",
    };
  }

  const created = await createBackendClient().createRun(plan.body);

  if (!created.ok) {
    const failure = created.failure;
    return {
      kind: "refused" as const,
      title:
        failure.kind === "http"
          ? "The service refused this run"
          : "The analysis service is not answering",
      message: [
        failureMessage(failure),
        // Field errors are the useful half of a 400: they name which part of
        // the configuration the service objected to.
        failure.kind === "http" && failure.error?.fieldErrors
          ? Object.entries(failure.error.fieldErrors)
              .map(([field, messages]) => `${field}: ${messages.join(" ")}`)
              .join(" ")
          : "",
      ]
        .filter(Boolean)
        .join(" "),
      showReceipt: failure.kind !== "http",
    };
  }

  const run = created.data;

  return {
    kind: "started",
    runId: run.runId,
    status: run.status,
    stages: run.stages,
    notes: plan.notes,
  };
}

export default function StartRun({
  topic,
  initial,
  request,
  criteria,
  criteriaFailure,
  query,
}: StartRunProps) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ kind: "starting" });

  /**
   * React mounts effects twice in development. A POST is not idempotent from
   * the browser's point of view even when the service treats it as such, so the
   * second call is stopped here rather than relied on to be harmless. It also
   * guards the real case: the re-render caused by the router replacing the URL
   * immediately after a successful create.
   */
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    let alive = true;

    // setState in the promise's callback, not in the effect body: the effect
    // starts the external work and stores what comes back when it comes back,
    // which is the shape react-hooks/set-state-in-effect exists to enforce.
    void decide({
      topicSlug: topic.slug,
      initial,
      request,
      criteria,
      criteriaFailure,
    }).then((next) => {
      if (!alive) return;
      setPhase(next);

      if (next.kind === "started") {
        // `replace`, not `push`: Back should return to the review step the
        // analyst came from, not to a URL that would start the run over.
        router.replace(runningHref(topic.slug, query, { request, runId: next.runId }));
      }
    });

    return () => {
      alive = false;
    };
  }, [criteria, criteriaFailure, initial, query, request, router, topic.slug]);

  if (phase.kind === "refused") {
    return (
      <RunProblem
        topic={topic}
        title={phase.title}
        message={phase.message}
        query={query}
        receiptHref={
          phase.showReceipt ? receiptHref(topic.slug, query, request) : null
        }
      />
    );
  }

  if (phase.kind === "starting") {
    return (
      <div
        className="mx-auto w-full max-w-band px-gutter py-16 lg:px-gutter-lg"
        role="status"
        aria-live="polite"
      >
        <p className="text-sm text-ink-muted">Submitting the run...</p>
      </div>
    );
  }

  return (
    <>
      {/*
        Above the screen rather than inside it. The notes are about what was
        done to the request on the way out, which is this component's business;
        RunningScreen's business is the run itself, and giving it a prop for
        this would put a second subject in its contract.
      */}
      <PlanNotes notes={phase.notes} />
      <RunningScreen
        topic={topic}
        runId={phase.runId}
        initialStatus={phase.status}
        initialStages={phase.stages}
        resultHref={resultHref(topic.slug, query, phase.runId)}
        reviewHref={stepHref(topic.slug, "review", query) as Route}
        poll={(id) => createBackendClient().runStatus(id)}
      />
    </>
  );
}

/**
 * What was changed about the request to make it runnable.
 *
 * Rendered whenever planRun returns a note, which today means a clicked point
 * was expanded into a square. It is a statement, not a warning: the run is
 * proceeding, and this says exactly what it is proceeding over. The alternative
 * was to make the transformation silent, which would put an area on screen that
 * the analyst never chose.
 */
function PlanNotes({ notes }: { notes: readonly PlanNote[] }) {
  if (notes.length === 0) return null;

  return (
    <div className="mx-auto w-full max-w-band px-gutter pt-6 lg:px-gutter-lg">
      <div
        data-testid="plan-notes"
        className="rounded-xl border border-warn-border bg-warn-soft px-5 py-4"
      >
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-ink">
          What was adjusted
        </p>
        <ul className="mt-2 space-y-1.5">
          {notes.map((note) => (
            <li key={note.areaId} className="text-sm leading-relaxed text-ink">
              {note.message}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

