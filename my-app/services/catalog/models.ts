/**
 * The two models a user can pick before an analysis runs.
 *
 * Both are tree ensembles because that is what the tabular, few-hundred-sample
 * problems in this app actually reward: the predictors are a handful of
 * gridded covariates (NDVI, rainfall, temperature, soil moisture) with sharp
 * thresholds and no useful linear structure. Adding a third family would mean
 * owning a third set of honest claims about it, so the list stays at two until
 * there is a reason.
 *
 * `costWeight` is a ratio, not seconds. The running screen multiplies its
 * stage durations by it, so the only property that has to hold is
 * xgboost > random-forest: boosting fits many shallow trees in sequence where
 * the forest fits independent ones in parallel.
 */
import type { ModelSpec, ModelId } from "@/contracts/catalog";

export const RANDOM_FOREST: ModelSpec = {
  id: "random-forest",
  label: "Random Forest",
  blurb:
    "Fits many decision trees on random subsets of the data and averages them.",
  strength:
    "Stable on small samples and mixed predictor types, and averaging over trees keeps it from overfitting noise. Reports which inputs mattered most.",
  costWeight: 1,
};

export const XGBOOST: ModelSpec = {
  id: "xgboost",
  label: "XGBoost",
  blurb:
    "Builds trees one after another, each correcting the errors left by the ones before it.",
  strength:
    "More accurate than a forest once the sample is large, and it picks up sharp thresholds (a rainfall cut-off, a biomass floor). Needs more tuning to get there.",
  costWeight: 1.6,
};

/**
 * Display order, which is also cheapest first. The pre-analysis page reads
 * this order directly, so the first entry is what a user who does not choose
 * ends up with.
 */
export const MODELS: readonly ModelSpec[] = [RANDOM_FOREST, XGBOOST] as const;

/**
 * Every model applies to every topic in contract version 1. Topics import this
 * rather than repeating the id list, so a topic cannot drift out of step with
 * the model registry.
 */
export const ALL_MODEL_IDS: readonly ModelId[] = MODELS.map((m) => m.id);
