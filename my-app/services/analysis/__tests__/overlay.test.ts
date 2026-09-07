/**
 * The map overlay.
 *
 * The property under test is spatial smoothness. Independent per-cell draws
 * would satisfy every other invariant (in domain, deterministic, seeded) and
 * still produce a map that reads as television static, which a user would take
 * as evidence the app is broken rather than as data. So neighbouring cells are
 * held to OVERLAY_NEIGHBOUR_BUDGET, and the test compares that against what
 * pure noise would give.
 */
import { describe, expect, it } from "vitest";
import { OVERLAY_NEIGHBOUR_BUDGET } from "../constants";
import { createAnalysisService, overlayCellSize } from "../service";
import { BASE_CONFIG, COMPARISON_CONFIG, FLOOD_CONFIG, stubCatalog, stubGeo } from "./stubs";

const geo = stubGeo();
const analysis = createAnalysisService({ catalog: stubCatalog(), geo });

describe("the overlay grid", () => {
  it("asks geo for the cells rather than building its own grid", () => {
    const calls: number[] = [];
    const spy: typeof geo = {
      ...geo,
      gridFor(areas, cellSize, valueAt) {
        calls.push(cellSize);
        return geo.gridFor(areas, cellSize, valueAt);
      },
    };
    const service = createAnalysisService({ catalog: stubCatalog(), geo: spy });
    const result = service.run(BASE_CONFIG);
    expect(calls).toEqual([overlayCellSize(geo.frame().width)]);
    expect(result.overlay.length).toBeGreaterThan(0);
  });

  it("labels every cell with the area it belongs to", () => {
    const result = analysis.run(COMPARISON_CONFIG);
    for (const cell of result.overlay) {
      expect(COMPARISON_CONFIG.areas).toContain(cell.areaId);
    }
  });

  it("is identical between two runs of the same config", () => {
    expect(analysis.run(FLOOD_CONFIG).overlay).toEqual(analysis.run(FLOOD_CONFIG).overlay);
  });

  it("changes when the config changes", () => {
    const a = analysis.run(BASE_CONFIG).overlay.map((cell) => cell.value);
    const b = analysis.run({ ...BASE_CONFIG, model: "xgboost" }).overlay.map((cell) => cell.value);
    expect(a).not.toEqual(b);
  });
});

describe("spatial smoothness", () => {
  /** Cells the stub grid emitted side by side in the same row. */
  const neighbourPairs = (config: typeof BASE_CONFIG) => {
    const cells = analysis.run(config).overlay;
    const byKey = new Map(cells.map((cell) => [`${cell.areaId}:${cell.x}:${cell.y}`, cell]));
    const pairs: Array<[number, number]> = [];
    for (const cell of cells) {
      const right = byKey.get(`${cell.areaId}:${cell.x + cell.size}:${cell.y}`);
      const below = byKey.get(`${cell.areaId}:${cell.x}:${cell.y + cell.size}`);
      if (right) pairs.push([cell.value, right.value]);
      if (below) pairs.push([cell.value, below.value]);
    }
    return pairs;
  };

  it("keeps every pair of neighbouring cells inside the budget", () => {
    for (const config of [BASE_CONFIG, FLOOD_CONFIG]) {
      const result = analysis.run(config);
      const span = result.indicator.domain[1] - result.indicator.domain[0];
      const pairs = neighbourPairs(config);
      expect(pairs.length).toBeGreaterThan(100);
      for (const [a, b] of pairs) {
        expect(Math.abs(a - b)).toBeLessThanOrEqual(span * OVERLAY_NEIGHBOUR_BUDGET);
      }
    }
  });

  it("reads as a field, not as noise: the mean neighbour step is a fraction of the spread", () => {
    const result = analysis.run(COMPARISON_CONFIG);
    const values = result.overlay.map((cell) => cell.value);
    const spread = Math.max(...values) - Math.min(...values);
    const pairs = neighbourPairs(COMPARISON_CONFIG);
    const meanStep = pairs.reduce((sum, [a, b]) => sum + Math.abs(a - b), 0) / pairs.length;
    // Independent draws over the same spread would average about a third of it.
    expect(meanStep).toBeLessThan(spread * 0.1);
    expect(spread).toBeGreaterThan(0);
  });

  it("still varies across a county, so the map is not one flat block", () => {
    const cells = analysis.run(BASE_CONFIG).overlay;
    const values = cells.map((cell) => cell.value);
    const result = analysis.run(BASE_CONFIG);
    const span = result.indicator.domain[1] - result.indicator.domain[0];
    expect(Math.max(...values) - Math.min(...values)).toBeGreaterThan(span * 0.05);
  });
});
