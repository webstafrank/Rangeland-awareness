/**
 * Gate tests for public/geo/kenya-counties.geojson, the county boundaries the
 * data explorer draws over every layer.
 *
 * Run against the committed file, not a fresh build, so a stale or
 * hand-edited copy fails here instead of on the map.
 */
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { geo } from "..";

const PATH = join(__dirname, "..", "..", "..", "public", "geo", "kenya-counties.geojson");
const data = JSON.parse(readFileSync(PATH, "utf8")) as {
  type: string;
  features: {
    type: string;
    properties: { id: string; name: string };
    geometry: { type: string; coordinates: number[][][][] };
  }[];
};

/** Kenya's national envelope, generous by ~0.3 degrees on every side. */
const KENYA_ENVELOPE = { minLon: 33.5, minLat: -5.2, maxLon: 42.2, maxLat: 5.8 } as const;

describe("kenya-counties.geojson", () => {
  // By id, the join key. Names are the source's own spelling (the app's
  // display names differ in places, e.g. "Tharaka-Nithi"), and the map never
  // shows them.
  it("is a FeatureCollection of the same 47 counties the app knows, by id", () => {
    expect(data.type).toBe("FeatureCollection");
    const fromFile = data.features.map((f) => f.properties.id);
    const known = geo
      .listAreas()
      .map((a) => a.id)
      .sort((a, b) => a.localeCompare(b));
    expect(fromFile).toEqual(known);
  });

  it("holds closed lon/lat rings inside Kenya", () => {
    for (const feature of data.features) {
      expect(feature.geometry.type).toBe("MultiPolygon");
      for (const polygon of feature.geometry.coordinates) {
        for (const ring of polygon) {
          expect(ring.length, feature.properties.id).toBeGreaterThanOrEqual(4);
          expect(ring[0]).toEqual(ring[ring.length - 1]);
          for (const [lon, lat] of ring) {
            expect(lon).toBeGreaterThan(KENYA_ENVELOPE.minLon);
            expect(lon).toBeLessThan(KENYA_ENVELOPE.maxLon);
            expect(lat).toBeGreaterThan(KENYA_ENVELOPE.minLat);
            expect(lat).toBeLessThan(KENYA_ENVELOPE.maxLat);
          }
        }
      }
    }
  });

  // It is fetched on every visit to the explorer; the build script records
  // why this tolerance, and a regeneration that bloats it should be noticed.
  it("stays small enough to fetch on every visit", () => {
    expect(statSync(PATH).size).toBeLessThan(200 * 1024);
  });
});
