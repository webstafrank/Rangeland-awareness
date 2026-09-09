/**
 * Criteria for the weighted-overlay topics.
 *
 * A criterion is one input layer plus the table that turns its raw values into
 * a 1..5 risk score. The overlay is then FHI = sum(risk_i * weight_i), with the
 * weights derived in-app from pairwise comparison (lib/ahp).
 *
 * THE RECLASSIFICATION TABLE BELONGS TO THE TOPIC-CRITERION PAIR, NEVER TO THE
 * CRITERION ALONE. Slope is the reason this is stated in capitals. For flood,
 * flat ground scores 5 because water pools on it. For landslides, flat ground
 * scores 1 and steep ground scores 5, because slope is what makes material
 * move. A shared "slope risk" helper would map landslide susceptibility
 * backwards, and the output would look entirely plausible while being upside
 * down. The type below makes sharing impossible: classes live inside the
 * topic's own criterion list, and a test asserts the two slope tables disagree.
 *
 * This is the same failure the codebase already guards against twice, in
 * `IndicatorSpec.badEnd` and in `SEASONAL_SIGN`. Third time, same lesson.
 */

/** Risk scores are the 1..5 the overlay multiplies. Nothing else is legal. */
export type RiskScore = 1 | 2 | 3 | 4 | 5;

/**
 * How much the shipped class breaks can be trusted before someone calibrates
 * them against local data. Rendered in the UI, because a susceptibility map
 * built on uncalibrated breaks is not wrong so much as unvalidated, and the
 * reader deserves to know which of those they are looking at.
 */
export type Calibration =
  /** Physically or empirically settled, and stable across regions. */
  | "established"
  /** Direction is settled; the break VALUES want local calibration. */
  | "regional"
  /** Cannot ship a default at all: depends on the source layer's own coding. */
  | "required";

/** One band of a continuous criterion: everything up to `max`. */
export interface ContinuousClass {
  risk: RiskScore;
  label: string;
  /** Exclusive upper bound in the criterion's unit. `null` is open-ended. */
  max: number | null;
}

/** One band of a categorical criterion: the source codes that map to a risk. */
export interface CategoricalClass {
  risk: RiskScore;
  label: string;
  /** Raster values from the source layer's own coding. */
  codes: readonly number[];
}

export type CriterionScale =
  | { kind: "continuous"; classes: readonly ContinuousClass[] }
  | {
      kind: "categorical";
      classes: readonly CategoricalClass[];
      /** What a value not listed in any class becomes. */
      unlisted: RiskScore | "nodata";
    }
  /**
   * Breaks computed from the data itself rather than fixed. The notebook does
   * this for rainfall, because spatial rainfall variation inside one county is
   * often under 200 mm and fixed thresholds collapse every pixel into one or
   * two classes.
   */
  | { kind: "percentile"; breaks: readonly [number, number, number, number]; ascending: boolean };

/** Where the raw values come from. */
export type CriterionSource =
  /** Straight from a published layer. */
  | { kind: "layer"; hint: string }
  /** Computed from another layer, e.g. slope and aspect from the DEM. */
  | { kind: "derived"; from: string; how: string }
  /** Euclidean distance to a vector feature set, in metres. */
  | { kind: "distance"; from: string; smoothSigmaPx?: number };

export interface Criterion {
  id: string;
  label: string;
  /** Unit of the RAW value, before reclassification. "" for categorical. */
  unit: string;
  source: CriterionSource;
  scale: CriterionScale;
  calibration: Calibration;
  /** One sentence: what makes this criterion's risk HIGH. Read by the UI. */
  direction: string;
  reference: string;
}

/** How a topic produces its result. */
export type TopicMethod =
  | {
      kind: "weighted-overlay";
      criteria: readonly Criterion[];
      /**
       * Weights to open the pairwise form on. Present where a published set
       * exists (flood, from the Tana River notebook); absent where the analyst
       * must derive them, which is the honest default for a new topic.
       */
      defaultWeights?: Readonly<Record<string, number>>;
    }
  | { kind: "model" };

/**
 * Whether a criterion's class table is contiguous and complete.
 *
 * A gap between two bands is a hole that silently becomes nodata; an
 * out-of-order table classifies against whichever band it reaches first. Both
 * are invisible in the output, so they are checked rather than reviewed.
 */
export function continuousClassProblems(
  classes: readonly ContinuousClass[],
): string[] {
  const problems: string[] = [];
  if (classes.length === 0) return ["No classes defined."];

  for (const [index, band] of classes.entries()) {
    const last = index === classes.length - 1;
    if (last && band.max !== null) {
      problems.push("The final class must be open-ended (max: null).");
    }
    if (!last && band.max === null) {
      problems.push(`Class ${index + 1} is open-ended but is not the last.`);
    }
    if (!last) {
      const next = classes[index + 1];
      if (band.max !== null && next.max !== null && band.max >= next.max) {
        problems.push(
          `Class ${index + 1} ends at ${band.max}, which is not below class ` +
            `${index + 2}'s ${next.max}; the bands must ascend.`,
        );
      }
    }
  }
  return problems;
}

/** The risk score for a raw value, given an ordered ascending class table. */
export function classifyContinuous(
  classes: readonly ContinuousClass[],
  value: number,
): RiskScore | null {
  // NaN is rejected rather than clamped, the same rule indicators use: a
  // missing pixel painted with a real risk is the failure this cannot afford.
  if (!Number.isFinite(value)) return null;
  for (const band of classes) {
    if (band.max === null || value <= band.max) return band.risk;
  }
  return classes[classes.length - 1].risk;
}

/** The risk score for a categorical code. */
export function classifyCategorical(
  scale: Extract<CriterionScale, { kind: "categorical" }>,
  code: number,
): RiskScore | null {
  for (const band of scale.classes) {
    if (band.codes.includes(code)) return band.risk;
  }
  return scale.unlisted === "nodata" ? null : scale.unlisted;
}
