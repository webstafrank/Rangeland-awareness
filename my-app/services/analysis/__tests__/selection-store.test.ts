import type { Feature } from "geojson";
import { describe, expect, it } from "vitest";
import {
  STORAGE_VERSION,
  applyUrlSelection,
  getSelectionSnapshot,
  loadSelection,
  parseSelection,
  serialiseSelection,
  serverSelection,
  storageKey,
} from "@/services/analysis/selection-store";
import { TOPIC_SLUGS } from "@/services/analysis/topics";
import {
  initialSelectionState,
  selectionReducer,
  type AreaOfInterest,
  type DraftArea,
  type SelectionState,
} from "@/services/analysis/selection";

/**
 * The persistence and URL-seeding gate.
 *
 * Splitting the wizard into four routes made two new things load-bearing, and
 * both are pure functions so both are tested here rather than in a browser:
 *
 *  1. A selection survives a navigation and a reload. That is
 *     serialise/parse, and the failure mode is not "it throws" — it is a
 *     partially-read payload that restores three of five areas, or a payload
 *     from another topic restoring areas that answer a different question.
 *  2. A shared link's configuration wins over a session already in progress,
 *     and narrowing the scope through a link drops areas the SAME way clicking
 *     the radio does: with a notice and an undo, never silently.
 */

const feature = (lng: number, lat: number): Feature => ({
  type: "Feature",
  properties: null,
  geometry: { type: "Point", coordinates: [lng, lat] },
});

const area = (id: string, label = id): AreaOfInterest => ({
  id,
  label,
  source: "coordinate",
  feature: feature(37, 2),
  bounds: [
    [2, 37],
    [2, 37],
  ],
  areaKm2: null,
});

const withAreas = (
  areas: AreaOfInterest[],
  over: Partial<SelectionState> = {},
): SelectionState => ({
  ...initialSelectionState,
  analysisType: "comparison",
  areas,
  nextId: areas.length + 1,
  ...over,
});

describe("storageKey", () => {
  it("gives every topic its own key", () => {
    // One key for the app would make the four topics take turns: opening a
    // second topic to check something would overwrite the first one's areas,
    // and nothing would report the loss.
    const keys = TOPIC_SLUGS.map(storageKey);
    expect(new Set(keys).size).toBe(TOPIC_SLUGS.length);
  });

  it("carries the schema version, so a bump cannot read the old entries", () => {
    for (const slug of TOPIC_SLUGS) {
      expect(storageKey(slug)).toContain(`v${STORAGE_VERSION}`);
      expect(storageKey(slug)).toContain(slug);
    }
  });
});

describe("serialise and parse round trip", () => {
  it("brings a selection back exactly as it went in", () => {
    const state = withAreas([area("aoi-1", "Marsabit"), area("aoi-2", "Turkana")], {
      modelId: "xgboost",
    });
    const restored = parseSelection(
      "flood-risk",
      serialiseSelection("flood-risk", state),
    );

    expect(restored).not.toBeNull();
    expect(restored?.analysisType).toBe("comparison");
    expect(restored?.modelId).toBe("xgboost");
    expect(restored?.areas.map((a) => a.label)).toEqual(["Marsabit", "Turkana"]);
    // Geometry survives, not just the label. A restored area that lost its
    // feature would render a row in the list and nothing on the map.
    expect(restored?.areas[0].feature.geometry).toEqual(
      state.areas[0].feature.geometry,
    );
  });

  it("does not restore the transient fields", () => {
    // focus is a one-shot map instruction and notice/undo describe an event
    // the reader has no memory of an hour later. Restoring any of them is a
    // viewport yanking itself, or a warning about something that did not just
    // happen.
    const state = withAreas([area("aoi-1")], {
      focus: { bounds: [[1, 2], [3, 4]], token: 7 },
      notice: "4 areas were removed.",
      undo: { analysisType: "comparison", areas: [area("aoi-9")] },
    });
    const restored = parseSelection(
      "flood-risk",
      serialiseSelection("flood-risk", state),
    );

    expect(restored?.focus).toBeNull();
    expect(restored?.notice).toBeNull();
    expect(restored?.undo).toBeNull();
  });

  it("restarts id minting past every restored area", () => {
    // Otherwise the next selection gets aoi-1 again, two rows share a key, and
    // removing one removes the other.
    const state = withAreas([area("aoi-1"), area("aoi-2"), area("aoi-3")]);
    const restored = parseSelection(
      "flood-risk",
      serialiseSelection("flood-risk", state),
    ) as SelectionState;

    const stamped = area("aoi-1");
    const draft: DraftArea = {
      label: stamped.label,
      source: stamped.source,
      feature: stamped.feature,
      bounds: stamped.bounds,
      areaKm2: stamped.areaKm2,
    };
    const next = selectionReducer(restored, { type: "addAreas", areas: [draft] });
    const ids = next.areas.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.at(-1)).toBe("aoi-4");
  });
});

describe("parseSelection refuses anything it cannot trust", () => {
  it("returns null for absent, malformed or non-object payloads", () => {
    expect(parseSelection("flood-risk", null)).toBeNull();
    expect(parseSelection("flood-risk", "not json")).toBeNull();
    expect(parseSelection("flood-risk", "null")).toBeNull();
    expect(parseSelection("flood-risk", '"a string"')).toBeNull();
    expect(parseSelection("flood-risk", "[]")).toBeNull();
  });

  it("returns null for a payload from a different schema version", () => {
    const raw = serialiseSelection("flood-risk", withAreas([area("aoi-1")]));
    const stale = raw.replace(
      `"version":${STORAGE_VERSION}`,
      `"version":${STORAGE_VERSION + 1}`,
    );
    expect(parseSelection("flood-risk", stale)).toBeNull();
  });

  it("returns null for a payload belonging to a different topic", () => {
    // Areas are chosen against a question. Carrying them into another topic
    // would silently answer one the analyst did not ask.
    const raw = serialiseSelection("flood-risk", withAreas([area("aoi-1")]));
    expect(parseSelection("drought-monitoring", raw)).toBeNull();
    expect(parseSelection("flood-risk", raw)).not.toBeNull();
  });

  it("returns null for an unknown analysis type or model", () => {
    const raw = serialiseSelection("flood-risk", withAreas([area("aoi-1")]));
    expect(
      parseSelection("flood-risk", raw.replace('"comparison"', '"both"')),
    ).toBeNull();
    expect(
      parseSelection("flood-risk", raw.replace('"random-forest"', '"catboost"')),
    ).toBeNull();
  });

  it("returns null rather than half a selection when one area is broken", () => {
    // The important half of this: a truncated payload must not restore the
    // areas it managed to read. Three of five areas is a comparison quietly
    // answering a different question.
    const state = withAreas([area("aoi-1"), area("aoi-2")]);
    const parsed = JSON.parse(serialiseSelection("flood-risk", state));
    delete parsed.areas[1].bounds;
    expect(parseSelection("flood-risk", JSON.stringify(parsed))).toBeNull();

    const noFeature = JSON.parse(serialiseSelection("flood-risk", state));
    noFeature.areas[0].feature = null;
    expect(parseSelection("flood-risk", JSON.stringify(noFeature))).toBeNull();

    const notAnArray = JSON.parse(serialiseSelection("flood-risk", state));
    notAnArray.areas = "two";
    expect(parseSelection("flood-risk", JSON.stringify(notAnArray))).toBeNull();
  });

  it("accepts an empty selection, which is a real state", () => {
    const raw = serialiseSelection("flood-risk", initialSelectionState);
    const restored = parseSelection("flood-risk", raw);
    expect(restored).not.toBeNull();
    expect(restored?.areas).toEqual([]);
  });
});

describe("applyUrlSelection", () => {
  it("is a no-op when the URL says nothing", () => {
    const state = withAreas([area("aoi-1")]);
    expect(applyUrlSelection(state, {})).toBe(state);
  });

  it("lets the URL win over a session already in progress", () => {
    // A shared link means "my configuration, your areas" (url-state.ts), so
    // the sender's model has to survive the receiver's stored one.
    const state = withAreas([area("aoi-1"), area("aoi-2")], {
      modelId: "random-forest",
    });
    const next = applyUrlSelection(state, { modelId: "combined" });
    expect(next.modelId).toBe("combined");
    expect(next.areas).toHaveLength(2);
  });

  it("drops areas through the reducer, with the notice and the undo", () => {
    // The bug this test exists for: assigning analysisType directly would
    // truncate a five-area comparison to one area silently, which is exactly
    // what selection.ts refuses to do when a radio is clicked.
    const state = withAreas([
      area("aoi-1", "Marsabit"),
      area("aoi-2", "Turkana"),
      area("aoi-3", "Wajir"),
    ]);
    const next = applyUrlSelection(state, { analysisType: "single" });

    expect(next.analysisType).toBe("single");
    expect(next.areas).toHaveLength(1);
    expect(next.areas[0].label).toBe("Wajir");
    expect(next.notice).toMatch(/2 earlier areas were removed/i);
    expect(next.undo?.areas).toHaveLength(3);
  });

  it("applies the model before the type, so a switch cannot lose the model", () => {
    const state = withAreas([area("aoi-1"), area("aoi-2")]);
    const next = applyUrlSelection(state, {
      analysisType: "single",
      modelId: "xgboost",
    });
    expect(next.modelId).toBe("xgboost");
    expect(next.analysisType).toBe("single");
  });
});

describe("the store does nothing on the server", () => {
  it("writes no module state when there is no window", () => {
    /*
     * This lane IS the server: node environment, no `window`, no
     * `sessionStorage`. That is what makes it the right place for this check —
     * jsdom defines `window` as non-configurable, so a dom-lane version would
     * have to fake its absence and would be testing the fake.
     *
     * What it guards: `loadSelection` is called during render, and on the
     * server that render is shared by every concurrent visitor. Module state
     * written there is cross-request state, one refactor away from serving one
     * analyst's selection to another. useWizard hands React a server snapshot
     * built from the route's own searchParams instead, so there is nothing for
     * the store to do here.
     */
    loadSelection("flood-risk", { analysisType: "comparison", modelId: "xgboost" });
    expect(getSelectionSnapshot()).toEqual(initialSelectionState);

    // And it did not reach for a storage API that is not there.
    expect(() => loadSelection("drought-monitoring", {})).not.toThrow();
    expect(getSelectionSnapshot()).toEqual(initialSelectionState);
  });
});

describe("serverSelection", () => {
  it("is the defaults when the URL is empty", () => {
    expect(serverSelection({})).toEqual(initialSelectionState);
  });

  it("is what the server renders for a bookmarked configuration", () => {
    // This is the value React hydrates against, so it must match what the
    // client computes from the same URL or the first paint flashes.
    const state = serverSelection({
      analysisType: "comparison",
      modelId: "combined",
    });
    expect(state.analysisType).toBe("comparison");
    expect(state.modelId).toBe("combined");
    expect(state.areas).toEqual([]);
  });
});
