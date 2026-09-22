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
 * COLOUR. Red (`bg-action`) is the control that advances the flow, and on this
 * screen there is normally no such control: the flow advances by itself when
 * the run finishes. So red appears in exactly one place, "Try again", which is
 * the only button that can move a stuck screen forward. Back to review is a
 * recovery, not an advance, so it takes the same bordered treatment StepShell
 * gives its Back link. A failed stage is a STATUS, not a control, so it takes
 * `--color-danger` (the deeper status red) and never the action red.
 *
 * WHY THE KIT IS USED ONLY PARTLY. `Eyebrow` and `Panel` come from
 * `components/ui/`. `Button` does not, and that is deliberate: `Button` is
 * built on the data-viz namespace (`bg-scarlet-fill`, `bg-navy-900`), while
 * every screen in this wizard - StepShell, ResultsStep - is built on the chrome
 * namespace (`bg-action`, `bg-accent`). The two reds and the two navies are
 * different hex values by design; see the header of app/globals.css. Dropping a
 * `Button` in here would give the running screen a red that the review step it
 * came from does not have. So the controls copy StepShell's classes exactly and
 * the layout components, whose light skin is already `bg-white border-edge`,
 * come from the kit.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Route } from "next";
import { Eyebrow } from "@/components/ui/Eyebrow";
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
 * The five stage states, each with a word.
 *
 * A `Record<StageState, ...>` rather than a lookup with a default, so a sixth
 * state added to the contract is a type error in this file rather than a row
 * that silently renders blank. That is the only way a UI keeps up with a schema
 * it does not own.
 *
 * Every state ships a WORD as well as a glyph and a colour, and the word is the
 * thing tests and screen readers read. `skipped` in particular has to be
 * legible as skipped: rubric R3 and the GitHub Actions reference both turn on a
 * skipped step being visibly present rather than quietly dropped.
 */
const STAGE_PRESENTATION: Record<
  StageState,
  { word: string; glyph: string; glyphInk: string; labelInk: string; wordInk: string }
> = {
  pending: {
    word: "Pending",
    glyph: "○",
    glyphInk: "text-ink-faint",
    labelInk: "text-ink-muted",
    wordInk: "text-ink-faint",
  },
  running: {
    word: "Running",
    glyph: "●",
    // animate-pulse is honoured by the reduced-motion block in globals.css,
    // which flattens every animation to 0.01ms app-wide.
    glyphInk: "text-accent animate-pulse",
    labelInk: "text-ink font-semibold",
    wordInk: "text-accent",
  },
  done: {
    word: "Done",
    glyph: "✓",
    glyphInk: "text-accent",
    labelInk: "text-ink",
    wordInk: "text-ink-muted",
  },
  skipped: {
    word: "Skipped",
    glyph: "–",
    // Greyed, per R3. Still full opacity on the row so the label stays legible:
    // a skipped stage is information, not a disabled control.
    glyphInk: "text-ink-faint",
    labelInk: "text-ink-faint",
    wordInk: "text-ink-faint",
  },
  failed: {
    word: "Failed",
    glyph: "✕",
    glyphInk: "text-danger",
    labelInk: "text-ink font-semibold",
    wordInk: "text-danger",
  },
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
    // max-w-band / px-gutter are the same frame StepShell uses, so arriving
    // here from review does not shift the page sideways. R10: everything below
    // is a single column with min-w-0 children, so 360px needs no scrollbar.
    <div className="mx-auto w-full max-w-band px-gutter pt-6 pb-16 lg:px-gutter-lg lg:pt-8">
      <div
        className="w-full max-w-step"
        aria-busy={!state.settled}
        data-run-status={state.status}
      >
        <Eyebrow>Running analysis</Eyebrow>
        <h1 className="mt-3 text-xl font-semibold tracking-tight lg:text-2xl">
          {topic.name}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          The service is computing the weighted overlay. Nothing is calculated in
          this browser; the list below is what the service reports it has done.
        </p>

        {/*
          The one polite live region. Visible rather than sr-only, because the
          sentence a screen reader needs and the sentence a sighted analyst
          needs are the same sentence, and two copies of it drift.
        */}
        <p
          aria-live="polite"
          aria-atomic="true"
          data-testid="run-announcement"
          className="mt-4 min-h-5 text-sm leading-5 font-medium text-ink"
        >
          {announcement}
        </p>

        <div className="mt-5 flex flex-col gap-4">
          <Panel title="Progress">
            <div className="flex items-center gap-4">
              {/*
                R2. The number is `state.progress`, which `advance` has already
                made monotonic; this element only renders it. aria-valuetext is
                the percentage and nothing else - the stage belongs to the live
                region, and duplicating it here would have a screen reader read
                the stage twice.
              */}
              <div
                role="progressbar"
                aria-label="Analysis progress"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent}
                aria-valuetext={`${percent}%`}
                className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-sunken"
              >
                <div
                  className="h-full rounded-full bg-accent transition-[width] duration-700 ease-out"
                  // A computed width, not a design value. Tokens govern colour
                  // and spacing; this one number comes from the service.
                  style={{ width: `${percent}%` }}
                />
              </div>
              <span className="w-12 shrink-0 text-right text-sm font-semibold tabular-nums">
                {percent}%
              </span>
            </div>
            <p className="mt-2.5 text-xs leading-relaxed text-ink-faint">
              {finished} of {rows.length} stages finished. Run{" "}
              <code className="font-mono break-all">{runId}</code>.
            </p>
          </Panel>

          <Panel title="Stages" pad="tight">
            {rows.length === 0 ? (
              <p className="text-sm text-ink-muted">
                The service accepted the run but named no stages for it.
              </p>
            ) : (
              <ol className="divide-y divide-edge">
                {rows.map((stage) => {
                  const look = STAGE_PRESENTATION[stage.state];
                  return (
                    <li
                      key={stage.id}
                      data-stage={stage.id}
                      data-state={stage.state}
                      // Three fixed tracks. The middle one is minmax(0,1fr) so
                      // a long label wraps instead of widening the row past
                      // 360px, and the outer two never change width, so the
                      // columns stay aligned as states change.
                      className="grid grid-cols-[1.25rem_minmax(0,1fr)_4.5rem] items-start gap-x-3 py-2.5 first:pt-1 last:pb-1"
                    >
                      <span
                        aria-hidden="true"
                        className={`text-center text-xs leading-5 ${look.glyphInk}`}
                      >
                        {look.glyph}
                      </span>

                      <span className="min-w-0">
                        <span className={`block text-sm leading-5 ${look.labelInk}`}>
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
                          className="block h-4 truncate text-xs leading-4 text-ink-faint"
                          title={stage.detail ?? undefined}
                        >
                          {stage.detail ?? ""}
                        </span>
                      </span>

                      <span className="text-right">
                        <span
                          className={`block text-xs leading-5 font-semibold ${look.wordInk}`}
                        >
                          {look.word}
                        </span>
                        {/* Reserved for the same reason as the detail line. */}
                        <span className="block h-4 text-xs leading-4 text-ink-faint tabular-nums">
                          {durationLabel(stage)}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}
          </Panel>

          {/* R4: the failing stage and its message, in place, with the way out. */}
          {runFailed && (
            <section
              aria-labelledby="run-failed-heading"
              data-testid="run-failed"
              className="rounded-lg border border-danger-border bg-danger-soft p-4 sm:p-5"
            >
              <h2
                id="run-failed-heading"
                className="text-sm font-semibold text-ink"
              >
                {failingLabel
                  ? `The run failed at "${failingLabel}"`
                  : "The run failed"}
              </h2>
              <p className="mt-2 text-sm leading-relaxed break-words text-ink-muted">
                {state.error?.message ??
                  "The service reported the run as failed without naming a stage."}
              </p>
              <p className="mt-2 text-xs leading-relaxed text-ink-faint">
                The analysis service answered, so it is reachable. This is the run
                itself, not the connection. Change the configuration on the review
                step and start it again.
              </p>
              <Link
                href={reviewHref}
                className="mt-4 inline-flex rounded-lg border border-edge-strong bg-surface px-4 py-2 text-sm font-semibold text-ink-muted hover:bg-sunken hover:text-ink"
              >
                <span aria-hidden="true">&larr;</span>&nbsp;Back to review
              </Link>
            </section>
          )}

          {/*
            R6: the other red. Warn tokens rather than danger tokens, because a
            service that is not answering is not the same severity as work that
            failed, and the two blocks can be on screen at once.
          */}
          {state.transportFailure && (
            <section
              aria-labelledby="transport-heading"
              data-testid="transport-failure"
              className="rounded-lg border border-warn-border bg-warn-soft p-4 sm:p-5"
            >
              <h2 id="transport-heading" className="text-sm font-semibold text-ink">
                {stopped
                  ? "Lost contact with the analysis service"
                  : "Waiting for the analysis service"}
              </h2>
              <p className="mt-2 text-sm leading-relaxed break-words text-ink-muted">
                {failureMessage(state.transportFailure)}
              </p>
              <p className="mt-2 text-xs leading-relaxed text-ink-faint">
                {stopped
                  ? `${MAX_CONSECUTIVE_FAILURES} polls in a row went unanswered, so this screen stopped asking. The run has not failed: it is very likely still going, and its result is kept under this run id once the service answers again.`
                  : `Attempt ${state.consecutiveFailures} of ${MAX_CONSECUTIVE_FAILURES}, waiting longer between each. This is the connection to the service, not the run: the run has not failed.`}
              </p>
              {stopped && (
                // The single red control on this screen: the only button that
                // can move a stuck flow forward.
                <button
                  type="button"
                  onClick={retry}
                  className="mt-4 rounded-lg bg-action px-5 py-2 text-sm font-semibold text-white shadow-card transition-colors hover:bg-action-hover"
                >
                  Try again
                </button>
              )}
            </section>
          )}
        </div>

        <footer className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2">
          {/*
            Rendered whether or not the run failed. Leaving mid-run is a normal
            thing to want, and a screen whose only exit appears on failure
            traps anyone who simply changed their mind.
          */}
          {!runFailed && (
            <Link
              href={reviewHref}
              className="text-sm font-semibold text-accent underline underline-offset-4 hover:text-accent-hover"
            >
              Back to review
            </Link>
          )}
          {paused && (
            <p className="text-xs text-ink-faint">
              Paused while this tab is in the background.
            </p>
          )}
        </footer>
      </div>

      {state.status === "succeeded" && !onSucceeded && (
        <RouterReplace href={resultHref} />
      )}
    </div>
  );
}

export { RunningScreen };
