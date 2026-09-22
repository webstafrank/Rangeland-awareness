/**
 * Turning what the wizard collected into what the service will accept.
 *
 * The four steps produce an `AnalysisRequest`: a topic, an analysis type, a
 * model and a list of areas. `POST /api/v1/runs` wants something different: a
 * topic, polygons, a weight per criterion, a projected CRS and a resolution.
 * The gap between those two is real and this module is where it is closed, in
 * one place, as a pure function, so every transformation applied to an
 * analyst's selection is one line of code with a test and a sentence on screen
 * rather than something that happened somewhere in a submit handler.
 *
 * The rule the whole file follows: **never quietly change what was asked for.**
 * Every transformation produces a note that the UI shows, and anything that
 * cannot be transformed honestly is a refusal with a reason rather than a
 * best guess. A run is minutes of compute and a map a county officer may act
 * on; a silently widened area of interest is a wrong answer that looks right.
 *
 * The service re-checks all of this and is authoritative. Checking here too is
 * not duplication for its own sake: a refusal the app can state immediately is
 * a sentence under the button instead of a round trip, and the two cannot drift
 * because the app's checks are strictly the looser ones.
 */

import type { Feature, Geometry } from "geojson";
import { boxAroundPoint } from "@/services/geo/box";
import {
  DEFAULT_RESOLUTION,
  DEFAULT_TARGET_CRS,
  runnableWeights,
  isWeightedOverlay,
} from "@/services/backend-api";
import type { CreateRunBody, TopicCriteria } from "@/services/backend-api";
import type { AnalysisRequest, RequestArea } from "@/services/analysis/request";

/**
 * The service takes 1 to 12 areas. Stated here as well so the refusal can be
 * phrased before the round trip; the service remains the one that enforces it.
 */
export const MAX_RUN_AREAS = 12;

/**
 * Half-width of the square a clicked point becomes, in kilometres.
 *
 * 10 because that is already this app's answer to the same question: the
 * coordinate entry control defaults to a 10km radius and has since it was
 * built, so a clicked point and a typed coordinate now produce the same area
 * rather than two different ones for no reason a user could discover.
 *
 * The number is arbitrary in the way every default is arbitrary, which is why
 * it is never applied silently. It produces a note, the note is rendered, and
 * the analyst can go back and draw the area they actually meant.
 */
export const POINT_BUFFER_KM = 10;

/** A transformation that was applied, phrased for the person who chose the area. */
export interface PlanNote {
  areaId: string;
  message: string;
}

export type PlanRefusal =
  /** The topic has no weighted overlay behind it. Not an error, a different screen. */
  | "model-topic"
  /** Every criterion this topic needs is unavailable on this deployment. */
  | "no-runnable-criteria"
  | "no-areas"
  | "too-many-areas"
  /** A selection that is neither a polygon nor a point, so nothing can be computed on it. */
  | "unusable-geometry";

export type RunPlan =
  | { ok: true; body: CreateRunBody; notes: PlanNote[] }
  | { ok: false; reason: PlanRefusal; message: string; areaIds?: string[] };

export interface PlanOptions {
  /** Overridable so a caller can compute in a zone that fits its areas. */
  targetCrs?: string;
  /** Metres per pixel. */
  resolution?: number;
  /** Optional, and omitted entirely when absent: the wizard collects no dates. */
  dateWindow?: { start: string; end: string };
}

/**
 * Build the POST body, or say why there is not one.
 */
export function planRun(
  request: AnalysisRequest,
  criteria: TopicCriteria,
  options: PlanOptions = {},
): RunPlan {
  if (!isWeightedOverlay(criteria)) {
    return {
      ok: false,
      reason: "model-topic",
      // The service sends its own sentence for this case; prefer it, because
      // it is the side that knows why.
      message:
        criteria.detail ??
        "This topic runs a model, and no model backend is connected yet.",
    };
  }

  const weights = runnableWeights(criteria);
  if (weights === null) {
    return {
      ok: false,
      reason: "no-runnable-criteria",
      message:
        criteria.unfilled.length > 0
          ? `This deployment cannot run ${criteria.topic}: no criterion has a usable ` +
            `class table (${criteria.unfilled.join(", ")}).`
          : `This deployment publishes no criteria for ${criteria.topic}.`,
    };
  }

  if (request.areas.length === 0) {
    return { ok: false, reason: "no-areas", message: "Select at least one area." };
  }

  if (request.areas.length > MAX_RUN_AREAS) {
    return {
      ok: false,
      reason: "too-many-areas",
      message:
        `The service takes at most ${MAX_RUN_AREAS} areas in one run. ` +
        `${request.areas.length} are selected.`,
    };
  }

  const notes: PlanNote[] = [];
  const areas: Feature[] = [];
  const unusable: string[] = [];

  for (const area of request.areas) {
    const converted = toPolygonFeature(area);
    if (converted === null) {
      unusable.push(area.id);
      continue;
    }
    if (converted.note !== null) notes.push({ areaId: area.id, message: converted.note });
    areas.push(converted.feature);
  }

  if (unusable.length > 0) {
    return {
      ok: false,
      reason: "unusable-geometry",
      message:
        unusable.length === 1
          ? "One selected area is neither a polygon nor a point, so there is nothing to compute over."
          : `${unusable.length} selected areas are neither polygons nor points, so there is nothing to compute over.`,
      areaIds: unusable,
    };
  }

  return {
    ok: true,
    notes,
    body: {
      topic: request.topic,
      areas,
      weights,
      targetCrs: options.targetCrs ?? DEFAULT_TARGET_CRS,
      resolution: options.resolution ?? DEFAULT_RESOLUTION,
      // Omitted rather than defaulted. The field is optional, the wizard
      // collects no dates, and inventing a window would make the run id depend
      // on a date nobody chose: the same selection submitted next month would
      // hash differently and miss the cache for no reason the analyst caused.
      ...(options.dateWindow ? { dateWindow: options.dateWindow } : {}),
      // Writing results back into GeoServer needs write credentials this
      // deployment does not have, and the numbers are the answer either way.
      publishLayers: false,
    },
  };
}

/**
 * One area, as something the pipeline can cut a grid out of.
 *
 * A polygon passes through untouched. A point becomes a square and says so. A
 * line, a multipoint or a geometry collection returns null: a river centreline
 * has no interior, and a distance transform over an area of zero width is not
 * a smaller answer, it is no answer.
 */
function toPolygonFeature(
  area: RequestArea,
): { feature: Feature; note: string | null } | null {
  const geometry = area.feature.geometry as Geometry | null;
  if (!geometry) return null;

  if (geometry.type === "Polygon" || geometry.type === "MultiPolygon") {
    return { feature: withProvenance(area, geometry), note: null };
  }

  if (geometry.type === "Point") {
    const [lng, lat] = geometry.coordinates as [number, number];
    const boxed = boxAroundPoint({ lat, lng }, POINT_BUFFER_KM);
    // boxAroundPoint answers with a Point when the radius is zero, which cannot
    // happen with a positive constant. Checked anyway: the alternative is
    // posting a Point the service refuses, several seconds later, with a
    // message about geometry rather than about this decision.
    if (boxed.type !== "Polygon") return null;
    return {
      feature: withProvenance(area, boxed),
      note:
        `"${area.label}" is a single point, and the service computes over areas. ` +
        `It was expanded to a ${POINT_BUFFER_KM * 2}km square centred on the point. ` +
        `Draw or upload the area instead if that is not what you meant.`,
    };
  }

  return null;
}

/**
 * Carry the app's own labelling into the feature's properties.
 *
 * The service echoes the configuration back whole in the result, so whatever is
 * here is what the results page has to name an area with, months later, in a
 * browser that never saw the selection. Without it the result knows only
 * coordinates.
 */
function withProvenance(area: RequestArea, geometry: Geometry): Feature {
  return {
    type: "Feature",
    geometry,
    properties: {
      ...(area.feature.properties ?? {}),
      area_id: area.id,
      label: area.label,
      source: area.source,
      area_km2: area.areaKm2,
    },
  };
}
