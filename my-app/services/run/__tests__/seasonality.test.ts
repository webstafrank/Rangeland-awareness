/**
 * The seasonal term has to encode Kenya's bimodal rainfall regime, with the
 * response lagging the rain. A test that only checked "the series varies" would
 * pass on a sine wave centred on the wrong month, which is the mistake worth
 * catching: a chart that peaks in August is read as obviously broken by anyone
 * who lives there.
 */
import { describe, expect, it } from "vitest";
import { SEASONAL_INDEX, seasonalIndex } from "@/services/run/seasonality";

describe("SEASONAL_INDEX", () => {
  it("covers the twelve months and stays inside [-1, 1]", () => {
    expect(SEASONAL_INDEX).toHaveLength(12);
    for (const value of SEASONAL_INDEX) {
      expect(value).toBeGreaterThanOrEqual(-1);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it("averages to zero across the year, so it shifts nobody's level", () => {
    const mean = SEASONAL_INDEX.reduce((sum, value) => sum + value, 0) / SEASONAL_INDEX.length;
    expect(Math.abs(mean)).toBeLessThan(1e-12);
  });

  it("peaks in May, a month after the long rains", () => {
    expect(SEASONAL_INDEX.indexOf(Math.max(...SEASONAL_INDEX)) + 1).toBe(5);
  });

  it("carries a second peak in December, after the short rains", () => {
    // A local maximum, not the global one: the short rains are the weaker season.
    expect(seasonalIndex(12)).toBeGreaterThan(seasonalIndex(11));
    expect(seasonalIndex(12)).toBeGreaterThan(seasonalIndex(1));
    expect(seasonalIndex(12)).toBeLessThan(seasonalIndex(5));
  });

  it("bottoms out in the long dry spell between the seasons", () => {
    expect([8, 9]).toContain(SEASONAL_INDEX.indexOf(Math.min(...SEASONAL_INDEX)) + 1);
  });

  /**
   * The shape assertion a magnitude bound cannot make. Two rainy seasons means
   * exactly two peaks and two troughs around the calendar circle. Noise leaking
   * into the seasonal term, or a third bump being added, breaks this while
   * leaving every step size inside its bound.
   */
  it("has exactly two peaks and two troughs, matching a bimodal regime", () => {
    let peaks = 0;
    let troughs = 0;
    for (let month = 1; month <= 12; month += 1) {
      const prev = seasonalIndex(month === 1 ? 12 : month - 1);
      const here = seasonalIndex(month);
      const next = seasonalIndex(month === 12 ? 1 : month + 1);
      if (here > prev && here > next) peaks += 1;
      if (here < prev && here < next) troughs += 1;
    }
    expect(peaks).toBe(2);
    expect(troughs).toBe(2);
  });

  it("is smooth month to month, since vegetation does not step", () => {
    /*
     * The index is normalised to a peak of 1 with mean zero, so its full range
     * is 2.0. The steepest adjacent step is the greenup on the flank of the
     * long-rains bump. That is fast on purpose: the response after the Kenyan
     * long rains really does climb within a month. The bound allows it while
     * still failing a discontinuity, which would show up well above 1.0.
     */
    for (let month = 1; month <= 12; month += 1) {
      const next = month === 12 ? 1 : month + 1;
      expect(Math.abs(seasonalIndex(next) - seasonalIndex(month))).toBeLessThan(0.8);
    }
  });

  it("wraps the calendar, so December and January are neighbours", () => {
    expect(seasonalIndex(13)).toBe(seasonalIndex(1));
    expect(seasonalIndex(0)).toBe(seasonalIndex(12));
    expect(seasonalIndex(-11)).toBe(seasonalIndex(1));
    expect(seasonalIndex(25)).toBe(seasonalIndex(1));
  });

  it("is frozen, so no caller can reach in and edit the year", () => {
    expect(Object.isFrozen(SEASONAL_INDEX)).toBe(true);
  });
});
