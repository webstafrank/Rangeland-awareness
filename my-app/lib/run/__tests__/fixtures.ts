/**
 * Test fixtures.
 *
 * Not a `.test.ts`, so the gate lane's include pattern skips it as a suite and
 * only picks it up as an import.
 *
 * The areas are real Kenyan places with their real coordinates, because half of
 * what the engine claims is geographic: an arid area should read worse than a
 * humid one on average, and a fixture set of made-up boxes at (0, 0) could not
 * show that. They are boxes rather than traced boundaries because the engine
 * only ever reads an area's bounds and its label.
 */

import type { Feature, Polygon } from "geojson";
import { areaKm2 } from "@/lib/geo/area";
import type { BoundsTuple } from "@/lib/geo/bounds";
import type { AoiSource } from "@/lib/analysis/selection";
import type { RequestArea } from "@/lib/analysis/request";
import { RUN_SCHEMA_VERSION } from "@/lib/run/config";
import type { RunConfig } from "@/lib/run/config";
import type { FormulaId } from "@/lib/analysis/formulas";

/** A square area of `halfSpan` degrees around a point, as the map would produce. */
export function areaAt(
  id: string,
  label: string,
  lat: number,
  lon: number,
  halfSpan = 0.25,
  source: AoiSource = "drawn",
): RequestArea {
  const south = lat - halfSpan;
  const north = lat + halfSpan;
  const west = lon - halfSpan;
  const east = lon + halfSpan;
  const geometry: Polygon = {
    type: "Polygon",
    coordinates: [
      [
        [west, south],
        [east, south],
        [east, north],
        [west, north],
        [west, south],
      ],
    ],
  };
  const feature: Feature = { type: "Feature", geometry, properties: null };
  const bounds: BoundsTuple = [
    [south, west],
    [north, east],
  ];
  return { id, label, source, feature, bounds, areaKm2: areaKm2(geometry) };
}

/* Four places spanning the climate gradient, plus two with awkward labels. */
export const TURKANA = areaAt("aoi-1", "Turkana", 3.1, 35.6, 0.9);
export const MARSABIT = areaAt("aoi-2", "Marsabit", 2.33, 37.99, 0.8);
export const MURANGA = areaAt("aoi-3", "Murang'a", -0.72, 37.15, 0.3);
export const MOMBASA = areaAt("aoi-4", "Mombasa", -4.05, 39.66, 0.2);
export const WAJIR = areaAt("aoi-5", "Wajir", 1.75, 40.06, 0.9);
export const KERICHO = areaAt("aoi-6", "Kericho", -0.37, 35.28, 0.3);
/** The label that breaks a naive CSV writer. */
export const TAITA = areaAt("aoi-7", "Taita, Taveta", -3.4, 38.36, 0.5);
export const NAIROBI = areaAt("aoi-8", "Nairobi", -1.29, 36.82, 0.15, "coordinate");

export const ALL_AREAS: readonly RequestArea[] = [
  TURKANA,
  MARSABIT,
  MURANGA,
  MOMBASA,
  WAJIR,
  KERICHO,
  TAITA,
  NAIROBI,
];

export function config(overrides: Partial<RunConfig> = {}): RunConfig {
  return {
    schemaVersion: RUN_SCHEMA_VERSION,
    topic: "drought-monitoring",
    analysisType: "single",
    model: "random-forest",
    formulas: ["vci", "vhi"] as FormulaId[],
    dateWindow: { start: "2024-01-01", end: "2024-12-31" },
    areas: [TURKANA],
    ...overrides,
  };
}

/** The reference config every pinned value in the suite is measured against. */
export const BASE_CONFIG: RunConfig = config();

export const COMPARISON_CONFIG: RunConfig = config({
  analysisType: "comparison",
  areas: [TURKANA, MURANGA, MOMBASA],
  dateWindow: { start: "2023-01-01", end: "2024-12-31" },
  model: "xgboost",
});

export const FLOOD_CONFIG: RunConfig = config({
  topic: "flood-risk",
  formulas: ["mndwi", "ndwi", "twi"] as FormulaId[],
  areas: [MOMBASA],
});

export const FOOD_CONFIG: RunConfig = config({
  topic: "food-security",
  formulas: ["vhi", "spi", "bsi"] as FormulaId[],
  areas: [WAJIR],
});

export const RANGELAND_CONFIG: RunConfig = config({
  topic: "rangeland-dynamics",
  formulas: ["ndvi", "evi", "savi", "bsi", "ndmi"] as FormulaId[],
  analysisType: "comparison",
  areas: [TURKANA, KERICHO],
});

/**
 * A spread of valid configs, used wherever an invariant has to hold everywhere
 * rather than on one lucky seed. Every topic, every model, every analysis type,
 * a one-month window and a ten-year one.
 */
export const CONFIG_TABLE: readonly RunConfig[] = [
  BASE_CONFIG,
  COMPARISON_CONFIG,
  FLOOD_CONFIG,
  FOOD_CONFIG,
  RANGELAND_CONFIG,
  config({ model: "combined" }),
  config({ model: "xgboost" }),
  config({ areas: [MURANGA] }),
  config({ areas: [MOMBASA], formulas: ["spi"] as FormulaId[] }),
  config({ dateWindow: { start: "2024-11-15", end: "2024-12-31" } }),
  config({ dateWindow: { start: "2015-01-01", end: "2024-12-31" } }),
  config({
    analysisType: "comparison",
    areas: [...ALL_AREAS],
    formulas: ["vci", "vhi", "tci", "spi", "lst-anomaly"] as FormulaId[],
    dateWindow: { start: "2019-06-01", end: "2024-05-31" },
    model: "combined",
  }),
  config({
    topic: "flood-risk",
    formulas: ["mndwi", "ndwi", "ndmi", "twi"] as FormulaId[],
    analysisType: "comparison",
    areas: [TAITA, NAIROBI, MURANGA],
    model: "combined",
  }),
];
