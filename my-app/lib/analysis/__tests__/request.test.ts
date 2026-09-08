import { describe, expect, it } from "vitest";
import { SCHEMA_VERSION, blockingReason, buildRequest } from "@/lib/analysis/request";
import {
  type DraftArea,
  type SelectionState,
  draftAreaFromGeometry,
  initialSelectionState,
  selectionReducer,
} from "@/lib/analysis/selection";
import { getAnalysisType } from "@/lib/analysis/models";

function box(label: string, west: number): DraftArea {
  const draft = draftAreaFromGeometry(
    {
      type: "Polygon",
      coordinates: [
        [
          [west, 0],
          [west + 1, 0],
          [west + 1, 1],
          [west, 1],
          [west, 0],
        ],
      ],
    },
    "drawn",
    label,
  );
  if (draft === null) throw new Error("fixture produced no bounds");
  return draft;
}

/** State with `count` areas selected under the given analysis type. */
function withAreas(
  count: number,
  analysisType: SelectionState["analysisType"] = "comparison",
): SelectionState {
  const areas = Array.from({ length: count }, (_, i) => box(`Area ${i + 1}`, i * 2));
  return [
    { type: "setAnalysisType", analysisType } as const,
    { type: "addAreas", areas } as const,
  ].reduce(selectionReducer, initialSelectionState);
}

describe("buildRequest: the complete request", () => {
  it("assembles a single-location request", () => {
    const state = withAreas(1, "single");
    const result = buildRequest("flood-risk", state);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.request).toMatchObject({
      schemaVersion: SCHEMA_VERSION,
      topic: "flood-risk",
      analysisType: "single",
      model: "random-forest",
    });
    expect(result.request.areas).toHaveLength(1);
  });

  it("carries every area through with its geometry, bounds and area", () => {
    const state = withAreas(2);
    const result = buildRequest("drought-monitoring", state);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const [first] = result.request.areas;
    expect(first.id).toBe("aoi-1");
    expect(first.label).toBe("Area 1");
    expect(first.source).toBe("drawn");
    expect(first.feature.geometry.type).toBe("Polygon");
    expect(first.bounds).toEqual([
      [0, 0],
      [1, 1],
    ]);
    expect(first.areaKm2).toBeGreaterThan(12000);
  });

  it("records the selected model", () => {
    const state = selectionReducer(withAreas(1, "single"), {
      type: "setModel",
      modelId: "combined",
    });
    const result = buildRequest("rangeland-dynamics", state);
    expect(result.ok && result.request.model).toBe("combined");
  });

  it("is serialisable, since it crosses a service boundary", () => {
    const result = buildRequest("food-security", withAreas(2));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const roundTripped = JSON.parse(JSON.stringify(result.request));
    expect(roundTripped).toEqual(result.request);
  });

  it("does not alias the selection state, so later edits cannot mutate a sent request", () => {
    const state = withAreas(2);
    const result = buildRequest("flood-risk", state);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const removed = selectionReducer(state, { type: "removeArea", id: "aoi-1" });
    expect(removed.areas).toHaveLength(1);
    // The already-built request keeps both areas.
    expect(result.request.areas).toHaveLength(2);
  });
});

describe("buildRequest: refusals", () => {
  it("refuses an unknown topic", () => {
    const result = buildRequest("nope", withAreas(1, "single"));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems).toEqual([
      { field: "topic", message: 'Unknown topic "nope".' },
    ]);
  });

  it("refuses single location with nothing selected, and says how to select", () => {
    const result = buildRequest("flood-risk", initialSelectionState);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0].field).toBe("areas");
    // The message has to name all three ways in, or the map is a dead end.
    expect(result.problems[0].message).toMatch(/click the map/);
    expect(result.problems[0].message).toMatch(/draw a shape/);
    expect(result.problems[0].message).toMatch(/upload a shapefile/);
  });

  it("refuses a comparison of one area and counts what is selected", () => {
    const result = buildRequest("flood-risk", withAreas(1));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems[0].message).toMatch(/at least 2 areas/);
    expect(result.problems[0].message).toMatch(/1 selected/);
  });

  it("accepts a comparison at exactly the minimum", () => {
    expect(buildRequest("flood-risk", withAreas(2)).ok).toBe(true);
  });

  it("accepts a comparison at exactly the maximum", () => {
    const cap = getAnalysisType("comparison").maxAreas;
    expect(buildRequest("flood-risk", withAreas(cap)).ok).toBe(true);
  });

  it("refuses more areas than the cap, if state is ever forced past it", () => {
    // The reducer caps adds, so this is a hand-built state: the validator is
    // the second line of defence and must not trust its input.
    const forced: SelectionState = {
      ...initialSelectionState,
      analysisType: "comparison",
      areas: Array.from({ length: 20 }, (_, i) => ({
        ...box(`A${i}`, i),
        id: `aoi-${i}`,
      })),
    };
    const result = buildRequest("flood-risk", forced);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems[0].message).toMatch(/At most 12 areas\. 20 selected/);
  });

  it("reports every problem at once, not just the first", () => {
    const broken: SelectionState = {
      ...initialSelectionState,
      modelId: "catboost" as SelectionState["modelId"],
    };
    const result = buildRequest("nope", broken);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems.map((p) => p.field).sort()).toEqual([
      "areas",
      "model",
      "topic",
    ]);
  });

  it("skips the area check when the analysis type itself is unknown", () => {
    // Without a known type there is no cap to check against, and inventing one
    // would produce a second, misleading message.
    const broken: SelectionState = {
      ...initialSelectionState,
      analysisType: "both" as SelectionState["analysisType"],
    };
    const result = buildRequest("flood-risk", broken);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems.map((p) => p.field)).toEqual(["analysisType"]);
  });
});

describe("blockingReason", () => {
  it("is null for a valid request, so the run button enables", () => {
    expect(blockingReason(buildRequest("flood-risk", withAreas(2)))).toBeNull();
  });

  it("surfaces the area problem when that is all that is wrong", () => {
    const reason = blockingReason(buildRequest("flood-risk", withAreas(1)));
    expect(reason).toMatch(/at least 2 areas/);
  });

  it("surfaces a model problem ahead of the area problem", () => {
    // Areas are what the user is most likely mid-way through fixing, so a
    // broken model choice must not hide behind it.
    const broken: SelectionState = {
      ...initialSelectionState,
      modelId: "catboost" as SelectionState["modelId"],
    };
    expect(blockingReason(buildRequest("flood-risk", broken))).toMatch(
      /Choose a model/,
    );
  });
});
