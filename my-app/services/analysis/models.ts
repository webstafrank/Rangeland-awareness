/**
 * Model and analysis-type registries.
 *
 * These are contracts, not UI copy: the strings in `id` are what a future
 * services/model backend receives in an AnalysisRequest, so they are stable
 * and kebab-case. Labels are free to change; ids are not.
 */

export const MODEL_IDS = ["random-forest", "xgboost", "combined"] as const;
export type ModelId = (typeof MODEL_IDS)[number];

export interface ModelChoice {
  id: ModelId;
  label: string;
  /** Why an analyst would pick this one over the others. */
  tradeoff: string;
}

export const MODELS: readonly ModelChoice[] = [
  {
    id: "random-forest",
    label: "Random Forest",
    tradeoff:
      "Steady on small or noisy samples and easy to interpret. The safe default.",
  },
  {
    id: "xgboost",
    label: "XGBoost",
    tradeoff:
      "Usually the sharpest accuracy on dense feature stacks, at the cost of tuning.",
  },
  {
    id: "combined",
    label: "Combined model",
    tradeoff:
      "Ensembles both and reports their agreement, so disputed areas are visible.",
  },
];

const MODEL_BY_ID: ReadonlyMap<string, ModelChoice> = new Map(
  MODELS.map((m) => [m.id, m]),
);

export function isModelId(value: string): value is ModelId {
  return MODEL_BY_ID.has(value);
}

export function getModel(id: string): ModelChoice | undefined {
  return MODEL_BY_ID.get(id);
}

export const ANALYSIS_TYPE_IDS = ["single", "comparison"] as const;
export type AnalysisTypeId = (typeof ANALYSIS_TYPE_IDS)[number];

export interface AnalysisType {
  id: AnalysisTypeId;
  label: string;
  description: string;
  /**
   * How many areas of interest this analysis type accepts.
   * `single` is capped at 1, which is what makes the cap a data question
   * rather than an `if` scattered through the UI.
   */
  maxAreas: number;
  /** Minimum needed before the request is runnable. */
  minAreas: number;
}

export const ANALYSIS_TYPES: readonly AnalysisType[] = [
  {
    id: "single",
    label: "Single location",
    description: "Analyse one area and report its result in detail.",
    maxAreas: 1,
    minAreas: 1,
  },
  {
    id: "comparison",
    label: "Multiple location comparison",
    description: "Analyse several areas and rank them side by side.",
    maxAreas: 12,
    minAreas: 2,
  },
];

const ANALYSIS_TYPE_BY_ID: ReadonlyMap<string, AnalysisType> = new Map(
  ANALYSIS_TYPES.map((a) => [a.id, a]),
);

export function isAnalysisTypeId(value: string): value is AnalysisTypeId {
  return ANALYSIS_TYPE_BY_ID.has(value);
}

/**
 * Unlike getTopic/getModel this one is non-optional: the analysis type gates
 * the area cap, and a silent undefined there would mean an uncapped selection.
 * Callers pass an AnalysisTypeId, so an unknown value is a programming error.
 */
export function getAnalysisType(id: AnalysisTypeId): AnalysisType {
  const found = ANALYSIS_TYPE_BY_ID.get(id);
  if (!found) throw new Error(`unknown analysis type: ${id}`);
  return found;
}
