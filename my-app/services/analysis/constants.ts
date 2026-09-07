/**
 * Tuning constants for the synthetic run.
 *
 * Every number a run produces comes from one of these constants plus the seeded
 * PRNG, so the shape of the output is reviewable in one file. They are named and
 * commented because a reviewer has to be able to ask "why is the interval that
 * wide" and get an answer without reading the generator.
 *
 * Contract version: 1 (see contracts/analysis.ts).
 */
import type { Severity } from "@/contracts/catalog";

/** Worst last. The only ordering used for `headlineSeverity` comparisons. */
export const SEVERITY_ORDER: readonly Severity[] = ["good", "warning", "serious", "critical"] as const;

/** Length of a run id, in base36 characters. Short enough to sit in a URL. */
export const RUN_ID_LENGTH = 11;

/* --------------------------------------------------------------- estimates */

/**
 * Where an area's level is allowed to sit inside the indicator domain, as a
 * fraction of the domain span. Kept away from both ends so a 90% interval never
 * needs clamping to stay inside the domain, which would break the "a shorter
 * window gives a wider interval" relationship at the edges.
 */
export const LEVEL_MIN_POSITION = 0.15;
export const LEVEL_MAX_POSITION = 0.85;

/** Half-width of the 90% interval at the reference window and cost, as a fraction of the domain span. */
export const INTERVAL_HALF_WIDTH_BASE = 0.055;

/** Window length the interval width is calibrated against, in months. */
export const REFERENCE_WINDOW_MONTHS = 24;

/**
 * Bounds on the two width multipliers. Both are clamped so that
 * base * maxRange * maxModel stays below LEVEL_MIN_POSITION and the interval
 * cannot reach a domain edge.
 */
export const RANGE_WIDTH_FACTOR_RANGE: readonly [number, number] = [0.6, 2.0];
export const MODEL_WIDTH_FACTOR_RANGE: readonly [number, number] = [0.65, 1.15];

/**
 * Seeded jitter on the interval width. Deliberately tight: it has to be smaller
 * than the range and model effects, or the two would stop being observable.
 */
export const INTERVAL_JITTER = 0.1;

/* ---------------------------------------------------------------- year over year */

/**
 * How far the year-earlier level may sit from the current one, as a fraction of
 * the domain span. A county's condition is autocorrelated year to year, so the
 * previous window is drawn as a perturbation of this one rather than
 * independently: an independent draw would produce implausible swings of half
 * the domain.
 */
export const YOY_MAX_STEP = 0.12;

/* --------------------------------------------------------------- exposure */

/**
 * Synthetic resident population per area, before the climate-zone weighting.
 * SCAFFOLD FIGURE. Not census data, not derived from census data. See README.
 */
export const POPULATION_RANGE: readonly [number, number] = [120_000, 1_400_000];

/** Arid counties are sparsely settled, humid ones densely. Multiplies the draw above. */
export const POPULATION_ZONE_WEIGHT: Readonly<Record<string, number>> = {
  arid: 0.45,
  "semi-arid": 0.8,
  humid: 1.35,
};

/** Population figures are rounded to this, so nobody mistakes them for a count. */
export const POPULATION_ROUNDING = 1_000;
/** Exposed counts are rounded to this. */
export const EXPOSED_ROUNDING = 100;

/**
 * Share of an area's territory in the worst two bands, per severity of the
 * headline estimate. This is the explicit link the contract asks for: a
 * `critical` area cannot report a small affected share, because its share is
 * drawn from a band that starts high.
 */
export const AFFECTED_SHARE_BY_SEVERITY: Readonly<Record<Severity, readonly [number, number]>> = {
  good: [0.02, 0.12],
  warning: [0.12, 0.35],
  serious: [0.35, 0.62],
  critical: [0.62, 0.95],
};

/* ----------------------------------------------------------------- series */

/**
 * Kenya's rainfall is bimodal: long rains around March to May, short rains
 * around October to December. Vegetation and flood indicators respond after the
 * rain has fallen, so the seasonal response peaks are placed a month later than
 * the rainfall peaks.
 */
export const LONG_RAINS_RESPONSE_MONTH = 5; // May, after the March-May long rains
export const SHORT_RAINS_RESPONSE_MONTH = 12; // December, after the October-December short rains
export const LONG_RAINS_WEIGHT = 0.62;
export const SHORT_RAINS_WEIGHT = 0.38;
export const LONG_RAINS_WIDTH_MONTHS = 1.7;
export const SHORT_RAINS_WIDTH_MONTHS = 1.5;

/** Peak-to-mean size of the seasonal term, as a fraction of the domain span. */
export const SEASON_AMPLITUDE = 0.16;

/** Month-to-month noise, as a fraction of the domain span, before AR(1) smoothing. */
export const SERIES_NOISE = 0.12;
/** AR(1) coefficient on the noise. Consecutive months are correlated, as real observations are. */
export const SERIES_NOISE_MEMORY = 0.6;

/** Total drift across the whole window, as a fraction of the domain span. */
export const SERIES_MAX_DRIFT = 0.12;

/**
 * Fraction of months dropped as cloud-obscured gaps. Optical indicators lose
 * months to cloud, and the chart code has to render a gap rather than a zero,
 * so a run always inserts a few once the window is long enough to hold one.
 */
export const CLOUD_GAP_RATE = 0.08;
/** Below this many months a run inserts no gaps: one gap in a three-month series hides the signal. */
export const MIN_MONTHS_FOR_GAPS = 4;

/* ---------------------------------------------------------------- metrics */

/** Floor on AUC before the model and data terms are added. A coin flip is 0.5. */
export const AUC_BASE = 0.62;
/** AUC gained per unit of model cost weight. Small on purpose: a better model is better, not magic. */
export const AUC_PER_COST_WEIGHT = 0.06;
/** AUC gained from a full reference window of data, at most. */
export const AUC_DATA_BONUS = 0.06;
/** Seeded spread on AUC. Smaller than the gap between the two models, or the ordering would flip. */
export const AUC_JITTER = 0.02;
/** No scaffold model claims to be perfect. */
export const AUC_CEILING = 0.97;

/** Held-out samples per area-month. Reads as a per-county pixel stack for one month. */
export const SAMPLES_PER_AREA_MONTH = 320;

/* ---------------------------------------------------------------- overlay */

/**
 * Target number of overlay cells across the width of the map frame. The cell
 * size handed to `geo.gridFor` is derived from this and the frame width, so the
 * overlay stays legible whatever viewBox `services/geo` settles on: roughly 70
 * cells across the country, which is a few hundred to a few thousand cells for
 * one to four counties. Small enough to render as SVG rects, large enough to
 * read as a field.
 */
export const OVERLAY_CELLS_ACROSS = 72;
/** Smallest cell the overlay will use, in frame units, whatever the frame width. */
export const MIN_OVERLAY_CELL = 4;

/** Size of the smooth spatial term in the overlay, as a fraction of the domain span. */
export const OVERLAY_FIELD_AMPLITUDE = 0.18;
/** Per-cell jitter, as a fraction of the domain span. Kept small so neighbours stay similar. */
export const OVERLAY_JITTER = 0.012;
/**
 * Angular rate of the smooth term, in radians per degree of lon/lat. At 2.0 the
 * field has a wavelength near 3 degrees (roughly 300 km), so it varies across a
 * county rather than within a cell, and neighbouring cells stay similar.
 */
export const OVERLAY_LON_FREQUENCY = 2.0;
export const OVERLAY_LAT_FREQUENCY = 1.7;

/**
 * The most two neighbouring overlay cells may differ, as a fraction of the
 * domain span. Not a tuning knob: it is the property the overlay has to have to
 * read as a field instead of as static, and it is asserted in the tests.
 */
export const OVERLAY_NEIGHBOUR_BUDGET = 0.08;

/* ----------------------------------------------------------------- stages */

/** Wall-clock budget for the running screen, in milliseconds, before the cost and area weighting. */
export const STAGE_TOTAL_BASE_MS = 2600;
/** Fraction of the total that scales with the model's cost weight. */
export const STAGE_COST_SHARE = 0.25;
/** Added per extra area beyond the first. */
export const STAGE_PER_EXTRA_AREA = 0.08;
/** Hard bounds on the total. Long enough to read the stage labels, short enough not to annoy. */
export const STAGE_TOTAL_BOUNDS_MS: readonly [number, number] = [2500, 6000];
