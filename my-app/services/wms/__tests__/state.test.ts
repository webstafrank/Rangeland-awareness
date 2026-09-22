/**
 * The layer panel reducer.
 */

import { describe, expect, it } from "vitest";

import { GIBS_LAYERS, layersForSource } from "@/services/wms/layers";
import { resolveSource } from "@/services/wms/source";
import {
  DEFAULT_OPACITY,
  clampOpacity,
  failureMessages,
  initialPanelState,
  layerZIndex,
  panelNotices,
  visibleLayers,
  wmsPanelReducer,
} from "@/services/wms/state";

const layers = layersForSource(resolveSource({}).source, "drought-monitoring");

describe("clampOpacity", () => {
  it("keeps a value inside 0..1", () => {
    expect(clampOpacity(0.4)).toBe(0.4);
    expect(clampOpacity(-1)).toBe(0);
    expect(clampOpacity(3)).toBe(1);
  });

  it("falls back to the default for a NaN, which Leaflet would render as blank", () => {
    expect(clampOpacity(Number.NaN)).toBe(DEFAULT_OPACITY);
    expect(clampOpacity(Number.POSITIVE_INFINITY)).toBe(DEFAULT_OPACITY);
  });
});

describe("initialPanelState", () => {
  it("shows only the first layer", () => {
    const state = initialPanelState(layers);

    expect(state[layers[0].id].visible).toBe(true);
    for (const layer of layers.slice(1)) {
      expect(state[layer.id].visible).toBe(false);
    }
  });

  it("starts every layer partly transparent and with no error", () => {
    const state = initialPanelState(layers);

    for (const layer of layers) {
      expect(state[layer.id].opacity).toBe(DEFAULT_OPACITY);
      expect(state[layer.id].status).toBe("idle");
      expect(state[layer.id].errorMessage).toBeNull();
    }
  });

  it("is empty for a source with no layers", () => {
    expect(initialPanelState([])).toEqual({});
  });
});

describe("wmsPanelReducer", () => {
  const first = layers[0].id;
  const second = layers[1].id;

  it("toggles a layer on and off", () => {
    let state = initialPanelState(layers);

    state = wmsPanelReducer(state, { type: "toggle", id: second });
    expect(state[second].visible).toBe(true);

    state = wmsPanelReducer(state, { type: "toggle", id: second });
    expect(state[second].visible).toBe(false);
  });

  it("sets opacity, clamped", () => {
    let state = initialPanelState(layers);

    state = wmsPanelReducer(state, { type: "set-opacity", id: first, opacity: 0.2 });
    expect(state[first].opacity).toBe(0.2);

    state = wmsPanelReducer(state, { type: "set-opacity", id: first, opacity: 9 });
    expect(state[first].opacity).toBe(1);
  });

  it("records a tile error with its message", () => {
    const state = wmsPanelReducer(initialPanelState(layers), {
      type: "tile-error",
      id: first,
      message: "NDVI did not load",
    });

    expect(state[first].status).toBe("error");
    expect(state[first].errorMessage).toBe("NDVI did not load");
  });

  it("clears the error once tiles load again", () => {
    let state = wmsPanelReducer(initialPanelState(layers), {
      type: "tile-error",
      id: first,
      message: "boom",
    });
    state = wmsPanelReducer(state, { type: "tile-ready", id: first });

    expect(state[first].status).toBe("ready");
    expect(state[first].errorMessage).toBeNull();
  });

  it("keeps the error visible while a failing layer keeps re-requesting", () => {
    // Leaflet emits `loading` on every pan. Clearing the message there would
    // flicker it off and straight back on for a layer that is still broken.
    let state = wmsPanelReducer(initialPanelState(layers), {
      type: "tile-error",
      id: first,
      message: "boom",
    });
    state = wmsPanelReducer(state, { type: "tile-loading", id: first });

    expect(state[first].errorMessage).toBe("boom");
  });

  it("drops a layer's error when it is switched off", () => {
    let state = wmsPanelReducer(initialPanelState(layers), {
      type: "tile-error",
      id: first,
      message: "boom",
    });
    state = wmsPanelReducer(state, { type: "set-visible", id: first, visible: false });

    expect(state[first].status).toBe("idle");
    expect(state[first].errorMessage).toBeNull();
  });

  it("ignores an action for an unknown id instead of throwing", () => {
    const state = initialPanelState(layers);
    const next = wmsPanelReducer(state, {
      type: "tile-error",
      id: "gone",
      message: "late event",
    });

    // A tile event can arrive one tick after the topic changed and swapped the
    // layer list out. Same object back, so React does not re-render either.
    expect(next).toBe(state);
  });

  it("returns the same object when nothing changes, so React can skip a render", () => {
    const state = initialPanelState(layers);

    expect(
      wmsPanelReducer(state, { type: "set-visible", id: first, visible: true }),
    ).toBe(state);
    expect(
      wmsPanelReducer(state, {
        type: "set-opacity",
        id: first,
        opacity: DEFAULT_OPACITY,
      }),
    ).toBe(state);
  });

  it("resets to a new topic's layers", () => {
    const flood = layersForSource(resolveSource({}).source, "flood-risk");
    let state = initialPanelState(layers);
    state = wmsPanelReducer(state, { type: "reset", layers: flood });

    expect(Object.keys(state).sort()).toEqual(flood.map((l) => l.id).sort());
  });
});

describe("visibleLayers", () => {
  it("returns the visible layers in registry order", () => {
    let state = initialPanelState(layers);
    state = wmsPanelReducer(state, { type: "toggle", id: layers[2].id });

    expect(visibleLayers(layers, state).map((l) => l.id)).toEqual([
      layers[0].id,
      layers[2].id,
    ]);
  });

  it("returns nothing when everything is off", () => {
    const state = wmsPanelReducer(initialPanelState(layers), {
      type: "toggle",
      id: layers[0].id,
    });
    expect(visibleLayers(layers, state)).toEqual([]);
  });
});

describe("failureMessages", () => {
  it("reports only visible failing layers, deduplicated", () => {
    let state = initialPanelState(layers);
    state = wmsPanelReducer(state, { type: "toggle", id: layers[1].id });
    state = wmsPanelReducer(state, {
      type: "tile-error",
      id: layers[0].id,
      message: "same message",
    });
    state = wmsPanelReducer(state, {
      type: "tile-error",
      id: layers[1].id,
      message: "same message",
    });
    // Hidden layers must not contribute.
    state = wmsPanelReducer(state, {
      type: "tile-error",
      id: layers[2].id,
      message: "hidden failure",
    });

    expect(failureMessages(layers, state)).toEqual(["same message"]);
  });

  it("is empty when nothing is failing", () => {
    expect(failureMessages(layers, initialPanelState(layers))).toEqual([]);
  });
});

describe("panelNotices", () => {
  // Drought layers include NDVI, whose archive starts 2025-02-12, so a 2024
  // window is genuinely uncovered on the live server.
  const coveredWindow = { start: "2026-01-01", end: "2026-06-30" };
  const uncoveredWindow = { start: "2024-01-01", end: "2024-12-31" };

  it("says nothing when every visible layer is covered and loading fine", () => {
    expect(panelNotices(layers, initialPanelState(layers), coveredWindow)).toEqual(
      [],
    );
  });

  it("reports a coverage gap for a visible layer the window misses", () => {
    const notices = panelNotices(
      layers,
      initialPanelState(layers),
      uncoveredWindow,
    );

    expect(notices).toHaveLength(1);
    expect(notices[0].kind).toBe("coverage");
    expect(notices[0].layerId).toBe(layers[0].id);
    expect(notices[0].text).toContain(layers[0].title);
    expect(notices[0].text).toContain("2025-02-12");
  });

  it("says nothing about a layer the analyst switched off", () => {
    const hidden = wmsPanelReducer(initialPanelState(layers), {
      type: "toggle",
      id: layers[0].id,
    });
    expect(panelNotices(layers, hidden, uncoveredWindow)).toEqual([]);
  });

  it("reports a tile failure as a problem, with the message the map showed", () => {
    const state = wmsPanelReducer(initialPanelState(layers), {
      type: "tile-error",
      id: layers[0].id,
      message: "NDVI did not load from NASA EOSDIS GIBS.",
    });

    const notices = panelNotices(layers, state, coveredWindow);
    expect(notices).toEqual([
      {
        layerId: layers[0].id,
        layerTitle: layers[0].title,
        kind: "problem",
        text: "NDVI did not load from NASA EOSDIS GIBS.",
      },
    ]);
  });

  it("gives one notice per layer, never both a problem and a coverage gap", () => {
    const state = wmsPanelReducer(initialPanelState(layers), {
      type: "tile-error",
      id: layers[0].id,
      message: "boom",
    });

    const notices = panelNotices(layers, state, uncoveredWindow);
    expect(notices).toHaveLength(1);
    expect(notices[0].kind).toBe("problem");
  });

  it("keeps registry order when several layers have something to say", () => {
    let state = initialPanelState(layers);
    for (const layer of layers) {
      state = wmsPanelReducer(state, {
        type: "set-visible",
        id: layer.id,
        visible: true,
      });
    }

    const notices = panelNotices(layers, state, uncoveredWindow);
    const order = notices.map((n) => n.layerId);
    const positions = order.map((id) => layers.findIndex((l) => l.id === id));

    expect(positions.length).toBeGreaterThan(0);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });
});

describe("layerZIndex", () => {
  it("draws the first listed layer on top", () => {
    const top = layerZIndex(layers, layers[0].id);
    const next = layerZIndex(layers, layers[1].id);
    expect(top).toBeGreaterThan(next);
  });

  it("gives every registry layer a distinct z-index", () => {
    const indices = GIBS_LAYERS.map((l) => layerZIndex(GIBS_LAYERS, l.id));
    expect(new Set(indices).size).toBe(GIBS_LAYERS.length);
  });

  it("gives an unknown id a base value rather than NaN", () => {
    expect(Number.isFinite(layerZIndex(layers, "gone"))).toBe(true);
  });
});
