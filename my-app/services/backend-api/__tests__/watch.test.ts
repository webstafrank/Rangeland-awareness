/**
 * The polling state machine.
 *
 * Every rule the running screen has to obey is asserted here rather than in a
 * browser, because all of them are decisions over plain values and none of them
 * need a DOM. The component that uses this holds a timer and nothing else.
 */

import { describe, expect, it } from "vitest";
import {
  DEFAULT_POLL_MS,
  MAX_BACKOFF_MS,
  MAX_CONSECUTIVE_FAILURES,
  MIN_POLL_MS,
  advance,
  currentStage,
  failed,
  finishedCount,
  gaveUp,
  initialState,
  nextDelayMs,
} from "@/services/backend-api/watch";
import type { BackendFailure } from "@/services/backend-api/client";
import type { RunStatusResponse, Stage } from "@/services/backend-api/types";

const STAGES: Stage[] = [
  { id: "resolve", label: "Resolving area geometry", state: "pending" },
  { id: "fetch", label: "Fetching criterion layers", state: "pending" },
  { id: "derive", label: "Deriving criteria", state: "pending" },
  { id: "classify", label: "Classifying", state: "pending" },
  { id: "publish", label: "Publishing layers", state: "pending" },
];

function poll(over: Partial<RunStatusResponse> = {}): RunStatusResponse {
  return {
    runId: "r_1",
    topic: "flood-risk",
    status: "running",
    stages: STAGES,
    progress: 0.2,
    startedAt: "2026-09-14T15:04:11Z",
    endedAt: null,
    error: null,
    ...over,
  };
}

const UNREACHABLE: BackendFailure = { kind: "unreachable", message: "ECONNREFUSED" };

/* ---------------------------------------------------------------- R1 ------ */

describe("the first frame", () => {
  it("carries the stage plan from the POST, before any poll", () => {
    const state = initialState("r_1", "queued", STAGES);
    expect(state.stages).toHaveLength(5);
    expect(state.progress).toBe(0);
    expect(state.settled).toBe(false);
  });

  it("takes the progress the caller already read, rather than showing zero", () => {
    // The bug this pins, found by opening a real finished run in a browser: a
    // status read on the server carries `progress`, and ignoring it rendered
    // "0%" beside "10 of 10 stages finished" in the server HTML until the first
    // client poll corrected it. A screen that contradicts itself for two
    // seconds is worse than one that waits.
    const state = initialState("r_1", "succeeded", STAGES, 1);
    expect(state.progress).toBe(1);
  });

  it("clamps a progress it is handed, and defaults to zero after a POST", () => {
    expect(initialState("r_1", "queued", STAGES).progress).toBe(0);
    expect(initialState("r_1", "running", STAGES, 1.5).progress).toBe(1);
    expect(initialState("r_1", "running", STAGES, -1).progress).toBe(0);
    expect(initialState("r_1", "running", STAGES, Number.NaN).progress).toBe(0);
  });

  it("is already settled when the POST reported a cached, finished run", () => {
    // A 200 with cached: true and status succeeded. Polling it would be a
    // request whose answer is known before it is sent.
    const state = initialState("r_1", "succeeded", STAGES);
    expect(state.settled).toBe(true);
    expect(nextDelayMs(state, null)).toBeNull();
  });
});

/* ---------------------------------------------------------------- R2 ------ */

describe("progress is monotonic on screen", () => {
  it("rises with the service", () => {
    let state = initialState("r_1", "queued", STAGES);
    state = advance(state, poll({ progress: 0.28 }));
    expect(state.progress).toBeCloseTo(0.28, 6);
    state = advance(state, poll({ progress: 0.61 }));
    expect(state.progress).toBeCloseTo(0.61, 6);
  });

  it("does not fall when a poll answers out of order", () => {
    let state = initialState("r_1", "queued", STAGES);
    state = advance(state, poll({ progress: 0.61 }));
    state = advance(state, poll({ progress: 0.28 }));
    expect(state.progress).toBeCloseTo(0.61, 6);
  });

  it("clamps a value outside 0..1 instead of rendering it", () => {
    let state = initialState("r_1", "queued", STAGES);
    state = advance(state, poll({ progress: 1.4 }));
    expect(state.progress).toBe(1);
  });

  it("holds the last good value when a poll reports NaN", () => {
    let state = initialState("r_1", "queued", STAGES);
    state = advance(state, poll({ progress: 0.4 }));
    state = advance(state, poll({ progress: Number.NaN }));
    expect(state.progress).toBeCloseTo(0.4, 6);
  });

  it("reports only what the service computed, never a count of finished stages", () => {
    // The service weights its stages; counting them is a different number. With
    // three of five stages done, counting would say 60% over the service's 6%.
    const done: Stage[] = STAGES.map((s, i) =>
      i < 3 ? { ...s, state: "done" as const } : s,
    );
    const state = advance(initialState("r_1", "queued", STAGES), poll({ stages: done, progress: 0.06 }));
    expect(state.progress).toBeCloseTo(0.06, 6);
  });
});

/* ---------------------------------------------------------------- R5 ------ */

describe("polling stops, and is paced by the service", () => {
  it("honours Retry-After", () => {
    const state = advance(initialState("r_1", "queued", STAGES), poll());
    expect(nextDelayMs(state, 2000)).toBe(2000);
    expect(nextDelayMs(state, 10_000)).toBe(10_000);
  });

  it("falls back to its own interval when the header is absent", () => {
    const state = advance(initialState("r_1", "queued", STAGES), poll());
    expect(nextDelayMs(state, null)).toBe(DEFAULT_POLL_MS);
  });

  it("never polls faster than the floor, whatever the service asks for", () => {
    const state = advance(initialState("r_1", "queued", STAGES), poll());
    expect(nextDelayMs(state, 0)).toBe(MIN_POLL_MS);
  });

  it("stops at every terminal status", () => {
    for (const status of ["succeeded", "failed", "cancelled"] as const) {
      const state = advance(initialState("r_1", "queued", STAGES), poll({ status }));
      expect(state.settled).toBe(true);
      expect(nextDelayMs(state, 2000)).toBeNull();
    }
  });

  it("backs off while the service is not answering, and caps", () => {
    let state = advance(initialState("r_1", "queued", STAGES), poll());
    const delays: number[] = [];
    for (let i = 0; i < MAX_CONSECUTIVE_FAILURES; i += 1) {
      state = failed(state, UNREACHABLE);
      const delay = nextDelayMs(state, 2000);
      if (delay !== null) delays.push(delay);
    }
    expect(delays[0]).toBe(4000);
    expect(delays[1]).toBe(8000);
    expect(Math.max(...delays)).toBeLessThanOrEqual(MAX_BACKOFF_MS);
  });

  it("gives up after enough consecutive failures rather than spinning forever", () => {
    let state = advance(initialState("r_1", "queued", STAGES), poll());
    for (let i = 0; i < MAX_CONSECUTIVE_FAILURES; i += 1) state = failed(state, UNREACHABLE);
    expect(gaveUp(state)).toBe(true);
    expect(state.settled).toBe(true);
    expect(nextDelayMs(state, 2000)).toBeNull();
  });
});

/* ---------------------------------------------------------------- R6 ------ */

describe("a silent service is not a failed run", () => {
  it("leaves the run's own status untouched when a poll does not arrive", () => {
    let state = advance(initialState("r_1", "queued", STAGES), poll({ status: "running" }));
    state = failed(state, UNREACHABLE);
    expect(state.status).toBe("running");
    expect(state.error).toBeNull();
    expect(state.transportFailure).toEqual(UNREACHABLE);
  });

  it("clears the transport problem as soon as anything answers", () => {
    let state = advance(initialState("r_1", "queued", STAGES), poll());
    state = failed(state, UNREACHABLE);
    state = advance(state, poll({ progress: 0.5 }));
    expect(state.transportFailure).toBeNull();
    expect(state.consecutiveFailures).toBe(0);
  });

  it("holds a failed run in `error`, which is a different field entirely", () => {
    const state = advance(
      initialState("r_1", "queued", STAGES),
      poll({
        status: "failed",
        error: { stage: "fetch", message: '"TR_Rivers" returned no features.' },
      }),
    );
    expect(state.error?.stage).toBe("fetch");
    expect(state.transportFailure).toBeNull();
    expect(state.settled).toBe(true);
  });
});

/* ------------------------------------------------------------- stages ----- */

describe("the stage list", () => {
  it("names the running stage as current", () => {
    const stages: Stage[] = [
      { id: "resolve", label: "a", state: "done" },
      { id: "fetch", label: "b", state: "running" },
      { id: "classify", label: "c", state: "pending" },
    ];
    expect(currentStage(stages)?.id).toBe("fetch");
  });

  it("names the failed stage when one failed", () => {
    const stages: Stage[] = [
      { id: "resolve", label: "a", state: "done" },
      { id: "fetch", label: "b", state: "failed" },
      { id: "classify", label: "c", state: "pending" },
    ];
    expect(currentStage(stages)?.id).toBe("fetch");
  });

  it("falls to the first unfinished stage between transitions", () => {
    const stages: Stage[] = [
      { id: "resolve", label: "a", state: "done" },
      { id: "fetch", label: "b", state: "pending" },
    ];
    expect(currentStage(stages)?.id).toBe("fetch");
  });

  it("counts skipped as finished, because it will not run", () => {
    const stages: Stage[] = [
      { id: "a", label: "a", state: "done" },
      { id: "b", label: "b", state: "skipped" },
      { id: "c", label: "c", state: "running" },
    ];
    expect(finishedCount(stages)).toBe(2);
  });

  it("has nothing to name for an empty plan", () => {
    expect(currentStage([])).toBeNull();
  });
});
