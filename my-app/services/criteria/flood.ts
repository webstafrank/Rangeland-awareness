/**
 * Flood hotspot criteria — a faithful transcription of the Tana River notebook.
 *
 * Source: TR_Floods_Hotspots_Mapping-Final, the SECOND copy of the pipeline in
 * that notebook. It contains two near-identical copies; the second adds the
 * Gaussian smoothing on distance-to-river that removes the concentric ring
 * artifacts the Euclidean distance transform leaves behind. Porting the first
 * would silently drop that fix, so the sigma is carried here explicitly.
 *
 * Every break value below is the notebook's, unchanged. A test asserts them
 * against an independently restated copy of the tables, so a transcription
 * slip fails the gate rather than shipping a map that is subtly wrong.
 *
 * The default weights are the notebook's AHP result. They open the pairwise
 * form rather than being final: the point of deriving weights in-app is that
 * they can be recalibrated and their consistency checked.
 */

import type { Criterion, TopicMethod } from "@/services/criteria/types";

export const FLOOD_CRITERIA: readonly Criterion[] = [
  {
    id: "elevation",
    label: "Elevation",
    unit: "m",
    source: { kind: "layer", hint: "DEM" },
    calibration: "regional",
    direction: "Low ground floods. Risk is highest on the floodplain and falls with height.",
    reference:
      "Tana River notebook, classify_elevation_absolute. Calibrated to a county ranging roughly 0-700 m with the floodplain below 150 m.",
    scale: {
      kind: "continuous",
      classes: [
        { risk: 5, label: "<= 50 m", max: 50 },
        { risk: 4, label: "50-150 m", max: 150 },
        { risk: 3, label: "150-300 m", max: 300 },
        { risk: 2, label: "300-500 m", max: 500 },
        { risk: 1, label: "> 500 m", max: null },
      ],
    },
  },
  {
    id: "slope",
    label: "Slope",
    unit: "degrees",
    source: { kind: "derived", from: "DEM", how: "gradient magnitude, in degrees" },
    calibration: "established",
    // The line that must never be copied to the landslide topic.
    direction:
      "Flat ground pools water. Risk is HIGHEST on the flattest ground and falls as slope increases.",
    reference: "Tana River notebook, classify_slope_absolute.",
    scale: {
      kind: "continuous",
      classes: [
        { risk: 5, label: "<= 2 deg", max: 2 },
        { risk: 4, label: "2-5 deg", max: 5 },
        { risk: 3, label: "5-10 deg", max: 10 },
        { risk: 2, label: "10-20 deg", max: 20 },
        { risk: 1, label: "> 20 deg", max: null },
      ],
    },
  },
  {
    id: "dist_to_river",
    label: "Distance to river",
    unit: "m",
    source: {
      kind: "distance",
      from: "river network",
      // The notebook's river_dist_smooth_sigma. Without it the Euclidean
      // distance transform leaves concentric rings wherever channels are
      // closely spaced, and they survive into the final map.
      smoothSigmaPx: 3,
    },
    calibration: "regional",
    direction: "Proximity to the channel. Risk falls with distance from the river.",
    reference:
      "Tana River notebook, classify_distance_to_river_absolute. Calibrated to a main-channel floodplain roughly 1-5 km wide.",
    scale: {
      kind: "continuous",
      classes: [
        { risk: 5, label: "<= 1 km", max: 1000 },
        { risk: 4, label: "1-3 km", max: 3000 },
        { risk: 3, label: "3-7 km", max: 7000 },
        { risk: 2, label: "7-15 km", max: 15000 },
        { risk: 1, label: "> 15 km", max: null },
      ],
    },
  },
  {
    id: "rainfall",
    label: "Rainfall",
    unit: "mm",
    source: { kind: "layer", hint: "annual or seasonal rainfall raster" },
    calibration: "established",
    direction: "More rain, more risk. Scored against the local distribution, not fixed depths.",
    reference:
      "Tana River notebook, classify_rainfall_percentile. Percentiles because rainfall variation within one county is often under 200 mm, and fixed thresholds collapse every pixel into one or two classes.",
    scale: { kind: "percentile", breaks: [20, 40, 60, 80], ascending: true },
  },
  {
    id: "landcover",
    label: "Land cover",
    unit: "",
    source: { kind: "layer", hint: "ESA WorldCover 2021" },
    calibration: "established",
    direction:
      "Surfaces that shed or hold water. Cropland, bare ground, water and wetland score highest.",
    reference: "Tana River notebook, LANDCOVER_RISK. ESA WorldCover 2021 class codes.",
    scale: {
      kind: "categorical",
      // Transcribed from LANDCOVER_RISK. Grouped by score rather than listed
      // per code, which is the same mapping written the way the legend reads.
      classes: [
        { risk: 1, label: "Tree cover, snow and ice", codes: [10, 70] },
        { risk: 2, label: "Shrubland", codes: [20] },
        { risk: 3, label: "Grassland, mangroves, moss and lichen", codes: [30, 95, 100] },
        { risk: 4, label: "Built-up", codes: [50] },
        { risk: 5, label: "Cropland, bare or sparse, water, herbaceous wetland", codes: [40, 60, 80, 90] },
      ],
      // An unlisted code is a coding mismatch between the layer and this table,
      // not a low-risk pixel. Painting it 1 would quietly clear the map.
      unlisted: "nodata",
    },
  },
];

/**
 * The notebook's AHP weights. Sum to exactly 1.0, verified by test.
 *
 * Distance to river dominates at 0.35, which is the substantive claim the
 * model makes: on the Tana floodplain, proximity to the channel matters more
 * than any other single factor.
 */
export const FLOOD_DEFAULT_WEIGHTS: Readonly<Record<string, number>> = {
  elevation: 0.25,
  slope: 0.15,
  dist_to_river: 0.35,
  rainfall: 0.2,
  landcover: 0.05,
};

export const FLOOD_METHOD: TopicMethod = {
  kind: "weighted-overlay",
  criteria: FLOOD_CRITERIA,
  defaultWeights: FLOOD_DEFAULT_WEIGHTS,
};
