"use client";

/**
 * The hook every step uses to read and change the shared selection.
 *
 * One place, so no step knows how the state is stored, how it survives a
 * navigation, or how the URL is kept in step. A step component asks for the
 * selection and gets back the state, a dispatch, the query string to thread
 * into its links, and the validation result — which is everything a step
 * needs and nothing more.
 *
 * `loadSelection` is called during render rather than in an effect, and that
 * is deliberate: an effect runs after the first paint, so a restored selection
 * would appear one frame late and a bookmarked configuration would flash the
 * defaults first. It is a no-op once the topic is loaded, so calling it from
 * four different step components costs nothing.
 */

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import {
  dispatchSelection,
  getSelectionSnapshot,
  loadSelection,
  serverSelection,
  subscribeSelection,
} from "@/lib/analysis/selection-store";
import {
  initialSelectionState,
  type SelectionAction,
  type SelectionState,
} from "@/lib/analysis/selection";
import { buildRequest, type ValidationResult } from "@/lib/analysis/request";
import { getAnalysisType, getModel } from "@/lib/analysis/models";
import type { AnalysisType, ModelChoice } from "@/lib/analysis/models";
import type { TopicSlug } from "@/lib/analysis/topics";
import { writeUrlSelection, type UrlSelection } from "@/lib/analysis/url-state";

/** What the URL omits, so a default configuration keeps a clean address. */
export const URL_DEFAULTS = {
  analysisType: initialSelectionState.analysisType,
  modelId: initialSelectionState.modelId,
} as const;

export interface Wizard {
  state: SelectionState;
  dispatch: (action: SelectionAction) => void;
  /** The resolved analysis type, which carries the area cap. */
  spec: AnalysisType;
  /** The resolved model. Never undefined: the reducer only holds valid ids. */
  model: ModelChoice;
  /** Every reason the request cannot run yet, or the request itself. */
  validation: ValidationResult;
  /** "" or "?type=...&model=...", to thread into every step link. */
  query: string;
  /** True once the areas requirement is met, which is what unlocks review. */
  canReview: boolean;
}

export function useWizard(topic: TopicSlug, initial: UrlSelection): Wizard {
  // Before the store is read, not after: see the file comment.
  loadSelection(topic, initial);

  const pathname = usePathname();

  // Cached, because React calls getServerSnapshot more than once and a fresh
  // object each time is an infinite render loop.
  const serverSnapshot = useMemo(
    () => serverSelection(initial),
    [initial.analysisType, initial.modelId], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const state = useSyncExternalStore(
    subscribeSelection,
    getSelectionSnapshot,
    () => serverSnapshot,
  );

  const spec = getAnalysisType(state.analysisType);
  // Non-null by construction: the reducer only ever holds a ModelId, and
  // parseSelection rejects a stored value that is not one.
  const model = getModel(state.modelId) as ModelChoice;

  const validation = useMemo(
    () => buildRequest(topic, state),
    [topic, state],
  );

  const query = writeUrlSelection(
    { analysisType: state.analysisType, modelId: state.modelId },
    URL_DEFAULTS,
  );

  /*
   * Keep type and model in the address bar so a configuration is shareable.
   *
   * replaceState, not push: every radio click would otherwise add a history
   * entry, and Back would walk the analyst through their own decisions one at
   * a time instead of leaving the step.
   *
   * Two details that are not decoration:
   *
   * `pathname` is a dependency because a step navigation changes the URL
   * without changing `query`, so an effect keyed on query alone never re-runs
   * and the new step's address loses the configuration.
   *
   * The write is synchronous, and stays that way. Deferring it by a frame was
   * tried, to win an ordering race against Next's own replaceState, and it
   * traded a cosmetic bug for a real one: a deferred write can land in the
   * middle of a navigation the same click started, and "Start over" then
   * cleared the selection and refused to leave the review page, because this
   * effect put the review URL back after router.replace had left it. A guard
   * on `window.location.pathname` did not help, since during a pending
   * transition the URL is still the old one. The address bar is not worth a
   * broken navigation.
   *
   * Writing `pathname` from the router rather than `window.location.pathname`
   * for the same reason: the window's value is a moving target mid-transition,
   * this render's value is not.
   *
   * The cost, stated rather than hidden: pressing Back can land on an address
   * that predates the last choice, because Next restores the recorded URL
   * after this effect has run. The choice itself is untouched — the store is
   * the source of truth inside a session, the URL is how a configuration
   * leaves one — and every forward link is built from the store, so stepping
   * forward puts it back in the address bar. evals/journey.spec.ts pins that
   * behaviour under its own name so nobody has to rediscover this race.
   */
  useEffect(() => {
    // The CURRENT state object, never null.
    //
    // Next's app router keeps its route tree in history.state. Passing null
    // replaces the URL and discards that tree, and the entry then describes
    // one route while carrying another's markers: pressing Back changed the
    // address to /topics/flood-risk while the model step stayed on screen.
    // Verified in a browser, which is the only place it is visible — every
    // unit test and every same-page assertion passes with null.
    window.history.replaceState(
      window.history.state,
      "",
      `${pathname}${query}`,
    );
  }, [query, pathname]);

  return {
    state,
    dispatch: dispatchSelection,
    spec,
    model,
    validation,
    query,
    // The areas rule is the only one a user can fail: type and model always
    // hold a valid value, so anything blocking here is an area count.
    canReview:
      state.areas.length >= spec.minAreas &&
      state.areas.length <= spec.maxAreas,
  };
}
