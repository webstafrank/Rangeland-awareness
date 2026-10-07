import { describe, expect, it } from "vitest";
import {
  CATEGORIES,
  CATEGORY_ORDER,
  FALLBACK_CATEGORY,
  categoryEntryFor,
  categoryLabel,
  SATELLITE_CATEGORY,
  filterExploreLayers,
  fromCatalogLayer,
  fromWmsSource,
  groupByCategory,
  humaniseLayerName,
  type ExploreLayer,
} from "@/services/explore";
import { GIBS_LAYERS, SOURCES } from "@/services/wms";

const urls = {
  tileTemplate: (id: string) => `http://backend/api/v1/tiles/${id}?BBOX={bbox-epsg-3857}`,
  legendUrl: (id: string) => `http://backend/api/v1/layers/${id}/legend`,
};

const rivers = {
  id: "Rangelands:rivers",
  name: "Rangelands:rivers",
  title: "rivers",
  abstract: "",
  workspace: "Rangelands",
  bbox: [38.47, -3.11, 40.48, 0.0] as [number, number, number, number],
  styles: ["Rangelands:rivers"],
  queryable: true,
  kind: "vector" as const,
};

describe("humaniseLayerName", () => {
  it("drops the workspace and turns underscores into words", () => {
    expect(humaniseLayerName("Rangelands:river_tana_riparian_extent")).toBe(
      "River tana riparian extent",
    );
    expect(humaniseLayerName("water_body")).toBe("Water body");
  });
});

describe("fromCatalogLayer", () => {
  it("takes the category and title from the mapping file", () => {
    const layer = fromCatalogLayer(rivers, urls);
    expect(layer.id).toBe("ksa:Rangelands:rivers");
    expect(layer.title).toBe("Rivers");
    expect(layer.category).toBe("Natural features");
    expect(layer.tiles).toBe(
      "http://backend/api/v1/tiles/Rangelands:rivers?BBOX={bbox-epsg-3857}",
    );
    expect(layer.legend).toEqual({
      kind: "image",
      url: "http://backend/api/v1/layers/Rangelands:rivers/legend",
    });
    expect(layer.bounds).toEqual([38.47, -3.11, 40.48, 0.0]);
    expect(layer.unavailable).toBeNull();
    // No features URL given, so no popups: the caller opts in.
    expect(layer.features).toBeNull();
  });

  it("gives a vector layer a features URL, and a raster none", () => {
    const withFeatures = { ...urls, featuresUrl: (id: string) => `http://backend/f/${id}` };
    expect(fromCatalogLayer(rivers, withFeatures).features).toBe("http://backend/f/Rangelands:rivers");
    expect(fromCatalogLayer({ ...rivers, kind: "raster" }, withFeatures).features).toBeNull();
  });

  it("lists an unmapped layer under Other, named from its layer name", () => {
    const layer = fromCatalogLayer(
      { ...rivers, id: "Rangelands:soil_map", name: "Rangelands:soil_map", title: "soil_map" },
      urls,
    );
    expect(layer.category).toBe(FALLBACK_CATEGORY);
    expect(layer.title).toBe("Soil map");
    expect(layer.description).toBe("Vector features from the Rangelands workspace.");
  });

  it("keys the mapping by layer name, and accepts the qualified name too", () => {
    const bare = { rivers: { category: "water" as const, title: "By name" } };
    expect(fromCatalogLayer(rivers, urls, bare).category).toBe("Water");
    const both = {
      ...bare,
      "Rangelands:rivers": { category: "naturalfeatures" as const, title: "Qualified" },
    };
    // The qualified key wins, for two workspaces sharing a layer name.
    expect(fromCatalogLayer(rivers, urls, both).title).toBe("Qualified");
    expect(categoryEntryFor("Other_ws:rivers", bare)?.title).toBe("By name");
  });

  it("uses the GeoServer abstract as the description when there is one", () => {
    const layer = fromCatalogLayer(
      { ...rivers, abstract: "Digitised from 1:50k sheets." },
      urls,
      {},
    );
    expect(layer.description).toBe("Digitised from 1:50k sheets.");
  });
});

describe("fromWmsSource", () => {
  const gibs = SOURCES.find((s) => s.id === "gibs")!;
  const window = { start: "2000-01-01", end: "2026-10-07" };

  it("builds a MapLibre template with the bbox placeholder left unencoded", () => {
    const [ndvi] = fromWmsSource(gibs, window);
    expect(ndvi.id).toBe(`gibs:${GIBS_LAYERS[0].id}`);
    expect(ndvi.category).toBe(SATELLITE_CATEGORY);
    expect(ndvi.tiles.endsWith("&BBOX={bbox-epsg-3857}")).toBe(true);
    const query = new URL(ndvi.tiles.replace("{bbox-epsg-3857}", "0,0,1,1")).searchParams;
    expect(query.get("LAYERS")).toBe(GIBS_LAYERS[0].layerName);
    expect(query.get("CRS")).toBe("EPSG:3857");
    expect(query.get("TIME")).toBe(GIBS_LAYERS[0].timeDefault);
  });

  it("marks a layer with nothing in the window as unavailable, with no tiles", () => {
    const empty = fromWmsSource(gibs, { start: "1990-01-01", end: "1990-12-31" });
    const timed = empty.filter((l) => l.timeNote !== null);
    expect(timed.length).toBeGreaterThan(0);
    for (const layer of timed) {
      expect(layer.unavailable).not.toBeNull();
      expect(layer.tiles).toBe("");
    }
  });
});

const make = (id: string, category: string, title = id): ExploreLayer => ({
  id,
  title,
  description: "",
  category,
  sourceLabel: "",
  tiles: "",
  attribution: "",
  legend: { kind: "none", reason: "" },
  bounds: null,
  timeNote: null,
  features: null,
  unavailable: null,
});

describe("categories", () => {
  it("labels every category, spelling infastructure properly", () => {
    expect(CATEGORIES).toHaveLength(9);
    expect(categoryLabel("infastructure")).toBe("Infrastructure");
    expect(categoryLabel("naturalfeatures")).toBe("Natural features");
    expect(new Set(CATEGORIES.map((c) => c.label)).size).toBe(CATEGORIES.length);
  });
});

describe("groupByCategory", () => {
  it("lists every configured heading, empty ones included, then others, then Other", () => {
    const groups = groupByCategory([
      make("a", FALLBACK_CATEGORY),
      make("b", "Zoning"),
      make("c", SATELLITE_CATEGORY),
      make("d", "Natural features"),
      make("f", "Natural features"),
    ]);
    expect(groups.map((g) => g.category)).toEqual([
      ...CATEGORY_ORDER,
      "Zoning",
      FALLBACK_CATEGORY,
    ]);
    expect(groups.find((g) => g.category === "Natural features")?.layers.map((l) => l.id)).toEqual([
      "d",
      "f",
    ]);
    expect(groups.find((g) => g.category === "Water")?.layers).toEqual([]);
  });

  it("drops empty headings when asked, and Other whenever it is empty", () => {
    const groups = groupByCategory([make("d", "Water")], undefined, { includeEmpty: false });
    expect(groups.map((g) => g.category)).toEqual(["Water"]);
    expect(groupByCategory([]).map((g) => g.category)).not.toContain(FALLBACK_CATEGORY);
  });
});

describe("filterExploreLayers", () => {
  const layers = [
    make("ksa:rivers", "Natural features", "Rivers"),
    make("gibs:ndvi", SATELLITE_CATEGORY, "NDVI"),
  ];

  it("matches the title, the category or the id, every word, any case", () => {
    expect(filterExploreLayers(layers, "RIVERS").map((l) => l.id)).toEqual(["ksa:rivers"]);
    expect(filterExploreLayers(layers, "natural").map((l) => l.id)).toEqual(["ksa:rivers"]);
    expect(filterExploreLayers(layers, "satellite ndvi").map((l) => l.id)).toEqual([
      "gibs:ndvi",
    ]);
    expect(filterExploreLayers(layers, "rivers ndvi")).toEqual([]);
    expect(filterExploreLayers(layers, "  ")).toBe(layers);
  });
});
