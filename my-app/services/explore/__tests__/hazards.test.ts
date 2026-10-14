import { describe, expect, it } from "vitest";
import {
  CATEGORIES,
  CATEGORY_ORDER,
  GIBS_CATEGORIES,
  HAZARDS,
  HAZARD_VIEWS,
  LAYER_CATEGORIES,
  filterByHazard,
  fromWmsSource,
  hazardCounts,
  hazardFor,
  isHazardView,
  isSatelliteLayer,
  layerMatchesHazard,
  type ExploreLayer,
} from "@/services/explore";
import { GIBS_LAYERS, SOURCES } from "@/services/wms";

const make = (id: string, category: string): ExploreLayer => ({
  id,
  title: id,
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

const flood = hazardFor("flood")!;
const landslide = hazardFor("landslide")!;

describe("HAZARDS", () => {
  it("is the four tabs the explorer offers, in order, after All", () => {
    expect(HAZARDS.map((h) => h.label)).toEqual(["Flood", "Drought", "Famine", "Landslide"]);
    expect(HAZARD_VIEWS).toEqual(["all", "flood", "drought", "famine", "landslide"]);
  });

  // A renamed registry entry would otherwise drop out of its tab in silence.
  it("names only NASA layers that exist in the GIBS registry", () => {
    const gibs = new Set(GIBS_LAYERS.map((l) => l.id));
    for (const hazard of HAZARDS) {
      for (const id of hazard.satellite) expect(gibs, `${hazard.id}: ${id}`).toContain(id);
    }
  });

  it("names only KSA layers that the mapping file knows", () => {
    for (const hazard of HAZARDS) {
      for (const name of hazard.layers) {
        expect(LAYER_CATEGORIES, `${hazard.id}: ${name}`).toHaveProperty(name);
      }
    }
  });

  it("gives every hazard something to show, KSA side and NASA side", () => {
    for (const hazard of HAZARDS) {
      expect(hazard.categories.length + hazard.layers.length).toBeGreaterThan(0);
      expect(hazard.satellite.length).toBeGreaterThan(0);
      expect(hazard.summary).not.toBe("");
    }
  });
});

describe("isHazardView", () => {
  it("accepts the tab values and nothing else, for ?hazard=", () => {
    expect(isHazardView("flood")).toBe(true);
    expect(isHazardView("all")).toBe(true);
    expect(isHazardView("Flood")).toBe(false);
    expect(isHazardView("wildfire")).toBe(false);
    expect(isHazardView(null)).toBe(false);
    expect(isHazardView(undefined)).toBe(false);
  });
});

describe("layerMatchesHazard", () => {
  const drm = CATEGORIES.find((c) => c.id === "disaster_risk_management")!.label;

  it("matches a KSA layer by name, with or without its workspace", () => {
    expect(layerMatchesHazard(make("ksa:Rangelands:rivers", "Natural features"), flood)).toBe(true);
    expect(layerMatchesHazard(make("ksa:rivers", "Natural features"), flood)).toBe(true);
    expect(
      layerMatchesHazard(make("ksa:Rangelands:wards", "Administrative boundaries"), flood),
    ).toBe(false);
  });

  it("matches every KSA layer in a listed category, published or not yet", () => {
    expect(layerMatchesHazard(make("ksa:Rangelands:new_flood_zones", drm), flood)).toBe(true);
    expect(layerMatchesHazard(make("ksa:Rangelands:new_flood_zones", drm), landslide)).toBe(true);
    expect(layerMatchesHazard(make("ksa:Rangelands:boreholes", "Water"), flood)).toBe(true);
    expect(layerMatchesHazard(make("ksa:Rangelands:boreholes", "Water"), landslide)).toBe(false);
  });

  it("matches a NASA layer by its registry id only, never by category", () => {
    expect(layerMatchesHazard(make("gibs:flood-2day", drm), flood)).toBe(true);
    // Filed under Disaster risk management, which Landslide takes whole, yet
    // flooding is not a landslide layer: the category does not count for NASA.
    expect(layerMatchesHazard(make("gibs:flood-2day", drm), landslide)).toBe(false);
    expect(layerMatchesHazard(make("gibs:ndvi-8day", "Agriculture and livestock"), flood)).toBe(
      false,
    );
    // A KSA layer that happens to share a GIBS id's name is still KSA.
    expect(layerMatchesHazard(make("ksa:Rangelands:flood-2day", "Other"), flood)).toBe(false);
  });
});

describe("filterByHazard", () => {
  const layers = [
    make("ksa:Rangelands:rivers", "Natural features"),
    make("ksa:Rangelands:wards", "Administrative boundaries"),
    make("ksa:Rangelands:soils", "Natural features"),
    make("gibs:flood-2day", "Disaster risk management"),
    make("gibs:land-cover", "Natural features"),
  ];

  it("returns the same list for All", () => {
    expect(filterByHazard(layers, "all")).toBe(layers);
  });

  it("keeps the matching layers, in their incoming order", () => {
    expect(filterByHazard(layers, "flood").map((l) => l.id)).toEqual([
      "ksa:Rangelands:rivers",
      "gibs:flood-2day",
    ]);
    expect(filterByHazard(layers, "landslide").map((l) => l.id)).toEqual([
      "ksa:Rangelands:soils",
      "gibs:land-cover",
    ]);
  });
});

describe("hazardCounts", () => {
  it("counts every view's layers, KSA and NASA together, for the tab badges", () => {
    const layers = [
      make("ksa:Rangelands:rivers", "Natural features"),
      make("ksa:Rangelands:livestock_routes", "Agriculture and livestock"),
      make("gibs:flood-2day", "Disaster risk management"),
      make("gibs:ndvi-8day", "Agriculture and livestock"),
    ];
    expect(hazardCounts(layers)).toEqual({
      all: 4,
      flood: 2, // rivers, flood-2day
      drought: 2, // livestock_routes, ndvi
      famine: 2, // livestock_routes (its category), ndvi
      landslide: 0,
    });
  });
});

describe("isSatelliteLayer", () => {
  it("is a GIBS layer by id, whatever category it is listed in", () => {
    expect(isSatelliteLayer(make("gibs:ndvi-8day", "Agriculture and livestock"))).toBe(true);
    expect(isSatelliteLayer(make("ksa:Rangelands:rivers", "Natural features"))).toBe(false);
  });
});

describe("GIBS_CATEGORIES", () => {
  // A registry layer with no line would land in "Other", not its category.
  it("files every NASA registry layer, and names no layer the registry lacks", () => {
    const gibs = GIBS_LAYERS.map((l) => l.id).sort();
    expect(Object.keys(GIBS_CATEGORIES).sort()).toEqual(gibs);
  });

  it("lists each NASA layer under a real panel heading, never Other", () => {
    const source = SOURCES.find((s) => s.id === "gibs")!;
    const listed = fromWmsSource(source, { start: "2000-01-01", end: "2026-10-14" });
    for (const layer of listed) {
      expect(CATEGORY_ORDER, layer.id).toContain(layer.category);
    }
    expect(listed.find((l) => l.id === "gibs:flood-2day")?.category).toBe(
      "Disaster risk management",
    );
  });
});
