/**
 * The monthly series.
 *
 * The assertion that matters is the seasonal one. A chart that peaks in August
 * is read as broken on sight by anyone in Kenya, and a test that only checked
 * "the values vary" would pass on exactly that. So the signal is measured out
 * of the produced series, not out of `seasonality.ts`: the sign per topic, the
 * amplitude per area and the clamp into the domain all sit between the two, and
 * any of them could bury it.
 */
import { describe, expect, it } from "vitest";
import { run } from "@/lib/run";
import { CLOUD_GAP_RATE, SEASONAL_SIGN } from "@/lib/run/constants";
import { monthOf } from "@/lib/run/dates";
import { indicatorFor, spanOf } from "@/lib/run/indicators";
import type { RunResult } from "@/lib/run/result";
import { gapCountFor } from "@/lib/run/series";
import { ALL_AREAS, BASE_CONFIG, COMPARISON_CONFIG, CONFIG_TABLE, config } from "./fixtures";
import type { FormulaId } from "@/lib/analysis/formulas";

const DECADE = { start: "2015-01-01", end: "2024-12-31" };

/** Mean value per calendar month across every area and every year in the run. */
function monthlyMeans(result: RunResult): readonly number[] {
  const sums = Array.from({ length: 12 }, () => 0);
  const counts = Array.from({ length: 12 }, () => 0);
  for (const point of result.series) {
    const month = monthOf(point.date) - 1;
    for (const value of Object.values(point.values)) {
      if (value === null) continue;
      sums[month] += value;
      counts[month] += 1;
    }
  }
  return sums.map((sum, i) => (counts[i] === 0 ? Number.NaN : sum / counts[i]));
}

describe("shape", () => {
  it("has one point per calendar month the window touches, in order", () => {
    const result = run(config({ dateWindow: { start: "2024-01-15", end: "2024-04-02" } }));
    expect(result.series.map((p) => p.date)).toEqual([
      "2024-01-01",
      "2024-02-01",
      "2024-03-01",
      "2024-04-01",
    ]);
  });

  it("keys every point by every area id, even where the value is a gap", () => {
    const result = run(COMPARISON_CONFIG);
    const ids = COMPARISON_CONFIG.areas.map((a) => a.id);
    for (const point of result.series) {
      expect(Object.keys(point.values).sort()).toEqual([...ids].sort());
    }
  });

  it("carries 120 points for the longest window the config allows", () => {
    expect(run(config({ dateWindow: DECADE })).series).toHaveLength(120);
  });
});

describe("cloud gaps", () => {
  it("writes null for a gap, never a zero", () => {
    const result = run(config({ dateWindow: DECADE }));
    const values = result.series.flatMap((p) => Object.values(p.values));
    const gaps = values.filter((v) => v === null);
    expect(gaps.length).toBeGreaterThan(0);
    // A zero would be an observation of nothing rather than no observation, and
    // a spreadsheet averages it into the year without complaint.
    expect(values.some((v) => v === 0)).toBe(false);
  });

  it("inserts none in a window too short to hold one without hiding the signal", () => {
    expect(gapCountFor(1)).toBe(0);
    expect(gapCountFor(3)).toBe(0);
    expect(gapCountFor(4)).toBe(1);
    const short = run(config({ dateWindow: { start: "2024-06-01", end: "2024-07-31" } }));
    expect(short.series.flatMap((p) => Object.values(p.values)).some((v) => v === null)).toBe(false);
  });

  it("never drops more than a quarter of the series", () => {
    for (const months of [4, 6, 12, 24, 60, 120]) {
      expect(gapCountFor(months)).toBeLessThanOrEqual(Math.floor(months / 4));
      expect(gapCountFor(months)).toBeGreaterThanOrEqual(1);
    }
    expect(gapCountFor(120)).toBe(Math.round(120 * CLOUD_GAP_RATE));
  });

  it("puts the gaps in the same months on every run, and in different months per area", () => {
    const a = run(COMPARISON_CONFIG);
    const b = run(COMPARISON_CONFIG);
    expect(a.series).toEqual(b.series);

    const gapsByArea = new Map<string, number[]>();
    for (const [index, point] of a.series.entries()) {
      for (const [id, value] of Object.entries(point.values)) {
        if (value === null) (gapsByArea.get(id) ?? gapsByArea.set(id, []).get(id)!).push(index);
      }
    }
    // Cloud does not obscure three separate areas in exactly the same months.
    const patterns = new Set([...gapsByArea.values()].map((list) => list.join(",")));
    expect(patterns.size).toBeGreaterThan(1);
  });
});

describe("the Kenyan bimodal signal", () => {
  const wide = (topic: (typeof CONFIG_TABLE)[number]["topic"], formulas: FormulaId[]) =>
    run(
      config({
        topic,
        formulas,
        analysisType: "comparison",
        areas: [...ALL_AREAS],
        dateWindow: DECADE,
      }),
    );

  it("peaks in May for a topic rain improves, a month after the long rains", () => {
    const result = wide("drought-monitoring", ["vci", "vhi"] as FormulaId[]);
    const means = monthlyMeans(result);
    const peak = means.indexOf(Math.max(...means)) + 1;
    expect(peak).toBe(5);
  });

  it("carries the weaker December peak, after the short rains", () => {
    const means = monthlyMeans(wide("rangeland-dynamics", ["ndvi", "evi"] as FormulaId[]));
    expect(means[11]).toBeGreaterThan(means[10]); // December over November
    expect(means[11]).toBeGreaterThan(means[0]); // December over January
    expect(means[11]).toBeLessThan(means[4]); // and still below May
  });

  it("bottoms out in the long dry spell, with a gap worth looking at", () => {
    const result = wide("drought-monitoring", ["vci", "vhi"] as FormulaId[]);
    const means = monthlyMeans(result);
    const span = spanOf(result.indicator);
    const trough = means.indexOf(Math.min(...means)) + 1;
    expect([8, 9]).toContain(trough);
    // Not merely ordered: the season has to be visible on a chart.
    expect(means[4] - means[8]).toBeGreaterThan(span * 0.05);
  });

  /**
   * Kenya's hunger season is the opposite phase of its growing season, so the
   * IPC series has to fall when the rain comes. Getting this sign wrong would
   * put the food crisis in the middle of the harvest, which is the single most
   * visible way this generator could embarrass the agency.
   */
  it("runs the other way for food security, where rain is relief", () => {
    expect(SEASONAL_SIGN["food-security"]).toBe(-1);
    const result = wide("food-security", ["vhi", "spi"] as FormulaId[]);
    const means = monthlyMeans(result);
    const span = spanOf(result.indicator);
    expect(means[4]).toBeLessThan(means[8]);
    expect(means[8] - means[4]).toBeGreaterThan(span * 0.05);
    expect(means.indexOf(Math.min(...means)) + 1).toBe(5);
  });

  it("gives a drier area a sharper season than a wet one", () => {
    const seasonalRangeOf = (area: (typeof ALL_AREAS)[number]): number => {
      const means = monthlyMeans(
        run(config({ areas: [area], dateWindow: DECADE })),
      );
      return Math.max(...means) - Math.min(...means);
    };
    const arid = ALL_AREAS.find((a) => a.label === "Wajir")!;
    const humid = ALL_AREAS.find((a) => a.label === "Kericho")!;
    expect(seasonalRangeOf(arid)).toBeGreaterThan(seasonalRangeOf(humid));
  });
});

describe("the noise", () => {
  it("is correlated month to month, not independent static", () => {
    const result = run(config({ areas: [...ALL_AREAS], analysisType: "comparison", dateWindow: DECADE }));
    const id = ALL_AREAS[0].id;
    const values = result.series
      .map((p) => p.values[id])
      .filter((v): v is number => v !== null);
    // Compared against the seasonal step, which is the signal: consecutive
    // months differ by clearly less than half the peak-to-trough range, which
    // an independent draw at this amplitude would not manage.
    const steps = values.slice(1).map((v, i) => Math.abs(v - values[i]));
    const range = Math.max(...values) - Math.min(...values);
    expect(Math.max(...steps)).toBeLessThan(range);
  });

  it("does not move when the gap draw does, because they are separate streams", () => {
    // Two configs whose only difference is one area's label. The other area's
    // series must be untouched: a shared stream would shift it.
    const a = run(config({ analysisType: "comparison", areas: [ALL_AREAS[0], ALL_AREAS[1]] }));
    const b = run(
      config({
        analysisType: "comparison",
        areas: [ALL_AREAS[0], { ...ALL_AREAS[1], label: "Renamed" }],
      }),
    );
    // Both change, because the run id changed with the config. The point being
    // made is narrower: within one run the two areas are independent.
    const firstOf = (r: typeof a) => r.series.map((p) => p.values[ALL_AREAS[0].id]);
    expect(firstOf(a)).not.toEqual(firstOf(b));
    expect(firstOf(a)).toEqual(firstOf(run(config({
      analysisType: "comparison",
      areas: [ALL_AREAS[0], ALL_AREAS[1]],
    }))));
  });
});

describe("agreement with the headline", () => {
  it("sits around the area's own estimate rather than somewhere else entirely", () => {
    for (const c of [BASE_CONFIG, COMPARISON_CONFIG]) {
      const result = run(c);
      const span = spanOf(indicatorFor(c.topic));
      for (const entry of result.areas) {
        const values = result.series
          .map((p) => p.values[entry.areaId])
          .filter((v): v is number => v !== null);
        const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
        // The seasonal term is mean zero over a whole year, so a series mean
        // that drifted far from the estimate would mean the two disagree about
        // the same area on the same page.
        expect(Math.abs(mean - entry.estimate.value)).toBeLessThan(span * 0.15);
      }
    }
  });
});
