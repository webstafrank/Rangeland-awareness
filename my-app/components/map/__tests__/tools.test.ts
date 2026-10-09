import { describe, expect, it } from "vitest";
import { MAP_TOOL_SPECS, TILE_LOADING } from "@/components/map/tools";

describe("selection map tile loading", () => {
  it("loads tiles only once the view settles, never per zoom level of a flight", () => {
    // Regression: a flight's per-zoom tile requests filled Chrome's queue for
    // low-priority requests, so the next step's script was never sent and
    // Continue did not navigate. See TILE_LOADING in tools.ts.
    expect(TILE_LOADING.updateWhenZooming).toBe(false);
    expect(TILE_LOADING.updateWhenIdle).toBe(true);
    expect(TILE_LOADING.keepBuffer).toBeLessThanOrEqual(1);
  });
});

describe("map tools", () => {
  it("offers the three tools, each with a label and a hint", () => {
    expect(MAP_TOOL_SPECS.map((t) => t.id)).toEqual(["point", "polygon", "rectangle"]);
    for (const tool of MAP_TOOL_SPECS) {
      expect(tool.label.length).toBeGreaterThan(0);
      expect(tool.hint.length).toBeGreaterThan(0);
    }
  });
});
