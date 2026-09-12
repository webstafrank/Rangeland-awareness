/**
 * Contract: study catalogue.
 *
 * The set of topics a user can study, the indicator each topic reports, and the
 * models available to compute it. `services/catalog` is the only implementer;
 * every other service and every page imports these types, never the catalogue's
 * internals.
 *
 * Contract version: 1. Adding a topic, model or band is backwards compatible.
 * Renaming or removing an id is a breaking change: bump this number and update
 * both sides in the same commit.
 */
import { z } from "zod";

export const CATALOG_CONTRACT_VERSION = 1;

/* ------------------------------------------------------------------ topics */

export const TOPIC_IDS = [
  "flood-risk",
  "drought",
  "food-security",
  "rangeland-dynamics",
] as const;

export const TopicIdSchema = z.enum(TOPIC_IDS);
export type TopicId = z.infer<typeof TopicIdSchema>;

/* ------------------------------------------------------------------ models */

export const MODEL_IDS = ["random-forest", "xgboost"] as const;

export const ModelIdSchema = z.enum(MODEL_IDS);
export type ModelId = z.infer<typeof ModelIdSchema>;

export interface ModelSpec {
  readonly id: ModelId;
  readonly label: string;
  /** One line a non-specialist can read. */
  readonly blurb: string;
  /** What the model is good at, shown as a hint on the pre-analysis page. */
  readonly strength: string;
  /** Relative compute cost, drives the running-screen stage durations. */
  readonly costWeight: number;
}

/* -------------------------------------------------------------- indicators */

/**
 * Severity classes. These map onto the reserved status palette
 * (good / warning / serious / critical) and are ALWAYS rendered with a text
 * label beside the colour, never colour alone: on a light surface `warning`
 * and `serious` sit below 3:1 by design, and the icon + label pairing is the
 * documented mitigation.
 */
export const SEVERITIES = ["good", "warning", "serious", "critical"] as const;
export const SeveritySchema = z.enum(SEVERITIES);
export type Severity = z.infer<typeof SeveritySchema>;

export interface IndicatorBand {
  /** Inclusive lower bound in indicator units. */
  readonly min: number;
  /** Exclusive upper bound in indicator units, or null for the top band. */
  readonly max: number | null;
  readonly label: string;
  readonly severity: Severity;
}

export interface IndicatorSpec {
  readonly id: string;
  /** Short name for axis labels and table headers. */
  readonly label: string;
  /** Full name with the acronym expanded, for the results summary. */
  readonly longLabel: string;
  /** Unit string, or "" for a dimensionless index. Always shown next to values. */
  readonly unit: string;
  /** Decimal places used everywhere this indicator is formatted. */
  readonly precision: number;
  readonly domain: readonly [number, number];
  /**
   * Which end of the domain is bad. `low` means small values are the concern
   * (vegetation indices, biomass); `high` means large values are (flood
   * probability, IPC phase).
   */
  readonly badEnd: "low" | "high";
  /** Ordered low to high. Must tile `domain` with no gaps. */
  readonly bands: readonly IndicatorBand[];
  /** Where the real-world definition comes from, surfaced in the UI. */
  readonly source: string;
}

/* ------------------------------------------------------------------- topic */

export interface TopicSpec {
  readonly id: TopicId;
  readonly label: string;
  /** One sentence, plain language, shown on the topic card. */
  readonly blurb: string;
  /** Longer framing shown on the pre-analysis page. */
  readonly description: string;
  /** The headline indicator this topic reports. */
  readonly indicator: IndicatorSpec;
  /** Input layers the model consumes, shown as the map's overlay options. */
  readonly drivers: readonly string[];
  /** Models valid for this topic, in display order. */
  readonly models: readonly ModelId[];
  /** Earliest date with input coverage, ISO yyyy-mm-dd. */
  readonly dataStart: string;
}

/* ------------------------------------------------------------- the service */

/** The surface `services/catalog` must expose. */
export interface CatalogService {
  listTopics(): readonly TopicSpec[];
  getTopic(id: TopicId): TopicSpec;
  /** Returns undefined instead of throwing, for validating untrusted input. */
  findTopic(id: string): TopicSpec | undefined;
  listModels(): readonly ModelSpec[];
  getModel(id: ModelId): ModelSpec;
  findModel(id: string): ModelSpec | undefined;
  /** The band a value falls in. Clamps to the first/last band out of domain. */
  classify(indicator: IndicatorSpec, value: number): IndicatorBand;
  /** Formats a value with its precision and unit, e.g. "27.4" or "1 340 kg/ha". */
  formatValue(indicator: IndicatorSpec, value: number): string;
}
