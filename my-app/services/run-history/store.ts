/**
 * The run history's browser half: localStorage plus a subscription, in the
 * same external-store shape as services/analysis/selection-store.ts, so a
 * component reads it with useSyncExternalStore and the server render (which
 * has no storage) shows the empty list without a hydration mismatch.
 */

import {
  addRun,
  parseHistory,
  serialiseHistory,
  type RunHistoryEntry,
} from "./history";

export const HISTORY_STORAGE_KEY = "dm.runs";

const EMPTY: readonly RunHistoryEntry[] = [];
const listeners = new Set<() => void>();
let cached: readonly RunHistoryEntry[] | null = null;

function read(): readonly RunHistoryEntry[] {
  try {
    return parseHistory(localStorage.getItem(HISTORY_STORAGE_KEY));
  } catch {
    // Private mode, or site data blocked: no history, nothing broken.
    return EMPTY;
  }
}

export function subscribeRunHistory(onChange: () => void): () => void {
  listeners.add(onChange);
  // Another tab started a run: pick it up.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== HISTORY_STORAGE_KEY) return;
    cached = null;
    onChange();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

export function getRunHistorySnapshot(): readonly RunHistoryEntry[] {
  if (cached === null) cached = read();
  return cached;
}

export function getRunHistoryServerSnapshot(): readonly RunHistoryEntry[] {
  return EMPTY;
}

/** Called once, when the service has accepted a run. */
export function recordRun(entry: RunHistoryEntry): void {
  const next = addRun(getRunHistorySnapshot(), entry);
  cached = next;
  try {
    localStorage.setItem(HISTORY_STORAGE_KEY, serialiseHistory(next));
  } catch {
    // The list just will not outlive the tab.
  }
  for (const listener of listeners) listener();
}

/** Test seam. */
export function resetRunHistoryForTests(): void {
  cached = null;
  listeners.clear();
}
