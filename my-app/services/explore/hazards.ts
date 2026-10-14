/**
 * The explorer's hazard views: Flood, Drought, Famine and Landslide, the tabs
 * across the top of the data explorer.
 *
 * A hazard is a FILTER, not a second catalogue. It names which layers bear on
 * that hazard, three ways, and a layer is in the view if any one matches:
 *
 *   categories  KSA categories (ids from CATEGORIES) whose every layer counts,
 *               so a layer published into "Disaster risk management" shows up
 *               under every hazard with no code change.
 *   layers      KSA layer NAMES, the part after the workspace, as in
 *               LAYER_CATEGORIES (`rivers`, not `Rangelands:rivers`).
 *   satellite   NASA GIBS registry ids (services/wms/layers.ts). These are
 *               not in the panel: they are offered on the map's Satellite
 *               view, which the hazard filters too.
 *
 * Adding a layer to a hazard is one string in the right list. TypeScript
 * holds `categories` to real category ids; the unit tests hold `satellite`
 * to real GIBS ids, so a renamed registry entry fails the gate rather than
 * silently dropping out of a tab.
 */

import { CATEGORIES, SATELLITE_CATEGORY, type CategoryId } from "@/services/explore/categories";
import type { ExploreLayer } from "@/services/explore/layers";

export interface Hazard {
  id: string;
  label: string;
  /** One sentence on what the view shows, under the tabs. */
  summary: string;
  categories: readonly CategoryId[];
  layers: readonly string[];
  satellite: readonly string[];
}

export const HAZARDS = [
  {
    id: "flood",
    label: "Flood",
    summary:
      "Surface water, rainfall and soil saturation, with the rivers, water bodies and irrigation schemes that flood.",
    categories: ["disaster_risk_management", "water"],
    // Bura and Hola sit on the Tana's floodplain. Both spellings, as in
    // LAYER_CATEGORIES, so the layer keeps its tab if GeoServer renames it.
    layers: [
      "rivers",
      "water_body",
      "river_tana_riparian_extent",
      "irrigarion_schemes",
      "irrigation_schemes",
    ],
    satellite: ["flood-2day", "precipitation", "soil-moisture-root-zone"],
  },
  {
    id: "drought",
    label: "Drought",
    summary:
      "Vegetation condition, soil moisture, heat and rainfall, with the water points and livestock routes herds fall back on.",
    categories: ["disaster_risk_management", "water"],
    // Moving herds along the routes is the rangelands' first drought response.
    layers: ["water_body", "agroecological_zones", "livestock_routes"],
    satellite: [
      "ndvi-8day",
      "evi-16day",
      "soil-moisture-root-zone",
      "lst-terra-monthly",
      "lst-aqua-monthly",
      "precipitation",
    ],
  },
  {
    id: "famine",
    label: "Famine",
    summary: "Pasture and crop condition, land use and the livestock economy that food security rests on.",
    categories: ["disaster_risk_management", "agriculture_livestock"],
    layers: ["water_body"],
    satellite: ["ndvi-8day", "evi-16day", "precipitation", "land-cover"],
  },
  {
    id: "landslide",
    label: "Landslide",
    summary: "Rainfall, soil saturation, soils and land cover, the conditions that set slopes moving.",
    categories: ["disaster_risk_management"],
    // No slope or terrain layer is published yet; add it here when it is.
    layers: ["soils"],
    satellite: ["precipitation", "soil-moisture-root-zone", "land-cover"],
  },
] as const satisfies readonly Hazard[];

export type HazardId = (typeof HAZARDS)[number]["id"];

/** The tab value: one hazard, or every layer. */
export type HazardView = HazardId | "all";

export const HAZARD_VIEWS: readonly HazardView[] = ["all", ...HAZARDS.map((h) => h.id)];

export function isHazardView(value: string | null | undefined): value is HazardView {
  return value != null && (HAZARD_VIEWS as readonly string[]).includes(value);
}

export function hazardFor(view: HazardView): Hazard | undefined {
  return HAZARDS.find((h) => h.id === view);
}

/** NASA's layers are offered on the map's Satellite view, never in the panel. */
export function isSatelliteLayer(layer: ExploreLayer): boolean {
  return layer.category === SATELLITE_CATEGORY;
}

/**
 * The part after the source prefix and workspace: `ksa:Rangelands:rivers`
 * and `ksa:rivers` -> `rivers`, `gibs:ndvi-8day` -> `ndvi-8day`.
 */
function layerName(id: string): string {
  return id.slice(id.lastIndexOf(":") + 1);
}

export function layerMatchesHazard(layer: ExploreLayer, hazard: Hazard): boolean {
  const name = layerName(layer.id);
  if (isSatelliteLayer(layer)) return hazard.satellite.includes(name);
  if (hazard.layers.includes(name)) return true;
  return hazard.categories.some(
    (id) => CATEGORIES.find((c) => c.id === id)?.label === layer.category,
  );
}

/** Each view's layer count, KSA and NASA together: the tab badges. */
export function hazardCounts(layers: readonly ExploreLayer[]): Record<HazardView, number> {
  return Object.fromEntries(
    HAZARD_VIEWS.map((view) => [view, filterByHazard(layers, view).length]),
  ) as Record<HazardView, number>;
}

/** The layers a view shows; "all" is every layer, as given. */
export function filterByHazard(
  layers: readonly ExploreLayer[],
  view: HazardView,
): readonly ExploreLayer[] {
  const hazard = hazardFor(view);
  if (hazard === undefined) return layers;
  return layers.filter((layer) => layerMatchesHazard(layer, hazard));
}
