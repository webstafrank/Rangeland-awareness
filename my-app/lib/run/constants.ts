/**
 * Every tunable the synthetic engine has, named and reasoned about in one file.
 *
 * Each number a run produces comes from one of these plus the seeded PRNG, so
 * the shape of the output is reviewable here without reading the generator. A
 * reviewer has to be able to ask "why is the interval that wide" and get an
 * answer, which is why these are constants with sentences rather than literals
 * inline.
 */

import type { ModelId } from "@/lib/analysis/models";
import type { TopicSlug } from "@/lib/analysis/topics";
import type { Severity } from "@/lib/run/result";

/** Worst LAST. The only ordering used to compare severities anywhere. */
export const SEVERITY_ORDER: readonly Severity[] = [
  "none",
  "low",
  "moderate",
  "high",
  "severe",
] as const;

/** Length of a run id, in base36 characters. Short enough to sit in a URL. */
export const RUN_ID_LENGTH = 11;

/* ------------------------------------------------------------------ models */

/**
 * Relative compute cost per model. Drives the processing-screen total and the
 * skill terms in `metrics.ts`.
 *
 * It lives here and not in lib/analysis/models.ts because cost is a property of
 * running a model, not of offering one: that registry is the contract the UI
 * and a future backend share, and it should not grow a field only the synthetic
 * engine reads. Exhaustive over `ModelId`, so adding a model is a compile error
 * here rather than a silent 0.
 */
export const MODEL_COST_WEIGHT: Readonly<Record<ModelId, number>> = {
  "random-forest": 1,
  xgboost: 1.35,
  // The ensemble runs both and reconciles them, so it costs more than either
  // and fits slightly better than the better of the two.
  combined: 1.7,
};

/* ------------------------------------------------------------ climate term */

/**
 * How an area's aridity proxy (see aridity.ts) becomes its baseline stress.
 *
 * `stress = BASE + GAIN * aridity`, so the wettest highland starts near 0.31
 * and the driest desert near 0.77, which is the spread the `rangeland-pages`
 * reference hard-coded per climate zone (humid 0.3, semi-arid 0.5, arid 0.7).
 *
 * Applied to all four topics, flood risk included, which is worth defending:
 * arid does not mean flood-safe in Kenya. The ASAL counties are exactly where
 * flash flooding on crusted soils and the Tana and Ewaso Ng'iro flood plains
 * do their damage, so a drier area reading as higher flood susceptibility is
 * right for the wrong-looking reason.
 */
export const ARIDITY_STRESS_BASE = 0.28;
export const ARIDITY_STRESS_GAIN = 0.5;

/**
 * Spread of the seeded draw around that baseline.
 *
 * Wide on purpose. Too tight and whole bands become unreachable, so the band
 * colours, the legend and the worst-case copy are never exercised by anything;
 * too wide and the climate term stops being visible at all and the map looks
 * random to anyone who knows the country. 0.6 keeps an arid area able to reach
 * the best band and a humid one able to reach the worst, while the averages
 * still separate.
 */
export const ZONE_SPREAD = 0.6;

/* --------------------------------------------------------------- estimates */

/**
 * Where an area's level may sit inside the indicator domain, as a fraction of
 * the domain span.
 *
 * Held off both ends so a 90% interval never needs clamping. Clamping would
 * flatten the two width relationships the results page explains to the analyst
 * (a shorter window widens the interval, a costlier model narrows it) exactly
 * for the most extreme areas, which are the ones anyone looks at.
 *
 * The window is wide (0.07 to 0.93) rather than the more comfortable 0.15/0.85
 * so that the end bands of a five-band table are actually reachable. A
 * generator that can never produce "Extreme drought" makes that band, its
 * colour and its copy dead code nothing exercises.
 */
export const LEVEL_MIN_POSITION = 0.07;
export const LEVEL_MAX_POSITION = 0.93;

/**
 * Half-width of the 90% interval at the reference window and cost, as a
 * fraction of the domain span.
 *
 * 0.024 is not a taste call. The widest one-sided reach of an interval is
 * `base * maxRangeFactor * maxModelFactor * maxJitter * maxSkew`
 * = 0.024 * 2.0 * 1.15 * 1.03 * 1.15 = 0.0654, which has to stay under
 * LEVEL_MIN_POSITION (0.07) or the clamp described above starts happening.
 * The skew factor is the one easily forgotten: the interval is not centred, so
 * one side reaches 15% further than the half-width alone suggests. Raising any
 * of those bounds means lowering this.
 */
export const INTERVAL_HALF_WIDTH_BASE = 0.024;

/** Window length the interval width is calibrated against, in months. */
export const REFERENCE_WINDOW_MONTHS = 24;

/** Bounds on the two width multipliers. See INTERVAL_HALF_WIDTH_BASE. */
export const RANGE_WIDTH_FACTOR_RANGE: readonly [number, number] = [0.6, 2.0];
export const MODEL_WIDTH_FACTOR_RANGE: readonly [number, number] = [0.65, 1.15];

/**
 * Seeded jitter on the interval width, as a fraction of itself.
 *
 * 0.06 is bounded by the SMALLEST effect it must not mask. Two draws can differ
 * by at most 1.03/0.97 = 1.062, and the closest pair of model width factors is
 * combined against xgboost at 0.767/0.861 = 0.891. 0.891 * 1.062 = 0.946, still
 * below 1, so the costlier model reports the narrower interval for every area
 * on every seed rather than merely on average. At the old 0.1 the two overlap
 * and the claim on the results page becomes a lie about one area in twenty.
 */
export const INTERVAL_JITTER = 0.06;

/* ------------------------------------------------------------ year on year */

/**
 * How far the year-earlier level may sit from this one, as a fraction of the
 * domain span. An area's condition is autocorrelated year to year, so the
 * previous window is a perturbation of this one rather than an independent
 * draw: independent draws produce swings of half the domain and a narrative
 * nobody would believe.
 */
export const YOY_MAX_STEP = 0.12;

/* ---------------------------------------------------------------- exposure */

/**
 * Share of an area in the worst two bands, per severity of its headline
 * estimate.
 *
 * A lookup table rather than an independent draw, because the two numbers have
 * to agree: an area reporting the worst band cannot also report that 3% of it
 * is affected. The bands do not overlap, so the relationship is legible in the
 * table itself.
 */
export const AFFECTED_SHARE_BY_SEVERITY: Readonly<
  Record<Severity, readonly [number, number]>
> = {
  none: [0.01, 0.08],
  low: [0.08, 0.25],
  moderate: [0.25, 0.5],
  high: [0.5, 0.75],
  severe: [0.75, 0.98],
};

/* ----------------------------------------------------------------- series */

/**
 * Kenya's rainfall is bimodal: long rains roughly March to May, short rains
 * roughly October to December. Vegetation and flood indicators do not peak with
 * the rain, they peak after it, once water has reached the root zone or the
 * river network, so the two response peaks sit a month behind the rainfall
 * peaks.
 */
export const LONG_RAINS_RESPONSE_MONTH = 5; // May, after the March-May long rains
export const SHORT_RAINS_RESPONSE_MONTH = 12; // December, after the October-December short rains
export const LONG_RAINS_WEIGHT = 0.62;
export const SHORT_RAINS_WEIGHT = 0.38;
export const LONG_RAINS_WIDTH_MONTHS = 1.7;
export const SHORT_RAINS_WIDTH_MONTHS = 1.5;

/** Peak-to-mean size of the seasonal term, as a fraction of the domain span. */
export const SEASON_AMPLITUDE = 0.16;

/**
 * Month-to-month noise, as a fraction of the domain span, before AR(1)
 * smoothing. Kept well under SEASON_AMPLITUDE so the seasonal signal survives
 * averaging in the tests and, more to the point, survives being looked at.
 */
export const SERIES_NOISE = 0.09;
/** AR(1) coefficient on the noise: consecutive months are correlated, as real observations are. */
export const SERIES_NOISE_MEMORY = 0.6;

/** Total drift across the whole window, as a fraction of the domain span. */
export const SERIES_MAX_DRIFT = 0.12;

/**
 * Fraction of months dropped as cloud-obscured gaps. Optical indices lose
 * months to cloud over the Kenyan highlands and the coast, and the chart has to
 * draw a gap rather than a zero, so a run always inserts a few once the window
 * is long enough to hold one without hiding the signal.
 */
export const CLOUD_GAP_RATE = 0.08;
/** Below this many months, no gaps: one gap in a three-month series is most of the series. */
export const MIN_MONTHS_FOR_GAPS = 4;

/**
 * Which way wetness moves each topic's headline indicator.
 *
 * Not derivable from `badEnd`, which is why it is its own table. Rain raises
 * flood susceptibility (bad) AND raises vegetation condition and VHI (good) AND
 * lowers an IPC phase (good). Three of the four move up with the rain; food
 * security is the one that moves down, and getting that backwards would put the
 * hunger peak in the middle of the growing season.
 */
export const SEASONAL_SIGN: Readonly<Record<TopicSlug, 1 | -1>> = {
  "flood-risk": 1,
  "drought-monitoring": 1,
  "rangeland-dynamics": 1,
  "food-security": -1,
};

/* ---------------------------------------------------------------- formulas */

/**
 * Where a formula's own value may sit inside its declared range, and how much
 * it may wander off the area's stress level.
 *
 * The position bounds keep a per-formula value off the very ends of its range,
 * for the same reason estimates are held off the domain ends: an NDVI pinned at
 * exactly 1.0 reads as a clipped number rather than a measurement. The jitter
 * is what stops five formulas for one area being five copies of the same curve.
 */
export const FORMULA_MIN_POSITION = 0.12;
export const FORMULA_MAX_POSITION = 0.88;
export const FORMULA_JITTER = 0.06;

/* ---------------------------------------------------------------- metrics */

/** Floor on AUC before the model and data terms. A coin flip is 0.5. */
export const AUC_BASE = 0.62;
/** AUC gained per unit of model cost weight. Small: a better model is better, not magic. */
export const AUC_PER_COST_WEIGHT = 0.06;
/** AUC gained from a full reference window of data, at most. */
export const AUC_DATA_BONUS = 0.06;
/** Seeded spread on AUC. Smaller than the gap between two models, or the ordering would flip. */
export const AUC_JITTER = 0.02;
/** No synthetic model claims to be perfect. */
export const AUC_CEILING = 0.97;

/** Held-out samples per area-month. Reads as one notional pixel stack for a month. */
export const SAMPLES_PER_AREA_MONTH = 320;

/**
 * Weight floor and spread for a feature importance, before normalising.
 *
 * The floor keeps a driver from rounding away to zero, which a reader takes as
 * "this input was ignored" rather than "this input mattered least". The formula
 * bonus is why a selected formula outranks an ambient driver: the analyst chose
 * it, so the model has to say it leaned on it.
 */
export const IMPORTANCE_FLOOR = 0.15;
export const IMPORTANCE_FORMULA_BONUS = 0.85;

/* ----------------------------------------------------------------- stages */

/** Wall-clock budget for the processing screen, before the cost and area weighting. */
export const STAGE_TOTAL_BASE_MS = 2600;
/** Fraction of the total that scales with the model's cost weight. */
export const STAGE_COST_SHARE = 0.25;
/** Added per extra area beyond the first. */
export const STAGE_PER_EXTRA_AREA = 0.08;
/** Hard bounds on the total: long enough to read the labels, short enough not to annoy. */
export const STAGE_TOTAL_BOUNDS_MS: readonly [number, number] = [2500, 6000];
