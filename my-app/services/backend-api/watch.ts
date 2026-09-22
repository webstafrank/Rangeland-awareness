/**
 * Watching a run, as a pure state machine.
 *
 * The running screen is a React component with a timer in it, which is the
 * least testable shape in the app. So everything that is a decision lives here
 * instead, as functions over plain values: what the screen should show after a
 * poll, whether to poll again, and how long to wait. The component keeps the
 * timer and nothing else, and the whole of this file runs in the node gate lane
 * with no DOM, no clock and no network.
 *
 * Three properties it exists to guarantee, all three from the rubric:
 *
 *   R2  progress never goes backwards on screen
 *   R5  polling stops at a terminal status, and never hammers the service
 *   R6  a service that is not answering is not the same thing as a run that
 *       failed, and the two are held in different fields
 */

import type { BackendFailure } from "./client";
import type { RunError, RunStatus, RunStatusResponse, Stage } from "./types";
import { isTerminal } from "./types";

/** What the screen renders. Everything the component needs, nothing it does not. */
export interface WatchState {
  readonly runId: string;
  readonly status: RunStatus;
  /** The stage list, in the order the plan declared. Never reordered. */
  readonly stages: readonly Stage[];
  /** 0..1, monotonic. See `advance`. */
  readonly progress: number;
  /** Set when the RUN failed. The service answered; the work did not finish. */
  readonly error: RunError | null;
  /** Set when the SERVICE is not answering. Different sentence, different field. */
  readonly transportFailure: BackendFailure | null;
  /** Consecutive failed polls. Resets to zero on any answer. */
  readonly consecutiveFailures: number;
  /** True once nothing further will change: terminal status, or given up. */
  readonly settled: boolean;
}

/**
 * How many polls in a row may fail before the screen stops trying.
 *
 * Six, with the backoff below, is a little over a minute of a service being
 * unreachable before the screen says so and offers a retry. Long enough to ride
 * out a backend restart or a laptop changing wifi; short enough that a genuinely
 * dead service does not leave a progress bar spinning indefinitely, which is the
 * screen telling a comfortable lie.
 */
export const MAX_CONSECUTIVE_FAILURES = 6;

/** Never poll faster than this, whatever the service says. */
export const MIN_POLL_MS = 1_000;
/** The interval when the service sends no `Retry-After`. Its own default is 2s. */
export const DEFAULT_POLL_MS = 2_000;
/** The ceiling the failure backoff climbs to. */
export const MAX_BACKOFF_MS = 30_000;

/**
 * The state a screen starts in, built from the POST response.
 *
 * This is rubric R1: the stage list is on screen from the first frame, before
 * any poll has answered, because the create response already carries the plan.
 * A screen that waits for its first poll to know what the stages are shows an
 * undifferentiated spinner for the first two seconds of every run.
 */
export function initialState(
  runId: string,
  status: RunStatus,
  stages: readonly Stage[],
  /**
   * The progress the caller already knows, when it knows any.
   *
   * Zero is right when the state comes from a POST, which is the moment before
   * any work has happened. It is wrong when the state comes from a status read
   * on the server, and the wrongness is visible: a finished run rendered "0%"
   * next to "10 of 10 stages finished" until the first client poll corrected
   * it, which is a screen contradicting itself in the server-rendered HTML.
   * Caught by opening a real finished run, not by a test.
   */
  progress = 0,
): WatchState {
  return {
    runId,
    status,
    stages,
    progress: Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 0,
    error: null,
    transportFailure: null,
    consecutiveFailures: 0,
    settled: isTerminal(status),
  };
}

/**
 * Fold a successful poll into the state.
 *
 * `progress` is taken as the maximum of what was shown and what arrived. The
 * service already promises monotonic progress derived from finished stage
 * weights, so in practice this never fires. It is here because the cost of
 * being wrong is asymmetric: a bar that goes backwards is read as the run
 * having lost work, and the guard is one line. A poll answered out of order by
 * a proxy, or a service restarted mid-run, would both produce it.
 */
export function advance(state: WatchState, response: RunStatusResponse): WatchState {
  const incoming = Number.isFinite(response.progress)
    ? Math.min(1, Math.max(0, response.progress))
    : state.progress;

  return {
    runId: response.runId,
    status: response.status,
    stages: response.stages,
    progress: Math.max(state.progress, incoming),
    error: response.error ?? null,
    // Any answer at all clears the transport problem, including an answer that
    // reports a failed run: the service is plainly alive.
    transportFailure: null,
    consecutiveFailures: 0,
    settled: isTerminal(response.status),
  };
}

/**
 * Fold a failed poll into the state.
 *
 * The run's own status is left exactly as it was. A poll that did not arrive is
 * no evidence about the run: it is almost certainly still going, and marking it
 * failed here would show an analyst a failed run that then succeeds.
 */
export function failed(state: WatchState, failure: BackendFailure): WatchState {
  const consecutiveFailures = state.consecutiveFailures + 1;
  return {
    ...state,
    transportFailure: failure,
    consecutiveFailures,
    settled: state.settled || consecutiveFailures >= MAX_CONSECUTIVE_FAILURES,
  };
}

/**
 * How long to wait before the next poll, or null when there should not be one.
 *
 * `Retry-After` is honoured because the service sends it and the contract says
 * to. Told, not guessed: a client polling as fast as it can manage is how a long
 * run becomes a denial of service against its own backend, and the service is
 * the only party that knows how expensive its own poll is.
 *
 * On consecutive failures the delay doubles from the base, capped, so a backend
 * that went away is retried sparsely rather than hammered while it restarts.
 */
export function nextDelayMs(state: WatchState, retryAfterMs: number | null): number | null {
  if (state.settled) return null;

  const base =
    retryAfterMs !== null && Number.isFinite(retryAfterMs)
      ? Math.max(MIN_POLL_MS, retryAfterMs)
      : DEFAULT_POLL_MS;

  if (state.consecutiveFailures === 0) return base;

  const backoff = base * 2 ** state.consecutiveFailures;
  return Math.min(MAX_BACKOFF_MS, backoff);
}

/** True when the screen has given up on a service that is not answering. */
export function gaveUp(state: WatchState): boolean {
  return state.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES;
}

/**
 * The stage the screen names as current, and what a live region announces.
 *
 * The running one, or the first that has not finished, or the last. Announcing
 * the stage rather than the percentage is rubric R9: a screen reader reading
 * "twenty eight percent, twenty nine percent" on every poll is noise, while
 * "Fetching criterion layers" is the actual news.
 */
export function currentStage(stages: readonly Stage[]): Stage | null {
  if (stages.length === 0) return null;
  const running = stages.find((s) => s.state === "running");
  if (running) return running;
  const failedStage = stages.find((s) => s.state === "failed");
  if (failedStage) return failedStage;
  const pending = stages.find((s) => s.state === "pending");
  if (pending) return pending;
  return stages[stages.length - 1];
}

/** Stages that reached a state where they will not run again. */
export function finishedCount(stages: readonly Stage[]): number {
  return stages.filter(
    (s) => s.state === "done" || s.state === "skipped" || s.state === "failed",
  ).length;
}

/*
 * A note on what is deliberately NOT here.
 *
 * An earlier draft put a floor under `progress` derived from how many stages
 * had finished, on the theory that a bar and the list beside it should agree.
 * It was removed. The service derives progress from stage WEIGHTS, and a floor
 * derived from stage COUNTS is a different number: with the fetch stage worth
 * four times the resolve stage, counting would report 20% for work the service
 * honestly calls 6%. Inventing a more flattering number than the one the
 * service computed is the failure this whole file exists to avoid, so the only
 * transformations applied to `progress` are a clamp to 0..1 and the monotonic
 * maximum above.
 */
