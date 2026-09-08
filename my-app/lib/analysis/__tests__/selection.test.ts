import { describe, expect, it } from "vitest";
import {
  type DraftArea,
  type SelectionState,
  draftAreaFromGeometry,
  initialSelectionState,
  selectionReducer,
  switchWouldDrop,
} from "@/lib/analysis/selection";
import { getAnalysisType } from "@/lib/analysis/models";

/** A named square area, one degree on a side, offset so each one is distinct. */
function box(label: string, west: number, south: number): DraftArea {
  const draft = draftAreaFromGeometry(
    {
      type: "Polygon",
      coordinates: [
        [
          [west, south],
          [west + 1, south],
          [west + 1, south + 1],
          [west, south + 1],
          [west, south],
        ],
      ],
    },
    "drawn",
    label,
  );
  if (draft === null) throw new Error("fixture geometry produced no bounds");
  return draft;
}

function point(label: string, lng: number, lat: number): DraftArea {
  const draft = draftAreaFromGeometry(
    { type: "Point", coordinates: [lng, lat] },
    "point",
    label,
  );
  if (draft === null) throw new Error("fixture point produced no bounds");
  return draft;
}

/** Reduce a list of actions from the initial state. */
function run(
  ...actions: Parameters<typeof selectionReducer>[1][]
): SelectionState {
  return actions.reduce(selectionReducer, initialSelectionState);
}

const comparison = { type: "setAnalysisType", analysisType: "comparison" } as const;

describe("draftAreaFromGeometry", () => {
  it("computes bounds and area for a polygon", () => {
    const draft = box("Block", 30, 0);
    expect(draft.bounds).toEqual([
      [0, 30],
      [1, 31],
    ]);
    expect(draft.areaKm2).toBeGreaterThan(12000);
    expect(draft.feature.type).toBe("Feature");
  });

  it("gives a point no area rather than zero", () => {
    expect(point("Pin", 36.8, -1.29).areaKm2).toBeNull();
  });

  it("returns null for geometry with no usable coordinates", () => {
    expect(
      draftAreaFromGeometry({ type: "Polygon", coordinates: [] }, "drawn", "x"),
    ).toBeNull();
  });

  it("carries attribute properties through onto the feature", () => {
    const draft = draftAreaFromGeometry(
      { type: "Point", coordinates: [1, 1] },
      "shapefile",
      "Wajir",
      { NAME: "Wajir", pop: 700000 },
    );
    expect(draft?.feature.properties).toEqual({ NAME: "Wajir", pop: 700000 });
  });
});

describe("initial state", () => {
  it("starts on single location with random forest and nothing selected", () => {
    expect(initialSelectionState.analysisType).toBe("single");
    expect(initialSelectionState.modelId).toBe("random-forest");
    expect(initialSelectionState.areas).toEqual([]);
    expect(initialSelectionState.focus).toBeNull();
    expect(initialSelectionState.notice).toBeNull();
  });
});

describe("adding areas", () => {
  it("stamps monotonic ids so React keys are stable and unique", () => {
    const state = run(
      comparison,
      { type: "addAreas", areas: [box("A", 30, 0)] },
      { type: "addAreas", areas: [box("B", 32, 0), box("C", 34, 0)] },
    );
    expect(state.areas.map((a) => a.id)).toEqual(["aoi-1", "aoi-2", "aoi-3"]);
  });

  it("does not reuse an id after a removal", () => {
    // Reusing "aoi-2" would make React reconcile a new area onto the old row.
    const state = run(
      comparison,
      { type: "addAreas", areas: [box("A", 30, 0), box("B", 32, 0)] },
      { type: "removeArea", id: "aoi-2" },
      { type: "addAreas", areas: [box("C", 34, 0)] },
    );
    expect(state.areas.map((a) => a.id)).toEqual(["aoi-1", "aoi-3"]);
  });

  it("requests a zoom covering everything just added", () => {
    const state = run(
      comparison,
      { type: "addAreas", areas: [box("A", 30, 0), box("B", 34, 5)] },
    );
    expect(state.focus).not.toBeNull();
    // The union spans 30..35 east and 0..6 north, before padding.
    expect(state.focus?.bounds[0][0]).toBeLessThanOrEqual(0);
    expect(state.focus?.bounds[0][1]).toBeLessThanOrEqual(30);
    expect(state.focus?.bounds[1][0]).toBeGreaterThanOrEqual(6);
    expect(state.focus?.bounds[1][1]).toBeGreaterThanOrEqual(35);
  });

  it("pads a clicked point so the zoom does not slam to max", () => {
    const state = run({ type: "addAreas", areas: [point("Pin", 38, 2.3)] });
    const bounds = state.focus?.bounds;
    expect(bounds).toBeDefined();
    // A zero-area box would zoom to street level; padding must widen it.
    expect((bounds as number[][])[1][0]).toBeGreaterThan(
      (bounds as number[][])[0][0],
    );
  });

  it("ignores an empty add rather than firing a pointless zoom", () => {
    const state = run({ type: "addAreas", areas: [] });
    expect(state).toBe(initialSelectionState);
  });
});

describe("single location replaces rather than accumulates", () => {
  it("swaps the area when a second one is clicked", () => {
    const state = run(
      { type: "addAreas", areas: [point("First", 38, 2)] },
      { type: "addAreas", areas: [point("Second", 36, 1)] },
    );
    expect(state.areas).toHaveLength(1);
    expect(state.areas[0].label).toBe("Second");
    // A replacement is normal map behaviour, not an error worth a notice.
    expect(state.notice).toBeNull();
  });

  it("takes only the first feature when a multi-feature shapefile arrives", () => {
    const state = run({
      type: "addAreas",
      areas: [box("A", 30, 0), box("B", 32, 0), box("C", 34, 0)],
    });
    expect(state.areas).toHaveLength(1);
    expect(state.areas[0].label).toBe("A");
    expect(state.notice).toMatch(/Added 1 of 3/);
    expect(state.notice).toMatch(/2 skipped/);
  });
});

describe("comparison caps the selection", () => {
  const cap = getAnalysisType("comparison").maxAreas;

  it("accepts up to the cap", () => {
    const many = Array.from({ length: cap }, (_, i) => box(`A${i}`, i, 0));
    const state = run(comparison, { type: "addAreas", areas: many });
    expect(state.areas).toHaveLength(cap);
    expect(state.notice).toBeNull();
  });

  it("truncates a bulk add at the cap and says how many were skipped", () => {
    const many = Array.from({ length: cap + 3 }, (_, i) => box(`A${i}`, i, 0));
    const state = run(comparison, { type: "addAreas", areas: many });
    expect(state.areas).toHaveLength(cap);
    expect(state.notice).toMatch(new RegExp(`Added ${cap} of ${cap + 3}`));
    expect(state.notice).toMatch(/3 skipped/);
  });

  it("refuses a further add once full, and keeps what is already there", () => {
    const many = Array.from({ length: cap }, (_, i) => box(`A${i}`, i, 0));
    const full = run(comparison, { type: "addAreas", areas: many });
    const after = selectionReducer(full, {
      type: "addAreas",
      areas: [box("One more", 99, 0)],
    });

    expect(after.areas).toHaveLength(cap);
    expect(after.areas.map((a) => a.label)).toEqual(
      full.areas.map((a) => a.label),
    );
    expect(after.notice).toMatch(/Remove one before adding another/);
    // A refused add must not move the map.
    expect(after.focus).toEqual(full.focus);
  });
});

describe("switching analysis type", () => {
  it("keeps the most recent area and reports the drop, going to single", () => {
    const state = run(
      comparison,
      { type: "addAreas", areas: [box("Old", 30, 0), box("Newer", 32, 0)] },
      { type: "setAnalysisType", analysisType: "single" },
    );

    expect(state.analysisType).toBe("single");
    expect(state.areas).toHaveLength(1);
    expect(state.areas[0].label).toBe("Newer");
    // The user is told what happened and what survived. This is the whole
    // point of the branch: no silent data loss.
    expect(state.notice).toMatch(/1 earlier area was removed/);
    expect(state.notice).toMatch(/Kept "Newer"/);
  });

  it("reports the plural correctly when several are dropped", () => {
    const state = run(
      comparison,
      {
        type: "addAreas",
        areas: [box("A", 30, 0), box("B", 32, 0), box("C", 34, 0)],
      },
      { type: "setAnalysisType", analysisType: "single" },
    );
    expect(state.areas).toHaveLength(1);
    expect(state.notice).toMatch(/2 earlier areas were removed/);
  });

  it("drops nothing when the selection already fits", () => {
    const state = run(
      { type: "addAreas", areas: [box("Only", 30, 0)] },
      comparison,
    );
    expect(state.areas).toHaveLength(1);
    expect(state.notice).toBeNull();
  });

  it("is a no-op when the type is already selected", () => {
    const before = run(comparison, {
      type: "addAreas",
      areas: [box("A", 30, 0), box("B", 32, 0)],
    });
    expect(selectionReducer(before, comparison)).toBe(before);
  });

  it("switchWouldDrop lets the UI warn before the click", () => {
    const two = run(comparison, {
      type: "addAreas",
      areas: [box("A", 30, 0), box("B", 32, 0)],
    });
    expect(switchWouldDrop(two, "single")).toBe(1);
    expect(switchWouldDrop(two, "comparison")).toBe(0);
    expect(switchWouldDrop(initialSelectionState, "single")).toBe(0);
  });
});

describe("removing and clearing", () => {
  it("removes by id and leaves the rest alone", () => {
    const state = run(
      comparison,
      {
        type: "addAreas",
        areas: [box("A", 30, 0), box("B", 32, 0), box("C", 34, 0)],
      },
      { type: "removeArea", id: "aoi-2" },
    );
    expect(state.areas.map((a) => a.label)).toEqual(["A", "C"]);
  });

  it("ignores a removal for an id that is not selected", () => {
    const before = run(comparison, { type: "addAreas", areas: [box("A", 30, 0)] });
    expect(selectionReducer(before, { type: "removeArea", id: "nope" })).toBe(
      before,
    );
  });

  it("clears everything and stops asking the map to move", () => {
    const state = run(
      comparison,
      { type: "addAreas", areas: [box("A", 30, 0)] },
      { type: "clearAreas" },
    );
    expect(state.areas).toEqual([]);
    expect(state.focus).toBeNull();
  });

  it("is a no-op when clearing an empty selection", () => {
    expect(selectionReducer(initialSelectionState, { type: "clearAreas" })).toBe(
      initialSelectionState,
    );
  });
});

describe("focus tokens", () => {
  it("re-fires the zoom when the same area is focused twice", () => {
    // A bounds-only focus value would compare equal on the second click and the
    // map effect would not run, so re-clicking a listed area would do nothing.
    const withArea = run(comparison, {
      type: "addAreas",
      areas: [box("A", 30, 0)],
    });
    const once = selectionReducer(withArea, { type: "focusArea", id: "aoi-1" });
    const twice = selectionReducer(once, { type: "focusArea", id: "aoi-1" });

    expect(once.focus?.bounds).toEqual(twice.focus?.bounds);
    expect(twice.focus?.token).toBeGreaterThan(once.focus?.token as number);
  });

  it("ignores a focus request for an unknown id", () => {
    const before = run(comparison, { type: "addAreas", areas: [box("A", 30, 0)] });
    expect(selectionReducer(before, { type: "focusArea", id: "ghost" })).toBe(
      before,
    );
  });

  it("focusAll covers every selected area", () => {
    const state = run(
      comparison,
      { type: "addAreas", areas: [box("A", 30, 0)] },
      { type: "addAreas", areas: [box("B", 40, 10)] },
      { type: "focusAll" },
    );
    expect(state.focus?.bounds[0][1]).toBeLessThanOrEqual(30);
    expect(state.focus?.bounds[1][1]).toBeGreaterThanOrEqual(41);
  });

  it("focusAll on an empty selection leaves the map where it is", () => {
    const state = selectionReducer(initialSelectionState, { type: "focusAll" });
    expect(state.focus).toBeNull();
  });
});

describe("model choice", () => {
  it("sets the model", () => {
    const state = run({ type: "setModel", modelId: "xgboost" });
    expect(state.modelId).toBe("xgboost");
  });

  it("is a no-op when already selected", () => {
    expect(
      selectionReducer(initialSelectionState, {
        type: "setModel",
        modelId: "random-forest",
      }),
    ).toBe(initialSelectionState);
  });

  it("does not disturb the selected areas", () => {
    const state = run(
      comparison,
      { type: "addAreas", areas: [box("A", 30, 0), box("B", 32, 0)] },
      { type: "setModel", modelId: "combined" },
    );
    expect(state.areas).toHaveLength(2);
    expect(state.modelId).toBe("combined");
  });
});

describe("notices", () => {
  it("can be dismissed", () => {
    const state = run(
      { type: "addAreas", areas: [box("A", 30, 0), box("B", 32, 0)] },
      { type: "dismissNotice" },
    );
    expect(state.notice).toBeNull();
  });

  it("clears when the user acts on it by removing an area", () => {
    const state = run(
      { type: "addAreas", areas: [box("A", 30, 0), box("B", 32, 0)] },
      { type: "removeArea", id: "aoi-1" },
    );
    expect(state.notice).toBeNull();
  });

  it("is a no-op to dismiss when there is nothing to dismiss", () => {
    expect(
      selectionReducer(initialSelectionState, { type: "dismissNotice" }),
    ).toBe(initialSelectionState);
  });
});

describe("purity", () => {
  it("never mutates the state it was given", () => {
    const before = run(comparison, { type: "addAreas", areas: [box("A", 30, 0)] });
    const snapshot = JSON.stringify(before);

    selectionReducer(before, { type: "addAreas", areas: [box("B", 32, 0)] });
    selectionReducer(before, { type: "removeArea", id: "aoi-1" });
    selectionReducer(before, { type: "setAnalysisType", analysisType: "single" });
    selectionReducer(before, { type: "clearAreas" });

    expect(JSON.stringify(before)).toBe(snapshot);
  });
});
