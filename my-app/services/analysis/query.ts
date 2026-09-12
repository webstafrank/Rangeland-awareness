/**
 * The URL codec.
 *
 * A run config survives navigation as query parameters, which is what makes a
 * result shareable with no server-side storage: the URL IS the run. The topic
 * travels in the path (`/study/drought/results?...`), not in the query, so the
 * codec here takes it separately. See the discrepancy note at `parseQuery`.
 *
 * Two rules this file exists to keep:
 *   - `toQuery` emits parameters in one fixed order, so two people who build the
 *     same config get byte-identical URLs and the same cache entry.
 *   - `parseQuery` collects EVERY error before returning, keyed by the form
 *     control that caused it. The pre-analysis form shows all of them at once;
 *     fixing one field only to be told about the next is a bad way to treat
 *     somebody filling in five inputs.
 */
import {
  MAX_COMPARISON_AREAS,
  MAX_RANGE_DAYS,
  MIN_RANGE_DAYS,
  RunConfigSchema,
  buildRunQuery,
  type ApiError,
  type RunConfig,
  type RunConfigQuery,
} from "@/contracts/analysis";
import type { CatalogService } from "@/contracts/catalog";
import { AreaIdSchema, type GeoService } from "@/contracts/geo";
import { inclusiveDayCount, parseIsoDate } from "./dates";

/**
 * Form controls an error can be attached to. These are the query parameter
 * names, not the config's own field names, because the point of `fieldErrors` is
 * to render the message beside the input the user typed in: the date input is
 * called `from`, not `dateRange.start`.
 *
 * `form` is the catch-all for anything that belongs to no single input.
 */
export type QueryField = "topic" | "type" | "areas" | "from" | "to" | "model" | "form";

/** Maps a zod issue path onto the control that produced it. */
export function fieldForPath(path: readonly PropertyKey[]): QueryField {
  const head = String(path[0] ?? "");
  if (head === "topic") return "topic";
  if (head === "analysisType") return "type";
  if (head === "areas") return "areas";
  if (head === "model") return "model";
  if (head === "dateRange") return String(path[1] ?? "start") === "end" ? "to" : "from";
  return "form";
}

/** Query object plus the topic, which the contract's `RunConfigQuery` has no slot for. */
export type RunConfigQueryWithTopic = RunConfigQuery & { readonly topic?: string };

export interface QueryCodecDeps {
  readonly catalog: CatalogService;
  readonly geo: GeoService;
}

export type ParseResult = { ok: true; config: RunConfig } | { ok: false; error: ApiError };

/**
 * The canonical query string. Order is fixed: type, areas, from, to, model.
 *
 * Delegates to `buildRunQuery` in the contract rather than re-implementing it.
 * The pre-analysis form is a client component and cannot import this service
 * (it would pull the catalogue, all 47 county geometries and the model code
 * into the browser bundle just to build a URL), so the encoding has to live in
 * the contract. Two copies of it would eventually disagree about one character
 * and split every shared link in half.
 */
export const toQuery: (config: RunConfig) => string = buildRunQuery;

/** Rewrites zod's wording into something that can sit under a form control. */
function messageFor(field: QueryField, code: string, fallback: string, raw: string): string {
  if (field === "areas" && code === "too_big") {
    return `compare at most ${MAX_COMPARISON_AREAS} areas`;
  }
  if (field === "areas" && code === "too_small") {
    return "choose at least one area";
  }
  if (field === "type" && (code === "invalid_value" || code === "invalid_enum_value")) {
    return "analysis type must be single or comparison";
  }
  if (field === "model" && (code === "invalid_value" || code === "invalid_enum_value")) {
    return `unknown model "${raw}"`;
  }
  if (field === "topic" && (code === "invalid_value" || code === "invalid_enum_value")) {
    return `unknown topic "${raw}"`;
  }
  if ((field === "from" || field === "to") && (code === "invalid_format" || code === "invalid_type")) {
    return "use a date in yyyy-mm-dd form";
  }
  return fallback;
}

/**
 * Parses query parameters into a config.
 *
 * CONTRACT DISCREPANCY, resolved rather than worked around: `AnalysisService`
 * declares `parseQuery(query: RunConfigQuery)`, and `RunConfigQuery` has no
 * `topic` member, by design, since the topic travels in the path. A `RunConfig`
 * cannot be produced without it. So this accepts the topic two ways, either as
 * a `topic` member on the query object or as a second argument, and reports a
 * missing topic as a field error on `topic` like any other missing input.
 * `contracts/analysis.ts` is untouched: the widened parameter is a superset of
 * the declared one, so a caller holding an `AnalysisService` still typechecks.
 */
export function parseQuery(
  deps: QueryCodecDeps,
  query: RunConfigQueryWithTopic,
  topicFromPath?: string,
): ParseResult {
  const errors = new Map<QueryField, string[]>();
  const add = (field: QueryField, message: string): void => {
    const list = errors.get(field) ?? [];
    if (!list.includes(message)) list.push(message);
    errors.set(field, list);
  };

  const raw = {
    topic: (topicFromPath ?? query.topic ?? "").trim(),
    type: (query.type ?? "").trim(),
    areas: (query.areas ?? "").trim(),
    from: (query.from ?? "").trim(),
    to: (query.to ?? "").trim(),
    model: (query.model ?? "").trim(),
  };

  // Missing is its own class of error. A field flagged as missing is not also
  // reported as invalid, or the user sees two messages for one empty input.
  const missing = new Set<QueryField>();
  const requireField = (field: Exclude<QueryField, "form">, message: string): void => {
    if (raw[field] === "") {
      missing.add(field);
      add(field, message);
    }
  };
  requireField("topic", "choose a topic");
  requireField("type", "choose single or comparison analysis");
  requireField("areas", "choose at least one area");
  requireField("from", "choose a start date");
  requireField("to", "choose an end date");
  requireField("model", "choose a model");

  const areaIds = raw.areas
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id !== "");
  if (raw.areas !== "" && areaIds.length === 0) add("areas", "choose at least one area");

  const parsed = RunConfigSchema.safeParse({
    topic: raw.topic,
    analysisType: raw.type,
    areas: areaIds,
    dateRange: { start: raw.from, end: raw.to },
    model: raw.model,
  });

  const flaggedByZod = new Set<QueryField>();
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = fieldForPath(issue.path);
      if (missing.has(field)) continue;
      flaggedByZod.add(field);
      const rawValue = field === "form" ? "" : raw[field];
      add(field, messageFor(field, issue.code, issue.message, rawValue));
    }
  }

  // The checks below run whether or not zod succeeded, because zod's object-level
  // refinements do not run once a member has failed. Collecting everything at
  // once is the requirement, so these cannot be gated on `parsed.success`.

  const start = parseIsoDate(raw.from);
  const end = parseIsoDate(raw.to);
  if (raw.from !== "" && !start && !flaggedByZod.has("from")) add("from", "use a date in yyyy-mm-dd form");
  if (raw.to !== "" && !end && !flaggedByZod.has("to")) add("to", "use a date in yyyy-mm-dd form");

  if (start && end && raw.from <= raw.to) {
    const days = inclusiveDayCount({ start: raw.from, end: raw.to });
    // Attached to `to` because extending the end date is how a user fixes it.
    if (days < MIN_RANGE_DAYS) add("to", `the window must cover at least ${MIN_RANGE_DAYS} days`);
    if (days > MAX_RANGE_DAYS) add("to", `the window must cover at most ${MAX_RANGE_DAYS} days`);
  }

  // Unknown ids are a catalogue and geography question, so they are answered by
  // the injected services rather than by a list duplicated in here. Skipped for
  // ids that are not even well-formed slugs, since zod already said so.
  for (const id of areaIds) {
    if (!AreaIdSchema.safeParse(id).success) continue;
    if (!deps.geo.findArea(id)) add("areas", `unknown area "${id}"`);
  }

  const topic = raw.topic === "" ? undefined : deps.catalog.findTopic(raw.topic);
  if (raw.topic !== "" && !topic && !flaggedByZod.has("topic")) add("topic", `unknown topic "${raw.topic}"`);

  const model = raw.model === "" ? undefined : deps.catalog.findModel(raw.model);
  if (raw.model !== "" && !model && !flaggedByZod.has("model")) add("model", `unknown model "${raw.model}"`);

  if (topic && model && !topic.models.includes(model.id)) {
    add("model", `${model.label} is not available for ${topic.label}`);
  }

  if (topic && start && raw.from < topic.dataStart) {
    add("from", `${topic.label} has no input coverage before ${topic.dataStart}`);
  }

  if (parsed.success && errors.size === 0) {
    return { ok: true, config: parsed.data };
  }
  // Belt and braces: never return a failure with nothing to render.
  if (errors.size === 0) add("form", "the run configuration is not valid");

  const fieldErrors: Record<string, readonly string[]> = {};
  for (const [field, messages] of errors) fieldErrors[field] = messages;
  return {
    ok: false,
    error: {
      error: "this run configuration cannot be used",
      fieldErrors,
    },
  };
}
