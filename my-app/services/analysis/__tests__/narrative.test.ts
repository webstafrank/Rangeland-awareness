/**
 * The sentence a non-specialist reads first.
 *
 * The trap it has to survive: direction is indicator-dependent. A rising
 * Vegetation Condition Index is recovery; a rising flood probability is the
 * opposite. Both directions are asserted on the actual wording here, because a
 * narrative that says "an improvement" over a worsening flood forecast is worse
 * than no narrative at all.
 */
import { describe, expect, it } from "vitest";
import type { AreaResult } from "@/contracts/analysis";
import { SEVERITY_ORDER } from "../constants";
import { isDeterioration, narrativeFor, worstArea } from "../narrative";
import { createAnalysisService } from "../service";
import {
  BASE_CONFIG,
  COMPARISON_CONFIG,
  FLOOD_CONFIG,
  FLOOD_PROBABILITY,
  MARSABIT,
  MURANGA,
  TURKANA,
  VCI,
  stubCatalog,
  stubGeo,
} from "./stubs";

const catalog = stubCatalog();
const analysis = createAnalysisService({ catalog, geo: stubGeo() });

/** A hand-built area result, so the wording can be asserted against fixed numbers. */
function areaResult(overrides: Partial<AreaResult> & Pick<AreaResult, "area">): AreaResult {
  return {
    estimate: { value: 18.4, lower: 12, upper: 24 },
    band: VCI.bands[0],
    changeYoY: -4.2,
    populationExposed: 120_000,
    affectedAreaShare: 0.7,
    ...overrides,
  };
}

const format = (value: number): string => catalog.formatValue(VCI, value);
const formatFlood = (value: number): string => catalog.formatValue(FLOOD_PROBABILITY, value);

describe("badEnd low (a vegetation index, where a fall is bad)", () => {
  it("calls a fall a deterioration", () => {
    const text = narrativeFor(
      {
        areas: [areaResult({ area: TURKANA, changeYoY: -4.2 })],
        indicator: VCI,
        analysisType: "single",
        format,
      },
      SEVERITY_ORDER,
    );
    expect(text).toBe(
      "Turkana reads 18.4 (extreme deficit) for Vegetation Condition Index. " +
        "VCI fell by 4.2 against the same window a year earlier, a deterioration.",
    );
  });

  it("calls a rise an improvement", () => {
    const text = narrativeFor(
      {
        areas: [areaResult({ area: TURKANA, changeYoY: 3.1 })],
        indicator: VCI,
        analysisType: "single",
        format,
      },
      SEVERITY_ORDER,
    );
    expect(text).toContain("VCI rose by 3.1");
    expect(text).toContain("an improvement");
    expect(text).not.toContain("a deterioration");
  });
});

describe("badEnd high (a probability, where a rise is bad)", () => {
  it("calls a rise a deterioration", () => {
    const text = narrativeFor(
      {
        areas: [
          areaResult({
            area: MARSABIT,
            estimate: { value: 0.78, lower: 0.7, upper: 0.86 },
            band: FLOOD_PROBABILITY.bands[3],
            changeYoY: 0.09,
          }),
        ],
        indicator: FLOOD_PROBABILITY,
        analysisType: "single",
        format: formatFlood,
      },
      SEVERITY_ORDER,
    );
    expect(text).toBe(
      "Marsabit reads 0.78 (very high) for Seasonal flood probability. " +
        "Flood probability rose by 0.09 against the same window a year earlier, a deterioration.",
    );
  });

  it("calls a fall an improvement", () => {
    const text = narrativeFor(
      {
        areas: [
          areaResult({
            area: MARSABIT,
            estimate: { value: 0.31, lower: 0.24, upper: 0.38 },
            band: FLOOD_PROBABILITY.bands[1],
            changeYoY: -0.06,
          }),
        ],
        indicator: FLOOD_PROBABILITY,
        analysisType: "single",
        format: formatFlood,
      },
      SEVERITY_ORDER,
    );
    expect(text).toContain("Flood probability fell by 0.06");
    expect(text).toContain("an improvement");
  });

  it("decides direction from badEnd alone", () => {
    expect(isDeterioration(1, VCI)).toBe(false);
    expect(isDeterioration(-1, VCI)).toBe(true);
    expect(isDeterioration(1, FLOOD_PROBABILITY)).toBe(true);
    expect(isDeterioration(-1, FLOOD_PROBABILITY)).toBe(false);
  });
});

describe("shape and edges", () => {
  it("says nothing about a rise or a fall when the change rounds to nothing", () => {
    const text = narrativeFor(
      {
        areas: [areaResult({ area: TURKANA, changeYoY: 0.01 })],
        indicator: VCI,
        analysisType: "single",
        format,
      },
      SEVERITY_ORDER,
    );
    expect(text).toContain("level with the same window a year earlier");
    expect(text).not.toContain("rose");
    expect(text).not.toContain("fell");
  });

  it("names the worst area of a comparison and how many were compared", () => {
    const text = narrativeFor(
      {
        areas: [
          areaResult({ area: MURANGA, estimate: { value: 62, lower: 56, upper: 68 }, band: VCI.bands[3] }),
          areaResult({ area: TURKANA }),
          areaResult({ area: MARSABIT, estimate: { value: 40, lower: 34, upper: 46 }, band: VCI.bands[2] }),
        ],
        indicator: VCI,
        analysisType: "comparison",
        format,
      },
      SEVERITY_ORDER,
    );
    expect(text).toContain("Turkana is the worst of the 3 areas compared");
    expect(text).toContain("extreme deficit");
  });

  it("picks the worst by severity first and by the bad end of the domain second", () => {
    const worseVci = areaResult({ area: TURKANA, estimate: { value: 12, lower: 8, upper: 16 } });
    const betterVci = areaResult({ area: MARSABIT, estimate: { value: 18, lower: 14, upper: 22 } });
    expect(worstArea([betterVci, worseVci], VCI, SEVERITY_ORDER)?.area.id).toBe("turkana");

    const worseFlood = areaResult({
      area: TURKANA,
      estimate: { value: 0.9, lower: 0.85, upper: 0.95 },
      band: FLOOD_PROBABILITY.bands[3],
    });
    const betterFlood = areaResult({
      area: MARSABIT,
      estimate: { value: 0.75, lower: 0.7, upper: 0.8 },
      band: FLOOD_PROBABILITY.bands[3],
    });
    expect(worstArea([betterFlood, worseFlood], FLOOD_PROBABILITY, SEVERITY_ORDER)?.area.id).toBe("turkana");
  });

  it("is at most two sentences", () => {
    for (const config of [BASE_CONFIG, COMPARISON_CONFIG, FLOOD_CONFIG]) {
      const { narrative } = analysis.run(config);
      const sentences = narrative.split(/\.\s|\.$/).filter((part) => part.trim() !== "");
      expect(sentences.length).toBeLessThanOrEqual(2);
      expect(narrative.endsWith(".")).toBe(true);
    }
  });

  it("reads correctly for a real run in both directions", () => {
    for (const config of [BASE_CONFIG, FLOOD_CONFIG]) {
      const result = analysis.run(config);
      const worst = worstArea(result.areas, result.indicator, SEVERITY_ORDER);
      expect(worst).toBeDefined();
      if (!worst) return;
      expect(result.narrative).toContain(worst.area.name);
      expect(result.narrative.toLowerCase()).toContain(worst.band.label.toLowerCase());
      if (Math.abs(worst.changeYoY) >= 0.5 * 10 ** -result.indicator.precision) {
        const expectedVerdict = isDeterioration(worst.changeYoY, result.indicator)
          ? "a deterioration"
          : "an improvement";
        expect(result.narrative).toContain(expectedVerdict);
        expect(result.narrative).toContain(worst.changeYoY > 0 ? "rose by" : "fell by");
      }
    }
  });

  it("does not fall over on an empty run", () => {
    expect(narrativeFor({ areas: [], indicator: VCI, analysisType: "single", format }, SEVERITY_ORDER)).toContain(
      "no areas",
    );
  });
});
