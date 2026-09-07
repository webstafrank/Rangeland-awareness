import { describe, expect, it } from "vitest";
import { sequential } from "@/design/tokens";
import { colourFor, legendStops, rampFor, stepIndex } from "../ramp";

/**
 * The orientation rule is the whole point of this module, so it is what the
 * tests are mostly about: dark must always mean "more concerning", whichever
 * end of the indicator's domain that happens to be.
 */

const DOMAIN = [0, 100] as const;

describe("stepIndex orientation", () => {
  const steps = sequential.light.length;

  it("puts a HIGH value at the concerning end when high is bad", () => {
    // Flood hazard probability: 100% is the worst case.
    expect(stepIndex(100, DOMAIN, steps, "high")).toBe(steps - 1);
    expect(stepIndex(0, DOMAIN, steps, "high")).toBe(0);
  });

  it("puts a LOW value at the concerning end when low is bad", () => {
    // VCI: 0 is extreme vegetation deficit, 100 is thriving.
    expect(stepIndex(0, DOMAIN, steps, "low")).toBe(steps - 1);
    expect(stepIndex(100, DOMAIN, steps, "low")).toBe(0);
  });

  it("is monotone across the domain in both orientations", () => {
    const ascending = [0, 20, 40, 60, 80, 100].map((v) => stepIndex(v, DOMAIN, steps, "high"));
    const descending = [0, 20, 40, 60, 80, 100].map((v) => stepIndex(v, DOMAIN, steps, "low"));

    for (let i = 1; i < ascending.length; i += 1) {
      expect(ascending[i]).toBeGreaterThanOrEqual(ascending[i - 1]);
      expect(descending[i]).toBeLessThanOrEqual(descending[i - 1]);
    }
  });

  it("clamps values outside the domain instead of indexing off the ramp", () => {
    expect(stepIndex(-50, DOMAIN, steps, "high")).toBe(0);
    expect(stepIndex(9999, DOMAIN, steps, "high")).toBe(steps - 1);
    expect(stepIndex(-50, DOMAIN, steps, "low")).toBe(steps - 1);
    expect(stepIndex(9999, DOMAIN, steps, "low")).toBe(0);
  });

  it("never returns an index outside the ramp for any value or orientation", () => {
    for (const badEnd of ["low", "high"] as const) {
      for (let v = -10; v <= 110; v += 1) {
        const index = stepIndex(v, DOMAIN, steps, badEnd);
        expect(index).toBeGreaterThanOrEqual(0);
        expect(index).toBeLessThan(steps);
      }
    }
  });

  it("survives a degenerate domain rather than dividing by zero", () => {
    expect(stepIndex(5, [5, 5], steps, "high")).toBe(0);
  });

  it("treats a non-finite value as the least concerning step", () => {
    expect(stepIndex(Number.NaN, DOMAIN, steps, "high")).toBe(0);
  });
});

describe("colourFor", () => {
  it("returns a hex from the tone's own ramp", () => {
    for (const tone of ["light", "dark"] as const) {
      const colour = colourFor(42, DOMAIN, "high", tone);
      expect(rampFor(tone)).toContain(colour);
    }
  });

  it("gives the two orientations opposite colours at the same value", () => {
    expect(colourFor(0, DOMAIN, "high", "light")).not.toBe(colourFor(0, DOMAIN, "low", "light"));
  });
});

describe("legendStops", () => {
  it("has one stop per ramp step", () => {
    expect(legendStops(DOMAIN, "high", "light")).toHaveLength(sequential.light.length);
  });

  it("covers the domain with no gap between stops", () => {
    const stops = legendStops(DOMAIN, "high", "light");
    expect(stops[0].from).toBeCloseTo(0, 6);
    expect(stops[stops.length - 1].to).toBeCloseTo(100, 6);
    for (let i = 1; i < stops.length; i += 1) {
      expect(stops[i].from).toBeCloseTo(stops[i - 1].to, 6);
    }
  });

  it("always reports from <= to", () => {
    for (const badEnd of ["low", "high"] as const) {
      for (const stop of legendStops(DOMAIN, badEnd, "light")) {
        expect(stop.from).toBeLessThanOrEqual(stop.to);
      }
    }
  });

  /**
   * The legend and the cells must never disagree. This checks the actual
   * property: a value inside a stop's range gets that stop's colour.
   */
  it("agrees with colourFor for every stop and both orientations", () => {
    for (const badEnd of ["low", "high"] as const) {
      const stops = legendStops(DOMAIN, badEnd, "light");
      for (const stop of stops) {
        const midpoint = (stop.from + stop.to) / 2;
        expect(colourFor(midpoint, DOMAIN, badEnd, "light")).toBe(stop.colour);
      }
    }
  });

  it("reverses the value order between orientations", () => {
    const high = legendStops(DOMAIN, "high", "light");
    const low = legendStops(DOMAIN, "low", "light");
    // Least concerning step: low values when high is bad, high values when low is.
    expect(high[0].from).toBeCloseTo(0, 6);
    expect(low[0].to).toBeCloseTo(100, 6);
  });
});
