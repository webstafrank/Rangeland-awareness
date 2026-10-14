/**
 * Map tool vocabulary, shared between the map and whatever renders its
 * toolbar. Kept out of AoiMap.tsx so a server component can import the type
 * without pulling Leaflet into its module graph.
 */

/*
 * One tool: a click on the map selects that point. Drawing a shape or a box
 * was removed when areas became pickable by county, sub-county and ward;
 * a named boundary replaced the hand-drawn outline those tools produced.
 */
export const MAP_TOOLS = ["point"] as const;
export type MapTool = (typeof MAP_TOOLS)[number];

export interface MapToolSpec {
  id: MapTool;
  label: string;
  /** Imperative instruction for the tool. */
  hint: string;
}

export const MAP_TOOL_SPECS: readonly MapToolSpec[] = [
  {
    id: "point",
    label: "Click a point",
    hint: "Click anywhere on the map to select that location.",
  },
];

/**
 * How the selection map loads basemap tiles: once the view settles, never
 * mid-animation.
 *
 * Leaflet's desktop default fetches a fresh set of tiles at every zoom level a
 * flyToBounds passes through, and every selection flies. Measured in the eval
 * trace of "the selection survives every navigation between steps": uploading
 * five counties started a flight, and when Continue was pressed 100ms later
 * twelve tile requests were in flight, some taking 4.9s. Chrome holds
 * low-priority requests back while about ten are already outstanding, and both
 * Next's prefetch and the dynamically injected script for the review step are
 * low priority, so neither was ever sent (send: -1 in the trace). The
 * navigation waited on code that never arrived and the URL stayed on /areas.
 *
 * Loading only when the view is idle means a flight costs one tile set, at its
 * destination, instead of one per zoom level, so the request queue is clear
 * when the analyst moves on. keepBuffer 1 trims the ring of off-screen tiles
 * kept around the view.
 */
export const TILE_LOADING = {
  updateWhenZooming: false,
  updateWhenIdle: true,
  keepBuffer: 1,
} as const;

/** Kenya, with enough margin to show the neighbouring rangelands. */
export const KENYA_BOUNDS: [[number, number], [number, number]] = [
  [-4.9, 33.8],
  [5.6, 42.1],
];
