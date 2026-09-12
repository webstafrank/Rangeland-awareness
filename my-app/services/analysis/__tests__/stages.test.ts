/**
 * The running screen's script. Tested for the two things that can go wrong:
 * durations that do not add up to the total (so the progress bar drifts off the
 * end), and a total that wanders outside the range a person will sit through.
 */
import { describe, expect, it } from "vitest";
import { STAGE_TOTAL_BOUNDS_MS } from "../constants";
import { createAnalysisService } from "../service";
import { STAGE_SCRIPT, stageTotalMs } from "../stages";
import { BASE_CONFIG, COMPARISON_CONFIG, RANDOM_FOREST, XGBOOST, stubCatalog, stubGeo } from "./stubs";

const analysis = createAnalysisService({ catalog: stubCatalog(), geo: stubGeo() });

const FOUR_AREAS = {
  ...BASE_CONFIG,
  analysisType: "comparison" as const,
  areas: ["turkana", "marsabit", "muranga", "taita-taveta"],
  model: "xgboost" as const,
};

describe("the script", () => {
  it("names what is actually being computed", () => {
    const labels = analysis.stages(BASE_CONFIG).map((stage) => stage.label);
    expect(labels).toEqual([
      "Resolving county boundaries and centroids",
      "Fetching the driver stack for the window",
      "Harmonising the monthly time series",
      "Training the model on the held-out split",
      "Scoring the grid cell by cell",
      "Classifying values against the band table",
      "Assembling the result",
    ]);
    for (const label of labels) {
      expect(label.toLowerCase()).not.toContain("loading");
      expect(label).not.toContain("...");
    }
  });

  it("has unique ids in a stable order", () => {
    const ids = analysis.stages(BASE_CONFIG).map((stage) => stage.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(analysis.stages(COMPARISON_CONFIG).map((stage) => stage.id));
  });

  it("splits the whole total, with no stage left at zero", () => {
    for (const config of [BASE_CONFIG, COMPARISON_CONFIG, FOUR_AREAS]) {
      const stages = analysis.stages(config);
      const total = stages.reduce((sum, stage) => sum + stage.durationMs, 0);
      expect(total).toBe(stageTotalMs(config, config.model === "xgboost" ? XGBOOST : RANDOM_FOREST));
      for (const stage of stages) {
        expect(stage.durationMs).toBeGreaterThan(0);
        expect(Number.isInteger(stage.durationMs)).toBe(true);
      }
    }
  });

  it("weights the script to sum to one, so the durations are shares of the total", () => {
    const sum = STAGE_SCRIPT.reduce((total, stage) => total + stage.weight, 0);
    expect(Math.abs(sum - 1)).toBeLessThan(1e-9);
  });

  it("spends the longest stage on training", () => {
    const stages = analysis.stages(COMPARISON_CONFIG);
    const longest = [...stages].sort((a, b) => b.durationMs - a.durationMs)[0];
    expect(longest.id).toBe("train");
  });
});

describe("the total", () => {
  it("stays inside the bounds a person will sit through", () => {
    for (const config of [BASE_CONFIG, COMPARISON_CONFIG, FOUR_AREAS]) {
      const total = analysis.stages(config).reduce((sum, stage) => sum + stage.durationMs, 0);
      expect(total).toBeGreaterThanOrEqual(STAGE_TOTAL_BOUNDS_MS[0]);
      expect(total).toBeLessThanOrEqual(STAGE_TOTAL_BOUNDS_MS[1]);
    }
  });

  it("is 2600 ms for the reference config, which is the number the design assumes", () => {
    expect(stageTotalMs(BASE_CONFIG, RANDOM_FOREST)).toBe(2600);
  });

  it("grows with the model cost", () => {
    expect(stageTotalMs(BASE_CONFIG, XGBOOST)).toBeGreaterThan(stageTotalMs(BASE_CONFIG, RANDOM_FOREST));
  });

  it("grows with the area count", () => {
    expect(stageTotalMs(FOUR_AREAS, XGBOOST)).toBeGreaterThan(stageTotalMs(BASE_CONFIG, XGBOOST));
  });

  it("is clamped for an absurd cost weight rather than running for a minute", () => {
    const silly = { ...XGBOOST, costWeight: 400 };
    expect(stageTotalMs(FOUR_AREAS, silly)).toBe(STAGE_TOTAL_BOUNDS_MS[1]);
  });

  it("is deterministic", () => {
    expect(analysis.stages(COMPARISON_CONFIG)).toEqual(analysis.stages(COMPARISON_CONFIG));
  });
});
