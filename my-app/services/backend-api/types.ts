/**
 * The shapes `contracts/backend-api.md` version 1 defines, as types the app can
 * hold, plus the schemas that check a response actually is one.
 *
 * Why schemas and not just types. Everything here crosses a process boundary,
 * so a TypeScript type is a claim about the other side rather than a fact about
 * this one. The Django service is in a different language, deployed separately,
 * and can be a version behind at any moment. A `progress` that arrives as the
 * string "0.28" typechecks as never having been checked and then renders a
 * progress bar at NaN percent, which looks like a stalled run rather than like
 * a bug.
 *
 * Every object schema is `.loose()`, which is the contract's own rule written
 * as code: "additive fields are not breaking, and the app must ignore fields it
 * does not know". A strict schema here would turn a backend that grew a field
 * into an app that refuses to show a finished run.
 */

import { z } from "zod";

/** The contract version this client speaks. A bump means /api/v2. */
export const BACKEND_CONTRACT_VERSION = 1;

/** Every path this client knows, relative to the base URL. */
export const API_PREFIX = "/api/v1";

/* ------------------------------------------------------------------ errors */

/**
 * The one error shape the service uses everywhere: a message, plus whatever
 * context helps. `fieldErrors` carries every problem at once because the
 * service checks every field before answering, and showing them one submit at
 * a time is what the contract calls out as the thing not to do.
 */
export const ApiErrorSchema = z
  .object({
    error: z.string(),
    fieldErrors: z.record(z.string(), z.array(z.string())).optional(),
    didYouMean: z.array(z.string()).optional(),
    /** Present on a 409 from the result endpoint: the run exists, it is not done. */
    runStatus: z.string().optional(),
    statusUrl: z.string().optional(),
  })
  .loose();

export type ApiError = z.infer<typeof ApiErrorSchema>;

/* ------------------------------------------------------------------ health */

export const HealthSchema = z
  .object({
    status: z.enum(["ok", "degraded"]),
    service: z.string(),
    version: z.string(),
    geoserver: z
      .object({
        endpoint: z.string(),
        reachable: z.boolean(),
        detail: z.string().nullable(),
        layerCount: z.number().nullable().optional(),
        elapsedMs: z.number().nullable().optional(),
      })
      .loose(),
  })
  .loose();

export type Health = z.infer<typeof HealthSchema>;

/* ---------------------------------------------------------------- criteria */

/**
 * `method` is the field the app switches on, and the reason the criteria
 * endpoint answers 200 for a topic it cannot run: a model-track topic is not an
 * error, it is a topic with a different method, and the app has to show a
 * different screen rather than an empty form. Left as a string rather than an
 * enum on purpose. A method this client has never heard of is a backend that is
 * ahead, not a response to reject, and `isWeightedOverlay` below is the only
 * question the app actually asks of it.
 */
export const CriterionSchema = z
  .object({
    id: z.string(),
    label: z.string(),
    unit: z.string().optional(),
    direction: z.string().optional(),
    reference: z.string().optional(),
    /** False when the class table ships empty, so a run naming it is refused. */
    filled: z.boolean(),
  })
  .loose();

export type Criterion = z.infer<typeof CriterionSchema>;

export const TopicCriteriaSchema = z
  .object({
    topic: z.string(),
    method: z.string(),
    criteria: z.array(CriterionSchema),
    defaultWeights: z.record(z.string(), z.number()),
    unfilled: z.array(z.string()),
    detail: z.string().optional(),
  })
  .loose();

export type TopicCriteria = z.infer<typeof TopicCriteriaSchema>;

export const WEIGHTED_OVERLAY = "weighted-overlay";

/** True when this topic has a method the backend can actually run. */
export function isWeightedOverlay(criteria: TopicCriteria): boolean {
  return criteria.method === WEIGHTED_OVERLAY;
}

/**
 * The weights a run can be created with: the defaults, minus anything whose
 * class table is empty on this deployment.
 *
 * Dropping an unfilled criterion is not enough on its own, because the service
 * requires the remaining weights to sum to 1.0 within 1e-6 and refuses a zero.
 * So the survivors are renormalised and rounded to six places, which is also
 * what the service rounds to before hashing the config into a run id. Rounding
 * after renormalising can leave the sum a few ulps off 1, so the largest share
 * absorbs the residual: it is the one where a 1e-6 adjustment is least visible,
 * and it guarantees the sum is exact rather than nearly exact.
 *
 * Returns null when nothing survives, which is a topic this deployment cannot
 * run at all. That is a state to render, not an empty object to POST.
 */
export function runnableWeights(criteria: TopicCriteria): Record<string, number> | null {
  const unfilled = new Set(criteria.unfilled);
  const kept = Object.entries(criteria.defaultWeights).filter(
    ([id, weight]) => !unfilled.has(id) && weight > 0,
  );
  if (kept.length === 0) return null;

  const total = kept.reduce((sum, [, weight]) => sum + weight, 0);
  if (!(total > 0)) return null;

  const scaled = kept.map(([id, weight]) => [id, round6(weight / total)] as const);
  const sum = scaled.reduce((acc, [, weight]) => acc + weight, 0);
  const residual = round6(1 - sum);

  if (residual !== 0) {
    let largest = 0;
    for (let i = 1; i < scaled.length; i += 1) {
      if (scaled[i][1] > scaled[largest][1]) largest = i;
    }
    // Reconstructed rather than mutated: the tuples are readonly by their own
    // declaration, and the rounding has to happen again after the addition.
    const adjusted: Array<readonly [string, number]> = [...scaled];
    adjusted[largest] = [scaled[largest][0], round6(scaled[largest][1] + residual)];
    return Object.fromEntries(adjusted);
  }

  return Object.fromEntries(scaled);
}

/** Six places, the precision the service rounds weights to before hashing. */
function round6(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

/* -------------------------------------------------------------------- runs */

export const RUN_STATUSES = [
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
] as const;
export const RunStatusSchema = z.enum(RUN_STATUSES);
export type RunStatus = z.infer<typeof RunStatusSchema>;

export const STAGE_STATES = [
  "pending",
  "running",
  "done",
  "skipped",
  "failed",
] as const;
export const StageStateSchema = z.enum(STAGE_STATES);
export type StageState = z.infer<typeof StageStateSchema>;

/** A run is over. Nothing about it will change, so polling stops here. */
export function isTerminal(status: RunStatus): boolean {
  return status === "succeeded" || status === "failed" || status === "cancelled";
}

export const StageSchema = z
  .object({
    id: z.string(),
    label: z.string(),
    state: StageStateSchema,
    startedAt: z.string().nullable().optional(),
    endedAt: z.string().nullable().optional(),
    /** Free text from the stage itself: "5 breaks", "928x922 at 30m". */
    detail: z.string().nullable().optional(),
  })
  .loose();

export type Stage = z.infer<typeof StageSchema>;

/**
 * The POST response. 202 for new work and 200 for a configuration that has
 * already been run, and `cached` is which: a client that retried after a
 * dropped connection needs to know it did not just start a second four-minute
 * computation.
 */
export const RunCreatedSchema = z
  .object({
    runId: z.string(),
    statusUrl: z.string(),
    status: RunStatusSchema,
    cached: z.boolean(),
    stages: z.array(StageSchema),
  })
  .loose();

export type RunCreated = z.infer<typeof RunCreatedSchema>;

export const RunErrorSchema = z
  .object({ stage: z.string(), message: z.string() })
  .loose();

export type RunError = z.infer<typeof RunErrorSchema>;

export const RunStatusResponseSchema = z
  .object({
    runId: z.string(),
    topic: z.string(),
    status: RunStatusSchema,
    stages: z.array(StageSchema),
    /** 0..1, derived from finished stage weights, never from a clock. */
    progress: z.number(),
    startedAt: z.string().nullable().optional(),
    endedAt: z.string().nullable().optional(),
    error: RunErrorSchema.nullable().optional(),
  })
  .loose();

export type RunStatusResponse = z.infer<typeof RunStatusResponseSchema>;

/* ------------------------------------------------------------------ result */

export const ClassRowSchema = z
  .object({
    class: z.number(),
    label: z.string(),
    pixels: z.number(),
    areaKm2: z.number(),
    /** 0..1 of the valid pixels. The rows sum to 1. */
    share: z.number(),
  })
  .loose();

export type ClassRow = z.infer<typeof ClassRowSchema>;

export const RunConfigSchema = z
  .object({
    topic: z.string(),
    areas: z.array(z.unknown()),
    weights: z.record(z.string(), z.number()),
    targetCrs: z.string(),
    resolution: z.number(),
    dateWindow: z
      .object({ start: z.string(), end: z.string() })
      .loose()
      .nullable()
      .optional(),
    publishLayers: z.boolean().optional(),
  })
  .loose();

export type BackendRunConfig = z.infer<typeof RunConfigSchema>;

/**
 * The result.
 *
 * `grid`, `validPixels` and `rasters` are optional here while every other field
 * is required, and the asymmetry is deliberate: the first two are reporting
 * detail the screen can do without, and `rasters` is a set of server-side file
 * paths that the app must never render. It is parsed only so that ignoring it
 * is a decision recorded in the type rather than an omission.
 */
export const RunResultSchema = z
  .object({
    runId: z.string(),
    config: RunConfigSchema,
    generatedAt: z.string().nullable(),
    indicator: z.object({ id: z.string(), label: z.string() }).loose(),
    /** Jenks natural breaks, computed from this run's own distribution. */
    breaks: z.array(z.number()),
    classes: z.array(ClassRowSchema),
    /** mean(risk_i) * weight_i, normalised. Not feature importance. */
    contribution: z.record(z.string(), z.number()),
    validPixels: z.number().optional(),
    grid: z
      .object({
        crs: z.string(),
        resolution: z.number(),
        width: z.number(),
        height: z.number(),
      })
      .loose()
      .optional(),
    rasters: z.record(z.string(), z.string()).optional(),
    /** Published GeoServer layer names, empty unless publishLayers was true. */
    layers: z.array(z.string()),
  })
  .loose();

export type RunResult = z.infer<typeof RunResultSchema>;

/* ------------------------------------------------------------- run request */

/** The POST body. Mirrors the table in contracts/backend-api.md. */
export interface CreateRunBody {
  topic: string;
  /** 1..12 GeoJSON Features or geometries, polygons only, WGS84. */
  areas: unknown[];
  /** One key per criterion, each > 0, summing to 1.0 within 1e-6. */
  weights: Record<string, number>;
  /** Projected, in metres. A geographic CRS is refused by the service. */
  targetCrs: string;
  /** Metres per pixel, 10..1000. */
  resolution: number;
  dateWindow?: { start: string; end: string };
  publishLayers?: boolean;
}

/**
 * UTM zone 37N, which covers the Tana River basin and most of eastern Kenya,
 * and is the CRS the first real run was computed in.
 *
 * Hardcoded rather than derived from the selected areas, and that is a limit
 * worth stating rather than hiding: a selection in western Kenya belongs in
 * 36N, and computing it in 37N stretches distances the further west it sits.
 * The service refuses a geographic CRS outright, so a wrong-but-projected
 * default at least computes in metres. Choosing the zone from the centroid is
 * the obvious next step and is deliberately not guessed at here, because which
 * CRS a KSA product is published in is their call, not this client's.
 */
export const DEFAULT_TARGET_CRS = "EPSG:32637";

/** Metres per pixel. 30 is Landsat-native and what the first real run used. */
export const DEFAULT_RESOLUTION = 30;
