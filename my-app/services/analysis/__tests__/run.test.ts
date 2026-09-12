/**
 * `run` is the contract's promise that a result is a pure function of its
 * config. These tests are written against the invariants rather than against the
 * specific numbers, on purpose: when `simulateRun` is replaced by a real model
 * backend, this file is what says the replacement is still usable by the pages.
 */
import { describe, expect, it } from "vitest";
import type { AnalysisService, RunConfig } from "@/contracts/analysis";
import type { IndicatorSpec } from "@/contracts/catalog";
import { AFFECTED_SHARE_BY_SEVERITY, SEVERITY_ORDER } from "../constants";
import { runIdFor } from "../hash";
import { createAnalysisService, overlayCellSize, worstSeverity } from "../service";
import { syntheticPopulation } from "../synthetic";
import {
  BASE_CONFIG,
  COMPARISON_CONFIG,
  FLOOD_CONFIG,
  MURANGA,
  STUB_AREAS,
  TURKANA,
  stubCatalog,
  stubGeo,
} from "./stubs";

const catalog = stubCatalog();
const geo = stubGeo();
const analysis = createAnalysisService({ catalog, geo });

/**
 * The widened `parseQuery` still satisfies the contract. This is a compile-time
 * assertion: if the impl type stops being assignable to `AnalysisService`, the
 * typecheck fails here rather than in whichever page imports the singleton.
 */
const asContract: AnalysisService = analysis;

function inDomain(indicator: IndicatorSpec, value: number): boolean {
  return value >= indicator.domain[0] && value <= indicator.domain[1];
}

/** A spread of valid configs, used wherever an invariant should hold everywhere. */
const CONFIG_TABLE: readonly RunConfig[] = [
  BASE_CONFIG,
  COMPARISON_CONFIG,
  FLOOD_CONFIG,
  { ...BASE_CONFIG, model: "xgboost" },
  { ...BASE_CONFIG, areas: ["muranga"] },
  { ...BASE_CONFIG, areas: ["taita-taveta"] },
  { ...BASE_CONFIG, topic: "flood-risk", areas: ["marsabit"] },
  {
    ...BASE_CONFIG,
    analysisType: "comparison",
    areas: ["turkana", "marsabit", "muranga", "taita-taveta"],
    dateRange: { start: "2015-01-01", end: "2024-12-31" },
    model: "xgboost",
  },
  { ...BASE_CONFIG, dateRange: { start: "2024-11-01", end: "2024-12-31" } },
];

describe("the contract surface", () => {
  it("is satisfied by the concrete service", () => {
    expect(typeof asContract.run).toBe("function");
    expect(typeof asContract.runId).toBe("function");
    expect(typeof asContract.stages).toBe("function");
    expect(typeof asContract.export).toBe("function");
    expect(typeof asContract.parseQuery).toBe("function");
    expect(typeof asContract.toQuery).toBe("function");
  });
});

describe("determinism", () => {
  it("returns the same runId as the hash module", () => {
    expect(analysis.runId(BASE_CONFIG)).toBe(runIdFor(BASE_CONFIG));
  });

  it("deep equals itself when called twice", () => {
    expect(analysis.run(COMPARISON_CONFIG)).toEqual(analysis.run(COMPARISON_CONFIG));
  });

  it("deep equals itself across a fresh service instance, so nothing is cached in a closure", () => {
    const other = createAnalysisService({ catalog: stubCatalog(), geo: stubGeo() });
    expect(other.run(COMPARISON_CONFIG)).toEqual(analysis.run(COMPARISON_CONFIG));
  });

  it("ignores the config object's key order", () => {
    const reordered = {
      model: COMPARISON_CONFIG.model,
      dateRange: {
        end: COMPARISON_CONFIG.dateRange.end,
        start: COMPARISON_CONFIG.dateRange.start,
      },
      areas: [...COMPARISON_CONFIG.areas],
      topic: COMPARISON_CONFIG.topic,
      analysisType: COMPARISON_CONFIG.analysisType,
    } as RunConfig;
    const fromReordered = analysis.run(reordered);
    const fromBase = analysis.run(COMPARISON_CONFIG);
    expect(fromReordered.runId).toBe(fromBase.runId);
    // `config` is echoed back as given, so compare everything else.
    expect({ ...fromReordered, config: null }).toEqual({ ...fromBase, config: null });
  });

  it("derives generatedAt from the window instead of the clock", () => {
    const result = analysis.run(BASE_CONFIG);
    expect(result.generatedAt).toMatch(/^2024-12-31T\d{2}:\d{2}:00\.000Z$/);
    expect(analysis.run(BASE_CONFIG).generatedAt).toBe(result.generatedAt);
  });

  it("echoes the config and the catalogue entries it was given", () => {
    const result = analysis.run(BASE_CONFIG);
    expect(result.config).toEqual(BASE_CONFIG);
    expect(result.topic).toBe(catalog.getTopic("drought"));
    expect(result.indicator).toBe(catalog.getTopic("drought").indicator);
    expect(result.analysisType).toBe("single");
    expect(result.metrics.model).toBe(catalog.getModel("random-forest"));
  });

  it("keeps the areas in the order the caller asked for", () => {
    const result = analysis.run(COMPARISON_CONFIG);
    expect(result.areas.map((entry) => entry.area.id)).toEqual([...COMPARISON_CONFIG.areas]);
  });
});

describe("every value stays inside the indicator domain", () => {
  it.each(CONFIG_TABLE.map((config, index) => [index, config] as const))(
    "config %i keeps estimates, series and overlay in range",
    (_index, config) => {
      const result = analysis.run(config);
      const indicator = result.indicator;

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
      for (const cell of result.overlay) {
        expect(inDomain(indicator, cell.value)).toBe(true);
      }
    },
  );

  it.each(CONFIG_TABLE.map((config, index) => [index, config] as const))(
    "config %i orders every interval",
    (_index, config) => {
      for (const entry of analysis.run(config).areas) {
        expect(entry.estimate.lower).toBeLessThanOrEqual(entry.estimate.value);
        expect(entry.estimate.value).toBeLessThanOrEqual(entry.estimate.upper);
      }
    },
  );

  it("never has to clamp an interval to the domain, which would hide the width effects", () => {
    for (const config of CONFIG_TABLE) {
      const result = analysis.run(config);
      for (const entry of result.areas) {
        expect(entry.estimate.lower).toBeGreaterThan(result.indicator.domain[0]);
        expect(entry.estimate.upper).toBeLessThan(result.indicator.domain[1]);
      }
    }
  });
});

describe("interval width", () => {
  const widthFor = (config: RunConfig): number => {
    const [entry] = analysis.run(config).areas;
    return entry.estimate.upper - entry.estimate.lower;
  };

  it("is wider for a shorter window, because there is less data behind it", () => {
    const short = widthFor({ ...BASE_CONFIG, dateRange: { start: "2024-11-01", end: "2024-12-31" } });
    const oneYear = widthFor(BASE_CONFIG);
    const tenYears = widthFor({ ...BASE_CONFIG, dateRange: { start: "2015-01-01", end: "2024-12-31" } });
    expect(short).toBeGreaterThan(oneYear);
    expect(oneYear).toBeGreaterThan(tenYears);
  });

  it("is narrower for the costlier model on the same config", () => {
    expect(widthFor({ ...BASE_CONFIG, model: "xgboost" })).toBeLessThan(widthFor(BASE_CONFIG));
  });

  it("holds both effects for every area of a comparison", () => {
    const cheap = analysis.run({ ...COMPARISON_CONFIG, model: "random-forest" });
    const costly = analysis.run(COMPARISON_CONFIG);
    for (let i = 0; i < cheap.areas.length; i += 1) {
      const cheapWidth = cheap.areas[i].estimate.upper - cheap.areas[i].estimate.lower;
      const costlyWidth = costly.areas[i].estimate.upper - costly.areas[i].estimate.lower;
      expect(costlyWidth).toBeLessThan(cheapWidth);
    }
  });
});

describe("bands and severity", () => {
  it("classifies every estimate through the injected catalogue, never on its own", () => {
    for (const config of CONFIG_TABLE) {
      const result = analysis.run(config);
      for (const entry of result.areas) {
        expect(entry.band).toEqual(catalog.classify(result.indicator, entry.estimate.value));
      }
    }
  });

  it("reports the worst severity across areas as the headline", () => {
    const result = analysis.run({
      ...BASE_CONFIG,
      analysisType: "comparison",
      areas: ["turkana", "marsabit", "muranga", "taita-taveta"],
    });
    const expected = worstSeverity(result.areas.map((entry) => entry.band.severity));
    expect(result.headlineSeverity).toBe(expected);
    for (const entry of result.areas) {
      expect(SEVERITY_ORDER.indexOf(entry.band.severity)).toBeLessThanOrEqual(
        SEVERITY_ORDER.indexOf(result.headlineSeverity),
      );
    }
  });

  it("orders severity explicitly, worst last", () => {
    expect(SEVERITY_ORDER).toEqual(["good", "warning", "serious", "critical"]);
    expect(worstSeverity(["good", "critical", "warning"])).toBe("critical");
    expect(worstSeverity(["good"])).toBe("good");
    expect(worstSeverity([])).toBe("good");
  });

  it("reaches both ends of the band table across a spread of configs, so no band is dead code", () => {
    const seen = new Set<string>();
    for (const area of STUB_AREAS) {
      for (const topic of ["drought", "flood-risk"] as const) {
        for (let year = 2016; year <= 2024; year += 1) {
          const result = analysis.run({
            topic,
            analysisType: "single",
            areas: [area.id],
            dateRange: { start: `${year}-01-01`, end: `${year}-12-31` },
            model: "random-forest",
          });
          for (const entry of result.areas) seen.add(entry.band.severity);
        }
      }
    }
    expect([...seen]).toContain("critical");
    expect([...seen]).toContain("good");
  });
});

describe("affectedAreaShare", () => {
  it("stays in 0..1 and inside the range its own severity allows", () => {
    for (const config of CONFIG_TABLE) {
      for (const entry of analysis.run(config).areas) {
        const [lo, hi] = AFFECTED_SHARE_BY_SEVERITY[entry.band.severity];
        expect(entry.affectedAreaShare).toBeGreaterThanOrEqual(0);
        expect(entry.affectedAreaShare).toBeLessThanOrEqual(1);
        expect(entry.affectedAreaShare).toBeGreaterThanOrEqual(lo);
        expect(entry.affectedAreaShare).toBeLessThanOrEqual(hi);
      }
    }
  });

  it("cannot report a small share for a critical area", () => {
    // The relationship is explicit in the table, so assert the table too: a
    // critical area's floor has to sit above every other band's ceiling.
    expect(AFFECTED_SHARE_BY_SEVERITY.critical[0]).toBeGreaterThan(AFFECTED_SHARE_BY_SEVERITY.serious[0]);
    expect(AFFECTED_SHARE_BY_SEVERITY.critical[0]).toBeGreaterThan(AFFECTED_SHARE_BY_SEVERITY.good[1]);
    expect(AFFECTED_SHARE_BY_SEVERITY.critical[0]).toBeGreaterThan(0.5);

    for (const area of STUB_AREAS) {
      for (let year = 2016; year <= 2024; year += 1) {
        const result = analysis.run({
          ...BASE_CONFIG,
          areas: [area.id],
          dateRange: { start: `${year}-01-01`, end: `${year}-12-31` },
        });
        for (const entry of result.areas) {
          if (entry.band.severity === "critical") {
            expect(entry.affectedAreaShare).toBeGreaterThan(0.5);
          }
          if (entry.band.severity === "good") {
            expect(entry.affectedAreaShare).toBeLessThan(0.2);
          }
        }
      }
    }
  });
});

describe("populationExposed", () => {
  it("is a rounded share of the area's synthetic population", () => {
    for (const entry of analysis.run(COMPARISON_CONFIG).areas) {
      const population = syntheticPopulation(entry.area);
      expect(entry.populationExposed % 100).toBe(0);
      expect(entry.populationExposed).toBeGreaterThan(0);
      expect(entry.populationExposed).toBeLessThanOrEqual(population);
      expect(Number.isInteger(entry.populationExposed)).toBe(true);
    }
  });

  it("uses a population that does not move between runs, since a county's population does not", () => {
    expect(syntheticPopulation(TURKANA)).toBe(syntheticPopulation(TURKANA));
    expect(syntheticPopulation(TURKANA)).not.toBe(syntheticPopulation(MURANGA));
    expect(syntheticPopulation(TURKANA) % 1000).toBe(0);
  });

  it("tracks the affected share: a worse area exposes more of its own population", () => {
    const result = analysis.run(FLOOD_CONFIG);
    for (const entry of result.areas) {
      const population = syntheticPopulation(entry.area);
      const implied = entry.populationExposed / population;
      expect(Math.abs(implied - entry.affectedAreaShare)).toBeLessThan(0.01);
    }
  });
});

describe("changeYoY", () => {
  it("is a signed change in indicator units, small enough to be plausible year to year", () => {
    for (const config of CONFIG_TABLE) {
      const result = analysis.run(config);
      const span = result.indicator.domain[1] - result.indicator.domain[0];
      for (const entry of result.areas) {
        expect(Number.isFinite(entry.changeYoY)).toBe(true);
        expect(Math.abs(entry.changeYoY)).toBeLessThanOrEqual(span * 0.2);
      }
    }
  });

  it("is signed both ways across a spread of areas and windows", () => {
    const signs = new Set<number>();
    for (const area of STUB_AREAS) {
      for (let year = 2018; year <= 2024; year += 1) {
        const result = analysis.run({
          ...BASE_CONFIG,
          areas: [area.id],
          dateRange: { start: `${year}-01-01`, end: `${year}-12-31` },
        });
        for (const entry of result.areas) signs.add(Math.sign(entry.changeYoY));
      }
    }
    expect([...signs]).toContain(1);
    expect([...signs]).toContain(-1);
  });
});

describe("frame and overlay", () => {
  it("takes the frame from the geo service, never from its own maths", () => {
    expect(analysis.run(BASE_CONFIG).frame).toEqual(geo.frame());
  });

  it("derives the cell size from the frame width", () => {
    expect(overlayCellSize(800)).toBe(11);
    expect(overlayCellSize(72)).toBe(4);
    expect(overlayCellSize(7200)).toBe(100);
  });

  it("covers every requested area with a useful number of cells", () => {
    const result = analysis.run(COMPARISON_CONFIG);
    expect(result.overlay.length).toBeGreaterThan(200);
    const areasWithCells = new Set(result.overlay.map((cell) => cell.areaId));
    expect(areasWithCells).toEqual(new Set(COMPARISON_CONFIG.areas));
    for (const cell of result.overlay) {
      expect(cell.size).toBe(overlayCellSize(geo.frame().width));
    }
  });
});

describe("failure modes", () => {
  it("refuses to report on fewer areas than it was asked about", () => {
    expect(() => analysis.run({ ...BASE_CONFIG, areas: ["atlantis"] })).toThrow(/unknown area ids: atlantis/);
    expect(() =>
      analysis.run({ ...BASE_CONFIG, analysisType: "comparison", areas: ["turkana", "atlantis"] }),
    ).toThrow(/atlantis/);
  });

  it("lets the catalogue reject an unknown topic or model", () => {
    expect(() => analysis.run({ ...BASE_CONFIG, topic: "rangeland-dynamics" })).toThrow(/no topic/);
  });
});
