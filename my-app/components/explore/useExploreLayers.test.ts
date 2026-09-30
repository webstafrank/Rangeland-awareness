import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { exploreDateWindow, useExploreLayers } from "./useExploreLayers";
import { GIBS_LAYERS } from "@/services/wms";

describe("useExploreLayers", () => {
  it("offers every layer the default source publishes, not filtered by topic", () => {
    // No NEXT_PUBLIC_WMS_SOURCE set in the test environment, so this resolves
    // to the built-in GIBS source. useWmsLayers(topic) would narrow this to
    // whichever layers list that topic in their `topics` array; the explorer
    // has no topic, so it must see the registry whole.
    const { result } = renderHook(() => useExploreLayers());

    expect(result.current.layers).toEqual(GIBS_LAYERS);
    expect(result.current.layers.length).toBeGreaterThan(1);

    // A sanity check that this really is "unfiltered", not coincidentally
    // equal: at least two returned layers must NOT share every topic, or the
    // registry itself would be indistinguishable from a single-topic slice.
    const topicSets = result.current.layers.map((l) => new Set(l.topics));
    const allSame = topicSets.every(
      (set) => set.size === topicSets[0].size && [...set].every((t) => topicSets[0].has(t)),
    );
    expect(allSame).toBe(false);
  });

  it("starts only the first layer visible, same as initialPanelState for any registry", () => {
    const { result } = renderHook(() => useExploreLayers());
    const [first, ...rest] = result.current.layers;

    expect(result.current.state[first.id]?.visible).toBe(true);
    for (const layer of rest) {
      expect(result.current.state[layer.id]?.visible).toBe(false);
    }
  });

  it("resolves the same source object useWmsLayers would, for the default env", () => {
    const { result } = renderHook(() => useExploreLayers());
    expect(result.current.resolution.source.id).toBe("gibs");
    expect(result.current.resolution.problems).toEqual([]);
  });
});

describe("exploreDateWindow", () => {
  it("starts well before any registered layer's extent and ends today", () => {
    const window = exploreDateWindow();
    const today = new Date().toISOString().slice(0, 10);

    expect(window.start < "2000-06-01").toBe(true);
    expect(window.end).toBe(today);
  });

  it("puts every registered layer's own most recent day inside the window", () => {
    // The point of a wide window: resolveLayerTime finds the LATEST covered
    // day inside [start, end], so every timeDefault a layer ships with must
    // itself fall inside this window or the explorer would clamp on load
    // for a layer that has never actually had a coverage gap at its own
    // most recent date.
    const window = exploreDateWindow();
    for (const layer of GIBS_LAYERS) {
      if (layer.timeDefault === undefined) continue;
      expect(layer.timeDefault >= window.start).toBe(true);
      expect(layer.timeDefault <= window.end).toBe(true);
    }
  });
});
