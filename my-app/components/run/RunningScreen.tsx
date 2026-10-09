"use client";

/**
 * The screen an analyst sits on while the backend computes a weighted overlay.
 *
 * The reference is Vercel's deployment view and GitHub Actions' job view, named
 * before this was built. What both get right is the same thing: the list of
 * work is on screen the instant the job is accepted, every row carries its own
 * state, and a row that did not run stays in the list saying so. What you never
 * see in either is a spinner that could mean anything. That is the whole design
 * brief here, and `contracts/backend-api.md` already hands us what it needs:
 * the POST answers with the stage plan, so the list can render on frame one.
 *
 * WHAT THIS FILE OWNS, AND WHAT IT DOES NOT.
 *
 * `services/backend-api/watch.ts` is the state machine: monotonic progress, the
 * backoff, `Retry-After`, when to stop. It is a pure function of its arguments
 * and it is gate-tested with no DOM and no clock. None of that is reimplemented
 * below. This component owns exactly two things the machine cannot own: the
 * timer that decides WHEN to call `poll`, and the markup. Every decision about
 * WHAT the next state is goes through `advance`, `failed`, `nextDelayMs` and
 * `gaveUp`. If you find yourself computing a progress number here, stop.
 *
 * THE THREE SENTENCES THIS SCREEN HAS TO KEEP APART (rubric R4 and R6):
 *
 *   the run failed          the service answered and said the work did not
 *                           finish. `state.error` names the stage.
 *   the service is quiet    a poll did not come back. The run is almost
 *                           certainly still going; this screen just cannot see
 *                           it. `state.transportFailure`.
 *   we stopped asking       six quiet polls in a row. `gaveUp(state)`.
 *
 * They are three different things to do next, so they are three different
 * blocks of copy, and the transport blocks say in as many words that the run
 * has not failed. Collapsing them into "something went wrong" is how an analyst
 * ends up mailing an administrator about a server that is running fine.
 *
 * THE DESIGN SYSTEM'S JOBSTATUS. This is the pipeline view that component was
 * written for, so its rules are followed as written: every row is icon plus
 * word plus time and never a coloured dot; the run's own state is a Fluent
 * `Badge` in the tint appearance (brand while running, the success, danger or
 * neutral pair after); progress is a Fluent `ProgressBar` in brand; a failure
 * shows its error in full, never truncated, with the way out beside it; job
 * and run ids are set in dataMono.
 *
 * COLOUR. Brand blue is the primary action, and on this screen there is
 * normally no such control: the flow advances by itself when the run
 * finishes. So a primary button appears in exactly one place, "Try again",
 * the only control that can move a stuck screen forward. Back to review is a
 * recovery, not an advance, so it is secondary. A failed stage is a STATUS,
 * not a control, so it takes the danger pair and never a button's fill.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Route } from "next";
import { ProgressBar } from "@fluentui/react-components";
import {
  ArrowClockwise20Regular,
  ArrowLeft20Regular,
  ArrowSync16Regular,
  Checkmark16Regular,
  Dismiss16Regular,
  ErrorCircle20Filled,
  PlugDisconnected20Regular,
} from "@/components/ui/icons";
import { FRAME } from "@/components/shell/Page";
import { JobBadge, stageWord } from "@/components/run/JobBadge";
import { Button } from "@/components/ui/Button";
import { buttonClasses } from "@/components/ui/button-classes";
import { Panel } from "@/components/ui/Panel";
import {
  MAX_CONSECUTIVE_FAILURES,
  advance,
  currentStage,
  failed,
  failureMessage,
  finishedCount,
  gaveUp,
  initialState,
  isTerminal,
  nextDelayMs,
} from "@/services/backend-api";
import type {
  BackendResult,
  RunStatus,
  RunStatusResponse,
  Stage,
  StageState,
  WatchState,
} from "@/services/backend-api";
import type { Topic } from "@/services/analysis/topics";

/* ------------------------------------------------------------------ props */

export interface RunningScreenProps {
  topic: Topic;
  runId: string;
  /** Status and stage plan from the POST response, so the list renders on the first frame. */
  initialStatus: RunStatus;
  initialStages: readonly Stage[];
  /**
   * Progress as the service last reported it, when the caller has read a
   * status. Omitted after a POST, where zero is the truth.
   */
  initialProgress?: number;
  /** Where to send the analyst when the run succeeds. */
  resultHref: Route;
  /** Back to the review step. */
  reviewHref: Route;
  /**
   * Injected so the component is testable with no network. The route passes
   * a closure over the real client; tests pass a function.
   */
  poll: (runId: string) => Promise<BackendResult<RunStatusResponse>>;
  /** Injected for tests. Defaults to next/navigation's router.replace. */
  onSucceeded?: (href: Route) => void;
}

/* ------------------------------------------------------- stage appearance */

/**
 * How each stage state weights its label. The word, the icon and the colour
 * live in `<JobBadge>`, which every row renders, so no state is carried by
 * colour alone.
 *
 * A `Record<StageState, ...>` rather than a lookup with a default, so a sixth
 * state added to the contract is a type error in this file rather than a row
 * that silently renders blank. `skipped` in particular has to be legible as
 * skipped: rubric R3 and the GitHub Actions reference both turn on a skipped
 * step being visibly present rather than quietly dropped. It is greyed, but at
 * full opacity: a skipped stage is information, not a disabled control.
 */
const STAGE_LABEL_INK: Record<StageState, string> = {
  pending: "text-ink-muted",
  running: "text-ink font-semibold",
  done: "text-ink",
  skipped: "text-ink-faint",
  failed: "text-ink font-semibold",
};

/** The state word's ink: the node's hue, darkened to text contrast. */
const STAGE_WORD_INK: Record<StageState, string> = {
  pending: "text-ink-faint",
  running: "text-accent",
  done: "text-success",
  skipped: "text-ink-faint",
  failed: "text-danger",
};

/* ------------------------------------------------------------- pure bits */

/**
 * The rows to draw, in the order the POST plan declared them.
 *
 * `advance` replaces the stage array wholesale with whatever the poll returned,
 * which is right for the state machine and not quite enough for the list. R3
 * asks for no reflow between polls, and a reflow does not need the service to
 * misbehave much: one response that omits a stage, or orders the array
 * differently, and rows jump under the cursor of someone reading them.
 *
 * So the plan fixes the order and the latest poll supplies each row's state.
 * A stage the plan never mentioned is appended rather than dropped, because
 * hiding work the service says it did is worse than a list one row longer than
 * it was. Nothing is ever removed.
 */
function orderedStages(
  plan: readonly Stage[],
  latest: readonly Stage[],
): readonly Stage[] {
  if (plan.length === 0) return latest;

  const byId = new Map(latest.map((stage) => [stage.id, stage]));
  const rows: Stage[] = plan.map((stage) => byId.get(stage.id) ?? stage);

  const planned = new Set(plan.map((stage) => stage.id));
  for (const stage of latest) {
    if (!planned.has(stage.id)) rows.push(stage);
  }
  return rows;
}

/** The stage's own label, or its raw id when the error names one we never saw. */
function labelFor(stages: readonly Stage[], id: string): string {
  return stages.find((stage) => stage.id === id)?.label ?? id;
}

/**
 * How long a finished stage took, from the timestamps the contract already
 * sends. Static, never a ticking clock: a running elapsed counter would be a
 * second progress signal that the service did not compute, and re-rendering
 * once a second would interrupt the live region below on every tick.
 */
function durationLabel(stage: Stage): string {
  if (!stage.startedAt || !stage.endedAt) return "";
  const ms = Date.parse(stage.endedAt) - Date.parse(stage.startedAt);
  if (!Number.isFinite(ms) || ms < 0) return "";
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

/**
 * What the one live region says (rubric R9).
 *
 * The stage label, not the percentage. "Twenty eight percent, twenty nine
 * percent" read out every two seconds is noise that drowns the one piece of
 * news a screen reader user actually wants, which is that the run moved on to
 * the next piece of work.
 *
 * A transport blip is deliberately NOT announced. Polls fail and recover all
 * the time on a laptop changing network, and announcing each one would be the
 * same noise in a different key. Only giving up, which is a state the analyst
 * has to act on, gets a sentence.
 */
function announcementFor(state: WatchState, rows: readonly Stage[]): string {
  if (state.status === "succeeded") return "Analysis finished. Opening the result.";
  if (state.status === "cancelled") return "The run was cancelled.";
  if (state.error) return `The run failed at ${labelFor(rows, state.error.stage)}.`;
  if (state.status === "failed") return "The run failed.";
  if (gaveUp(state)) return "Lost contact with the analysis service. Polling has stopped.";

  const stage = currentStage(rows);
  return stage ? `Current stage: ${stage.label}.` : "Starting the analysis.";
}

/**
 * The default `onSucceeded`, as a child that only mounts when it is needed.
 *
 * `useRouter` throws outside an app router context, and a hook cannot be called
 * conditionally, so a bare `const router = useRouter()` in the screen would
 * make the whole component unrenderable in any test that has not built a router
 * provider. Moving the hook into a child that is only mounted on the success
 * path keeps the documented default behaviour (router.replace) while letting a
 * test hand in `onSucceeded` and never construct a router at all. The prop
 * contract does not change; only where the hook lives does.
 */
function RouterReplace({ href }: { href: Route }) {
  const router = useRouter();
  useEffect(() => {
    router.replace(href);
  }, [router, href]);
  return null;
}

/* ------------------------------------------------------------- component */

export default function RunningScreen({
  topic,
  runId,
  initialStatus,
  initialStages,
  initialProgress = 0,
  resultHref,
  reviewHref,
  poll,
  onSucceeded,
}: RunningScreenProps) {
  /*
   * R1: the machine's starting state is built from the POST response, so the
   * very first render already has the stage plan. Lazy initialiser, or every
   * re-render would rebuild it and throw away the polled state.
   */
  const [state, setState] = useState<WatchState>(() =>
    initialState(runId, initialStatus, initialStages, initialProgress),
  );
  /** The last `Retry-After` the service sent, fed straight back to nextDelayMs. */
  const [retryAfterMs, setRetryAfterMs] = useState<number | null>(null);
  /** True while the tab is hidden. Polling is suspended, not stopped. */
  const [paused, setPaused] = useState(false);

  /*
   * `poll` and `onSucceeded` are held in refs rather than read from the
   * closure.
   *
   * The route will pass `poll` as an inline closure over its client, so its
   * identity changes on every parent render. In the dependency array of the
   * scheduling effect below that would tear down and rebuild the pending
   * timeout on each render, and a parent that re-renders faster than the poll
   * interval would mean the timer never fires at all. A ref makes the schedule
   * depend only on things that should actually reschedule it.
   *
   * Assigned in an effect rather than during render, and this effect is
   * declared FIRST so it has run before the effects below read the refs.
   */
  const pollRef = useRef(poll);
  const succeededRef = useRef(onSucceeded);
  useEffect(() => {
    pollRef.current = poll;
    succeededRef.current = onSucceeded;
  });

  const rows = useMemo(
    () => orderedStages(initialStages, state.stages),
    [initialStages, state.stages],
  );

  /* -------------------------------------------------------- visibility */

  /*
   * R5: no polling while the tab is hidden.
   *
   * A backgrounded tab that keeps polling every two seconds is a load the
   * service is paying for so that nobody can see the answer. Browsers already
   * throttle background timers, which makes the interval unpredictable rather
   * than absent; this makes it absent, and resumes cleanly.
   *
   * Read once on mount as well as on the event, because the tab can already be
   * hidden when this mounts (a run started in a tab the analyst then switched
   * away from before the first frame).
   */
  useEffect(() => {
    const sync = () => setPaused(document.visibilityState === "hidden");
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);

  /* ----------------------------------------------------------- the timer */

  /*
   * The one timer in the component, and the only thing this file does that
   * watch.ts cannot.
   *
   * `state` is in the dependency list, which is what makes this a loop: every
   * fold produces a new state object, the effect tears down and schedules the
   * next wait with the new state's backoff. `nextDelayMs` returns null on a
   * settled state, so a finished run schedules nothing and R5's "never polls a
   * finished run" holds without a second check.
   *
   * `live` guards the response as well as the timeout. Clearing the timeout
   * alone leaves an in-flight fetch that resolves after unmount and calls
   * setState on a component that is gone; the flag makes the cleanup cover both
   * halves. Same flag covers the pause: a poll in flight when the tab hides is
   * discarded rather than applied.
   */
  useEffect(() => {
    if (paused || state.settled) return;

    const delay = nextDelayMs(state, retryAfterMs);
    if (delay === null) return;

    let live = true;
    const timer = window.setTimeout(() => {
      pollRef
        .current(state.runId)
        .then((result) => {
          if (!live) return;
          if (result.ok) {
            setRetryAfterMs(result.retryAfterMs);
            setState((prev) => advance(prev, result.data));
          } else {
            setState((prev) => failed(prev, result.failure));
          }
        })
        .catch((cause: unknown) => {
          // The client contracts never to throw, so this branch should be
          // unreachable. It is here because the alternative to an unreachable
          // branch is an unhandled rejection and a screen frozen at whatever
          // percentage it happened to be showing, which is the exact failure
          // the rubric calls out. A thrown error is a poll that did not
          // arrive, so it folds in as one.
          if (!live) return;
          setState((prev) =>
            failed(prev, {
              kind: "unreachable",
              message: cause instanceof Error ? cause.message : String(cause),
            }),
          );
        });
    }, delay);

    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [state, paused, retryAfterMs]);

  /* ------------------------------------------------------- announcements */

  /*
   * R9: derived, never stored.
   *
   * An earlier version mirrored this into state so that "the text only changes
   * when the sentence changes" was enforced by an explicit comparison. It is
   * not needed and it is not free: setState inside an effect is a second render
   * pass on every poll, and the repo's lint rules reject it outright. Deriving
   * it gets the same guarantee from the reconciler, which does not touch a text
   * node whose string is unchanged - so a poll that only moves the percentage
   * writes nothing into the region and nothing is re-announced. The test
   * "does not change when only the percentage moves" is what holds that.
   */
  const announcement = useMemo(() => announcementFor(state, rows), [state, rows]);

  /* ------------------------------------------------------------- success */

  /*
   * R8: a run that was already succeeded when the POST answered (the cached
   * case, HTTP 200 with `cached: true`) leaves here on the first effect pass,
   * having polled nothing. The scheduling effect above never starts, because
   * `initialState` marks a terminal status settled.
   *
   * `navigated` makes the hand-off once. Without it, a state change arriving
   * after the status went succeeded - the announcement fold, say - would call
   * `replace` a second time.
   */
  const navigated = useRef(false);
  useEffect(() => {
    if (state.status !== "succeeded" || navigated.current) return;
    const handler = succeededRef.current;
    if (!handler) return; // the RouterReplace child below does it instead
    navigated.current = true;
    handler(resultHref);
  }, [state.status, resultHref]);

  /* --------------------------------------------------------------- retry */

  /*
   * Resume after giving up.
   *
   * watch.ts has no `resume`, and that is the right split: giving up is the
   * machine's rule, un-giving-up is a person pressing a button, which is this
   * file's business. The reset is only the transport fields - the run's own
   * status and its monotonic progress are untouched, so a bar at 62% does not
   * drop back to zero because the wifi came back.
   */
  const retry = useCallback(() => {
    setRetryAfterMs(null);
    setState((prev) => ({
      ...prev,
      transportFailure: null,
      consecutiveFailures: 0,
      settled: isTerminal(prev.status),
    }));
  }, []);

  /* --------------------------------------------------------------- render */

  const percent = Math.round(Math.min(1, Math.max(0, state.progress)) * 100);
  const finished = finishedCount(rows);
  const runFailed = state.status === "failed" || state.error !== null;
  const stopped = gaveUp(state);
  const failingLabel = state.error ? labelFor(rows, state.error.stage) : null;

  return (
    // FRAME and the section rhythm every page uses. R10: every grid track is
    // minmax(0, ...) and every child min-w-0, so 360px needs no scrollbar.
    <div className={`${FRAME} py-8 lg:py-10`}>
      <div
        className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]"
        aria-busy={!state.settled}
        data-run-status={state.status}
      >
        {/* ---------------------------------------------- status column */}
        <div className="flex min-w-0 flex-col gap-4">
          <section aria-labelledby="run-heading" className="card p-4 lg:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <JobBadge kind="run" state={state.status} />
              <code className="type-caption1 font-mono break-all text-ink-faint">{runId}</code>
            </div>
            <h2 id="run-heading" className="type-title3 mt-3 text-ink">
              Analysis run
            </h2>

            {/*
              The one polite live region, and the first on the page (R9).
              Visible rather than sr-only, because the sentence a screen reader
              needs and the sentence a sighted analyst needs are the same
              sentence, and two copies of it drift.
            */}
            <p
              aria-live="polite"
              aria-atomic="true"
              data-testid="run-announcement"
              className="type-body2 mt-1 min-h-6 font-semibold text-ink"
            >
              {announcement}
            </p>

            <div className="mt-5 rounded-fluent-large bg-surface-subtle p-3 ring-1 ring-edge">
              <div className="flex items-baseline justify-between gap-3">
                <span className="eyebrow">Progress</span>
                <span className="type-title3 text-ink tabular-nums">{percent}%</span>
              </div>
              {/*
                R2. The number is `state.progress`, which `advance` has already
                made monotonic; this element only renders it. Determinate,
                because the step count is known. aria-valuetext is the
                percentage and nothing else: the stage belongs to the live
                region, and duplicating it here would read it twice.
              */}
              <ProgressBar
                value={percent}
                max={100}
                thickness="large"
                aria-label="Analysis progress"
                aria-valuetext={`${percent}%`}
                className="mt-2 min-w-0"
              />
              <p className="type-caption1 mt-2 text-ink-faint tabular-nums">
                {finished} of {rows.length} stages finished
              </p>
            </div>

            <p className="type-caption1 mt-4 text-ink-faint">
              The service is computing the weighted overlay for {topic.name}. Nothing
              is calculated in this browser; the stages are what the service reports
              it has done.
            </p>
          </section>

          {/*
            R4: the failing stage and its message, in place, with the way out.
            A region rather than a Fluent MessageBar, because a MessageBar is a
            `group` and this needs to be a named landmark an analyst can jump
            to; it wears the MessageBar's error skin so it reads as one.
          */}
          {runFailed && (
            <section
              aria-labelledby="run-failed-heading"
              data-testid="run-failed"
              className="flex gap-3 rounded-fluent-xlarge border border-danger/30 bg-danger-soft p-4"
            >
              <ErrorCircle20Filled aria-hidden="true" className="mt-0.5 shrink-0 text-danger" />
              <div className="min-w-0">
                <h3 id="run-failed-heading" className="type-subtitle2 text-ink">
                  {failingLabel ? `The run failed at "${failingLabel}"` : "The run failed"}
                </h3>
                {/* Never truncated: the design system's JobStatus rule. */}
                <p className="type-body1 mt-1 break-words text-ink">
                  {state.error?.message ??
                    "The service reported the run as failed without naming a stage."}
                </p>
                <p className="type-caption1 mt-1 text-ink-muted">
                  The analysis service answered, so it is reachable. This is the run
                  itself, not the connection. Change the configuration on the review
                  step and start it again.
                </p>
                <Link href={reviewHref} className={buttonClasses({ className: "mt-3" })}>
                  <ArrowLeft20Regular aria-hidden="true" />
                  Back to review
                </Link>
              </div>
            </section>
          )}

          {/*
            R6: not the same severity as work that failed, so the warning pair
            rather than the danger pair, and the two blocks can be on screen at
            once.
          */}
          {state.transportFailure && (
            <section
              aria-labelledby="transport-heading"
              data-testid="transport-failure"
              className="flex gap-3 rounded-fluent-xlarge border border-warn/30 bg-warn-soft p-4"
            >
              <PlugDisconnected20Regular aria-hidden="true" className="mt-0.5 shrink-0 text-warn" />
              <div className="min-w-0">
                <h3 id="transport-heading" className="type-subtitle2 text-ink">
                  {stopped
                    ? "Lost contact with the analysis service"
                    : "Waiting for the analysis service"}
                </h3>
                <p className="type-body1 mt-1 break-words text-ink">
                  {failureMessage(state.transportFailure)}
                </p>
                <p className="type-caption1 mt-1 text-ink-muted">
                  {stopped
                    ? `${MAX_CONSECUTIVE_FAILURES} polls in a row went unanswered, so this screen stopped asking. The run has not failed: it is very likely still going, and its result is kept under this run id once the service answers again.`
                    : `Attempt ${state.consecutiveFailures} of ${MAX_CONSECUTIVE_FAILURES}, waiting longer between each. This is the connection to the service, not the run: the run has not failed.`}
                </p>
                {stopped && (
                  // The single primary control on this screen: the only
                  // button that can move a stuck flow forward.
                  <Button
                    type="button"
                    variant="primary"
                    onClick={retry}
                    icon={<ArrowClockwise20Regular />}
                    className="mt-3"
                  >
                    Try again
                  </Button>
                )}
              </div>
            </section>
          )}

          {/*
            Rendered whether or not the run is going. Leaving mid-run is a
            normal thing to want, and a screen whose only exit appears on
            failure traps anyone who simply changed their mind.
          */}
        </div>

        {/* ----------------------------------------------- the timeline */}
        <Panel title="Stages" pad="none" action={<StageCount finished={finished} total={rows.length} />}>
          {rows.length === 0 ? (
            <p className="type-body1 p-4 text-ink-muted">
              The service accepted the run but named no stages for it.
            </p>
          ) : (
            // A vertical timeline. These <li>s are the only list items this
            // screen renders: the stage list's tests count every listitem.
            <ol className="px-4 py-3 lg:px-5">
              {rows.map((stage, index) => {
                const duration = durationLabel(stage);
                const last = index === rows.length - 1;
                return (
                  <li
                    key={stage.id}
                    data-stage={stage.id}
                    data-state={stage.state}
                    // Three tracks: the node with its connector, the label
                    // (minmax(0,1fr), so a long one wraps rather than widening
                    // the row past 360px), and the state with its time. The
                    // outer two never change width, so the columns stay put as
                    // states change.
                    className="relative grid grid-cols-[1.75rem_minmax(0,1fr)_auto] items-start gap-x-3"
                  >
                    {last ? null : (
                      <span
                        aria-hidden="true"
                        className={`absolute top-8 bottom-1 left-[calc(0.875rem-1px)] w-0.5 rounded-full ${
                          stage.state === "done" ? "bg-success/40" : "bg-edge"
                        }`}
                      />
                    )}
                    <StageNode state={stage.state} number={index + 1} />

                    <span className={`min-w-0 pt-1 ${last ? "" : "pb-5"}`}>
                      <span className={`type-body1 block ${STAGE_LABEL_INK[stage.state]}`}>
                        {stage.label}
                      </span>
                      {/*
                        Reserved, always present, always exactly one line.
                        `detail` is free text that appears part way through a
                        stage ("928x922 at 30m"); rendered conditionally it
                        would grow the row mid-run and push every row below it
                        down, which is the reflow R3 forbids. `truncate` holds
                        it to one line however long the service makes it.
                      */}
                      <span
                        className="type-caption1 block h-4 truncate text-ink-faint"
                        title={stage.detail ?? undefined}
                      >
                        {stage.detail ?? ""}
                      </span>
                    </span>

                    {/*
                      The state's word, beside the node's icon: icon plus word,
                      once per row, so state is never colour alone.
                    */}
                    <span className="flex flex-col items-end gap-0.5 pt-1">
                      <span className={`type-caption1 font-semibold ${STAGE_WORD_INK[stage.state]}`}>
                        {stageWord(stage.state)}
                      </span>
                      {/* Reserved for the same reason as the detail line. */}
                      <span className="type-caption1 block h-4 text-ink-faint tabular-nums">
                        {duration}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </Panel>

        {/*
          Rendered whether or not the run is going, after the stage list on
          every width. Leaving mid-run is a normal thing to want, and a screen
          whose only exit appears on failure traps anyone who changed their
          mind. Hidden on failure only because the failure block carries it.
        */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 lg:col-span-2">
          {!runFailed && (
            <Link href={reviewHref} className={buttonClasses({ appearance: "subtle" })}>
              <ArrowLeft20Regular aria-hidden="true" />
              Back to review
            </Link>
          )}
          {paused && (
            <p className="type-caption1 text-ink-faint">
              Paused while this tab is in the background.
            </p>
          )}
        </div>
      </div>

      {state.status === "succeeded" && !onSucceeded && (
        <RouterReplace href={resultHref} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------ small parts */

/** "3 / 5" in the timeline's header, so the count sits where the list is. */
function StageCount({ finished, total }: { finished: number; total: number }) {
  return (
    <span className="type-caption1 text-ink-faint tabular-nums" aria-hidden="true">
      {finished} / {total}
    </span>
  );
}

/**
 * The timeline node: the row's icon. aria-hidden, because the state's word is
 * printed beside it (and read), so neither the node's colour nor its glyph is
 * the only channel. Done shows a tick, failed a cross, running the turning
 * sync arrows (still under reduced motion), pending and skipped their step
 * number, skipped in a dashed ring.
 */
const NODE: Record<StageState, string> = {
  pending: "border border-edge-strong bg-surface text-ink-faint",
  running: "bg-accent text-white",
  done: "bg-success-soft text-success ring-1 ring-success/30",
  skipped: "border border-dashed border-edge-strong bg-surface text-ink-faint",
  failed: "bg-danger-soft text-danger ring-1 ring-danger/30",
};

function StageNode({ state, number }: { state: StageState; number: number }) {
  return (
    <span
      aria-hidden="true"
      className={`type-caption1 relative grid h-7 w-7 place-items-center rounded-full font-mono font-semibold tabular-nums ${NODE[state]}`}
    >
      {state === "done" ? (
        <Checkmark16Regular />
      ) : state === "failed" ? (
        <Dismiss16Regular />
      ) : state === "running" ? (
        <ArrowSync16Regular className="animate-spin [animation-duration:2s]" />
      ) : (
        number
      )}
    </span>
  );
}

export { RunningScreen };
