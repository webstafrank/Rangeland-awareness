/**
 * Whether the desktop sidebar is collapsed to its icon rail.
 *
 * The same external-store shape as `components/topic/map-size-store.ts`, for
 * the same reason: the shell is server-rendered, so reading storage during the
 * first client render would produce HTML that differs from the server's (a
 * hydration mismatch), and reading it in an effect then calling setState
 * renders twice on every page. `useSyncExternalStore` with a server snapshot
 * of "expanded" is the shape that avoids both.
 *
 * localStorage rather than sessionStorage: how wide someone likes their
 * sidebar is a preference that should outlive the tab.
 */

export const SIDEBAR_STORAGE_KEY = "dm.sidebar.collapsed";

const listeners = new Set<() => void>();

let cached: boolean | null = null;

function readStorage(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_STORAGE_KEY) === "1";
  } catch {
    // Private mode, or site data blocked. Expanded is the safe default.
    return false;
  }
}

export function subscribeSidebar(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

export function getSidebarSnapshot(): boolean {
  if (cached === null) cached = readStorage();
  return cached;
}

export function getSidebarServerSnapshot(): boolean {
  return false;
}

export function setSidebarCollapsed(collapsed: boolean): void {
  // Compared with the snapshot, not the raw cache: before the first read the
  // cache is null, and "expanded" would otherwise count as a change.
  if (getSidebarSnapshot() === collapsed) return;
  cached = collapsed;
  try {
    localStorage.setItem(SIDEBAR_STORAGE_KEY, collapsed ? "1" : "0");
  } catch {
    // The choice just will not persist.
  }
  for (const listener of listeners) listener();
}

/** Test seam: forget the cached value so the next read goes to storage. */
export function resetSidebarStoreForTests(): void {
  cached = null;
  listeners.clear();
}
