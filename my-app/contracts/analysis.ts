/**
 * Contract: analysis runs.
 *
 * A run is a pure function of its configuration. `runId` is a hash of the
 * config, so the same config always produces the same id and the same result,
 * and a result URL is shareable with no server-side storage at all. That is a
 * deliberate scaffold decision: swap `services/analysis` for a real model
 * backend without changing this contract or any page.
 *
 * Contract version: 1.
 */
import { z } from "zod";
import { ModelIdSchema, SeveritySchema, TopicIdSchema } from "./catalog";
import { AreaIdSchema } from "./geo";
import type { IndicatorBand, IndicatorSpec, ModelSpec, TopicSpec } from "./catalog";
import type { Area, MapFrame, OverlayCell } from "./geo";

export const ANALYSIS_CONTRACT_VERSION = 1;

/* ------------------------------------------------------------------ config */

export const ANALYSIS_TYPES = ["single", "comparison"] as const;
export const AnalysisTypeSchema = z.enum(ANALYSIS_TYPES);
export type AnalysisType = z.infer<typeof AnalysisTypeSchema>;

/** Inclusive date window, ISO yyyy-mm-dd, evaluated in UTC. */
export const DateRangeSchema = z
  .object({ start: z.iso.date(), end: z.iso.date() })
  .refine((r) => r.start <= r.end, {
    message: "start date must be on or before the end date",
    path: ["start"],
  });

export type DateRange = z.infer<typeof DateRangeSchema>;

/** The smallest window the models will accept, in days. */
export const MIN_RANGE_DAYS = 30;
/** The largest window, in days. Keeps a scaffold run bounded. */
export const MAX_RANGE_DAYS = 366 * 10;
/** Comparison mode is capped so the categorical palette stays inside its gates. */
export const MAX_COMPARISON_AREAS = 4;

export const RunConfigSchema = z
  .object({
    topic: TopicIdSchema,
    analysisType: AnalysisTypeSchema,
    areas: z.array(AreaIdSchema).min(1).max(MAX_COMPARISON_AREAS),
    dateRange: DateRangeSchema,
    model: ModelIdSchema,
  })
  .superRefine((cfg, ctx) => {
    if (cfg.analysisType === "single" && cfg.areas.length !== 1) {
      ctx.addIssue({
        code: "custom",
        path: ["areas"],
        message: "single-location analysis takes exactly one area",
      });
    }
    if (cfg.analysisType === "comparison" && cfg.areas.length < 2) {
      ctx.addIssue({
        code: "custom",
        path: ["areas"],
        message: "comparison needs at least two areas",
      });
    }
    if (new Set(cfg.areas).size !== cfg.areas.length) {
      ctx.addIssue({ code: "custom", path: ["areas"], message: "areas must be unique" });
    }

    // The window bounds are enforced here rather than on DateRangeSchema so
    // that a bad range reports under `dateRange`, which is the one control the
    // form renders for it.
    const days =
      Math.round(
        (Date.parse(`${cfg.dateRange.end}T00:00:00Z`) -
          Date.parse(`${cfg.dateRange.start}T00:00:00Z`)) /
          86_400_000,
      ) + 1;

    if (Number.isFinite(days)) {
      if (days < MIN_RANGE_DAYS) {
        ctx.addIssue({
          code: "custom",
          path: ["dateRange"],
          message: `the window must cover at least ${MIN_RANGE_DAYS} days`,
        });
      }
      if (days > MAX_RANGE_DAYS) {
        ctx.addIssue({
          code: "custom",
          path: ["dateRange"],
          message: `the window must cover at most ${MAX_RANGE_DAYS} days`,
        });
      }
    }
  });

export type RunConfig = z.infer<typeof RunConfigSchema>;

/* ------------------------------------------------------- url serialisation */

/**
 * A run config survives a page navigation as query parameters, so a result is
 * bookmarkable and server-renderable. This is the only encoding; both the
 * pages and the API routes use it.
 *
 * ?type=comparison&areas=turkana,marsabit&from=2024-01-01&to=2024-12-31&model=xgboost
 */
export interface RunConfigQuery {
  type?: string;
  areas?: string;
  from?: string;
  to?: string;
  model?: string;
}

/**
 * The codec lives in the contract, not in the service, because BOTH sides need
 * it and it is pure string work with no data behind it. The pre-analysis form
 * is a client component: if it had to import `services/analysis` to build a
 * URL, it would pull the whole catalogue, all 47 county geometries and the
 * model code into the browser bundle to produce a query string.
 *
 * `services/analysis` delegates its `toQuery` / `parseQuery` to these, so
 * there is exactly one encoding and it cannot drift between the two callers.
 */
export function buildRunQuery(config: RunConfig): string {
  /*
   * Fixed key order, so the same config always yields a byte-identical URL and
   * two links to the same run compare equal as strings.
   *
   * Built by hand rather than with `URLSearchParams`, which percent-encodes the
   * comma in the area list and turns a readable
   * `areas=turkana,marsabit` into `areas=turkana%2Cmarsabit`. A comma is legal
   * unencoded in a query value, area ids are validated kebab-case slugs with
   * nothing else needing an escape, and a URL a person can read is worth the
   * five lines. `services/analysis/query.ts` delegates here so there is exactly
   * one encoding.
   */
  return [
    `type=${encodeURIComponent(config.analysisType)}`,
    `areas=${config.areas.map((id) => encodeURIComponent(id)).join(",")}`,
    `from=${encodeURIComponent(config.dateRange.start)}`,
    `to=${encodeURIComponent(config.dateRange.end)}`,
    `model=${encodeURIComponent(config.model)}`,
  ].join("&");
}

/**
 * Parses the query half of a run config. The topic travels in the PATH
 * (`/analysis/[topic]/results`), so it is passed in separately rather than
 * read from the query.
 *
 * Returns every field error at once, keyed by field, so the form can show all
 * of them instead of revealing one per submit.
 */
export function parseRunQuery(
  topic: string,
  query: RunConfigQuery,
): { ok: true; config: RunConfig } | { ok: false; error: ApiError } {
  const candidate = {
    topic,
    analysisType: query.type,
    areas: (query.areas ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    dateRange: { start: query.from, end: query.to },
    model: query.model,
  };

  const parsed = RunConfigSchema.safeParse(candidate);
  if (parsed.success) return { ok: true, config: parsed.data };

  const fieldErrors: Record<string, string[]> = {};
  for (const issue of parsed.error.issues) {
    // "dateRange.start" collapses to "dateRange": the form shows one message
    // under the range control, not one under each end of it.
    const key = issue.path.length > 0 ? String(issue.path[0]) : "form";
    (fieldErrors[key] ??= []).push(issue.message);
  }

  return { ok: false, error: { error: "Invalid run configuration", fieldErrors } };
}

/** Inclusive whole days between two ISO dates. Used by the range validators. */
export function rangeDays(range: { start: string; end: string }): number {
  const start = Date.parse(`${range.start}T00:00:00Z`);
  const end = Date.parse(`${range.end}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end)) return Number.NaN;
  return Math.round((end - start) / 86_400_000) + 1;
}

/* ------------------------------------------------------------------ result */

export interface Estimate {
  /** Point estimate in indicator units. */
  readonly value: number;
  /** 90% interval. `lower <= value <= upper`. */
  readonly lower: number;
  readonly upper: number;
}

export interface AreaResult {
  readonly area: Area;
  readonly estimate: Estimate;
  readonly band: IndicatorBand;
  /**
   * Change against the same window one year earlier, in indicator units.
   * Positive means the indicator rose, which is not necessarily an improvement:
   * read it together with `indicator.badEnd`.
   */
  readonly changeYoY: number;
  /** Population exposed, rounded. Scaffold figure, see services/analysis. */
  readonly populationExposed: number;
  /** Share of the county area in the worst two bands, 0..1. */
  readonly affectedAreaShare: number;
}

export interface SeriesPoint {
  /** ISO yyyy-mm-dd, the first day of the observation period. */
  readonly date: string;
  /** Indicator value per area id. Sparse entries are gaps, not zeroes. */
  readonly values: Readonly<Record<string, number | null>>;
}

export interface FeatureImportance {
  readonly feature: string;
  /** 0..1, sums to ~1 across the list. */
  readonly weight: number;
}

export interface ModelMetrics {
  readonly model: ModelSpec;
  /** Area under the ROC curve for the classified indicator, 0..1. */
  readonly auc: number;
  /** Coefficient of determination on the held-out split, 0..1. */
  readonly r2: number;
  /** Root mean squared error in indicator units. */
  readonly rmse: number;
  readonly trainingSamples: number;
  /** Ordered most important first. */
  readonly featureImportances: readonly FeatureImportance[];
}

export interface RunResult {
  readonly runId: string;
  readonly config: RunConfig;
  readonly topic: TopicSpec;
  readonly indicator: IndicatorSpec;
  readonly analysisType: AnalysisType;
  /** ISO timestamp, derived from the config so it stays deterministic. */
  readonly generatedAt: string;
  readonly areas: readonly AreaResult[];
  readonly series: readonly SeriesPoint[];
  readonly metrics: ModelMetrics;
  readonly frame: MapFrame;
  readonly overlay: readonly OverlayCell[];
  /** Plain-language reading of the result, two sentences at most. */
  readonly narrative: string;
  /** The worst severity across areas, for the headline chip. */
  readonly headlineSeverity: z.infer<typeof SeveritySchema>;
}

/* --------------------------------------------------------------- transport */

/** Shape of a successful POST /api/analysis/run response. */
export interface RunAcceptedResponse {
  readonly runId: string;
  /** Where to poll or navigate for the result. */
  readonly resultUrl: string;
  /** Stages the running screen should display, in order. */
  readonly stages: readonly RunStage[];
}

export interface RunStage {
  readonly id: string;
  /** Imperative, names what is actually being computed. */
  readonly label: string;
  /** Milliseconds this stage should occupy on the running screen. */
  readonly durationMs: number;
}

export interface ApiError {
  readonly error: string;
  /** Field-keyed messages, ready to render beside the offending input. */
  readonly fieldErrors?: Readonly<Record<string, readonly string[]>>;
}

export const DOWNLOAD_FORMATS = ["csv", "geojson", "json"] as const;
export const DownloadFormatSchema = z.enum(DOWNLOAD_FORMATS);
export type DownloadFormat = z.infer<typeof DownloadFormatSchema>;

/* ------------------------------------------------------------- the service */

/** The surface `services/analysis` must expose. */
export interface AnalysisService {
  /** Stable id for a config. Same config in, same id out, across processes. */
  runId(config: RunConfig): string;
  /** Pure. No IO, no clock, no randomness that is not seeded from the config. */
  run(config: RunConfig): RunResult;
  /** Stages for the running screen, sized by model cost and area count. */
  stages(config: RunConfig): readonly RunStage[];
  /** Serialises a result for download. Returns the body and its content type. */
  export(result: RunResult, format: DownloadFormat): { body: string; contentType: string; filename: string };
  /** Parses query parameters into a config, collecting every field error. */
  parseQuery(query: RunConfigQuery): { ok: true; config: RunConfig } | { ok: false; error: ApiError };
  /** Builds the canonical query string for a config. Inverse of parseQuery. */
  toQuery(config: RunConfig): string;
}
