/**
 * Mobile map height stops.
 *
 * `svh`, not `dvh` or `vh`. On iOS the URL bar collapses as the page scrolls,
 * which changes `dvh` and resizes the map container mid-gesture: Leaflet then
 * needs an invalidateSize and a half-drawn polygon's vertices shift under the
 * finger. `svh` is the small stable viewport, so the map keeps one height for
 * the whole session. Plain `vh` has the opposite problem on mobile, being
 * taller than the visible area.
 *
 * Separate from the component so the values are importable without pulling a
 * client component into a server module graph.
 */

export const MAP_SIZE_IDS = ["small", "medium", "large"] as const;
export type MapSize = (typeof MAP_SIZE_IDS)[number];

export interface MapSizeSpec {
  label: string;
  /** Tailwind height for the mobile map pane. */
  className: string;
  /** Shown in the stepper button. */
  glyph: string;
}

export const MAP_SIZES: Record<MapSize, MapSizeSpec> = {
  small: { label: "small", className: "h-[30svh] min-h-[180px]", glyph: "▁" },
  medium: { label: "medium", className: "h-[45svh] min-h-[240px]", glyph: "▄" },
  large: { label: "large", className: "h-[70svh] min-h-[320px]", glyph: "█" },
};

/** Cycle small to medium to large and back. */
export function nextMapSize(size: MapSize): MapSize {
  const at = MAP_SIZE_IDS.indexOf(size);
  return MAP_SIZE_IDS[(at + 1) % MAP_SIZE_IDS.length];
}

/** Where the chosen size is remembered between runs, per tab. */
export const MAP_SIZE_STORAGE_KEY = "ra.mapSize";

/** Narrow a value read back from storage. */
export function isMapSize(value: unknown): value is MapSize {
  return (
    typeof value === "string" && (MAP_SIZE_IDS as readonly string[]).includes(value)
  );
}
