/**
 * The chart's input. Two things are being defended here: the month grid (one
 * point per calendar month the window touches, keyed by area id) and the gaps.
 *
 * The gaps matter more than they look. Optical indicators lose months to cloud,
 * so the real series will have holes, and a chart that quietly draws a line
 * through them is lying. Putting deterministic nulls in the scaffold output
 * forces the chart code to handle a hole from the first day it is written.
 */
import { describe, expect, it } from "vitest";
import type { RunConfig } from "@/contracts/analysis";
import { monthStarts } from "../dates";
import { seasonalIndex } from "../seasonality";
import { createAnalysisService } from "../service";
import { BASE_CONFIG, COMPARISON_CONFIG, stubCatalog, stubGeo } from "./stubs";

const analysis = createAnalysisService({ catalog: stubCatalog(), geo: stubGeo() });

const TEN_YEARS: RunConfig = {
  ...BASE_CONFIG,
  dateRange: { start: "2015-01-01", end: "2024-12-31" },
};

describe("the month grid", () => {
  it("has one point per calendar month the window touches", () => {
    const result = analysis.run(BASE_CONFIG);
    expect(result.series).toHaveLength(12);
    expect(result.series.map((point) => point.date)).toEqual(monthStarts(BASE_CONFIG.dateRange));
  });

  it("names every point by the first day of its month", () => {
    for (const point of analysis.run(COMPARISON_CONFIG).series) {
      expect(point.date).toMatch(/^\d{4}-\d{2}-01$/);
    }
  });

  it("keys values by area id, for every area, in every month", () => {
    const result = analysis.run(COMPARISON_CONFIG);
    for (const point of result.series) {
      expect(Object.keys(point.values).sort()).toEqual([...COMPARISON_CONFIG.areas].sort());
    }
  });

  it("covers a partial first and last month", () => {
    const result = analysis.run({ ...BASE_CONFIG, dateRange: { start: "2024-01-20", end: "2024-03-05" } });
    expect(result.series.map((point) => point.date)).toEqual(["2024-01-01", "2024-02-01", "2024-03-01"]);
  });
});

describe("cloud gaps", () => {
  it("puts at least one null in a known twelve-month config", () => {
    const result = analysis.run(BASE_CONFIG);
    const nulls = result.series.filter((point) => point.values.turkana === null);
    expect(nulls.length).toBeGreaterThanOrEqual(1);
  });

  it("puts the nulls in the same months every run", () => {
    const first = analysis.run(BASE_CONFIG).series.map((point) => point.values.turkana === null);
    const second = analysis.run(BASE_CONFIG).series.map((point) => point.values.turkana === null);
    expect(first).toEqual(second);
    expect(first.some((isNull) => isNull)).toBe(true);
  });

  it("keeps the gaps to a small share of a long window", () => {
    const result = analysis.run(TEN_YEARS);
    const total = result.series.length;
    const nulls = result.series.filter((point) => point.values.turkana === null).length;
    expect(total).toBe(120);
    expect(nulls).toBeGreaterThanOrEqual(1);
    expect(nulls / total).toBeLessThan(0.25);
  });

  it("inserts no gaps in a window too short to spare a month", () => {
    const result = analysis.run({ ...BASE_CONFIG, dateRange: { start: "2024-02-01", end: "2024-03-15" } });
    expect(result.series).toHaveLength(2);
    for (const point of result.series) {
      expect(point.values.turkana).not.toBeNull();
    }
  });

  it("gaps one area without gapping the others in the same month", () => {
    // Cloud is not synchronised across the country, and a chart that assumes it
    // is would draw a break in every line at once.
    const result = analysis.run(COMPARISON_CONFIG);
    const gappedMonths = result.series.filter((point) =>
      Object.values(point.values).some((value) => value === null),
    );
    expect(gappedMonths.length).toBeGreaterThan(0);
    const anyPartial = gappedMonths.some((point) =>
      Object.values(point.values).some((value) => value !== null),
    );
    expect(anyPartial).toBe(true);
  });
});

describe("the seasonal signal", () => {
  it("is visible: May and December months read higher than the August trough", () => {
    // Averaged across ten years and both arid counties, the seasonal term should
    // dominate the noise. This is the test that catches a seasonal signal wired
    // to the wrong months or drowned by noise.
    const result = analysis.run({
      ...TEN_YEARS,
      analysisType: "comparison",
      areas: ["turkana", "marsabit"],
    });
    const byMonth = new Map<number, number[]>();
    for (const point of result.series) {
      const month = Number(point.date.slice(5, 7));
      const values = Object.values(point.values).filter((value): value is number => value !== null);
      byMonth.set(month, [...(byMonth.get(month) ?? []), ...values]);
    }
    const mean = (month: number): number => {
      const values = byMonth.get(month) ?? [];
      return values.reduce((sum, value) => sum + value, 0) / values.length;
    };
    expect(mean(5)).toBeGreaterThan(mean(8));
    expect(mean(12)).toBeGreaterThan(mean(8));
    expect(mean(5)).toBeGreaterThan(mean(12));
  });

  it("orders the seasonal term the same way the series is built from it", () => {
    expect(seasonalIndex(5)).toBeGreaterThan(seasonalIndex(12));
    expect(seasonalIndex(12)).toBeGreaterThan(seasonalIndex(8));
  });

  it("keeps month-to-month movement plausible rather than jumping the domain", () => {
    const result = analysis.run(TEN_YEARS);
    const span = result.indicator.domain[1] - result.indicator.domain[0];
    let previous: number | null = null;
    for (const point of result.series) {
      const value = point.values.turkana;
      if (value !== null && previous !== null) {
        expect(Math.abs(value - previous)).toBeLessThan(span * 0.35);
      }
      if (value !== null) previous = value;
    }
  });
});
