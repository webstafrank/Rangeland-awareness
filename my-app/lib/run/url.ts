/**
 * The URL codec (CONTRACT section 4).
 *
 * The config travels in the query string and the topic travels in the path, so
 * `/analysis/drought-monitoring/results?type=single&model=xgboost&formulas=vci,vhi&from=2024-01-01&to=2024-12-31`
 * is the whole of a run's persistence. There is no run table: the URL is the
 * study, which is what makes a result shareable, bookmarkable and reopenable
 * months later with nothing stored anywhere.
 *
 * AREAS ARE NOT IN THE URL. A drawn polygon is kilobytes of coordinates, which
 * would blow past URL length limits and make the link unreadable, and it gives
 * a shared link the right meaning: "my configuration, your areas". They travel
 * between pages in `sessionStorage`, and a results page opened without them
 * must say so and offer a route back rather than crash. That is why
 * `parseRunQuery` returns a `PartialRunConfig` and only `withAreas` can produce
 * something `run()` accepts.
 *
 * Two rules this file exists to keep:
 *   - `buildRunQuery` emits one fixed key order, so two people who build the
 *     same config get byte-identical URLs.
 *   - `parseRunQuery` collects EVERY problem before returning. Fixing one field
 *     only to be told about the next is a bad way to treat somebody who has
 *     just had five choices rejected one at a time.
 */

import { isAnalysisTypeId, isModelId } from "@/lib/analysis/models";
import type { AnalysisTypeId, ModelId } from "@/lib/analysis/models";
import { isTopicSlug } from "@/lib/analysis/topics";
import type { TopicSlug } from "@/lib/analysis/topics";
import type { FormulaId } from "@/lib/analysis/formulas";
import {
  RUN_SCHEMA_VERSION,
  formulaProblems,
  windowProblems,
} from "@/lib/run/config";
import type { PartialRunConfig, Problem, RunConfig } from "@/lib/run/config";

export const TYPE_PARAM = "type";
export const MODEL_PARAM = "model";
export const FORMULAS_PARAM = "formulas";
export const FROM_PARAM = "from";
export const TO_PARAM = "to";

/** What a page can hand the parser: a raw query string, or either map shape. */
export type QueryInput =
  | string
  | URLSearchParams
  | Readonly<Record<string, string | undefined>>;

export type ParseResult =
  | { ok: true; config: PartialRunConfig }
  | { ok: false; problems: Problem[] };

/**
 * The canonical query string. Order is fixed: type, model, formulas, from, to.
 *
 * Built by hand rather than with `URLSearchParams`, which percent-encodes the
 * comma in the formula list and turns a readable `formulas=vci,vhi` into
 * `formulas=vci%2Cvhi`. A comma is legal unencoded in a query value, formula
 * ids are validated kebab-case slugs with nothing else needing an escape, and a
 * URL a person can read is worth the five lines. Each value still goes through
 * `encodeURIComponent`, so a hand-built config carrying junk cannot inject a
 * second parameter.
 *
 * Formula order is preserved rather than sorted. It is what the analyst picked
 * and what the chips render in; the RUN ID sorts them (see hash.ts), so two
 * orders still resolve to one study.
 */
export function buildRunQuery(config: Pick<RunConfig, "analysisType" | "model" | "formulas" | "dateWindow">): string {
  return [
    `${TYPE_PARAM}=${encodeURIComponent(config.analysisType)}`,
    `${MODEL_PARAM}=${encodeURIComponent(config.model)}`,
    `${FORMULAS_PARAM}=${config.formulas.map((id) => encodeURIComponent(id)).join(",")}`,
    `${FROM_PARAM}=${encodeURIComponent(config.dateWindow.start)}`,
    `${TO_PARAM}=${encodeURIComponent(config.dateWindow.end)}`,
  ].join("&");
}

function reader(query: QueryInput): (key: string) => string {
  if (typeof query === "string") {
    // `URLSearchParams` tolerates a leading "?" and an empty string, so the
    // caller can pass `location.search` straight through.
    const params = new URLSearchParams(query.startsWith("?") ? query.slice(1) : query);
    return (key) => (params.get(key) ?? "").trim();
  }
  if (query instanceof URLSearchParams) {
    return (key) => (query.get(key) ?? "").trim();
  }
  return (key) => (query[key] ?? "").trim();
}

/**
 * Parses the query half of a run config, collecting every problem.
 *
 * The topic comes in separately because it travels in the path. It is validated
 * here anyway rather than trusted: a route param is user input, and reporting
 * `Unknown topic "drough"` as a field problem is what lets the results page
 * render one error card with a route back instead of a 404 that loses the rest
 * of the configuration (RUBRIC F4).
 *
 * Missing and invalid are kept apart. A field flagged as missing is never also
 * flagged as invalid, or an empty control shows two messages for one mistake.
 */
export function parseRunQuery(topic: string, query: QueryInput): ParseResult {
  const get = reader(query);
  const problems: Problem[] = [];
  const add = (field: Problem["field"], message: string): void => {
    if (!problems.some((p) => p.field === field && p.message === message)) {
      problems.push({ field, message });
    }
  };

  const rawType = get(TYPE_PARAM);
  const rawModel = get(MODEL_PARAM);
  const rawFormulas = get(FORMULAS_PARAM);
  const rawFrom = get(FROM_PARAM);
  const rawTo = get(TO_PARAM);

  if (!isTopicSlug(topic)) {
    add("topic", topic === "" ? "No topic in the address." : `Unknown topic "${topic}".`);
  }

  if (rawType === "") add("type", "The address is missing the analysis type.");
  else if (!isAnalysisTypeId(rawType)) {
    add("type", `"${rawType}" is not an analysis type. Use single or comparison.`);
  }

  if (rawModel === "") add("model", "The address is missing the model.");
  else if (!isModelId(rawModel)) add("model", `Unknown model "${rawModel}".`);

  // Split before validating, so " vci , vhi ," from a hand-edited URL still
  // reads as two formulas rather than as four, one of them empty.
  const formulaIds = rawFormulas
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id !== "");
  if (rawFormulas === "") {
    add("formulas", "The address is missing the index formulas.");
  } else {
    for (const problem of formulaProblems(topic, formulaIds)) add(problem.field, problem.message);
  }

  if (rawFrom === "") add("from", "The address is missing the start date.");
  if (rawTo === "") add("to", "The address is missing the end date.");
  if (rawFrom !== "" && rawTo !== "") {
    for (const problem of windowProblems({ start: rawFrom, end: rawTo })) {
      add(problem.field, problem.message);
    }
  }

  if (problems.length > 0) return { ok: false, problems };

  return {
    ok: true,
    config: {
      schemaVersion: RUN_SCHEMA_VERSION,
      topic: topic as TopicSlug,
      analysisType: rawType as AnalysisTypeId,
      model: rawModel as ModelId,
      formulas: formulaIds as FormulaId[],
      dateWindow: { start: rawFrom, end: rawTo },
    },
  };
}

/**
 * The single problem to show first, when there is only room for one.
 *
 * Ordered the way the pre-analysis page is laid out, so the message points at
 * the control nearest the top of the page that is still wrong. Same idea as
 * `blockingReason` in lib/analysis/request.ts, and deliberately the same shape,
 * so the two pages read alike.
 */
export function firstProblem(problems: readonly Problem[]): string | null {
  if (problems.length === 0) return null;
  const order: Problem["field"][] = [
    "topic",
    "type",
    "model",
    "from",
    "to",
    "formulas",
    "areas",
    "form",
  ];
  const sorted = [...problems].sort(
    (a, b) => order.indexOf(a.field) - order.indexOf(b.field),
  );
  return sorted[0].message;
}
