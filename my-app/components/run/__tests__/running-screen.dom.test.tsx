/**
 * Gate tests for the running screen.
 *
 * The `.dom.` infix is load-bearing, not a naming habit. vitest.config.mts puts
 * every `*.dom.*` suite in the jsdom lane and runs the node lane with
 * `isolate: false`, one worker shared across files; a suite that installs a
 * global and is not named for the dom lane leaks into the pure suites beside it
 * and fails something unrelated, in a different file, depending on execution
 * order. This one overrides `document.visibilityState`, so it belongs here
 * twice over.
 *
 * Everything is driven by fake timers and an injected `poll`. No network, no
 * mocking library, no router. That is what the `poll` and `onSucceeded` props
 * are for, and it is what keeps the whole file inside the gate lane's 2s
 * per-test budget: the real screen waits two seconds between polls and gives up
 * after ninety, both of which happen here in microseconds.
 *
 * Queries are by role and accessible name. The one place that is not possible
 * is a stage row: the `listitem` role takes no name from its contents, so the
 * rows are fetched by role and then asserted on their text. Never by class.
 */

import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import type { Route } from "next";
import RunningScreen from "@/components/run/RunningScreen";
import { MAX_CONSECUTIVE_FAILURES } from "@/services/backend-api";
import type {
  BackendResult,
  RunStatusResponse,
  Stage,
} from "@/services/backend-api";
import { TOPICS } from "@/services/analysis/topics";

/* ------------------------------------------------------------- fixtures */

const TOPIC = TOPICS[0];
const RUN_ID = "r_8f3c21a9c4e1";
const RESULT_HREF = "/topics/flood-risk/results?run=r_8f3c21a9c4e1" as Route;
const REVIEW_HREF = "/topics/flood-risk/review" as Route;

/**
 * The plan the POST returns. `publish` is skipped from the start, which is the
 * normal state for a run with `publishLayers: false` and the row R3 is about.
 */
const PLAN: readonly Stage[] = [
  { id: "resolve", label: "Resolving area geometry", state: "pending" },
  { id: "fetch", label: "Fetching criterion layers", state: "pending" },
  { id: "overlay", label: "Computing the weighted overlay", state: "pending" },
  { id: "classify", label: "Classifying with Jenks breaks", state: "pending" },
  { id: "publish", label: "Publishing layers to GeoServer", state: "skipped" },
];

function stages(states: Partial<Record<string, Stage["state"]>>): Stage[] {
  return PLAN.map((stage) => ({ ...stage, state: states[stage.id] ?? stage.state }));
}

function answered(
  body: Partial<RunStatusResponse>,
): BackendResult<RunStatusResponse> {
  return {
    ok: true,
    status: 200,
    retryAfterMs: 2_000,
    data: {
      runId: RUN_ID,
      topic: TOPIC.slug,
      status: "running",
      stages: [...PLAN],
      progress: 0,
      ...body,
    },
  };
}

const UNREACHABLE: BackendResult<RunStatusResponse> = {
  ok: false,
  failure: { kind: "unreachable", message: "fetch failed" },
};

/** A queue of answers, one per poll, the last one repeating forever. */
function queued(...answers: BackendResult<RunStatusResponse>[]) {
  let i = 0;
  const calls: string[] = [];
  const poll = (runId: string) => {
    calls.push(runId);
    const answer = answers[Math.min(i, answers.length - 1)];
    i += 1;
    return Promise.resolve(answer);
  };
  return { poll, calls };
}

function renderScreen(
  overrides: Partial<ComponentProps<typeof RunningScreen>> = {},
) {
  const onSucceeded = vi.fn();
  const utils = render(
    <RunningScreen
      topic={TOPIC}
      runId={RUN_ID}
      initialStatus="queued"
      initialStages={PLAN}
      resultHref={RESULT_HREF}
      reviewHref={REVIEW_HREF}
      poll={() => new Promise(() => {})}
      onSucceeded={onSucceeded}
      {...overrides}
    />,
  );
  return { ...utils, onSucceeded };
}

/** Run the clock, flushing the promises each timer fires. */
async function tick(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function setVisibility(value: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => value,
  });
  fireEvent(document, new Event("visibilitychange"));
}

function rowText(): string[] {
  return screen.getAllByRole("listitem").map((li) => li.textContent ?? "");
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  setVisibility("visible");
  vi.useRealTimers();
});

/* ------------------------------------------------------------------ R1 */

describe("the stage list is there before the first poll (R1)", () => {
  it("renders every planned stage on the first frame", () => {
    // poll never resolves, so nothing on screen can have come from one.
    renderScreen();

    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(PLAN.length);
    for (const stage of PLAN) {
      expect(screen.getByText(stage.label)).toBeInTheDocument();
    }
  });

  it("shows a progress bar at zero rather than an undifferentiated spinner", () => {
    renderScreen();

    const bar = screen.getByRole("progressbar", { name: /analysis progress/i });
    expect(bar).toHaveAttribute("aria-valuenow", "0");
    expect(bar).toHaveAttribute("aria-valuemin", "0");
    expect(bar).toHaveAttribute("aria-valuemax", "100");
  });
});

/* ------------------------------------------------------------------ R3 */

describe("stage states (R3)", () => {
  it("keeps a skipped stage in the list, labelled skipped", () => {
    renderScreen();

    const rows = screen.getAllByRole("listitem");
    const publish = rows.find((li) =>
      li.textContent?.includes("Publishing layers to GeoServer"),
    );
    expect(publish).toBeDefined();
    expect(publish).toHaveTextContent(/skipped/i);
  });

  it("renders all five states distinctly, and the skipped row survives a poll", async () => {
    const { poll } = queued(
      answered({
        status: "running",
        progress: 0.4,
        stages: stages({
          resolve: "done",
          fetch: "running",
          overlay: "pending",
          classify: "failed",
        }),
      }),
    );
    renderScreen({ poll });
    const before = rowText().length;

    await tick(2_000);

    const after = rowText();
    // Same rows, same order, nothing dropped or inserted.
    expect(after).toHaveLength(before);
    expect(after[0]).toMatch(/Resolving area geometry[\s\S]*Done/);
    expect(after[1]).toMatch(/Fetching criterion layers[\s\S]*Running/);
    expect(after[2]).toMatch(/Computing the weighted overlay[\s\S]*Pending/);
    expect(after[3]).toMatch(/Classifying with Jenks breaks[\s\S]*Failed/);
    expect(after[4]).toMatch(/Publishing layers to GeoServer[\s\S]*Skipped/);
  });

  it("holds the plan's order even when a poll omits a stage", async () => {
    const { poll } = queued(
      answered({
        status: "running",
        progress: 0.2,
        // The service dropped `publish` and reordered the rest. The list must
        // not reflow because of it.
        stages: [
          { id: "fetch", label: "Fetching criterion layers", state: "running" },
          { id: "resolve", label: "Resolving area geometry", state: "done" },
        ],
      }),
    );
    renderScreen({ poll });

    await tick(2_000);

    const rows = rowText();
    expect(rows).toHaveLength(PLAN.length);
    expect(rows[0]).toMatch(/Resolving area geometry/);
    expect(rows[4]).toMatch(/Publishing layers to GeoServer[\s\S]*Skipped/);
  });
});

/* ------------------------------------------------------------------ R2 */

describe("progress (R2)", () => {
  it("moves with the service and never backwards", async () => {
    const { poll } = queued(
      answered({ progress: 0.62 }),
      answered({ progress: 0.11 }),
      answered({ progress: 0.62 }),
    );
    renderScreen({ poll });

    await tick(2_000);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "62");

    // A poll reporting less does not drag the bar back.
    await tick(2_000);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "62");
  });
});

/* ------------------------------------------------------------------ R4 */

describe("a failed run (R4)", () => {
  it("names the failing stage and its message, with a way back to review", async () => {
    const { poll } = queued(
      answered({
        status: "failed",
        progress: 0.35,
        stages: stages({ resolve: "done", fetch: "failed" }),
        error: { stage: "fetch", message: "GeoServer returned a ServiceException." },
      }),
    );
    renderScreen({ poll });

    await tick(2_000);

    const panel = screen.getByRole("region", { name: /the run failed at/i });
    expect(panel).toHaveTextContent(/Fetching criterion layers/);
    expect(panel).toHaveTextContent(/GeoServer returned a ServiceException\./);
    expect(
      within(panel).getByRole("link", { name: /back to review/i }),
    ).toHaveAttribute("href", REVIEW_HREF);
  });

  it("stops polling once the run is terminal", async () => {
    const { poll, calls } = queued(
      answered({
        status: "failed",
        error: { stage: "fetch", message: "boom" },
      }),
    );
    renderScreen({ poll });

    await tick(2_000);
    expect(calls).toHaveLength(1);

    await tick(60_000);
    expect(calls).toHaveLength(1);
  });
});

/* ------------------------------------------------------------------ R6 */

describe("an unreachable service is not a failed run (R6)", () => {
  it("uses the transport copy and none of the run-failure copy", async () => {
    const { poll } = queued(UNREACHABLE);
    renderScreen({ poll });

    await tick(2_000);

    const panel = screen.getByRole("region", {
      name: /waiting for the analysis service/i,
    });
    expect(panel).toHaveTextContent(/The analysis service did not answer\./);
    // The distinguishing sentence, in as many words.
    expect(panel).toHaveTextContent(/the run has not failed/i);

    expect(
      screen.queryByRole("region", { name: /the run failed/i }),
    ).not.toBeInTheDocument();
  });

  it("reads differently from a run that failed", async () => {
    const failing = queued(
      answered({
        status: "failed",
        error: { stage: "fetch", message: "Invalid geometry." },
      }),
    );
    const { unmount } = renderScreen({ poll: failing.poll });
    await tick(2_000);
    const failedCopy = screen.getByRole("region", { name: /the run failed at/i })
      .textContent;
    unmount();

    const quiet = queued(UNREACHABLE);
    renderScreen({ poll: quiet.poll });
    await tick(2_000);
    const transportCopy = screen.getByRole("region", {
      name: /waiting for the analysis service/i,
    }).textContent;

    expect(failedCopy).not.toEqual(transportCopy);
    expect(failedCopy).toMatch(/so it is reachable/i);
    expect(transportCopy).toMatch(/did not answer/i);
  });

  it("gives up after the machine's limit and offers a retry that resumes", async () => {
    const answers: BackendResult<RunStatusResponse>[] = [
      ...Array.from({ length: MAX_CONSECUTIVE_FAILURES }, () => UNREACHABLE),
      answered({ status: "succeeded", progress: 1 }),
    ];
    const { poll, calls } = queued(...answers);
    const { onSucceeded } = renderScreen({ poll });

    // One tick per poll rather than one long advance. The next timeout is
    // scheduled by the effect that runs after React commits the folded state,
    // which lands after `advanceTimersByTimeAsync` has already finished moving
    // the clock, so a single long advance fires exactly one timer. 30s clears
    // the backoff ceiling, so each tick is guaranteed to cover the next wait.
    for (let i = 0; i < MAX_CONSECUTIVE_FAILURES; i += 1) await tick(30_000);
    expect(calls).toHaveLength(MAX_CONSECUTIVE_FAILURES);
    expect(
      screen.getByRole("region", { name: /lost contact with the analysis service/i }),
    ).toBeInTheDocument();

    const retry = screen.getByRole("button", { name: /try again/i });
    await act(async () => {
      fireEvent.click(retry);
    });
    await tick(2_000);

    expect(calls.length).toBeGreaterThan(MAX_CONSECUTIVE_FAILURES);
    expect(onSucceeded).toHaveBeenCalledWith(RESULT_HREF);
  });
});

/* ------------------------------------------------------------------ R5 */

describe("the timer (R5)", () => {
  it("pauses while the tab is hidden and resumes on visibilitychange", async () => {
    const { poll, calls } = queued(answered({ progress: 0.1 }));
    renderScreen({ poll });

    act(() => setVisibility("hidden"));
    await tick(60_000);
    expect(calls).toHaveLength(0);

    act(() => setVisibility("visible"));
    await tick(2_000);
    expect(calls).toHaveLength(1);
  });

  it("clears its timer on unmount", async () => {
    const { poll, calls } = queued(answered({ progress: 0.1 }));
    const { unmount } = renderScreen({ poll });

    unmount();
    await tick(60_000);
    expect(calls).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ R8 */

describe("success", () => {
  it("calls onSucceeded with the result href when the run finishes", async () => {
    const { poll } = queued(
      answered({ progress: 0.5 }),
      answered({ status: "succeeded", progress: 1 }),
    );
    const { onSucceeded } = renderScreen({ poll });

    await tick(2_000);
    expect(onSucceeded).not.toHaveBeenCalled();

    await tick(2_000);
    expect(onSucceeded).toHaveBeenCalledExactlyOnceWith(RESULT_HREF);
  });

  it("goes straight to the result without polling when the run is already succeeded (R8)", async () => {
    const { poll, calls } = queued(answered({ status: "succeeded", progress: 1 }));
    const { onSucceeded } = renderScreen({
      poll,
      initialStatus: "succeeded",
      initialStages: stages({
        resolve: "done",
        fetch: "done",
        overlay: "done",
        classify: "done",
      }),
    });

    expect(onSucceeded).toHaveBeenCalledExactlyOnceWith(RESULT_HREF);

    await tick(60_000);
    expect(calls).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ R9 */

describe("the live region (R9)", () => {
  it("announces the stage label, not the percentage", async () => {
    const { poll } = queued(
      answered({ progress: 0.28, stages: stages({ resolve: "done", fetch: "running" }) }),
    );
    renderScreen({ poll });

    await tick(2_000);

    const region = screen.getByTestId("run-announcement");
    expect(region).toHaveAttribute("aria-live", "polite");
    expect(region).toHaveTextContent("Fetching criterion layers");
    expect(region).not.toHaveTextContent("28");
    expect(region).not.toHaveTextContent("%");
  });

  it("does not change when only the percentage moves", async () => {
    const running = stages({ resolve: "done", fetch: "running" });
    const { poll } = queued(
      answered({ progress: 0.28, stages: running }),
      answered({ progress: 0.44, stages: running }),
    );
    renderScreen({ poll });

    await tick(2_000);
    const first = screen.getByTestId("run-announcement").textContent;

    await tick(2_000);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "44");
    expect(screen.getByTestId("run-announcement").textContent).toBe(first);
  });

  it("announces the failing stage when the run fails", async () => {
    const { poll } = queued(
      answered({
        status: "failed",
        stages: stages({ resolve: "done", fetch: "failed" }),
        error: { stage: "fetch", message: "GeoServer went away." },
      }),
    );
    renderScreen({ poll });

    await tick(2_000);
    expect(screen.getByTestId("run-announcement")).toHaveTextContent(
      "The run failed at Fetching criterion layers.",
    );
  });
});
