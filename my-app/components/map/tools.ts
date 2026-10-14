/**
 * Map tool vocabulary, shared between the map and whatever renders its
 * toolbar. Kept out of AoiMap.tsx so a server component can import the type
 * without pulling Leaflet into its module graph.
 */

/*
 * What a click on the map does. `identify` (the default) names the place under
 * the click in the County, Sub-county and Ward boxes and outlines it, for the
 * analyst to add; `point` adds the clicked point itself as an area. Drawing a
 * shape or a box was removed when areas became pickable by name.
 */
export const MAP_TOOLS = ["identify", "point"] as const;
export type MapTool = (typeof MAP_TOOLS)[number];

export interface MapToolSpec {
  id: MapTool;
  label: string;
  /** Imperative instruction for the tool. */
  hint: string;
}

export const MAP_TOOL_SPECS: readonly MapToolSpec[] = [
  {
    id: "identify",
    label: "Identify place",
    hint: "Click the map to fill County, Sub-county and Ward with the place there.",
  },
  {
    id: "point",
    label: "Add point",
    hint: "Click the map to add that exact point as an area.",
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
