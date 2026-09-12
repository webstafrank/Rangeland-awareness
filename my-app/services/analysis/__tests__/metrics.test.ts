/**
 * The metrics panel. Two audiences read it: a user deciding whether to trust the
 * number, and a user deciding which model to pick. Both are ill served by scores
 * that wander, so the model comparison is a property of the code (identical data
 * seed, monotone skill term) rather than an accident of the seed.
 */
import { describe, expect, it } from "vitest";
import type { RunConfig } from "@/contracts/analysis";
import { SAMPLES_PER_AREA_MONTH } from "../constants";
import { createAnalysisService } from "../service";
import { featureImportancesFor } from "../synthetic";
import {
  BASE_CONFIG,
  COMPARISON_CONFIG,
  DROUGHT_TOPIC,
  FLOOD_CONFIG,
  FLOOD_TOPIC,
  stubCatalog,
  stubGeo,
} from "./stubs";

const analysis = createAnalysisService({ catalog: stubCatalog(), geo: stubGeo() });

const MODEL_PAIRS: readonly RunConfig[] = [
  BASE_CONFIG,
  { ...BASE_CONFIG, dateRange: { start: "2015-01-01", end: "2024-12-31" } },
  { ...BASE_CONFIG, dateRange: { start: "2024-10-01", end: "2024-12-31" } },
  { ...COMPARISON_CONFIG },
  { ...FLOOD_CONFIG },
];

describe("scores", () => {
  it("keeps auc and r2 inside 0..1 and rmse plausible against the domain", () => {
    for (const config of [...MODEL_PAIRS, { ...BASE_CONFIG, model: "xgboost" as const }]) {
      const result = analysis.run(config);
      const span = result.indicator.domain[1] - result.indicator.domain[0];
      expect(result.metrics.auc).toBeGreaterThan(0.5);
      expect(result.metrics.auc).toBeLessThanOrEqual(1);
      expect(result.metrics.r2).toBeGreaterThanOrEqual(0);
      expect(result.metrics.r2).toBeLessThanOrEqual(1);
      expect(result.metrics.rmse).toBeGreaterThan(0);
      expect(result.metrics.rmse).toBeLessThan(span * 0.3);
    }
  });

  it("scores XGBoost slightly better than Random Forest on the same config", () => {
    for (const config of MODEL_PAIRS) {
      const forest = analysis.run({ ...config, model: "random-forest" }).metrics;
      const boosted = analysis.run({ ...config, model: "xgboost" }).metrics;
      expect(boosted.auc).toBeGreaterThan(forest.auc);
      // Slightly, not magically: a scaffold that claimed a huge gap would teach
      // the user the wrong thing about model choice.
      expect(boosted.auc - forest.auc).toBeLessThan(0.1);
      expect(boosted.rmse).toBeLessThan(forest.rmse);
      expect(boosted.r2).toBeGreaterThan(forest.r2);
    }
  });

  it("scores a longer window better than a short one, for the same model", () => {
    const short = analysis.run({ ...BASE_CONFIG, dateRange: { start: "2024-10-01", end: "2024-12-31" } });
    const long = analysis.run({ ...BASE_CONFIG, dateRange: { start: "2015-01-01", end: "2024-12-31" } });
    expect(long.metrics.auc).toBeGreaterThan(short.metrics.auc);
  });

  it("reports the model spec it was handed, not a copy", () => {
    expect(analysis.run(BASE_CONFIG).metrics.model.id).toBe("random-forest");
    expect(analysis.run({ ...BASE_CONFIG, model: "xgboost" }).metrics.model.id).toBe("xgboost");
  });
});

describe("trainingSamples", () => {
  it("is a whole number scaling with the window and the area count", () => {
    const single = analysis.run(BASE_CONFIG).metrics.trainingSamples;
    expect(Number.isInteger(single)).toBe(true);
    expect(single).toBe(12 * 1 * SAMPLES_PER_AREA_MONTH);

    const threeAreas = analysis.run(COMPARISON_CONFIG).metrics.trainingSamples;
    expect(threeAreas).toBe(24 * 3 * SAMPLES_PER_AREA_MONTH);

    const tenYears = analysis.run({
      ...BASE_CONFIG,
      dateRange: { start: "2015-01-01", end: "2024-12-31" },
    }).metrics.trainingSamples;
    expect(tenYears).toBe(120 * 1 * SAMPLES_PER_AREA_MONTH);
    expect(tenYears).toBeGreaterThan(single);
  });
});

describe("featureImportances", () => {
  it("comes from the topic's own driver list", () => {
    const result = analysis.run(BASE_CONFIG);
    const features = result.metrics.featureImportances.map((entry) => entry.feature);
    expect([...features].sort()).toEqual([...DROUGHT_TOPIC.drivers].sort());
  });

  it("is sorted heaviest first", () => {
    for (const config of MODEL_PAIRS) {
      const weights = analysis.run(config).metrics.featureImportances.map((entry) => entry.weight);
      for (let i = 1; i < weights.length; i += 1) {
        expect(weights[i - 1]).toBeGreaterThanOrEqual(weights[i]);
      }
    }
  });

  it("sums to 1", () => {
    for (const config of [...MODEL_PAIRS, { ...FLOOD_CONFIG, model: "random-forest" as const }]) {
      const total = analysis
        .run(config)
        .metrics.featureImportances.reduce((sum, entry) => sum + entry.weight, 0);
      expect(Math.abs(total - 1)).toBeLessThan(1e-9);
    }
  });

  it("gives every driver a non-zero weight, so no input reads as ignored", () => {
    for (const entry of analysis.run(FLOOD_CONFIG).metrics.featureImportances) {
      expect(entry.weight).toBeGreaterThan(0);
    }
    expect(analysis.run(FLOOD_CONFIG).metrics.featureImportances).toHaveLength(FLOOD_TOPIC.drivers.length);
  });

  it("is stable for a run id and different between run ids", () => {
    expect(featureImportancesFor("abc", DROUGHT_TOPIC)).toEqual(featureImportancesFor("abc", DROUGHT_TOPIC));
    expect(featureImportancesFor("abc", DROUGHT_TOPIC)).not.toEqual(
      featureImportancesFor("abd", DROUGHT_TOPIC),
    );
  });

  it("returns nothing for a topic with no drivers rather than dividing by zero", () => {
    expect(featureImportancesFor("abc", { ...DROUGHT_TOPIC, drivers: [] })).toEqual([]);
  });
});
