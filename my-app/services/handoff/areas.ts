/**
 * Carrying the selected areas from the pre-analysis page to the results page.
 *
 * Everything else about a run travels in the query string, which is what makes a
 * result bookmarkable. Areas cannot: a drawn polygon or an uploaded county is
 * kilobytes of coordinates, and putting that in a URL blows past length limits
 * and makes the link unreadable. So the areas travel in sessionStorage and the
 * config travels in the URL.
 *
 * That split has one consequence the whole app has to handle honestly: a results
 * URL can be opened in a context where the areas are gone. A bookmark from
 * yesterday, a link pasted to a colleague, a new tab. The config is still valid,
 * the areas are simply absent. `read` names that case rather than returning an
 * empty list, because an empty list would render a result for zero areas and
 * look like an answer.
 *
 * Keyed by run id, not by a bare "areas" key. The run id is a hash of the
 * config, so if someone edits the query string the stored areas no longer match
 * and `read` reports a mismatch instead of silently pairing yesterday's areas
 * with today's config. That pairing is the specific wrong answer this module
 * exists to prevent: it would render confidently, and be wrong.
 *
 * Pure apart from the storage handle, which is injected, so all of it is
 * gate-tested in node where there is no sessionStorage.
 */

import type { RequestArea } from "@/services/analysis/request";

/**
 * Versioned. A shape change must not let an old payload deserialize into the new
 * reader: bumping the key is cheaper and safer than migrating, because the cost
 * of a miss is one re-selection, not lost work.
 */
const STORAGE_KEY = "ra.run.areas.v1";

/** What was stored, before it has been checked against a run id. */
interface StoredHandoff {
  runId: string;
  areas: RequestArea[];
}

export type HandoffFailure =
  /** Nothing stored at all: a fresh tab, a cleared session, a shared link. */
  | "missing"
  /** Stored, but for a different config than the URL currently describes. */
  | "mismatch"
  /** Present and unreadable. Treated as absent, never as partial. */
  | "corrupt"
  /** No storage available: private mode, or a server render. */
  | "unavailable";

export type HandoffResult =
  | { ok: true; areas: RequestArea[] }
  | { ok: false; reason: HandoffFailure };

/**
 * Why a failure is worth showing a user, in their words.
 *
 * Lives here rather than in the page so the four cases cannot drift apart, and
 * so a new failure mode is a compile error at this table rather than a silent
 * fallthrough to a generic message.
 */
export const HANDOFF_MESSAGE: Readonly<Record<HandoffFailure, string>> = {
  missing:
    "The areas for this run are not in this browser session. Results are " +
    "bookmarkable, but the areas you selected are not carried in the link.",
  mismatch:
    "The link describes a different configuration than the areas held in this " +
    "session, so the two cannot be paired.",
  corrupt: "The stored areas could not be read.",
  unavailable: "This browser session cannot store the selected areas.",
};

/**
 * Resolve the storage to use.
 *
 * Wrapped in try/catch rather than a truthiness check because a browser set to
 * block site data throws on *access* to sessionStorage, not on use of it, and
 * an uncaught throw here would take down a server-rendered page.
 */
function resolveStorage(explicit?: Storage): Storage | null {
  if (explicit !== undefined) return explicit;
  try {
    if (typeof window === "undefined") return null;
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/**
 * Store the areas for a run.
 *
 * Returns whether it worked instead of throwing. A full or blocked quota must
 * not stop the analyst from running the analysis: the results page degrades to
 * the "missing" path, which is already designed, and that is strictly better
 * than an exception on the way out of a form they just filled in.
 */
export function writeAreas(
  runId: string,
  areas: readonly RequestArea[],
  storage?: Storage,
): boolean {
  const store = resolveStorage(storage);
  if (store === null) return false;

  const payload: StoredHandoff = { runId, areas: [...areas] };
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(payload));
    return true;
  } catch {
    // QuotaExceededError, or a storage that accepts reads and refuses writes.
    return false;
  }
}

/**
 * Read the areas back, but only if they belong to this run.
 *
 * Validates the shape rather than trusting it. The value came from storage the
 * user's own browser extensions can write to, and an area missing its geometry
 * would reach the map as `undefined` and throw somewhere far from here.
 */
export function readAreas(runId: string, storage?: Storage): HandoffResult {
  const store = resolveStorage(storage);
  if (store === null) return { ok: false, reason: "unavailable" };

  let raw: string | null;
  try {
    raw = store.getItem(STORAGE_KEY);
  } catch {
    return { ok: false, reason: "unavailable" };
  }
  if (raw === null) return { ok: false, reason: "missing" };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "corrupt" };
  }

  if (!isStoredHandoff(parsed)) return { ok: false, reason: "corrupt" };
  // The mismatch check comes after the shape check on purpose: a corrupt
  // payload has no trustworthy runId to compare in the first place.
  if (parsed.runId !== runId) return { ok: false, reason: "mismatch" };
  // An empty array is stored data that cannot produce a result, so it is
  // reported as corrupt rather than handed on as a runnable zero-area run.
  if (parsed.areas.length === 0) return { ok: false, reason: "corrupt" };

  return { ok: true, areas: parsed.areas };
}

/** Drop the handoff. Called when a run is abandoned, so a stale pairing cannot linger. */
export function clearAreas(storage?: Storage): void {
  const store = resolveStorage(storage);
  if (store === null) return;
  try {
    store.removeItem(STORAGE_KEY);
  } catch {
    // Nothing useful to do: the caller is discarding state either way.
  }
}

/**
 * Structural check on a parsed payload.
 *
 * Deliberately checks the fields the rest of the app dereferences without
 * guarding — id, label, bounds and the feature's geometry — rather than every
 * field. A validator that only checks `typeof x === "object"` is a validator
 * that passes garbage; one that re-validates every leaf is a schema library we
 * are not adding for this.
 */
function isStoredHandoff(value: unknown): value is StoredHandoff {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.runId !== "string") return false;
  if (!Array.isArray(candidate.areas)) return false;

  return candidate.areas.every((area) => {
    if (typeof area !== "object" || area === null) return false;
    const a = area as Record<string, unknown>;
    if (typeof a.id !== "string" || typeof a.label !== "string") return false;
    // Bounds is what the map flies to; a wrong arity here is a runtime throw
    // inside Leaflet, a long way from this module.
    if (!Array.isArray(a.bounds) || a.bounds.length !== 2) return false;
    if (typeof a.feature !== "object" || a.feature === null) return false;
    const feature = a.feature as Record<string, unknown>;
    return typeof feature.geometry === "object" && feature.geometry !== null;
  });
}
