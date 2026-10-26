/**
 * The data explorer's categories, and which KSA GeoServer layer goes in which.
 *
 * This is the one file to edit when layers are published. The layers
 * themselves come live from the backend's catalogue (`GET /api/v1/layers`),
 * so a layer published in a listed workspace appears in the explorer with no
 * code change at all: under "Other", named from its layer name, until it gets
 * a line in LAYER_CATEGORIES below. Every category in CATEGORIES is listed in
 * the panel from the start, empty ones included, so the structure is visible
 * before the data is.
 *
 * Adding a layer is a single line, keyed by its LAYER NAME, the part after the
 * workspace in `layers=Rangelands:rivers`:
 *
 *   river_tana_riparian_extent: { category: "naturalfeatures", title: "Tana River riparian extent" },
 *
 * `category` is one of the ids in CATEGORIES (TypeScript refuses anything
 * else). `title` is optional: GeoServer titles are usually the layer name
 * again, so a human one is worth writing, but leaving it out is not an error.
 * The qualified `Rangelands:rivers` form is accepted as a key too, for the day
 * two workspaces publish the same layer name.
 */

/** GeoServer workspaces the explorer lists. Every layer in them is shown. */
export const KSA_WORKSPACES: readonly string[] = ["Rangelands"];

/** The KSA categories, in the order the panel lists them. */
export const CATEGORIES = [
  { id: "administrative_boundaries", label: "Administrative boundaries" },
  { id: "agriculture_livestock", label: "Agriculture and livestock" },
  { id: "county_projects", label: "County projects" },
  { id: "disaster_risk_management", label: "Disaster risk management" },
  { id: "infastructure", label: "Infrastructure" },
  { id: "institutions_facilities", label: "Institutions and facilities" },
  { id: "naturalfeatures", label: "Natural features" },
  { id: "water", label: "Water" },
  { id: "ranches_protectedareas", label: "Ranches and protected areas" },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]["id"];

/**
 * Where each NASA GIBS layer is listed, keyed by its registry id
 * (services/wms/layers.ts). NASA's layers sit in the same categories as the
 * KSA ones, by what they show, not under a heading of their own; the row
 * names its source ("From NASA EOSDIS GIBS"). The unit tests hold every registry id to a line here,
 * so a layer added to the registry without one fails the gate rather than
 * landing in "Other".
 */
export const GIBS_CATEGORIES: Readonly<Record<string, CategoryId>> = {
  // Pasture and crop condition: what the herds and farms live on.
  "ndvi-8day": "agriculture_livestock",
  "evi-16day": "agriculture_livestock",
  // Rainfall and the water held in the soil.
  precipitation: "water",
  "soil-moisture-root-zone": "water",
  // Flood water on the land surface: an event, not a resource.
  "flood-2day": "disaster_risk_management",
  // Measurements of the land surface, beside soils and rivers. Disaster risk
  // management holds events (flooding); heat stress reaches the Drought tab
  // through its hazard list, not through a category.
  "lst-terra-monthly": "naturalfeatures",
  "lst-aqua-monthly": "naturalfeatures",
  "land-cover": "naturalfeatures",
};

/** Where a KSA layer with no entry below is listed. Always last, and only when non-empty. */
export const FALLBACK_CATEGORY = "Other";

/** Every heading the panel shows even when empty, in order. */
export const CATEGORY_ORDER: readonly string[] = CATEGORIES.map((c) => c.label);

export interface LayerCategoryEntry {
  category: CategoryId;
  /** The name shown in the panel. Defaults to the layer name, humanised. */
  title?: string;
  /** One sentence on what the layer shows. Defaults to the GeoServer abstract. */
  description?: string;
}

/** Keyed by layer name. */
export const LAYER_CATEGORIES: Readonly<Record<string, LayerCategoryEntry>> = {
  // ---------------------------------------------- administrative_boundaries
  subcounties: { category: "administrative_boundaries", title: "Sub-counties" },
  tana_river_subcounty: {
    category: "administrative_boundaries",
    title: "Tana River sub-counties",
  },
  wards: { category: "administrative_boundaries", title: "Wards" },
  places: { category: "administrative_boundaries", title: "Places" },

  // -------------------------------------------------- agriculture_livestock
  agroecological_zones: { category: "agriculture_livestock", title: "Agro-ecological zones" },
  // Published as "irrigarion" in GeoServer. Both spellings are listed so the
  // layer keeps its place if it is renamed there.
  irrigarion_schemes: { category: "agriculture_livestock", title: "Irrigation schemes" },
  irrigation_schemes: { category: "agriculture_livestock", title: "Irrigation schemes" },
  livestock_routes: { category: "agriculture_livestock", title: "Livestock routes" },

  // -------------------------------------------------------- county_projects
  // The eco clusters are the county's planned safe zones for disaster
  // relocation, so they sit with its other projects.
  eco_clusters_urbanisation: {
    category: "county_projects",
    title: "Eco clusters (disaster safe zones)",
  },
  garsen_township: { category: "county_projects", title: "Garsen township" },
  kisip_sites: { category: "county_projects", title: "KISIP sites" },
  stella_mundi_lucerne: { category: "county_projects", title: "Stella Mundi lucerne" },

  // ---------------------------------------------------------- infastructure
  roads: { category: "infastructure", title: "Roads" },
  ketraco_wayleave: { category: "infastructure", title: "KETRACO wayleave" },

  // ------------------------------------------------ institutions_facilities
  agriculture_training_center: {
    category: "institutions_facilities",
    title: "Agriculture training centres",
  },
  schools: { category: "institutions_facilities", title: "Schools" },
  social_amenities: { category: "institutions_facilities", title: "Social amenities" },

  // -------------------------------------------------------- naturalfeatures
  rivers: { category: "naturalfeatures", title: "Rivers" },
  water_body: { category: "naturalfeatures", title: "Water bodies" },
  river_tana_riparian_extent: {
    category: "naturalfeatures",
    title: "Tana River riparian extent",
  },
  soils: { category: "naturalfeatures", title: "Soils" },
};

/** A category id's label, e.g. `infastructure` -> "Infrastructure". */
export function categoryLabel(id: CategoryId): string {
  return CATEGORIES.find((c) => c.id === id)?.label ?? FALLBACK_CATEGORY;
}

/**
 * The entry for a catalogue layer: the qualified name first, then the bare
 * layer name, which is the normal key.
 */
export function categoryEntryFor(
  qualifiedName: string,
  categories: Readonly<Record<string, LayerCategoryEntry>> = LAYER_CATEGORIES,
): LayerCategoryEntry | undefined {
  const bare = qualifiedName.includes(":")
    ? qualifiedName.slice(qualifiedName.indexOf(":") + 1)
    : qualifiedName;
  return categories[qualifiedName] ?? categories[bare];
}
