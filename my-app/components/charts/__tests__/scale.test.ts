import { describe, expect, it } from "vitest";
import {
  contiguousRuns,
  labelIndices,
  nearestIndex,
  niceTicks,
  plotDomain,
  scaleX,
  scaleY,
} from "../scale";

describe("niceTicks", () => {
  it("produces round numbers a reader can read", () => {
    expect(niceTicks(0, 2074, 5)).toEqual([0, 500, 1000, 1500, 2000, 2500]);
  });

  it("handles a 0..100 index domain", () => {
    expect(niceTicks(0, 100, 5)).toEqual([0, 20, 40, 60, 80, 100]);
  });

  it("handles a small fractional domain without float noise", () => {
    const ticks = niceTicks(0, 1, 5);
    expect(ticks).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1]);
    // The bug this pins: accumulating `+= 0.2` yields 0.30000000000000004.
    for (const tick of ticks) {
      expect(String(tick).length).toBeLessThan(6);
    }
  });

  it("covers the whole domain", () => {
    const ticks = niceTicks(13, 87, 5);
    expect(ticks[0]).toBeLessThanOrEqual(13);
    expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(87);
  });

  it("returns a single tick for a flat domain rather than dividing by zero", () => {
    expect(niceTicks(42, 42)).toEqual([42]);
  });

  it("tolerates a reversed domain", () => {
    expect(niceTicks(100, 0, 5)).toEqual(niceTicks(0, 100, 5));
  });

  it("returns nothing for a non-finite domain", () => {
    expect(niceTicks(Number.NaN, 10)).toEqual([]);
    expect(niceTicks(0, Number.POSITIVE_INFINITY)).toEqual([]);
  });

  it("handles a negative domain", () => {
    const ticks = niceTicks(-40, 40, 4);
    expect(ticks[0]).toBeLessThanOrEqual(-40);
    expect(ticks).toContain(0);
  });
});

describe("plotDomain", () => {
  it("pads the data range so a line never touches the frame", () => {
    const [min, max] = plotDomain([10, 20]);
    expect(min).toBeLessThan(10);
    expect(max).toBeGreaterThan(20);
  });

  it("never pads past the indicator's own bounds", () => {
    // The bounds are a floor and a ceiling, not a snap: padding that stays
    // inside them is left alone.
    const [min, max] = plotDomain([2, 8], [0, 100]);
    expect(min).toBeGreaterThanOrEqual(0);
    expect(min).toBeLessThan(2);
    expect(max).toBeLessThanOrEqual(100);
  });

  it("clamps padding that would cross the floor", () => {
    // VCI cannot be negative, so an 8% pad below a zero reading must not
    // invent negative territory.
    expect(plotDomain([0, 10], [0, 100])[0]).toBe(0);
  });

  it("clamps padding that would cross the ceiling", () => {
    expect(plotDomain([90, 100], [0, 100])[1]).toBe(100);
  });

  it("ignores nulls", () => {
    expect(plotDomain([null, 10, null, 20, null])).toEqual(plotDomain([10, 20]));
  });

  it("gives a flat series real height", () => {
    const [min, max] = plotDomain([50, 50, 50]);
    expect(max).toBeGreaterThan(min);
  });

  it("falls back to the bounds when every point is missing", () => {
    expect(plotDomain([null, null], [0, 100])).toEqual([0, 100]);
  });

  it("falls back to a unit domain with no data and no bounds", () => {
    expect(plotDomain([null])).toEqual([0, 1]);
  });
});

describe("scaleY", () => {
  it("is y-flipped: the domain maximum is at pixel zero", () => {
    expect(scaleY(100, [0, 100], 300)).toBe(0);
    expect(scaleY(0, [0, 100], 300)).toBe(300);
  });

  it("puts the midpoint in the middle", () => {
    expect(scaleY(50, [0, 100], 300)).toBe(150);
  });

  it("does not divide by zero on a flat domain", () => {
    expect(scaleY(5, [5, 5], 300)).toBe(150);
  });
});

describe("scaleX", () => {
  it("spans the full width across the point count", () => {
    expect(scaleX(0, 5, 400)).toBe(0);
    expect(scaleX(4, 5, 400)).toBe(400);
  });

  it("centres a single point", () => {
    expect(scaleX(0, 1, 400)).toBe(200);
  });
});

describe("contiguousRuns", () => {
  it("breaks the line at a gap rather than interpolating through it", () => {
    const runs = contiguousRuns([1, 2, null, 4, 5]);
    expect(runs).toHaveLength(2);
    expect(runs[0].map((p) => p.index)).toEqual([0, 1]);
    expect(runs[1].map((p) => p.index)).toEqual([3, 4]);
  });

  it("keeps the original indices so x positions stay correct", () => {
    const runs = contiguousRuns([null, null, 7]);
    expect(runs).toEqual([[{ index: 2, value: 7 }]]);
  });

  it("returns nothing when every point is missing", () => {
    expect(contiguousRuns([null, null])).toEqual([]);
  });

  it("returns one run when nothing is missing", () => {
    expect(contiguousRuns([1, 2, 3])).toHaveLength(1);
  });

  it("treats NaN as a gap, not as a value", () => {
    expect(contiguousRuns([1, Number.NaN, 3])).toHaveLength(2);
  });

  it("handles a trailing gap", () => {
    const runs = contiguousRuns([1, 2, null]);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toHaveLength(2);
  });
});

describe("nearestIndex", () => {
  it("snaps to the closest data position", () => {
    // 5 points across 400px: positions 0, 100, 200, 300, 400.
    expect(nearestIndex(0, 5, 400)).toBe(0);
    expect(nearestIndex(96, 5, 400)).toBe(1);
    expect(nearestIndex(210, 5, 400)).toBe(2);
    expect(nearestIndex(400, 5, 400)).toBe(4);
  });

  it("clamps a pointer that leaves the plot area", () => {
    expect(nearestIndex(-50, 5, 400)).toBe(0);
    expect(nearestIndex(9999, 5, 400)).toBe(4);
  });

  it("handles a single point", () => {
    expect(nearestIndex(123, 1, 400)).toBe(0);
  });
});

describe("labelIndices", () => {
  it("labels every point when they all fit", () => {
    expect(labelIndices(4, 6)).toEqual([0, 1, 2, 3]);
  });

  it("strides when there are more points than slots", () => {
    const picked = labelIndices(24, 6);
    expect(picked.length).toBeLessThanOrEqual(7);
    expect(picked[0]).toBe(0);
  });

  it("always labels the last point, which carries the current value", () => {
    for (const count of [7, 13, 24, 37, 120]) {
      expect(labelIndices(count, 6).at(-1)).toBe(count - 1);
    }
  });

  it("never emits a duplicate or an out-of-range index", () => {
    for (const count of [1, 2, 5, 13, 24, 100]) {
      const picked = labelIndices(count, 6);
      expect(new Set(picked).size).toBe(picked.length);
      for (const index of picked) {
        expect(index).toBeGreaterThanOrEqual(0);
        expect(index).toBeLessThan(count);
      }
    }
  });

  it("returns nothing for an empty series", () => {
    expect(labelIndices(0, 6)).toEqual([]);
  });
});
