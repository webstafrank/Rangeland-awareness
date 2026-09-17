/**
 * The pre-analysis form's state machine.
 *
 * The page asks for four things: parameters (analysis type, model, date window),
 * locations, formulas, and then a run. Areas already have a state machine in
 * services/analysis/selection.ts and it is a good one, so this composes it rather
 * than reimplementing it: every area action is forwarded untouched and the
 * area rules stay in exactly one place.
 *
 * What is added here is the two dimensions selection.ts does not know about:
 * the formula multi-select, and the date window. Both are pure, so both are
 * gate-tested in node, and the page is an adapter that dispatches into this.
 *
 * The reducer deliberately does NOT decide whether the form is runnable. That
 * is services/run's job, because the same rules have to hold for a config that
 * arrives from a URL with no form anywhere near it. Two copies of that check
 * would eventually disagree, and the one that disagreed would be the one the
 * user saw.
 */

import {
  type Formula,
  type FormulaId,
  DEFAULT_FORMULAS,
  formulasForTopic,
  getFormula,
  isFormulaId,
} from "@/services/analysis/formulas";
import type { TopicSlug } from "@/services/analysis/topics";
import {
  type SelectionAction,
  type SelectionState,
  initialSelectionState,
  selectionReducer,
} from "@/services/analysis/selection";

/** ISO yyyy-mm-dd, inclusive at both ends, evaluated in UTC. */
export interface DateWindow {
  start: string;
  end: string;
}

export interface PreAnalysisState {
  /** Areas, and the analysis type and model that gate them. */
  selection: SelectionState;
  /** Order is the analyst's, not the registry's: it is what the results page lists. */
  formulaIds: FormulaId[];
  dateWindow: DateWindow;
}

export type PreAnalysisAction =
  /** Anything the area state machine already understands, forwarded whole. */
  | { type: "selection"; action: SelectionAction }
  | { type: "toggleFormula"; formulaId: FormulaId }
  | { type: "setFormulas"; formulaIds: readonly FormulaId[] }
  | { type: "setWindowStart"; date: string }
  | { type: "setWindowEnd"; date: string }
  | { type: "setWindow"; window: DateWindow };

const MS_PER_DAY = 86_400_000;

/** Matches yyyy-mm-dd and nothing else. Rejects "2024-1-1" and "2024-13-45" below. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Whether a string is a real calendar date in yyyy-mm-dd.
 *
 * The round trip through Date is what catches 2023-02-29: Date.parse accepts it
 * and rolls it to 1 March, so comparing the formatted result back to the input
 * is the only cheap way to reject it. A regex alone would let it through and the
 * window length would then be computed from a date the user never chose.
 */
export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const ms = Date.parse(`${value}T00:00:00Z`);
  if (Number.isNaN(ms)) return false;
  return new Date(ms).toISOString().slice(0, 10) === value;
}

/** Inclusive whole days spanned by a window. NaN if either end is not a date. */
export function windowDays(window: DateWindow): number {
  if (!isIsoDate(window.start) || !isIsoDate(window.end)) return Number.NaN;
  const start = Date.parse(`${window.start}T00:00:00Z`);
  const end = Date.parse(`${window.end}T00:00:00Z`);
  return Math.round((end - start) / MS_PER_DAY) + 1;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * The window a topic page opens on: the twelve complete months before this one.
 *
 * It ends at the last complete month rather than at today. Earth observation
 * composites land days to weeks after the period they cover, so a window whose
 * end is today is a window whose last weeks are empty, and the analyst reads
 * that gap as a data problem rather than as latency.
 *
 * Twelve whole months because Kenya's rainfall is bimodal: a shorter window can
 * miss a whole rainy season and make the series look like a trend when it is a
 * phase.
 *
 * All of it in UTC month arithmetic rather than day offsets. `Date.UTC` with
 * day 0 gives the last day of the previous month and normalises a negative
 * month index back into the previous year, which is what makes February and
 * year boundaries fall out for free instead of needing their own branches.
 * Taking `today` as an argument keeps this pure, so the server resolves the
 * clock once and the same value renders on both sides of hydration.
 */
export function defaultWindow(today: string): DateWindow {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));

  // Day 0 of this month is the last day of the month before it.
  const end = new Date(Date.UTC(year, month - 1, 0));
  // Eleven months back from the end's month, inclusive of both, is twelve.
  const start = new Date(
    Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 11, 1),
  );

  return { start: iso(start), end: iso(end) };
}

/**
 * The state a topic's page starts in.
 *
 * Formulas are seeded from the registry's per-topic defaults rather than left
 * empty. An empty multi-select would put the form in a blocked state before the
 * analyst has touched anything, and the first thing they would read is an error
 * about a control they have not seen yet.
 */
export function initialPreAnalysisState(
  topic: TopicSlug,
  today: string,
): PreAnalysisState {
  return {
    selection: initialSelectionState,
    formulaIds: [...DEFAULT_FORMULAS[topic]],
    dateWindow: defaultWindow(today),
  };
}

/**
 * The reducer. `topic` is closed over rather than carried in state: it comes
 * from the route and cannot change without a navigation, and holding it in
 * state would make an impossible transition representable.
 */
export function preAnalysisReducer(
  topic: TopicSlug,
  state: PreAnalysisState,
  action: PreAnalysisAction,
): PreAnalysisState {
  switch (action.type) {
    case "selection": {
      const selection = selectionReducer(state.selection, action.action);
      return selection === state.selection ? state : { ...state, selection };
    }

    case "toggleFormula": {
      const allowed = formulasForTopic(topic).some(
        (f) => f.id === action.formulaId,
      );
      // A formula that is not offered for this topic is not a user mistake to
      // report, it is a link or a stale bookmark. Ignoring it keeps the state
      // representable rather than storing something the results page cannot
      // explain.
      if (!allowed) return state;

      const has = state.formulaIds.includes(action.formulaId);
      // Removing the last one is refused rather than allowed-and-then-blocked.
      // The alternative is a form that lets you empty a control and only then
      // tells you it was required.
      if (has && state.formulaIds.length === 1) return state;

      return {
        ...state,
        formulaIds: has
          ? state.formulaIds.filter((id) => id !== action.formulaId)
          : [...state.formulaIds, action.formulaId],
      };
    }

    case "setFormulas": {
      const offered = formulasForTopic(topic);
      // Filter to what this topic offers and drop duplicates, preserving the
      // caller's order: the order is the analyst's and the results page lists
      // formulas in it.
      const seen = new Set<FormulaId>();
      const next = action.formulaIds.filter((id) => {
        if (seen.has(id)) return false;
        if (!offered.some((f) => f.id === id)) return false;
        seen.add(id);
        return true;
      });
      // An empty result would leave the form permanently blocked with no way
      // back from inside the control, so the previous selection stands.
      if (next.length === 0) return state;
      return { ...state, formulaIds: next };
    }

    case "setWindowStart":
      return state.dateWindow.start === action.date
        ? state
        : { ...state, dateWindow: { ...state.dateWindow, start: action.date } };

    case "setWindowEnd":
      return state.dateWindow.end === action.date
        ? state
        : { ...state, dateWindow: { ...state.dateWindow, end: action.date } };

    case "setWindow":
      return {
        ...state,
        dateWindow: { start: action.window.start, end: action.window.end },
      };
  }
}

/**
 * Formulas the analyst picked, in their order, as registry entries.
 *
 * Used by the pre-analysis summary and by the results page, which both have to
 * show the arithmetic. Unknown ids are dropped rather than rendered as a bare
 * slug: a slug next to a number reads as a data quality problem.
 */
export function selectedFormulas(state: PreAnalysisState): readonly Formula[] {
  const found: Formula[] = [];
  for (const id of state.formulaIds) {
    if (!isFormulaId(id)) continue;
    const formula = getFormula(id);
    if (formula !== undefined) found.push(formula);
  }
  return found;
}
