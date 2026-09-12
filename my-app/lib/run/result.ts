/**
 * The run result: the output side of the engine boundary (CONTRACT section 3).
 *
 * Types only. Nothing here computes anything, so a page, a chart or an exporter
 * can import the shape it renders without pulling the generator, the hash and
 * the whole indicator table into its bundle.
 *
 * The invariants these types cannot express, and which `engine.ts` holds and
 * `__tests__/engine.test.ts` proves:
 *   - every value sits inside `indicator.domain`
 *   - `lower <= value <= upper` for every estimate
 *   - `band` is always `classify(indicator, estimate.value)`, never a guess
 *   - every `formulaValues` entry sits inside that formula's declared `range`
 *   - `affectedAreaShare` agrees with the severity of the band
 *   - `featureImportances` names every formula the analyst selected
 */

import type { RunConfig } from "@/lib/run/config";

/**
 * How bad a band is. Ordered least to worst by `SEVERITY_ORDER` in
 * constants.ts; nothing may assume this declaration order carries the ranking,
 * because a union has no order.
 *
 * Always rendered with its label beside any colour. On a light surface the
 * middle two sit below 3:1 against each other, so colour alone would not
 * distinguish them for a low-vision reader.
 */
export type Severity = "none" | "low" | "moderate" | "high" | "severe";

/**
 * One class of an indicator, half-open: `[min, max)`.
 *
 * Half-open is what makes classification total. With both ends inclusive, a
 * value exactly on a boundary belongs to two bands and the answer depends on
 * iteration order. `max: null` on the top band means open-ended, so no value
 * above the domain can fall out of the table.
 */
export interface IndicatorBand {
  id: string;
  label: string;
  min: number;
  max: number | null;
  severity: Severity;
}

export interface IndicatorSpec {
  id: string;
  /** Short name, for axis labels and table headers. */
  label: string;
  /** Unit string, or "" for a dimensionless index. Always shown next to a value. */
  unit: string;
  domain: readonly [number, number];
  /**
   * Which end of the domain is the concern. `low` means small values are bad
   * (vegetation condition, VHI); `high` means large values are (flood
   * susceptibility, IPC phase). The single fact that decides whether a rise is
   * good news, read at the point a sentence is written and nowhere else.
   */
  badEnd: "high" | "low";
  /** Ordered low to high, tiling `domain` with no gaps and no overlaps. */
  bands: readonly IndicatorBand[];
  /**
   * Decimal places used everywhere this indicator is formatted.
   *
   * ADDITION to CONTRACT section 3, flagged in lib/run/README.md. Without it
   * every renderer picks its own rounding, and a table that shows 27.4 beside a
   * chart that shows 27.35 reads as "the numbers are wrong" even though both
   * are the same number.
   */
  precision: number;
  /** Where the real-world definition comes from. Surfaced in the UI. */
  source: string;
}

/** A point estimate with its 90% interval. `lower <= value <= upper`, always. */
export interface Estimate {
  value: number;
  lower: number;
  upper: number;
}

export interface AreaResult {
  areaId: string;
  label: string;
  estimate: Estimate;
  band: IndicatorBand;
  /**
   * Change against the same window one year earlier, in indicator units.
   * Signed, and NOT pre-interpreted: positive means the indicator rose, which
   * is only good news when `indicator.badEnd` is `low`.
   */
  changeYoY: number;
  /** Share of the area in the worst two bands, 0..1. */
  affectedAreaShare: number;
  /**
   * One value per selected formula, keyed by `FormulaId`. Each sits inside that
   * formula's own declared `range`, so a page can render it next to the
   * formula's arithmetic without re-scaling anything.
   */
  formulaValues: Readonly<Record<string, number>>;
}

export interface SeriesPoint {
  /** ISO yyyy-mm-dd, the first day of the observation month. */
  date: string;
  /** Indicator value per area id. `null` is a gap, never a zero. */
  values: Readonly<Record<string, number | null>>;
}

export interface FeatureImportance {
  feature: string;
  /** 0..1, summing to 1 across the list. */
  weight: number;
}

export interface ModelMetrics {
  /** Area under the ROC curve for the classified indicator, 0.5..1. */
  auc: number;
  /** Coefficient of determination on the held-out split, 0..1. */
  r2: number;
  /** Root mean squared error, in indicator units. */
  rmse: number;
  trainingSamples: number;
  /** Ordered heaviest first. Always names every formula the analyst selected. */
  featureImportances: readonly FeatureImportance[];
}

export interface RunResult {
  /** Stable hash of the config. The whole of this result's persistence. */
  runId: string;
  config: RunConfig;
  /** Derived from the config's window, NEVER from a clock. */
  generatedAt: string;
  indicator: IndicatorSpec;
  /** In the order the analyst selected the areas. Order is presentation. */
  areas: readonly AreaResult[];
  series: readonly SeriesPoint[];
  metrics: ModelMetrics;
  /** Plain-language reading of the result. Two sentences at most. */
  narrative: string;
  /** The worst band across areas, for the headline chip. */
  headlineBand: IndicatorBand;
}

/** One step of the processing screen. */
export interface RunStage {
  id: string;
  /** Names what is actually being computed. "Loading..." is not a stage. */
  label: string;
  durationMs: number;
}

export const EXPORT_FORMATS = ["csv", "geojson", "json"] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export interface ExportPayload {
  body: string;
  contentType: string;
  filename: string;
}
