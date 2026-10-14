/**
 * Gate tests for services/geo/locate.ts: a click on the Areas map turned into
 * the county, sub-county and ward under it.
 */

import { describe, expect, it } from "vitest";
import type { MultiPolygon } from "geojson";

import { ADMIN_BY_ID, ADMIN_UNITS, loadAdminGeometry } from "../admin";
import { COUNTIES } from "../data/counties.generated";
import {
  countiesAround,
  locateAdminUnit,
  pointInMultiPolygon,
  pointInRing,
  unitInFile,
} from "../locate";

const square = (w: number, s: number, e: number, n: number) => [
  [w, s],
  [e, s],
  [e, n],
  [w, n],
  [w, s],
];

describe("pointInRing", () => {
  it("is true inside a square and false outside it", () => {
    const ring = square(0, 0, 2, 2);
    expect(pointInRing(1, 1, ring)).toBe(true);
    expect(pointInRing(3, 1, ring)).toBe(false);
    expect(pointInRing(1, -0.5, ring)).toBe(false);
  });

  it("handles a concave ring: the notch of a U is outside", () => {
    const u = [
      [0, 0],
      [3, 0],
      [3, 3],
      [2, 3],
      [2, 1],
      [1, 1],
      [1, 3],
      [0, 3],
      [0, 0],
    ];
    expect(pointInRing(0.5, 2, u)).toBe(true);
    expect(pointInRing(1.5, 2, u)).toBe(false);
  });
});

describe("pointInMultiPolygon", () => {
  const donut: MultiPolygon = {
    type: "MultiPolygon",
    coordinates: [[square(0, 0, 4, 4), square(1, 1, 3, 3)], [square(10, 10, 11, 11)]],
  };

  it("counts a hole as outside and an island as inside", () => {
    expect(pointInMultiPolygon(0.5, 0.5, donut)).toBe(true);
    expect(pointInMultiPolygon(2, 2, donut)).toBe(false);
    expect(pointInMultiPolygon(10.5, 10.5, donut)).toBe(true);
    expect(pointInMultiPolygon(7, 7, donut)).toBe(false);
  });
});

describe("unitInFile", () => {
  const ward = ADMIN_UNITS.find((u) => u.level === "ward" && u.county === "nairobi")!;
  const sub = ADMIN_BY_ID.get(ward.subcounty!)!;
  const county = ADMIN_BY_ID.get("county:nairobi")!;
  const box = (w: number, s: number, e: number, n: number): MultiPolygon => ({
    type: "MultiPolygon",
    coordinates: [[square(w, s, e, n)]],
  });

  it("prefers the ward over the sub-county and county that also hold the point", () => {
    const file = {
      [county.id]: box(0, 0, 10, 10),
      [sub.id]: box(0, 0, 5, 5),
      [ward.id]: box(0, 0, 2, 2),
    };
    expect(unitInFile(1, 1, file)?.id).toBe(ward.id);
  });

  it("falls back to the sub-county, then the county, in a gap between wards", () => {
    const file = {
      [county.id]: box(0, 0, 10, 10),
      [sub.id]: box(0, 0, 5, 5),
      [ward.id]: box(0, 0, 2, 2),
    };
    expect(unitInFile(3, 3, file)?.id).toBe(sub.id);
    expect(unitInFile(8, 8, file)?.id).toBe(county.id);
    expect(unitInFile(20, 20, file)).toBeNull();
  });

  it("skips ids it does not know", () => {
    expect(unitInFile(1, 1, { "ward:nowhere:x:y": box(0, 0, 2, 2) })).toBeNull();
  });
});

describe("countiesAround", () => {
  it("narrows an inland point to a handful of county files", () => {
    const hits = countiesAround(37.9, 0.3);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.length).toBeLessThanOrEqual(4);
    expect(hits).toContain("meru");
  });

  it("finds nothing far outside Kenya", () => {
    expect(countiesAround(32.58, 0.35)).toEqual([]); // Kampala
  });

  it("opens Kericho's file for a click in Buret, which Kericho's outline misses", async () => {
    // Regression: Buret's wards are filed under Kericho but lie outside
    // Kericho's county outline. Boxes taken from the county outlines
    // (COUNTIES) never opened Kericho's file for a click in Litein, and the
    // click was named "Bomet county".
    const litein = ADMIN_BY_ID.get("ward:kericho:buret:litein")!;
    const [lon, lat] = interiorPoint(await loadAdminGeometry(litein))!;
    const [w, s, e, n] = COUNTIES.find((c) => c.id === "kericho")!.bbox;
    expect(lon >= w && lon <= e && lat >= s && lat <= n).toBe(false);
    expect(countiesAround(lon, lat)).toContain("kericho");
    expect((await locateAdminUnit(lon, lat))?.id).toBe(litein.id);
  });
});

/*
 * Every test here loads real county files, and the first to touch a file pays
 * for Vite turning its JSON into a module (well under a second idle, but past
 * the 5s default when the eval suite runs beside the pre-commit gate). A hang
 * still fails at 30s.
 */
describe("locateAdminUnit", { timeout: 30_000 }, () => {
  it.each([
    ["Nairobi CBD", 36.8219, -1.2864, "nairobi"],
    ["Lodwar", 35.597, 3.119, "turkana"],
    ["Garissa town", 39.646, -0.4532, "garissa"],
    ["Kisumu", 34.7617, -0.0917, "kisumu"],
    ["Mombasa island", 39.6682, -4.0435, "mombasa"],
  ])("names %s down to a ward of the right county", async (_, lon, lat, county) => {
    const unit = await locateAdminUnit(lon, lat);
    expect(unit?.level).toBe("ward");
    expect(unit?.county).toBe(county);
  });

  it.each([
    ["Kampala", 32.58, 0.35],
    ["the Indian Ocean off Lamu", 41.5, -3.0],
    ["Addis Ababa", 38.74, 9.03],
  ])("returns null for %s", async (_, lon, lat) => {
    expect(await locateAdminUnit(lon, lat)).toBeNull();
  });

  /*
   * Every ward, found from a point inside it. The point is the first grid
   * sample in the ward's box that its own boundary holds. Simplified wards
   * overlap their neighbours by a hairline in places, so a sample right on an
   * edge may name the neighbour; the rule is that every answer is a ward that
   * really holds the point, and almost every answer is the ward sampled.
   */
  it("finds every ward from a point inside it", { timeout: 30_000 }, async () => {
    const wards = ADMIN_UNITS.filter((u) => u.level === "ward");
    const problems: string[] = [];
    let exact = 0;
    for (const ward of wards) {
      const geometry = await loadAdminGeometry(ward);
      const point = interiorPoint(geometry);
      if (point === null) {
        problems.push(`${ward.id}: no interior sample`);
        continue;
      }
      const found = await locateAdminUnit(point[0], point[1]);
      if (found === null || found.level !== "ward") {
        problems.push(`${ward.id}: found ${found?.id ?? "nothing"}`);
        continue;
      }
      if (found.id === ward.id) {
        exact += 1;
      } else if (!pointInMultiPolygon(point[0], point[1], await loadAdminGeometry(found))) {
        problems.push(`${ward.id}: named ${found.id}, which does not hold the point`);
      }
    }
    expect(problems).toEqual([]);
    expect(exact / wards.length).toBeGreaterThan(0.97);
  });
});

/** A point inside the geometry, from a 12x12 grid over its box. Null if none. */
function interiorPoint(geometry: MultiPolygon): [number, number] | null {
  const all = geometry.coordinates.flat(2);
  const lons = all.map((p) => p[0]);
  const lats = all.map((p) => p[1]);
  const [w, e, s, n] = [Math.min(...lons), Math.max(...lons), Math.min(...lats), Math.max(...lats)];
  const steps = 12;
  // Centre-out, so the sample tends to sit well inside rather than on an edge.
  const order = Array.from({ length: steps }, (_, i) => i).sort(
    (a, b) => Math.abs(a - steps / 2) - Math.abs(b - steps / 2),
  );
  for (const i of order) {
    for (const j of order) {
      const lon = w + ((i + 0.5) / steps) * (e - w);
      const lat = s + ((j + 0.5) / steps) * (n - s);
      if (pointInMultiPolygon(lon, lat, geometry)) return [lon, lat];
    }
  }
  return null;
}
