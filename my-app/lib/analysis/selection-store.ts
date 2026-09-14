/**
 * The selection, shared across the four step routes.
 *
 * Splitting the wizard into routes moved one problem to the front: React state
 * inside a page component dies when that page unmounts, and every Continue
 * unmounts one. Three shapes were considered:
 *
 *   context in a layout   Survives sibling navigation, but a layout cannot
 *                         read searchParams, so the URL configuration could
 *                         only be applied in an effect — a flash of the
 *                         defaults on every bookmarked link, which is the
 *                         exact regression url-state.ts was written to avoid.
 *   everything in the URL A drawn polygon is kilobytes of coordinates. It does
 *                         not fit, and it would make a shared link unreadable.
 *   an external store     What this file is.
 *
 * The store holds the whole SelectionState and runs the SAME pure reducer the
 * single-page build used, so every rule about area caps, the comparison to
 * single transition and the undo offer is unchanged and still gate-tested in
 * lib/analysis/__tests__/selection.test.ts. This module adds three things:
 * subscription, sessionStorage persistence, and a server snapshot.
 *
 * useSyncExternalStore is what keeps hydration honest. React renders the
 * server snapshot during hydration and only then switches to the client
 * snapshot, so restoring a selection from storage cannot produce a mismatch.
 * The same pattern is already used for the map height in
 * components/topic/map-size-store.ts.
 *
 * The pure half — SERIALISE and PARSE — is exported and tested in node. The
 * stateful half is a module singleton, which is correct here for the same
 * reason the URL is a singleton: there is one analyst, in one tab, filling in
 * one request.
 */

import {
  initialSelectionState,
  selectionReducer,
  type AreaOfInterest,
  type SelectionAction,
  type SelectionState,
} from "@/lib/analysis/selection";
import { isAnalysisTypeId, isModelId } from "@/lib/analysis/models";
import type { TopicSlug } from "@/lib/analysis/topics";
import type { UrlSelection } from "@/lib/analysis/url-state";

/** Bumped when the persisted shape changes, so a stale entry is dropped, not misread. */
export const STORAGE_VERSION = 1;

/**
 * One key per topic, not one key for the app.
 *
 * A single key would make the four topics take turns: opening drought
 * monitoring to check something would overwrite the five areas already
 * selected under flood risk, and coming back would find them gone. Nothing
 * would report the loss, because from the store's point of view nothing
 * failed. Keying by topic costs three more sessionStorage entries and removes
 * the whole class.
 *
 * The topic is still checked again inside the payload by `parseSelection`.
 * That is not redundant: the key names what SHOULD be there, the field proves
 * what IS, and only the second one survives a future rename of the key.
 */
export function storageKey(topic: TopicSlug): string {
  return `ra.selection.v${STORAGE_VERSION}.${topic}`;
}

/**
 * What is persisted.
 *
 * Deliberately not the whole state. `focus` is a map instruction with a
 * one-shot token, and replaying it on reload would yank the viewport for no
 * reason; `notice` and `undo` describe something that just happened, and a
 * notice restored an hour later is a message about an event the reader has no
 * memory of. `nextId` and `nextToken` are rebuilt from the areas, so a
 * restored selection cannot mint an id that collides with one already on
 * screen.
 */
export interface PersistedSelection {
  version: number;
  topic: TopicSlug;
  analysisType: string;
  modelId: string;
  areas: AreaOfInterest[];
}

/** Serialise the part of the state worth keeping. Pure, so it is tested in node. */
export function serialiseSelection(
  topic: TopicSlug,
  state: SelectionState,
): string {
  const payload: PersistedSelection = {
    version: STORAGE_VERSION,
    topic,
    analysisType: state.analysisType,
    modelId: state.modelId,
    areas: state.areas,
  };
  return JSON.stringify(payload);
}

/**
 * Rebuild a state from a persisted string, for one topic.
 *
 * Returns null rather than throwing on anything it does not recognise: stored
 * JSON is untrusted input the moment a version ships, and a selection that
 * cannot be read should start the analyst on a clean flow rather than break
 * the page. Every field is checked, not just the version, because the storage
 * key is per-origin and a different build of this app could have written it.
 *
 * A payload for a DIFFERENT topic is also null. Areas are chosen against a
 * question ("which areas flood?"), so carrying them into another topic would
 * silently answer a question the analyst did not ask.
 */
export function parseSelection(
  topic: TopicSlug,
  raw: string | null,
): SelectionState | null {
  if (raw === null) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) return null;
  const payload = parsed as Partial<PersistedSelection>;

  if (payload.version !== STORAGE_VERSION) return null;
  if (payload.topic !== topic) return null;
  if (typeof payload.analysisType !== "string" || !isAnalysisTypeId(payload.analysisType)) {
    return null;
  }
  if (typeof payload.modelId !== "string" || !isModelId(payload.modelId)) {
    return null;
  }
  if (!Array.isArray(payload.areas)) return null;

  // Shallow structural check per area. A deep GeoJSON validation would be the
  // wrong bar: the areas were produced by this app's own reducer, and the
  // failure being guarded against is a truncated or foreign payload, not a
  // subtly invalid polygon.
  const areas: AreaOfInterest[] = [];
  for (const candidate of payload.areas) {
    if (typeof candidate !== "object" || candidate === null) return null;
    const area = candidate as Partial<AreaOfInterest>;
    if (
      typeof area.id !== "string" ||
      typeof area.label !== "string" ||
      typeof area.source !== "string" ||
      typeof area.feature !== "object" ||
      area.feature === null ||
      !Array.isArray(area.bounds)
    ) {
      return null;
    }
    areas.push(area as AreaOfInterest);
  }

  return {
    ...initialSelectionState,
    analysisType: payload.analysisType,
    modelId: payload.modelId,
    areas,
    nextId: nextIdAfter(areas),
  };
}

/**
 * The next id to mint, given a restored selection.
 *
 * `areas.length + 1` is the obvious version and it is wrong, because ids are
 * monotonic and never reused (see selection.ts): remove the first of three and
 * the survivors are aoi-2 and aoi-3, so a count-based next id lands back
 * inside the range already in use. The next area then gets aoi-3 as well, two
 * rows share a key, and pressing Remove on either deletes both. React logs
 * nothing, because the duplicate keys are in the reducer's array rather than
 * in one render's children.
 *
 * So the highest suffix actually present is what decides, and an id that does
 * not parse contributes 0 rather than NaN, which would poison the max.
 */
function nextIdAfter(areas: readonly AreaOfInterest[]): number {
  let highest = 0;
  for (const area of areas) {
    const suffix = Number.parseInt(area.id.replace(/^aoi-/, ""), 10);
    if (Number.isFinite(suffix) && suffix > highest) highest = suffix;
  }
  return highest + 1;
}

/**
 * Apply a URL selection over a base state.
 *
 * The URL wins over storage for type and model, and that ordering is the
 * point: a shared link says "my configuration, your areas" (see url-state.ts),
 * so opening one must show the sender's configuration even when the receiver
 * has a session of their own in progress.
 *
 * Narrowing the analysis type is routed through the reducer rather than
 * assigned, so a link to ?type=single arriving at a five-area selection drops
 * four areas WITH the notice and the undo offer, exactly as clicking the radio
 * would. Assigning the field directly is the silent-truncation bug that
 * selection.ts exists to prevent, one layer up.
 */
export function applyUrlSelection(
  state: SelectionState,
  fromUrl: UrlSelection,
): SelectionState {
  let next = state;
  if (fromUrl.modelId !== undefined && fromUrl.modelId !== next.modelId) {
    next = selectionReducer(next, { type: "setModel", modelId: fromUrl.modelId });
  }
  if (
    fromUrl.analysisType !== undefined &&
    fromUrl.analysisType !== next.analysisType
  ) {
    next = selectionReducer(next, {
      type: "setAnalysisType",
      analysisType: fromUrl.analysisType,
    });
  }
  return next;
}

/** The state a server render produces: the defaults, plus whatever the URL said. */
export function serverSelection(fromUrl: UrlSelection): SelectionState {
  return applyUrlSelection(initialSelectionState, fromUrl);
}

/* -------------------------------------------------------------- the store */

const listeners = new Set<() => void>();

/**
 * Cached so getSnapshot is referentially stable between renders. Returning a
 * freshly built object every call would make React re-render forever.
 */
let state: SelectionState | null = null;
/** Which topic the cached state belongs to, so switching topics starts clean. */
let loadedTopic: TopicSlug | null = null;
/** The URL selection last applied, so a changed query is applied exactly once. */
let loadedSeed: string | null = null;

function readStorage(topic: TopicSlug): SelectionState | null {
  try {
    return parseSelection(topic, sessionStorage.getItem(storageKey(topic)));
  } catch {
    // Private mode, or site data blocked. A fresh selection is fine.
    return null;
  }
}

function writeStorage(topic: TopicSlug, next: SelectionState): void {
  try {
    sessionStorage.setItem(storageKey(topic), serialiseSelection(topic, next));
  } catch {
    // Quota, private mode, or blocked storage. The flow still works in this
    // tab; only a reload would lose the selection, so there is nothing to
    // report to the analyst mid-task.
  }
}

function emit(): void {
  for (const listener of listeners) listener();
}

/**
 * Load the topic's selection, seeding it from storage and then the URL.
 *
 * Idempotent per topic, and called during render by every step. That is safe
 * because it is a no-op once the topic is loaded, and because the first call
 * happens before any subscriber exists — there is nothing to notify and no
 * render to interrupt. It is NOT safe to call with a different topic mid-tree,
 * which is why the wizard hook takes its topic from the route.
 */
export function loadSelection(topic: TopicSlug, fromUrl: UrlSelection): void {
  // The server never reads this store — useWizard hands React a server
  // snapshot built from the route's own searchParams instead. Writing module
  // state during a server render would be cross-request state shared by every
  // concurrent visitor, which is one refactor away from serving one analyst's
  // selection to another. There is nothing to load on the server, so it does
  // nothing there.
  if (typeof window === "undefined") return;

  const seed = seedKey(fromUrl);

  if (loadedTopic === topic && state !== null) {
    // Same topic, already loaded. The URL still gets a say: a client-side
    // navigation to a link carrying a different configuration must apply it,
    // or "a shared link wins over a session in progress" would only be true of
    // a full page load. Guarded by the seed so the common case — every step
    // link threading the SAME query through — costs one string compare and
    // does not re-run the reducer on every render.
    if (seed === loadedSeed) return;
    loadedSeed = seed;
    const next = applyUrlSelection(state, fromUrl);
    if (next === state) return;
    state = next;
    writeStorage(topic, next);
    emit();
    return;
  }

  loadedTopic = topic;
  loadedSeed = seed;
  state = applyUrlSelection(readStorage(topic) ?? initialSelectionState, fromUrl);
  // Not persisted here: a load that wrote back would rewrite storage on every
  // navigation, including one that changed nothing.
}

/** A stable string for a URL selection, so "did the query change" is one compare. */
function seedKey(fromUrl: UrlSelection): string {
  return `${fromUrl.analysisType ?? ""}|${fromUrl.modelId ?? ""}`;
}

export function subscribeSelection(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

/**
 * The client snapshot.
 *
 * Falls back to the defaults rather than throwing when nothing has been
 * loaded. A subscriber can only exist after a step rendered, and every step
 * loads first, so the fallback is unreachable in the app — it is here so a
 * unit test can read the store without staging a route.
 */
export function getSelectionSnapshot(): SelectionState {
  return state ?? initialSelectionState;
}

/** Dispatch into the shared state, persist, and notify every step on screen. */
export function dispatchSelection(action: SelectionAction): void {
  const current = getSelectionSnapshot();
  const next = selectionReducer(current, action);
  if (next === current) return;
  state = next;
  if (loadedTopic !== null) writeStorage(loadedTopic, next);
  emit();
}

/**
 * Drop one topic's selection, in memory and in storage.
 *
 * Behind "Start over" on the review step, which is the point in the flow where
 * an analyst is most likely to decide the whole request was wrong. Without it,
 * clearing a five-area comparison means walking back to the areas step and
 * pressing Clear all, and the scope and model stay where they were.
 *
 * Takes the topic explicitly rather than using the loaded one, so it can clear
 * a topic that is not currently on screen and so a test can call it without
 * staging a route first.
 */
export function resetSelection(topic: TopicSlug): void {
  if (loadedTopic === topic) {
    /*
     * Reset to the defaults, and stay loaded on the same topic and the same
     * seed. Clearing all three looked tidier and was wrong: the render that
     * immediately follows calls loadSelection with the URL still on screen,
     * which at that moment is the review step's ?type=comparison&model=xgboost.
     * With nothing loaded, that seed is treated as new and applied, so the
     * configuration the analyst just discarded came straight back — and then
     * rode into step one, because the step links thread the query through.
     *
     * Staying loaded makes that render hit the early return instead, and the
     * navigation to step one then arrives with a clean URL and an empty seed,
     * which changes nothing.
     */
    state = initialSelectionState;
  }
  try {
    sessionStorage.removeItem(storageKey(topic));
  } catch {
    // Nothing to do.
  }
  emit();
}
