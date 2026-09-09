/**
 * The run configuration: everything an analyst chose, and nothing else.
 *
 * This is the input side of the engine boundary (CONTRACT section 1). It is a
 * superset of `AnalysisRequest` in lib/analysis/request.ts — that type is the
 * payload a future model backend receives, this one adds the two things a run
 * needs and a request does not: the spectral formulas and the date window.
 *
 * Areas keep their geometry. That is the deliberate departure from the
 * `rangeland-pages` branch, which keyed areas by county slug: this app lets an
 * analyst draw a polygon, upload a shapefile or type a coordinate, and none of
 * those are counties. So the engine seeds off the geometry, never off an id.
 *
 * Versioned like `SCHEMA_VERSION` next door: a change to the shape bumps
 * RUN_SCHEMA_VERSION so a stored or shared config can be refused rather than
 * silently misread.
 */

import { getAnalysisType, isAnalysisTypeId, isModelId } from "@/lib/analysis/models";
import type { AnalysisTypeId, ModelId } from "@/lib/analysis/models";
import { isTopicSlug } from "@/lib/analysis/topics";
import type { TopicSlug } from "@/lib/analysis/topics";
import type { RequestArea } from "@/lib/analysis/request";
import { formulasForTopic, isFormulaId } from "@/lib/analysis/formulas";
import type { FormulaId } from "@/lib/analysis/formulas";
import { inclusiveDayCount, parseIsoDate } from "@/lib/run/dates";

export const RUN_SCHEMA_VERSION = "2.0.0";

export interface DateWindow {
  /** ISO yyyy-mm-dd, inclusive, evaluated in UTC. */
  start: string;
  end: string;
}

export interface RunConfig {
  schemaVersion: typeof RUN_SCHEMA_VERSION;
  topic: TopicSlug;
  analysisType: AnalysisTypeId;
  model: ModelId;
  formulas: FormulaId[];
  dateWindow: DateWindow;
  areas: RequestArea[];
}

/**
 * A run config with no areas attached yet.
 *
 * The URL carries everything but the areas (a drawn polygon is kilobytes of
 * coordinates), so `parseRunQuery` can only ever return this much. The results
 * page joins it with the areas handed over in `sessionStorage`. Making that a
 * distinct type means a page cannot forget the join and quietly run on zero
 * areas: `run()` takes a `RunConfig`, and only `withAreas` produces one.
 */
export type PartialRunConfig = Omit<RunConfig, "areas">;

/** Minimum window, in days. Shorter than this and a monthly series has nothing in it. */
export const MIN_WINDOW_DAYS = 30;
/**
 * Maximum window, in days: ten years plus the leap days. Not a technical limit,
 * a courtesy one — the monthly series is drawn point per month and 120 points
 * is already the most a chart this size can carry.
 */
export const MAX_WINDOW_DAYS = 3660;

/**
 * One blocking reason, phrased for a person and keyed by the control that
 * caused it.
 *
 * The field names are the QUERY PARAMETER names, not the config's own field
 * names, because the point of the key is to render the message beside the input
 * the analyst typed into: the control is called `from`, not `dateWindow.start`.
 * `form` is the catch-all for anything belonging to no single control.
 *
 * Same `{ field, message }` shape as `ValidationProblem` in
 * lib/analysis/request.ts, deliberately: the run page and the topic page render
 * problems the same way.
 */
export interface Problem {
  field: "topic" | "type" | "model" | "formulas" | "from" | "to" | "areas" | "form";
  message: string;
}

/** Inclusive whole days the window covers. 0 for a window that does not parse. */
export function windowDays(window: DateWindow): number {
  return inclusiveDayCount(window);
}

/**
 * Every problem with a window, in the order a reader would hit them.
 *
 * Split out from `validateConfig` because the URL codec needs exactly these
 * checks on two raw strings before it has a config to validate, and two copies
 * of the rules would eventually disagree about whether 30 days is 30 or 31.
 */
export function windowProblems(window: DateWindow): Problem[] {
  const problems: Problem[] = [];
  const start = parseIsoDate(window.start);
  const end = parseIsoDate(window.end);

  if (!start) problems.push({ field: "from", message: "Use a start date in yyyy-mm-dd form." });
  if (!end) problems.push({ field: "to", message: "Use an end date in yyyy-mm-dd form." });
  if (!start || !end) return problems;

  // String comparison is safe and exact for zero-padded ISO dates, and avoids
  // building two Date objects just to order them.
  if (window.start > window.end) {
    problems.push({
      field: "from",
      message: "The start date must be on or before the end date.",
    });
    // The length checks below would report a negative window as "too short",
    // which is a second message for one mistake.
    return problems;
  }

  const days = inclusiveDayCount(window);
  // Attached to `to`, because extending the end date is how a person fixes a
  // window that is too short.
  if (days < MIN_WINDOW_DAYS) {
    problems.push({
      field: "to",
      message: `The window must cover at least ${MIN_WINDOW_DAYS} days. This one covers ${days}.`,
    });
  }
  if (days > MAX_WINDOW_DAYS) {
    problems.push({
      field: "to",
      message: `The window must cover at most ${MAX_WINDOW_DAYS} days. This one covers ${days}.`,
    });
  }
  return problems;
}

/**
 * Every problem with a whole config, collected rather than thrown one at a time.
 *
 * `run()` does not call this. Validation is the caller's job at the boundary
 * (the URL parse, the run button), and making the engine re-validate would mean
 * every test config had to be fully valid before it could exercise one
 * invariant. What `run()` does guarantee is that it never invents an area or a
 * formula it was not given.
 */
export function validateConfig(config: RunConfig): Problem[] {
  const problems: Problem[] = [];

  if (config.schemaVersion !== RUN_SCHEMA_VERSION) {
    problems.push({
      field: "form",
      message: `This configuration is version ${String(
        config.schemaVersion,
      )}; this app runs ${RUN_SCHEMA_VERSION}.`,
    });
  }
  if (!isTopicSlug(config.topic)) {
    problems.push({ field: "topic", message: `Unknown topic "${config.topic}".` });
  }
  if (!isAnalysisTypeId(config.analysisType)) {
    problems.push({ field: "type", message: "Choose an analysis type." });
  }
  if (!isModelId(config.model)) {
    problems.push({ field: "model", message: "Choose a model." });
  }

  problems.push(...windowProblems(config.dateWindow));
  problems.push(...formulaProblems(config.topic, config.formulas));

  // The area count is a question only a known analysis type can answer, so it
  // waits until that much is settled rather than guessing a cap.
  if (isAnalysisTypeId(config.analysisType)) {
    const spec = getAnalysisType(config.analysisType);
    const n = config.areas.length;
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

  return problems;
}

/**
 * Formula problems, checked against the topic rather than against the id union
 * alone: `twi` is a real formula and still meaningless under drought
 * monitoring, and offering a result computed from it would be a lie about what
 * the model did.
 */
export function formulaProblems(topic: string, formulas: readonly string[]): Problem[] {
  const problems: Problem[] = [];
  if (formulas.length === 0) {
    problems.push({ field: "formulas", message: "Choose at least one index formula." });
    return problems;
  }

  const seen = new Set<string>();
  for (const id of formulas) {
    if (seen.has(id)) {
      problems.push({ field: "formulas", message: `"${id}" is selected twice.` });
      continue;
    }
    seen.add(id);
    if (!isFormulaId(id)) {
      problems.push({ field: "formulas", message: `Unknown index formula "${id}".` });
    }
  }

  if (isTopicSlug(topic)) {
    const allowed = new Set(formulasForTopic(topic).map((f) => f.id));
    for (const id of seen) {
      if (isFormulaId(id) && !allowed.has(id)) {
        problems.push({
          field: "formulas",
          message: `"${id}" is not offered for this topic.`,
        });
      }
    }
  }

  return problems;
}

/** Attaches the areas a page recovered from `sessionStorage` to a parsed config. */
export function withAreas(config: PartialRunConfig, areas: RequestArea[]): RunConfig {
  return { ...config, areas };
}
