/**
 * The held-out scores and the ranked drivers.
 *
 * Two audiences read this panel: someone deciding whether to trust the number,
 * and someone deciding which model to pick. Both are badly served by scores
 * that wander, so the model comparison is a property of the code rather than an
 * accident of the seed. Everything belonging to the DATA (the noise draw, the
 * window length, the geometry) is seeded from `studySeed`, which excludes the
 * model, so the only term that moves between two models on one config is the
 * cost-weighted skill term. The costlier model therefore always scores better,
 * by construction.
 */

import { getFormula } from "@/lib/analysis/formulas";
import type { FormulaId } from "@/lib/analysis/formulas";
import { getTopic } from "@/lib/analysis/topics";
import type { RunConfig } from "@/lib/run/config";
import {
  AUC_BASE,
  AUC_CEILING,
  AUC_DATA_BONUS,
  AUC_JITTER,
  AUC_PER_COST_WEIGHT,
  IMPORTANCE_FLOOR,
  IMPORTANCE_FORMULA_BONUS,
  MODEL_COST_WEIGHT,
  REFERENCE_WINDOW_MONTHS,
  SAMPLES_PER_AREA_MONTH,
} from "@/lib/run/constants";
import { monthCount } from "@/lib/run/dates";
import { seedFor, studySeed } from "@/lib/run/hash";
import { spanOf } from "@/lib/run/indicators";
import type { FeatureImportance, IndicatorSpec, ModelMetrics } from "@/lib/run/result";
import { clamp, mulberry32, roundTo } from "@/lib/run/rng";

export function metricsFor(
  runId: string,
  config: RunConfig,
  indicator: IndicatorSpec,
): ModelMetrics {
  const months = monthCount(config.dateWindow);
  const costWeight = MODEL_COST_WEIGHT[config.model] ?? 1;
  const rng = mulberry32(studySeed(config));

  const dataFactor = clamp(months / REFERENCE_WINDOW_MONTHS, 0, 1);
  const jitter = rng() * AUC_JITTER;
  const auc = clamp(
    AUC_BASE + AUC_PER_COST_WEIGHT * costWeight + AUC_DATA_BONUS * dataFactor + jitter,
    0.5,
    AUC_CEILING,
  );
  // R-squared tracks AUC: the same fit read on the regression rather than on
  // the classification. Kept below AUC because explaining the level is harder
  // than ranking the cases, and derived from AUC rather than drawn separately
  // so a model cannot come back with a better AUC and a worse R2, which would
  // be unexplainable on a page that shows both.
  const r2 = clamp((auc - 0.5) * 1.5 + rng() * 0.04 - 0.02, 0, 0.97);
  // A better fit means a smaller error, in indicator units.
  const rmse = spanOf(indicator) * clamp(0.17 - 0.14 * (auc - 0.5), 0.03, 0.25);

  return {
    auc: roundTo(auc, 3),
    r2: roundTo(r2, 3),
    rmse: roundTo(rmse, indicator.precision + 2),
    // One sample per area, per month, per notional pixel stack.
    trainingSamples: months * config.areas.length * SAMPLES_PER_AREA_MONTH,
    featureImportances: featureImportancesFor(runId, config),
  };
}

/**
 * Ranked drivers, heaviest first, summing to exactly 1.
 *
 * THE SELECTED FORMULAS ARE ALWAYS IN THIS LIST, by name. That is the contract
 * (section 3) and it is also the only honest answer: the analyst chose those
 * indices, so a model that reported importances without them would be claiming
 * it ignored the input it was told to use. They are drawn with a bonus over the
 * topic's ambient drivers for the same reason, so a chosen index outranks a
 * background one rather than sometimes disappearing to the bottom.
 *
 * The topic's own `inputs` come along as the ambient stack: a model that used
 * only the four indices an analyst ticked and nothing else would be a worse
 * model, and the panel would say so by being nearly empty.
 */
export function featureImportancesFor(
  runId: string,
  config: RunConfig,
): readonly FeatureImportance[] {
  const rng = mulberry32(seedFor(runId, "feature-importances"));

  interface Draw {
    feature: string;
    weight: number;
    /** Selected formulas sort ahead of ambient drivers on an exact weight tie. */
    chosen: boolean;
  }

  const draws: Draw[] = [];
  const seen = new Set<string>();

  const add = (feature: string, chosen: boolean): void => {
    // Dedupe by the rendered name. A topic input and a formula name could
    // coincide after a rename, and the panel would then show one driver twice
    // with two different weights, which reads as a bug in the model.
    if (feature.trim() === "" || seen.has(feature)) return;
    seen.add(feature);
    // The floor keeps a driver from rounding away to zero, which a reader takes
    // as "this input was ignored" rather than "this input mattered least".
    const bonus = chosen ? IMPORTANCE_FORMULA_BONUS : 0;
    draws.push({ feature, weight: IMPORTANCE_FLOOR + bonus + rng(), chosen });
  };

  for (const id of config.formulas as readonly FormulaId[]) {
    const formula = getFormula(id);
    // Unknown ids are skipped rather than named: the panel must not invent a
    // driver the results page cannot then explain the arithmetic of.
    if (formula) add(formula.name, true);
  }
  for (const input of getTopic(config.topic)?.inputs ?? []) add(input, false);

  if (draws.length === 0) return [];

  const total = draws.reduce((sum, item) => sum + item.weight, 0);
  const sorted = draws
    .map((item) => ({ ...item, weight: item.weight / total }))
    .sort(
      (a, b) =>
        b.weight - a.weight ||
        Number(b.chosen) - Number(a.chosen) ||
        a.feature.localeCompare(b.feature),
    )
    .map((item) => ({ feature: item.feature, weight: roundTo(item.weight, 4) }));

  // The rounding residual is folded into the largest weight, which keeps the
  // sum exactly 1 without disturbing the order. A panel whose percentages add
  // up to 99.97 is the kind of detail that costs a reader their trust in
  // everything else on the page.
  const residual = 1 - sorted.reduce((sum, item) => sum + item.weight, 0);
  return [
    { feature: sorted[0].feature, weight: roundTo(sorted[0].weight + residual, 6) },
    ...sorted.slice(1),
  ];
}
