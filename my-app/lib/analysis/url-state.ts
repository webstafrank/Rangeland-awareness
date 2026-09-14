/**
 * Analysis type and model in the URL.
 *
 * So `/topics/drought-monitoring?type=comparison&model=combined` is
 * bookmarkable and an analyst starts the morning two of the three decisions
 * ahead. That is the difference between a tool used once and a tool used
 * twenty times a day.
 *
 * Areas are deliberately NOT in the URL. A drawn polygon or an uploaded county
 * is kilobytes of coordinates, which would blow past URL length limits and
 * make the link unreadable. It also gives the link the right meaning: sharing
 * one says "my configuration, your areas".
 *
 * Pure functions only, so the parsing is gate-tested in node. The React
 * plumbing lives in the component.
 */

import {
  type AnalysisTypeId,
  type ModelId,
  isAnalysisTypeId,
  isModelId,
} from "@/lib/analysis/models";

export const TYPE_PARAM = "type";
export const MODEL_PARAM = "model";

export interface UrlSelection {
  analysisType?: AnalysisTypeId;
  modelId?: ModelId;
}

/**
 * Read the two params, ignoring anything unrecognised.
 *
 * An unknown value is dropped rather than treated as an error: a stale
 * bookmark from before a model was renamed should still open the page on the
 * default, not show an error the user cannot act on.
 */
export function readUrlSelection(
  params: URLSearchParams | Readonly<Record<string, string | undefined>>,
): UrlSelection {
  const get = (key: string): string | undefined => {
    if (params instanceof URLSearchParams) return params.get(key) ?? undefined;
    return params[key];
  };

  const rawType = get(TYPE_PARAM);
  const rawModel = get(MODEL_PARAM);

  const selection: UrlSelection = {};
  if (rawType !== undefined && isAnalysisTypeId(rawType)) {
    selection.analysisType = rawType;
  }
  if (rawModel !== undefined && isModelId(rawModel)) {
    selection.modelId = rawModel;
  }
  return selection;
}

/**
 * The same read, from Next's resolved `searchParams` shape.
 *
 * Next hands a param that appeared twice as an array, and every step route
 * needs the same flattening before `readUrlSelection` can look at it. Four
 * copies of that dance is four chances for one of them to be written slightly
 * differently, so it lives here beside the parser it feeds.
 *
 * The first occurrence wins on a repeat, which is the same rule
 * URLSearchParams.get follows, so `?model=a&model=b` means the same thing
 * whichever side reads it.
 */
export function readSearchParamSelection(
  query: Readonly<Record<string, string | string[] | undefined>>,
): UrlSelection {
  return readUrlSelection(
    Object.fromEntries(
      Object.entries(query).map(([key, value]) => [
        key,
        Array.isArray(value) ? value[0] : value,
      ]),
    ),
  );
}

/**
 * The query string for a selection, or "" when it is all defaults.
 *
 * Defaults are omitted so a fresh page keeps a clean URL and only a
 * deliberately configured one carries params.
 */
export function writeUrlSelection(
  selection: Required<UrlSelection>,
  defaults: Required<UrlSelection>,
): string {
  const params = new URLSearchParams();
  if (selection.analysisType !== defaults.analysisType) {
    params.set(TYPE_PARAM, selection.analysisType);
  }
  if (selection.modelId !== defaults.modelId) {
    params.set(MODEL_PARAM, selection.modelId);
  }
  const query = params.toString();
  return query === "" ? "" : `?${query}`;
}
