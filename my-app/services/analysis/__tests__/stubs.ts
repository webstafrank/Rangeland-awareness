/**
 * Stub catalogue and geography for this service's tests.
 *
 * `services/catalog` and `services/geo` are being written in parallel with this
 * one, so the suite here runs against a small fake world instead of waiting for
 * them. That is the point of injecting them: a two-topic, four-county world lets
 * a test assert on exact wording and exact numbers, which no test could do
 * against 47 real counties and a full catalogue.
 *
 * The world is chosen to exercise the things that break:
 *   - one indicator with `badEnd: "low"` (a vegetation index, where a fall is
 *     bad) and one with `badEnd: "high"` (a probability, where a rise is bad),
 *     so both narrative directions are covered
 *   - a county name with an apostrophe (Murang'a) and one with a comma
 *     (deliberately fake) so the CSV quoting is exercised for real
 *   - all three climate zones, so the zone weighting is exercised
 *   - two models with different cost weights, so the model effects are visible
 */
import type { RunConfig } from "@/contracts/analysis";
import type {
  CatalogService,
  IndicatorBand,
  IndicatorSpec,
  ModelId,
  ModelSpec,
  TopicId,
  TopicSpec,
} from "@/contracts/catalog";
import type { Area, AreaId, GeoService, MapFrame, OverlayCell } from "@/contracts/geo";

/* ------------------------------------------------------------------ catalog */

/** Vegetation Condition Index: 0..100, and LOW is the bad end. */
export const VCI: IndicatorSpec = {
  id: "vci",
  label: "VCI",
  longLabel: "Vegetation Condition Index",
  unit: "",
  precision: 1,
  domain: [0, 100],
  badEnd: "low",
  bands: [
    { min: 0, max: 20, label: "Extreme deficit", severity: "critical" },
    { min: 20, max: 35, label: "Severe deficit", severity: "serious" },
    { min: 35, max: 50, label: "Moderate deficit", severity: "warning" },
    { min: 50, max: null, label: "No deficit", severity: "good" },
  ],
  source: "Stub indicator for tests, modelled on the NDMA VCI bands",
};

/** Flood probability: 0..1, and HIGH is the bad end. */
export const FLOOD_PROBABILITY: IndicatorSpec = {
  id: "flood-probability",
  label: "Flood probability",
  longLabel: "Seasonal flood probability",
  unit: "",
  precision: 2,
  domain: [0, 1],
  badEnd: "high",
  bands: [
    { min: 0, max: 0.2, label: "Low", severity: "good" },
    { min: 0.2, max: 0.4, label: "Elevated", severity: "warning" },
    { min: 0.4, max: 0.7, label: "High", severity: "serious" },
    { min: 0.7, max: null, label: "Very high", severity: "critical" },
  ],
  source: "Stub indicator for tests",
};

export const DROUGHT_TOPIC: TopicSpec = {
  id: "drought",
  label: "Drought",
  blurb: "How much vegetation stress the rangelands are carrying.",
  description: "Stub topic for tests.",
  indicator: VCI,
  drivers: ["Rainfall (CHIRPS)", "Land surface temperature", "NDVI anomaly", "Soil moisture"],
  models: ["random-forest", "xgboost"],
  dataStart: "2001-01-01",
};

export const FLOOD_TOPIC: TopicSpec = {
  id: "flood-risk",
  label: "Flood risk",
  blurb: "Where water is likely to stand this season.",
  description: "Stub topic for tests.",
  indicator: FLOOD_PROBABILITY,
  drivers: ["Rainfall (CHIRPS)", "Slope", "Drainage density", "Soil saturation", "River level"],
  models: ["random-forest", "xgboost"],
  dataStart: "2000-01-01",
};

/** Only `random-forest` is offered for this topic, so the model/topic check has something to reject. */
export const FOOD_SECURITY_TOPIC: TopicSpec = {
  id: "food-security",
  label: "Food security",
  blurb: "Stub topic used to test model availability.",
  description: "Stub topic for tests.",
  indicator: VCI,
  drivers: ["Market prices", "Rainfall (CHIRPS)"],
  models: ["random-forest"],
  dataStart: "2011-01-01",
};

export const RANDOM_FOREST: ModelSpec = {
  id: "random-forest",
  label: "Random Forest",
  blurb: "Averages many decision trees.",
  strength: "Steady on small samples.",
  costWeight: 1,
};

export const XGBOOST: ModelSpec = {
  id: "xgboost",
  label: "XGBoost",
  blurb: "Boosts trees one after another.",
  strength: "Sharper on long windows.",
  costWeight: 1.6,
};

const TOPICS: readonly TopicSpec[] = [DROUGHT_TOPIC, FLOOD_TOPIC, FOOD_SECURITY_TOPIC];
const MODELS: readonly ModelSpec[] = [RANDOM_FOREST, XGBOOST];

export function stubCatalog(): CatalogService {
  return {
    listTopics: () => TOPICS,
    getTopic(id: TopicId): TopicSpec {
      const topic = TOPICS.find((candidate) => candidate.id === id);
      if (!topic) throw new Error(`stub catalog: no topic ${id}`);
      return topic;
    },
    findTopic: (id: string) => TOPICS.find((candidate) => candidate.id === id),
    listModels: () => MODELS,
    getModel(id: ModelId): ModelSpec {
      const model = MODELS.find((candidate) => candidate.id === id);
      if (!model) throw new Error(`stub catalog: no model ${id}`);
      return model;
    },
    findModel: (id: string) => MODELS.find((candidate) => candidate.id === id),
    classify(indicator: IndicatorSpec, value: number): IndicatorBand {
      const bands = indicator.bands;
      if (value < bands[0].min) return bands[0];
      const hit = bands.find((band) => value >= band.min && (band.max === null || value < band.max));
      return hit ?? bands[bands.length - 1];
    },
    formatValue(indicator: IndicatorSpec, value: number): string {
      const text = value.toFixed(indicator.precision);
      return indicator.unit === "" ? text : `${text} ${indicator.unit}`;
    },
  };
}

/* ---------------------------------------------------------------------- geo */

export const TURKANA: Area = {
  id: "turkana",
  name: "Turkana",
  shapeId: "KE-023",
  climateZone: "arid",
  asal: true,
  centroid: [35.6, 3.1],
  bbox: [34.3, 1.2, 36.8, 5.0],
  path: "M0,0 L10,0 L10,10 Z",
};

export const MARSABIT: Area = {
  id: "marsabit",
  name: "Marsabit",
  shapeId: "KE-011",
  climateZone: "arid",
  asal: true,
  centroid: [37.9, 2.3],
  bbox: [36.0, 0.9, 39.8, 4.6],
  path: "M20,0 L30,0 L30,10 Z",
};

/** The apostrophe is the point: it has to survive the CSV and the JSON untouched. */
export const MURANGA: Area = {
  id: "muranga",
  name: "Murang'a",
  shapeId: "KE-021",
  climateZone: "humid",
  asal: false,
  centroid: [37.0, -0.72],
  bbox: [36.6, -1.1, 37.4, -0.4],
  path: "M40,20 L46,20 L46,26 Z",
};

/**
 * The comma in the name is deliberate and fake: the real county is Taita-Taveta.
 * A field with a comma in it is the case a naive CSV writer corrupts, so the
 * stub world contains one.
 */
export const TAITA: Area = {
  id: "taita-taveta",
  name: "Taita, Taveta",
  shapeId: "KE-022",
  climateZone: "semi-arid",
  asal: true,
  centroid: [38.3, -3.4],
  bbox: [37.6, -4.2, 39.0, -2.7],
  path: "M50,40 L58,40 L58,48 Z",
};

export const STUB_AREAS: readonly Area[] = [TURKANA, MARSABIT, MURANGA, TAITA];

const FRAME: MapFrame = { width: 800, height: 900, bounds: [33.9, -4.7, 41.9, 5.5] };

function project(lonLat: readonly [number, number]): readonly [number, number] {
  const [minLon, minLat, maxLon, maxLat] = FRAME.bounds;
  const x = ((lonLat[0] - minLon) / (maxLon - minLon)) * FRAME.width;
  const y = ((maxLat - lonLat[1]) / (maxLat - minLat)) * FRAME.height;
  return [x, y];
}

function unproject(xy: readonly [number, number]): readonly [number, number] {
  const [minLon, minLat, maxLon, maxLat] = FRAME.bounds;
  const lon = minLon + (xy[0] / FRAME.width) * (maxLon - minLon);
  const lat = maxLat - (xy[1] / FRAME.height) * (maxLat - minLat);
  return [lon, lat];
}

export function stubGeo(): GeoService {
  return {
    listAreas: () => STUB_AREAS,
    getArea(id: AreaId): Area {
      const area = STUB_AREAS.find((candidate) => candidate.id === id);
      if (!area) throw new Error(`stub geo: no area ${id}`);
      return area;
    },
    findArea: (id: string) => STUB_AREAS.find((candidate) => candidate.id === id),
    pickAreas: (ids) =>
      ids
        .map((id) => STUB_AREAS.find((candidate) => candidate.id === id))
        .filter((area): area is Area => area !== undefined),
    frame: () => FRAME,
    project,
    /**
     * A bbox grid, snapped to a global cell lattice so cells line up between
     * areas. The real service will test the polygon; a bbox is enough to
     * exercise the overlay's value function, which is what this suite is about.
     */
    gridFor(areas, cellSize, valueAt): readonly OverlayCell[] {
      const cells: OverlayCell[] = [];
      for (const area of areas) {
        const [minLon, minLat, maxLon, maxLat] = area.bbox;
        const topLeft = project([minLon, maxLat]);
        const bottomRight = project([maxLon, minLat]);
        const x0 = Math.floor(topLeft[0] / cellSize) * cellSize;
        const y0 = Math.floor(topLeft[1] / cellSize) * cellSize;
        for (let y = y0; y < bottomRight[1]; y += cellSize) {
          for (let x = x0; x < bottomRight[0]; x += cellSize) {
            const centre = unproject([x + cellSize / 2, y + cellSize / 2]);
            cells.push({ x, y, size: cellSize, value: valueAt(area.id, centre), areaId: area.id });
          }
        }
      }
      return cells;
    },
  };
}

/* ------------------------------------------------------------------ configs */

/** A valid single-area drought config. Every test that needs "a config" starts here. */
export const BASE_CONFIG: RunConfig = {
  topic: "drought",
  analysisType: "single",
  areas: ["turkana"],
  dateRange: { start: "2024-01-01", end: "2024-12-31" },
  model: "random-forest",
};

/** A valid comparison config across three counties, two arid and one humid. */
export const COMPARISON_CONFIG: RunConfig = {
  topic: "drought",
  analysisType: "comparison",
  areas: ["turkana", "marsabit", "muranga"],
  dateRange: { start: "2022-06-01", end: "2024-05-31" },
  model: "xgboost",
};

/** The same window and counties, reported by the flood indicator (badEnd "high"). */
export const FLOOD_CONFIG: RunConfig = {
  ...COMPARISON_CONFIG,
  topic: "flood-risk",
};
