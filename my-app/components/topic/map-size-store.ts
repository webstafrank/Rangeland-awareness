/**
 * The remembered mobile map height, as an external store.
 *
 * This is deliberately not `useState` plus an effect that reads sessionStorage.
 * Two problems with that shape, and this module exists to avoid both:
 *
 * 1. TopicWorkbench is server-rendered, so storage cannot be read during the
 *    first client render without producing HTML that differs from the server's,
 *    which is a hydration mismatch.
 * 2. Reading it in an effect and calling setState triggers a second render pass
 *    on every mount, which is the cascading-render pattern React warns about.
 *
 * useSyncExternalStore solves exactly this: React uses the server snapshot for
 * hydration, then switches to the client snapshot without a mismatch.
 *
 * sessionStorage fires no event for writes in the same tab, so the store keeps
 * its own subscriber set. Every write goes through setMapSize.
 */

import {
  MAP_SIZE_STORAGE_KEY,
  type MapSize,
  isMapSize,
} from "@/components/topic/map-size";

const DEFAULT_SIZE: MapSize = "medium";

const listeners = new Set<() => void>();

/**
 * Cached so getSnapshot is referentially stable between renders. Returning a
 * freshly read value every call would make React re-render forever.
 */
let cached: MapSize | null = null;

function readStorage(): MapSize {
  try {
    const stored = sessionStorage.getItem(MAP_SIZE_STORAGE_KEY);
    return isMapSize(stored) ? stored : DEFAULT_SIZE;
  } catch {
    // Private mode, or site data blocked. The default stop is fine.
    return DEFAULT_SIZE;
  }
}

export function subscribeMapSize(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

export function getMapSizeSnapshot(): MapSize {
  if (cached === null) cached = readStorage();
  return cached;
}

/** What the server renders, and what React hydrates against. */
export function getMapSizeServerSnapshot(): MapSize {
  return DEFAULT_SIZE;
}

export function setStoredMapSize(size: MapSize): void {
  if (cached === size) return;
  cached = size;
  try {
    sessionStorage.setItem(MAP_SIZE_STORAGE_KEY, size);
  } catch {
    // Nothing to do; the choice just will not persist.
  }
  for (const listener of listeners) listener();
}
