/**
 * Map tool vocabulary, shared between the map and whatever renders its
 * toolbar. Kept out of AoiMap.tsx so a server component can import the type
 * without pulling Leaflet into its module graph.
 */

export const MAP_TOOLS = ["point", "polygon", "rectangle"] as const;
export type MapTool = (typeof MAP_TOOLS)[number];

export interface MapToolSpec {
  id: MapTool;
  label: string;
  /** Imperative instruction shown while the tool is armed. */
  hint: string;
}

export const MAP_TOOL_SPECS: readonly MapToolSpec[] = [
  {
    id: "point",
    label: "Click a point",
    hint: "Click anywhere on the map to select that location.",
  },
  {
    id: "polygon",
    label: "Draw a shape",
    hint: "Click to place each corner, then click the first point to close it.",
  },
  {
    id: "rectangle",
    label: "Draw a box",
    hint: "Click one corner, then click the opposite corner.",
  },
];

/** Kenya, with enough margin to show the neighbouring rangelands. */
export const KENYA_BOUNDS: [[number, number], [number, number]] = [
  [-4.9, 33.8],
  [5.6, 42.1],
];
