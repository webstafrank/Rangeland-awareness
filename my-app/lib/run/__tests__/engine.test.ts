/**
 * `run` is the promise that a result is a pure function of its config, and
 * every invariant CONTRACT section 3 states.
 *
 * Written against the invariants rather than against the numbers, on purpose.
 * When `engine.ts` is replaced by a real model backend this file is what says
 * the replacement is still usable by the pages, and a suite full of pinned
 * floats would have to be deleted on that day instead of run.
 */
import { describe, expect, it } from "vitest";
import { getFormula } from "@/lib/analysis/formulas";
import type { FormulaId } from "@/lib/analysis/formulas";
import { getAnalysisType } from "@/lib/analysis/models";
import { run, runId } from "@/lib/run";
import type { RunConfig } from "@/lib/run/config";
import { AFFECTED_SHARE_BY_SEVERITY, SEVERITY_ORDER } from "@/lib/run/constants";
import { formulaValuesFor } from "@/lib/run/engine";
import { runIdFor } from "@/lib/run/hash";
import { classify, indicatorFor, spanOf } from "@/lib/run/indicators";
import type { IndicatorSpec } from "@/lib/run/result";
import {
  ALL_AREAS,
  BASE_CONFIG,
  COMPARISON_CONFIG,
  CONFIG_TABLE,
  FLOOD_CONFIG,
  KERICHO,
  MURANGA,
  TURKANA,
  WAJIR,
  areaAt,
  config,
} from "./fixtures";

const inDomain = (indicator: IndicatorSpec, value: number): boolean =>
  value >= indicator.domain[0] && value <= indicator.domain[1];

const labelled = CONFIG_TABLE.map((c, i) => [i, c] as const);

describe("determinism", () => {
  it("returns the same runId as the hash module", () => {
    expect(runId(BASE_CONFIG)).toBe(runIdFor(BASE_CONFIG));
  });

  it("deep equals itself when called twice", () => {
    expect(run(COMPARISON_CONFIG)).toEqual(run(COMPARISON_CONFIG));
  });

  it("serialises byte-identically when called twice, which is the actual claim", () => {
    // Deep equality would pass on two objects whose key insertion order differs,
    // and the JSON export would then differ byte for byte between two loads of
    // the same URL. This is the assertion the contract's wording asks for.
    expect(JSON.stringify(run(COMPARISON_CONFIG))).toBe(JSON.stringify(run(COMPARISON_CONFIG)));
  });

  it.each(labelled)("config %i is stable across repeated runs", (_i, c) => {
    expect(JSON.stringify(run(c))).toBe(JSON.stringify(run(c)));
  });

  it("ignores the config object's own key order", () => {
    const reordered = {
      model: COMPARISON_CONFIG.model,
      dateWindow: {
        end: COMPARISON_CONFIG.dateWindow.end,
        start: COMPARISON_CONFIG.dateWindow.start,
      },
      areas: [...COMPARISON_CONFIG.areas],
      formulas: [...COMPARISON_CONFIG.formulas],
      schemaVersion: COMPARISON_CONFIG.schemaVersion,
      topic: COMPARISON_CONFIG.topic,
      analysisType: COMPARISON_CONFIG.analysisType,
    } as RunConfig;
    const a = run(reordered);
    const b = run(COMPARISON_CONFIG);
    expect(a.runId).toBe(b.runId);
    // `config` is echoed back exactly as given, so compare everything else.
    expect({ ...a, config: null }).toEqual({ ...b, config: null });
  });

  it("does not depend on the order the analyst added the areas", () => {
    const forwards = run(config({ analysisType: "comparison", areas: [TURKANA, MURANGA] }));
    const backwards = run(config({ analysisType: "comparison", areas: [MURANGA, TURKANA] }));
    expect(backwards.runId).toBe(forwards.runId);
    // Same numbers, different presentation order.
    expect(backwards.areas.map((a) => a.label)).toEqual(["Murang'a", "Turkana"]);
    expect(backwards.areas[1].estimate).toEqual(forwards.areas[0].estimate);
  });

  it("does not depend on the session ids the reducer happened to stamp", () => {
    const renumbered = run(config({ areas: [{ ...TURKANA, id: "aoi-42" }] }));
    const original = run(BASE_CONFIG);
    expect(renumbered.areas[0].estimate).toEqual(original.areas[0].estimate);
    expect(renumbered.metrics).toEqual(original.metrics);
  });

  it("derives generatedAt from the window's end date, never from a clock", () => {
    const result = run(BASE_CONFIG);
    expect(result.generatedAt).toMatch(/^2024-12-31T\d{2}:\d{2}:00\.000Z$/);
    expect(run(BASE_CONFIG).generatedAt).toBe(result.generatedAt);
    // A different window moves it, which is what makes it derived rather than
    // constant.
    expect(run(config({ dateWindow: { start: "2023-01-01", end: "2023-06-30" } })).generatedAt).toMatch(
      /^2023-06-30T/,
    );
  });

  it("echoes the config it was given, unmodified", () => {
    const result = run(BASE_CONFIG);
    expect(result.config).toEqual(BASE_CONFIG);
    expect(result.config).toBe(BASE_CONFIG);
  });

  it("keeps the areas in the order the analyst selected them", () => {
    const result = run(COMPARISON_CONFIG);
    expect(result.areas.map((entry) => entry.areaId)).toEqual(
      COMPARISON_CONFIG.areas.map((a) => a.id),
    );
    expect(result.areas.map((entry) => entry.label)).toEqual(
      COMPARISON_CONFIG.areas.map((a) => a.label),
    );
  });
});

describe("the indicator domain holds", () => {
  it.each(labelled)("config %i keeps estimates and series in range", (_i, c) => {
    const result = run(c);
    const indicator = result.indicator;
    expect(indicator).toBe(indicatorFor(c.topic));

    for (const entry of result.areas) {
      expect(inDomain(indicator, entry.estimate.value)).toBe(true);
      expect(inDomain(indicator, entry.estimate.lower)).toBe(true);
      expect(inDomain(indicator, entry.estimate.upper)).toBe(true);
    }
    for (const point of result.series) {
      for (const value of Object.values(point.values)) {
        if (value !== null) expect(inDomain(indicator, value)).toBe(true);
      }
    }
  });

  it.each(labelled)("config %i orders every interval", (_i, c) => {
    for (const entry of run(c).areas) {
      expect(entry.estimate.lower).toBeLessThanOrEqual(entry.estimate.value);
      expect(entry.estimate.value).toBeLessThanOrEqual(entry.estimate.upper);
    }
  });

  /**
   * If an interval ever touched a domain end it would be silently clamped, and
   * the two width relationships the results page explains would stop being true
   * exactly for the most extreme areas, which are the ones anyone looks at.
   */
  it.each(labelled)("config %i never has to clamp an interval", (_i, c) => {
    const result = run(c);
    for (const entry of result.areas) {
      expect(entry.estimate.lower).toBeGreaterThan(result.indicator.domain[0]);
      expect(entry.estimate.upper).toBeLessThan(result.indicator.domain[1]);
    }
  });
});

describe("interval width", () => {
  const widthOf = (c: RunConfig, index = 0): number => {
    const entry = run(c).areas[index];
    return entry.estimate.upper - entry.estimate.lower;
  };

  it("is wider for a shorter window, because there is less data behind it", () => {
    const short = widthOf(config({ dateWindow: { start: "2024-11-15", end: "2024-12-31" } }));
    const oneYear = widthOf(BASE_CONFIG);
    const tenYears = widthOf(config({ dateWindow: { start: "2015-01-01", end: "2024-12-31" } }));
    expect(short).toBeGreaterThan(oneYear);
    expect(oneYear).toBeGreaterThan(tenYears);
  });

  it("is narrower for a costlier model on the same config", () => {
    const forest = widthOf(config({ model: "random-forest" }));
    const boosted = widthOf(config({ model: "xgboost" }));
    const ensemble = widthOf(config({ model: "combined" }));
    expect(boosted).toBeLessThan(forest);
    expect(ensemble).toBeLessThan(boosted);
  });

  it("holds the model effect for every area of a comparison, not just on average", () => {
    const areas = [...ALL_AREAS];
    const cheap = run(config({ analysisType: "comparison", areas, model: "random-forest" }));
    const costly = run(config({ analysisType: "comparison", areas, model: "combined" }));
    for (let i = 0; i < areas.length; i += 1) {
      const cheapWidth = cheap.areas[i].estimate.upper - cheap.areas[i].estimate.lower;
      const costlyWidth = costly.areas[i].estimate.upper - costly.areas[i].estimate.lower;
      expect(costlyWidth).toBeLessThan(cheapWidth);
    }
  });
});

describe("bands", () => {
  it.each(labelled)("config %i classifies through the shared table, never twice", (_i, c) => {
    const result = run(c);
    for (const entry of result.areas) {
      expect(entry.band).toBe(classify(result.indicator, entry.estimate.value));
    }
  });

  it("reports the worst band across areas as the headline", () => {
    const result = run(config({ analysisType: "comparison", areas: [...ALL_AREAS] }));
    for (const entry of result.areas) {
      expect(SEVERITY_ORDER.indexOf(entry.band.severity)).toBeLessThanOrEqual(
        SEVERITY_ORDER.indexOf(result.headlineBand.severity),
      );
    }
    expect(result.areas.map((e) => e.band.severity)).toContain(result.headlineBand.severity);
  });

  it("still returns a headline band for a run with no areas, rather than undefined", () => {
    const empty = run(config({ areas: [] }));
    expect(empty.headlineBand).toBeDefined();
    expect(empty.headlineBand.severity).toBe("none");
    expect(empty.areas).toHaveLength(0);
    expect(empty.narrative).toContain("no areas");
  });

  it("reaches several bands across a spread of areas and windows, so none is theoretical", () => {
    const seen = new Set<string>();
    for (const area of ALL_AREAS) {
      for (let year = 2016; year <= 2024; year += 1) {
        const result = run(
          config({ areas: [area], dateWindow: { start: `${year}-01-01`, end: `${year}-12-31` } }),
        );
        seen.add(result.areas[0].band.id);
      }
    }
    // Five bands exist; a generator that only ever produced two would make the
    // legend and the severity copy untestable by anything real.
    expect(seen.size).toBeGreaterThanOrEqual(4);
  });
});

describe("the climate proxy shows through", () => {
  /**
   * The reason `aridity.ts` exists. Averaged over many windows, the ASAL areas
   * have to read worse than the highlands, or the map looks random to anyone
   * who knows the country. Averaged, never per run: the spread is deliberately
   * wide enough that any single area can land anywhere.
   */
  const meanStressOf = (area: (typeof ALL_AREAS)[number]): number => {
    const indicator = indicatorFor("drought-monitoring");
    let total = 0;
    let n = 0;
    for (let year = 2010; year <= 2024; year += 1) {
      const result = run(
        config({ areas: [area], dateWindow: { start: `${year}-01-01`, end: `${year}-12-31` } }),
      );
      // VHI is badEnd low, so a lower value is more stress. Normalise so a
      // higher number always means worse, whatever the indicator.
      total += 1 - (result.areas[0].estimate.value - indicator.domain[0]) / spanOf(indicator);
      n += 1;
    }
    return total / n;
  };

  it("reads the arid north worse than the wet highlands, on average", () => {
    expect(meanStressOf(TURKANA)).toBeGreaterThan(meanStressOf(MURANGA));
    expect(meanStressOf(WAJIR)).toBeGreaterThan(meanStressOf(KERICHO));
  });

  it("still lets a humid area reach a bad band, so the climate term is a bias, not a verdict", () => {
    const seen = new Set<string>();
    for (let year = 2000; year <= 2024; year += 1) {
      seen.add(
        run(config({ areas: [KERICHO], dateWindow: { start: `${year}-01-01`, end: `${year}-12-31` } }))
          .areas[0].band.severity,
      );
    }
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe("affectedAreaShare", () => {
  it.each(labelled)("config %i stays inside the range its own severity allows", (_i, c) => {
    for (const entry of run(c).areas) {
      const [lo, hi] = AFFECTED_SHARE_BY_SEVERITY[entry.band.severity];
      expect(entry.affectedAreaShare).toBeGreaterThanOrEqual(0);
      expect(entry.affectedAreaShare).toBeLessThanOrEqual(1);
      expect(entry.affectedAreaShare).toBeGreaterThanOrEqual(lo);
      expect(entry.affectedAreaShare).toBeLessThanOrEqual(hi);
    }
  });

  it("cannot report a small share for the worst band, or a large one for the best", () => {
    // Assert the table itself as well as the output: the relationship is only
    // guaranteed because the ranges do not overlap.
    expect(AFFECTED_SHARE_BY_SEVERITY.severe[0]).toBeGreaterThan(
      AFFECTED_SHARE_BY_SEVERITY.high[0],
    );
    expect(AFFECTED_SHARE_BY_SEVERITY.severe[0]).toBeGreaterThan(
      AFFECTED_SHARE_BY_SEVERITY.none[1],
    );

    for (const area of ALL_AREAS) {
      for (let year = 2016; year <= 2024; year += 1) {
        for (const entry of run(
          config({ areas: [area], dateWindow: { start: `${year}-01-01`, end: `${year}-12-31` } }),
        ).areas) {
          if (entry.band.severity === "severe") expect(entry.affectedAreaShare).toBeGreaterThan(0.7);
          if (entry.band.severity === "none") expect(entry.affectedAreaShare).toBeLessThan(0.1);
        }
      }
    }
  });
});

describe("changeYoY", () => {
  it.each(labelled)("config %i reports a plausible signed change", (_i, c) => {
    const result = run(c);
    const span = spanOf(result.indicator);
    for (const entry of result.areas) {
      expect(Number.isFinite(entry.changeYoY)).toBe(true);
      // Bounded by YOY_MAX_STEP over the level band, plus rounding.
      expect(Math.abs(entry.changeYoY)).toBeLessThanOrEqual(span * 0.2);
    }
  });

  it("is signed both ways across a spread of areas and windows", () => {
    const signs = new Set<number>();
    for (const area of ALL_AREAS) {
      for (let year = 2018; year <= 2024; year += 1) {
        signs.add(
          Math.sign(
            run(config({ areas: [area], dateWindow: { start: `${year}-01-01`, end: `${year}-12-31` } }))
              .areas[0].changeYoY,
          ),
        );
      }
    }
    expect([...signs]).toContain(1);
    expect([...signs]).toContain(-1);
  });
});

describe("formulaValues", () => {
  it.each(labelled)("config %i gives one value per selected formula", (_i, c) => {
    for (const entry of run(c).areas) {
      expect(Object.keys(entry.formulaValues).sort()).toEqual([...c.formulas].sort());
    }
  });

  it.each(labelled)("config %i keeps every value inside that formula's own range", (_i, c) => {
    for (const entry of run(c).areas) {
      for (const [id, value] of Object.entries(entry.formulaValues)) {
        const formula = getFormula(id);
        expect(formula, `formula "${id}" is not in the registry`).toBeDefined();
        if (!formula) continue;
        const [lo, hi] = formula.range;
        expect(Number.isFinite(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(lo);
        expect(value).toBeLessThanOrEqual(hi);
      }
    }
  });

  it("moves with the area's condition, so the page tells one story", () => {
    // NDVI is a greenness index: the worse the area, the lower it reads.
    const healthy = formulaValuesFor("run", "area", "rangeland-dynamics", ["ndvi"] as FormulaId[], 0.1);
    const stressed = formulaValuesFor("run", "area", "rangeland-dynamics", ["ndvi"] as FormulaId[], 0.9);
    expect(healthy.ndvi).toBeGreaterThan(stressed.ndvi);

    // The Bare Soil Index points the other way, and the engine knows it.
    const bareHealthy = formulaValuesFor("run", "area", "rangeland-dynamics", ["bsi"] as FormulaId[], 0.1);
    const bareStressed = formulaValuesFor("run", "area", "rangeland-dynamics", ["bsi"] as FormulaId[], 0.9);
    expect(bareStressed.bsi).toBeGreaterThan(bareHealthy.bsi);
  });

  /**
   * The flood exception. Under every other topic a wetter canopy means a
   * healthier area; under flood risk it means more water on the ground. Reading
   * the base table for flood risk would report an area as less flood-prone the
   * wetter its soil is, which is backwards in the one topic where it matters.
   */
  it("flips the water indices under flood risk", () => {
    const dryRangeland = formulaValuesFor("r", "a", "rangeland-dynamics", ["ndmi"] as FormulaId[], 0.9);
    const wetRangeland = formulaValuesFor("r", "a", "rangeland-dynamics", ["ndmi"] as FormulaId[], 0.1);
    expect(wetRangeland.ndmi).toBeGreaterThan(dryRangeland.ndmi);

    const lowFlood = formulaValuesFor("r", "a", "flood-risk", ["ndmi"] as FormulaId[], 0.1);
    const highFlood = formulaValuesFor("r", "a", "flood-risk", ["ndmi"] as FormulaId[], 0.9);
    expect(highFlood.ndmi).toBeGreaterThan(lowFlood.ndmi);
  });

  it("skips an id the registry does not know rather than inventing a value for it", () => {
    const values = formulaValuesFor("r", "a", "flood-risk", ["ndwi", "not-real"] as FormulaId[], 0.5);
    expect(Object.keys(values)).toEqual(["ndwi"]);
  });

  it("gives two different formulas two different values for one area", () => {
    const entry = run(FLOOD_CONFIG).areas[0];
    const values = Object.values(entry.formulaValues);
    expect(new Set(values).size).toBe(values.length);
  });

  it("is stable for an area across two runs that share its geometry", () => {
    const a = run(config({ areas: [TURKANA] }));
    const b = run(config({ areas: [{ ...TURKANA, id: "aoi-99", source: "shapefile" }] }));
    expect(b.areas[0].formulaValues).toEqual(a.areas[0].formulaValues);
  });
});

describe("failure modes and edges", () => {
  it("runs on the maximum comparison the analysis type allows", () => {
    const many = Array.from({ length: getAnalysisType("comparison").maxAreas }, (_, i) =>
      areaAt(`aoi-${i + 1}`, `Block ${i + 1}`, -2 + i * 0.6, 36 + i * 0.4, 0.2),
    );
    const result = run(config({ analysisType: "comparison", areas: many }));
    expect(result.areas).toHaveLength(many.length);
    expect(new Set(result.areas.map((a) => a.estimate.value)).size).toBeGreaterThan(1);
  });

  it("runs on the shortest and longest windows the config allows", () => {
    for (const dateWindow of [
      { start: "2024-06-01", end: "2024-06-30" },
      { start: "2015-01-01", end: "2024-12-31" },
    ]) {
      const result = run(config({ dateWindow }));
      expect(result.series.length).toBeGreaterThan(0);
      expect(result.areas).toHaveLength(1);
    }
  });

  it("gives two duplicate areas the same numbers under two ids, rather than failing", () => {
    // Reachable: an analyst can upload a shapefile twice. The right answer is
    // two identical rows, not a crash and not two different verdicts on one place.
    const result = run(
      config({ analysisType: "comparison", areas: [TURKANA, { ...TURKANA, id: "aoi-2" }] }),
    );
    expect(result.areas[0].estimate).toEqual(result.areas[1].estimate);
    expect(result.areas[0].areaId).not.toBe(result.areas[1].areaId);
  });

  it("throws for a topic with no indicator instead of inventing one", () => {
    expect(() => run(config({ topic: "not-a-topic" as never }))).toThrow(/no indicator/);
  });
});
