/**
 * The AnalysisRequest contract.
 *
 * This is the boundary between the UI in app/ and the model backend that does
 * not exist yet. When a services/model service is built, this type is what it
 * accepts, and `validateRequest` is the check both sides run. Nothing in this
 * file knows how a model works, and nothing here calls anything.
 *
 * Versioned on purpose: a change to the shape bumps SCHEMA_VERSION so a
 * backend can reject a payload it does not understand rather than guess.
 */

import type { Feature } from "geojson";
import {
  type AnalysisTypeId,
  type ModelId,
  getAnalysisType,
  isAnalysisTypeId,
  isModelId,
} from "@/lib/analysis/models";
import { isTopicSlug, type TopicSlug } from "@/lib/analysis/topics";
import type { AoiSource, SelectionState } from "@/lib/analysis/selection";
import type { BoundsTuple } from "@/lib/geo/bounds";

export const SCHEMA_VERSION = "1.0.0";

export interface RequestArea {
  id: string;
  label: string;
  source: AoiSource;
  feature: Feature;
  bounds: BoundsTuple;
  areaKm2: number | null;
}

export interface AnalysisRequest {
  schemaVersion: typeof SCHEMA_VERSION;
  topic: TopicSlug;
  analysisType: AnalysisTypeId;
  model: ModelId;
  areas: RequestArea[];
}

/** One blocking reason, phrased for a user, not a log. */
export interface ValidationProblem {
  field: "topic" | "analysisType" | "model" | "areas";
  message: string;
}

export type ValidationResult =
  | { ok: true; request: AnalysisRequest }
  | { ok: false; problems: ValidationProblem[] };

/**
 * Assemble and validate a request from the current selection.
 *
 * Returns every problem, not the first one, because the UI shows the reason the
 * run button is disabled and a one-at-a-time reveal makes the user click,
 * read, fix, click again.
 */
export function buildRequest(
  topic: string,
  state: Pick<SelectionState, "analysisType" | "modelId" | "areas">,
): ValidationResult {
  const problems: ValidationProblem[] = [];

  if (!isTopicSlug(topic)) {
    problems.push({ field: "topic", message: `Unknown topic "${topic}".` });
  }
  if (!isAnalysisTypeId(state.analysisType)) {
    problems.push({ field: "analysisType", message: "Choose an analysis type." });
  }
  if (!isModelId(state.modelId)) {
    problems.push({ field: "model", message: "Choose a model." });
  }

  // The area check needs a known analysis type to know its own limits, so it
  // only runs once that much is settled.
  if (isAnalysisTypeId(state.analysisType)) {
    const spec = getAnalysisType(state.analysisType);
    const n = state.areas.length;

    if (n < spec.minAreas) {
      problems.push({
        field: "areas",
        message:
          spec.minAreas === 1
            ? "Select an area: click the map, draw a shape, or upload a shapefile."
            : `Select at least ${spec.minAreas} areas to compare. ${n} selected.`,
      });
    } else if (n > spec.maxAreas) {
      problems.push({
        field: "areas",
        message: `At most ${spec.maxAreas} areas. ${n} selected.`,
      });
    }
  }

  if (problems.length > 0) return { ok: false, problems };

  return {
    ok: true,
    request: {
      schemaVersion: SCHEMA_VERSION,
      topic: topic as TopicSlug,
      analysisType: state.analysisType,
      model: state.modelId,
      areas: state.areas.map((a) => ({
        id: a.id,
        label: a.label,
        source: a.source,
        feature: a.feature,
        bounds: a.bounds,
        areaKm2: a.areaKm2,
      })),
    },
  };
}

/** The single blocking reason to show on a disabled run button. */
export function blockingReason(result: ValidationResult): string | null {
  if (result.ok) return null;
  // Areas last: it is the one the user is most likely mid-way through fixing,
  // so a model or type problem should surface first.
  const order: ValidationProblem["field"][] = [
    "topic",
    "analysisType",
    "model",
    "areas",
  ];
  const sorted = [...result.problems].sort(
    (a, b) => order.indexOf(a.field) - order.indexOf(b.field),
  );
  return sorted[0].message;
}
