import { describe, expect, it } from "vitest";
import {
  type PreAnalysisState,
  defaultWindow,
  initialPreAnalysisState,
  isIsoDate,
  preAnalysisReducer,
  selectedFormulas,
  windowDays,
} from "@/services/preanalysis/state";
import { formulasForTopic } from "@/services/analysis/formulas";
import { draftAreaFromGeometry } from "@/services/analysis/selection";

const TOPIC = "drought-monitoring" as const;
const TODAY = "2025-06-17";

/** Shorthand: run one action against a state for the drought topic. */
const step = (state: PreAnalysisState, action: Parameters<typeof preAnalysisReducer>[2]) =>
  preAnalysisReducer(TOPIC, state, action);

const fresh = () => initialPreAnalysisState(TOPIC, TODAY);

describe("isIsoDate", () => {
  it("accepts a real yyyy-mm-dd date", () => {
    expect(isIsoDate("2024-01-01")).toBe(true);
    expect(isIsoDate("2024-02-29")).toBe(true); // leap year
  });

  it("rejects a date that rolls over", () => {
    // Date.parse accepts this and silently returns 1 March. Letting it through
    // would compute the window length from a date the analyst never chose.
    expect(isIsoDate("2023-02-29")).toBe(false);
    expect(isIsoDate("2024-13-01")).toBe(false);
    expect(isIsoDate("2024-04-31")).toBe(false);
  });

  it("rejects anything not zero-padded yyyy-mm-dd", () => {
    expect(isIsoDate("2024-1-1")).toBe(false);
    expect(isIsoDate("01/01/2024")).toBe(false);
    expect(isIsoDate("2024-01-01T00:00:00Z")).toBe(false);
    expect(isIsoDate("")).toBe(false);
  });
});

describe("windowDays", () => {
  it("counts both ends", () => {
    expect(windowDays({ start: "2024-01-01", end: "2024-01-01" })).toBe(1);
    expect(windowDays({ start: "2024-01-01", end: "2024-01-31" })).toBe(31);
  });

  it("spans a leap day", () => {
    expect(windowDays({ start: "2024-02-28", end: "2024-03-01" })).toBe(3);
  });

  it("is NaN when either end is not a date", () => {
    expect(windowDays({ start: "nope", end: "2024-01-31" })).toBeNaN();
    expect(windowDays({ start: "2024-01-01", end: "2023-02-29" })).toBeNaN();
  });

  it("is not thrown off by a daylight saving boundary", () => {
    // Computed in UTC on purpose. A local-time subtraction would return 364 or
    // 366 here depending on the machine's zone.
    expect(windowDays({ start: "2024-03-01", end: "2025-02-28" })).toBe(365);
  });
});

describe("defaultWindow", () => {
  it("ends on the last day of the month before today", () => {
    // EO composites land days to weeks late, so a window ending today ends in
    // a gap the analyst reads as missing data.
    expect(defaultWindow("2025-06-17").end).toBe("2025-05-31");
    expect(defaultWindow("2025-01-04").end).toBe("2024-12-31");
    expect(defaultWindow("2024-03-31").end).toBe("2024-02-29");
  });

  it("covers exactly twelve complete months", () => {
    // Pinned, not a range. The first version of this returned thirteen months
    // (396 days) and a 365..367 assertion was the only thing that caught it;
    // an exact expectation says what the function is for.
    expect(defaultWindow("2025-06-17")).toEqual({
      start: "2024-06-01",
      end: "2025-05-31",
    });
    expect(defaultWindow("2025-01-04")).toEqual({
      start: "2024-01-01",
      end: "2024-12-31",
    });
    expect(defaultWindow("2024-03-31")).toEqual({
      start: "2023-03-01",
      end: "2024-02-29",
    });
  });

  it("spans one year of days, never thirteen months", () => {
    for (const today of ["2025-06-17", "2025-01-04", "2024-03-31", "2026-12-31"]) {
      const days = windowDays(defaultWindow(today));
      expect(days, today).toBeGreaterThanOrEqual(365);
      expect(days, today).toBeLessThanOrEqual(366);
    }
  });

  it("starts on the first of a month and ends on the last of one", () => {
    for (const today of ["2025-06-17", "2025-01-04", "2024-03-31", "2026-02-15"]) {
      const w = defaultWindow(today);
      expect(w.start.endsWith("-01"), today).toBe(true);
      // The day after the end must be the first of the next month.
      const next = new Date(Date.parse(`${w.end}T00:00:00Z`) + 86_400_000);
      expect(next.toISOString().slice(8, 10), today).toBe("01");
    }
  });

  it("is pure: the same today gives the same window", () => {
    expect(defaultWindow("2025-06-17")).toEqual(defaultWindow("2025-06-17"));
  });

  it("produces two real ISO dates", () => {
    const w = defaultWindow("2025-06-17");
    expect(isIsoDate(w.start)).toBe(true);
    expect(isIsoDate(w.end)).toBe(true);
    expect(w.start < w.end).toBe(true);
  });
});

describe("initialPreAnalysisState", () => {
  it("opens with formulas already chosen, never an empty required control", () => {
    const state = fresh();
    expect(state.formulaIds.length).toBeGreaterThan(0);
  });

  it("only seeds formulas the topic actually offers", () => {
    const offered = formulasForTopic(TOPIC).map((f) => f.id);
    for (const id of fresh().formulaIds) expect(offered).toContain(id);
  });

  it("starts with no areas selected", () => {
    expect(fresh().selection.areas).toEqual([]);
  });
});

describe("toggleFormula", () => {
  it("adds one that is not selected", () => {
    const offered = formulasForTopic(TOPIC).map((f) => f.id);
    const state = fresh();
    const missing = offered.find((id) => !state.formulaIds.includes(id));
    expect(missing).toBeDefined();
    if (missing === undefined) return;

    const next = step(state, { type: "toggleFormula", formulaId: missing });
    expect(next.formulaIds).toContain(missing);
  });

  it("appends rather than reordering, because the order is the analyst's", () => {
    const offered = formulasForTopic(TOPIC).map((f) => f.id);
    const state = fresh();
    const missing = offered.find((id) => !state.formulaIds.includes(id));
    if (missing === undefined) return;

    const next = step(state, { type: "toggleFormula", formulaId: missing });
    expect(next.formulaIds.at(-1)).toBe(missing);
    expect(next.formulaIds.slice(0, -1)).toEqual(state.formulaIds);
  });

  it("removes one that is selected, when it is not the last", () => {
    const offered = formulasForTopic(TOPIC).map((f) => f.id);
    let state = fresh();
    // Guarantee at least two are selected.
    for (const id of offered) {
      if (!state.formulaIds.includes(id)) {
        state = step(state, { type: "toggleFormula", formulaId: id });
      }
      if (state.formulaIds.length >= 2) break;
    }

    const victim = state.formulaIds[0];
    const next = step(state, { type: "toggleFormula", formulaId: victim });
    expect(next.formulaIds).not.toContain(victim);
  });

  it("refuses to remove the last formula", () => {
    // A form that lets you empty a required control and only then complains is
    // the failure this branch exists to prevent.
    let state = fresh();
    while (state.formulaIds.length > 1) {
      state = step(state, {
        type: "toggleFormula",
        formulaId: state.formulaIds[0],
      });
    }
    const only = state.formulaIds[0];
    const next = step(state, { type: "toggleFormula", formulaId: only });
    expect(next).toBe(state);
    expect(next.formulaIds).toEqual([only]);
  });

  it("ignores a formula this topic does not offer", () => {
    const offered = new Set(formulasForTopic(TOPIC).map((f) => f.id));
    const foreign = formulasForTopic("rangeland-dynamics").find(
      (f) => !offered.has(f.id),
    );
    expect(foreign).toBeDefined();
    if (foreign === undefined) return;

    const state = fresh();
    expect(step(state, { type: "toggleFormula", formulaId: foreign.id })).toBe(
      state,
    );
  });
});

describe("setFormulas", () => {
  it("keeps only what the topic offers", () => {
    const offered = formulasForTopic(TOPIC).map((f) => f.id);
    const foreign = formulasForTopic("rangeland-dynamics").find(
      (f) => !offered.includes(f.id),
    );
    if (foreign === undefined) return;

    const next = step(fresh(), {
      type: "setFormulas",
      formulaIds: [offered[0], foreign.id],
    });
    expect(next.formulaIds).toEqual([offered[0]]);
  });

  it("drops duplicates but keeps the caller's order", () => {
    const offered = formulasForTopic(TOPIC).map((f) => f.id);
    const next = step(fresh(), {
      type: "setFormulas",
      formulaIds: [offered[1], offered[0], offered[1]],
    });
    expect(next.formulaIds).toEqual([offered[1], offered[0]]);
  });

  it("refuses an empty result and leaves the previous selection standing", () => {
    const state = fresh();
    expect(step(state, { type: "setFormulas", formulaIds: [] })).toBe(state);
  });
});

describe("the date window", () => {
  it("sets each end independently", () => {
    let state = fresh();
    state = step(state, { type: "setWindowStart", date: "2020-01-01" });
    expect(state.dateWindow.start).toBe("2020-01-01");
    state = step(state, { type: "setWindowEnd", date: "2020-12-31" });
    expect(state.dateWindow).toEqual({ start: "2020-01-01", end: "2020-12-31" });
  });

  it("returns the same object when nothing changes", () => {
    // Identity matters: the page renders from this and a new object every
    // keystroke would re-render the map subtree for nothing.
    const state = fresh();
    expect(step(state, { type: "setWindowStart", date: state.dateWindow.start })).toBe(
      state,
    );
  });

  it("stores an invalid date rather than silently correcting it", () => {
    // A half-typed date is a normal intermediate state. Rejecting it here would
    // fight the user's keyboard; it is the run validation that refuses it.
    const next = step(fresh(), { type: "setWindowStart", date: "2024-0" });
    expect(next.dateWindow.start).toBe("2024-0");
  });
});

describe("area actions are forwarded to the selection machine", () => {
  const draft = () =>
    draftAreaFromGeometry(
      { type: "Point", coordinates: [36.8, -1.3] },
      "point",
      "Point -1.300, 36.800",
    );

  it("adds an area through the composed reducer", () => {
    const d = draft();
    expect(d).not.toBeNull();
    if (d === null) return;

    const next = step(fresh(), {
      type: "selection",
      action: { type: "addAreas", areas: [d] },
    });
    expect(next.selection.areas).toHaveLength(1);
  });

  it("keeps the area rules where they already live", () => {
    // Single-location caps at one area: adding a second replaces the first.
    // That rule is selection.ts's and must not be duplicated here.
    const d = draft();
    if (d === null) return;
    let state = fresh();
    state = step(state, { type: "selection", action: { type: "addAreas", areas: [d] } });
    state = step(state, { type: "selection", action: { type: "addAreas", areas: [d] } });
    expect(state.selection.areas).toHaveLength(1);
  });

  it("returns the same state object when the inner reducer no-ops", () => {
    const state = fresh();
    expect(
      step(state, { type: "selection", action: { type: "addAreas", areas: [] } }),
    ).toBe(state);
  });
});

describe("selectedFormulas", () => {
  it("returns registry entries in the analyst's order", () => {
    const offered = formulasForTopic(TOPIC).map((f) => f.id);
    const state = step(fresh(), {
      type: "setFormulas",
      formulaIds: [offered[1], offered[0]],
    });
    expect(selectedFormulas(state).map((f) => f.id)).toEqual([
      offered[1],
      offered[0],
    ]);
  });

  it("drops an unknown id rather than rendering a bare slug", () => {
    // A slug printed next to a number reads as a data quality problem.
    const state: PreAnalysisState = {
      ...fresh(),
      formulaIds: ["not-a-formula" as never],
    };
    expect(selectedFormulas(state)).toEqual([]);
  });

  it("carries the arithmetic the results page has to show", () => {
    for (const formula of selectedFormulas(fresh())) {
      expect(formula.expression.length).toBeGreaterThan(0);
      expect(formula.inputs.length).toBeGreaterThan(0);
    }
  });
});
