/**
 * Gate tests for Kenya's national outline, the clip the data explorer cuts
 * NASA imagery to. A bad outline does not crash anything: it silently blanks
 * part of the country or lets a neighbour through, which is why its shape is
 * asserted here rather than trusted.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { KENYA_OUTLINE, KENYA_OUTLINE_BBOX } from "..";

/** Even-odd point in polygon over every ring, in lon/lat. */
function inKenya(lon: number, lat: number): boolean {
  let hit = false;
  for (const ring of KENYA_OUTLINE) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) hit = !hit;
    }
  }
  return hit;
}

describe("KENYA_OUTLINE", () => {
  it("is every ring of the committed ADM0 source, none dropped", () => {
    // If this fails, the raw file changed and `npm run geo:build` was not run.
    const raw = JSON.parse(
      readFileSync(
        join(__dirname, "..", "data", "raw", "geoBoundaries-KEN-ADM0_simplified.geojson"),
        "utf8",
      ),
    );
    const polygons: number[][][][] = raw.features[0].geometry.coordinates;
    const rings = polygons.flat();
    expect(KENYA_OUTLINE).toHaveLength(rings.length);
    expect(KENYA_OUTLINE.map((r) => r.length)).toEqual(rings.map((r) => r.length));
  });

  it("closes every ring", () => {
    for (const ring of KENYA_OUTLINE) {
      expect(ring.length).toBeGreaterThanOrEqual(4);
      expect(ring[ring.length - 1]).toEqual(ring[0]);
    }
  });

  it("declares the extent its rings actually have", () => {
    const points = KENYA_OUTLINE.flat();
    const lons = points.map(([lon]) => lon);
    const lats = points.map(([, lat]) => lat);
    expect(KENYA_OUTLINE_BBOX).toEqual([
      Math.min(...lons),
      Math.min(...lats),
      Math.max(...lons),
      Math.max(...lats),
    ]);
  });

  it.each([
    ["Nairobi", 36.82, -1.29],
    ["Mombasa island", 39.66, -4.05],
    ["Lodwar", 35.6, 3.12],
    ["Mandera", 41.85, 3.93],
    ["Lamu island", 40.9, -2.28],
    ["Kisumu", 34.76, -0.09],
  ])("contains %s", (_, lon, lat) => {
    expect(inKenya(lon, lat)).toBe(true);
  });

  it.each([
    ["Kampala", 32.58, 0.35],
    ["Mogadishu", 45.34, 2.05],
    ["Arusha", 36.68, -3.37],
    ["Moyale, Ethiopian side", 39.06, 3.6],
    ["the Indian Ocean off Kilifi", 41.5, -4.0],
  ])("excludes %s", (_, lon, lat) => {
    expect(inKenya(lon, lat)).toBe(false);
  });
});
