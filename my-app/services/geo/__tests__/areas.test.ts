/**
 * Gate tests for the generated county data.
 *
 * These check the invariants the rest of the app is allowed to assume, and they
 * run against the committed `counties.generated.ts` rather than regenerating it,
 * so a stale or hand-edited generated file fails here instead of in a page.
 *
 * The id schema is imported from `@/contracts/geo` rather than restated: a test
 * that keeps its own copy of the regex passes happily after the contract has
 * changed underneath it.
 */
import { describe, expect, it } from "vitest";

import { AreaIdSchema, CLIMATE_ZONES, GEO_CONTRACT_VERSION } from "@/contracts/geo";

import { geo } from "..";

const AREAS = geo.listAreas();

/** Kenya's national envelope, generous by ~0.3 degrees on every side. */
const KENYA_ENVELOPE = { minLon: 33.5, minLat: -5.2, maxLon: 42.2, maxLat: 5.8 } as const;

/**
 * The 8 counties this service classifies as arid. Restated here on purpose: the
 * point of the test is to catch an accidental edit to the classification
 * constant, so it has to compare against an independent list.
 */
const EXPECTED_ARID = [
  "garissa",
  "isiolo",
  "mandera",
  "marsabit",
  "samburu",
  "tana-river",
  "turkana",
  "wajir",
] as const;

describe("county data", () => {
  it("is built against contract version 1", () => {
    expect(GEO_CONTRACT_VERSION).toBe(1);
  });

  it("has exactly Kenya's 47 counties", () => {
    expect(AREAS).toHaveLength(47);
  });

  it("has unique ids", () => {
    expect(new Set(AREAS.map((a) => a.id)).size).toBe(47);
  });

  it("gives every county an id that satisfies AreaIdSchema", () => {
    for (const area of AREAS) {
      expect(AreaIdSchema.safeParse(area.id), `${area.name} -> "${area.id}"`).toMatchObject({
        success: true,
      });
    }
  });

  it("slugs the awkward county names the way the URL scheme expects", () => {
    // Apostrophe, existing hyphen, and three two-word names: the five cases
    // where a naive slugifier produces something wrong or ugly.
    for (const id of ["muranga", "elgeyo-marakwet", "taita-taveta", "homa-bay", "trans-nzoia"]) {
      expect(geo.findArea(id), `expected an area with id "${id}"`).toBeDefined();
    }
    expect(geo.getArea("muranga").name).toBe("Murang'a");
    expect(geo.getArea("elgeyo-marakwet").name).toBe("Elgeyo-Marakwet");
  });

  it("displays Tharaka-Nithi's official name while keeping its source slug", () => {
    // The boundary source (RCMRD 2020) calls this county "Tharaka". Its
    // official name has been Tharaka-Nithi since 2013, so printing "Tharaka"
    // would read as an error to a Kenyan audience. DISPLAY_NAME_OVERRIDES in
    // the build script fixes the display name only: the slug still derives
    // from the source spelling, so no saved result URL moves. See ../README.md.
    expect(geo.getArea("tharaka").name).toBe("Tharaka-Nithi");
    expect(geo.findArea("tharaka-nithi")).toBeUndefined();
    // Traceability survives the override, via shapeId rather than the name.
    expect(geo.getArea("tharaka").shapeId).toBeTruthy();
  });

  it("keeps the overridden county in the ASAL group", () => {
    // The ASAL list is written against source spellings, so the override must
    // not drop Tharaka-Nithi out of it. The build script asserts 23 ASAL
    // counties, and this pins the specific one the override touches.
    expect(geo.getArea("tharaka").asal).toBe(true);
    expect(geo.getArea("tharaka").climateZone).toBe("semi-arid");
  });

  it("sorts listAreas by name", () => {
    const names = AREAS.map((a) => a.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, "en")));
  });

  it("keeps the upstream shape id for every county so a row can be traced back", () => {
    for (const area of AREAS) {
      // geoBoundaries ids are the release id followed by an alphanumeric suffix.
      expect(area.shapeId, area.name).toMatch(/^32016919[A-Z0-9]+$/);
    }
  });

  it("gives every county a climate zone from the contract's enum", () => {
    for (const area of AREAS) {
      expect(CLIMATE_ZONES, area.name).toContain(area.climateZone);
    }
  });

  it("marks exactly Kenya's 23 ASAL counties", () => {
    expect(AREAS.filter((a) => a.asal)).toHaveLength(23);
  });

  it("marks exactly the 8 expected counties arid", () => {
    const arid = AREAS.filter((a) => a.climateZone === "arid")
      .map((a) => a.id)
      .sort();
    expect(arid).toEqual([...EXPECTED_ARID]);
  });

  it("keeps asal and climateZone consistent", () => {
    for (const area of AREAS) {
      expect(area.asal, area.name).toBe(area.climateZone !== "humid");
    }
  });
});

describe("county paths", () => {
  it("gives every county a non-empty path starting with M", () => {
    for (const area of AREAS) {
      expect(area.path.length, area.name).toBeGreaterThan(0);
      expect(area.path.startsWith("M"), `${area.name}: ${area.path.slice(0, 12)}`).toBe(true);
    }
  });

  it("emits paths whose coordinates are all finite numbers", () => {
    for (const area of AREAS) {
      // Every token that is not a command must parse as a finite number. Done by
      // brute force rather than through the parser, so a parser bug cannot make
      // this pass.
      const numbers = area.path.split(/[MLZ ]/).filter((t) => t !== "");
      expect(numbers.length, area.name).toBeGreaterThan(0);
      for (const token of numbers) {
        expect(Number.isFinite(Number(token)), `${area.name}: token "${token}"`).toBe(true);
      }
    }
  });

  it("uses only the M/L/Z commands the parser understands", () => {
    for (const area of AREAS) {
      expect(area.path, area.name).toMatch(/^[MLZ\d .-]+$/);
      expect(area.path.endsWith("Z"), area.name).toBe(true);
    }
  });

  it("keeps every path inside the frame", () => {
    const { width, height } = geo.frame();
    for (const area of AREAS) {
      for (const ring of parseRings(area.path)) {
        for (const [x, y] of ring) {
          // A one-unit slack: path coordinates are rounded to 0.1, and the
          // extreme points of the country sit exactly on the frame edge.
          expect(x, area.name).toBeGreaterThanOrEqual(-1);
          expect(x, area.name).toBeLessThanOrEqual(width + 1);
          expect(y, area.name).toBeGreaterThanOrEqual(-1);
          expect(y, area.name).toBeLessThanOrEqual(height + 1);
        }
      }
    }
  });

  it("keeps at least four points in every ring", () => {
    for (const area of AREAS) {
      for (const ring of parseRings(area.path)) {
        expect(ring.length, area.name).toBeGreaterThanOrEqual(4);
      }
    }
  });
});

describe("county centroids and bboxes", () => {
  it("puts every centroid inside its own bbox", () => {
    for (const area of AREAS) {
      const [lon, lat] = area.centroid;
      const [west, south, east, north] = area.bbox;
      expect(lon, `${area.name} lon`).toBeGreaterThanOrEqual(west);
      expect(lon, `${area.name} lon`).toBeLessThanOrEqual(east);
      expect(lat, `${area.name} lat`).toBeGreaterThanOrEqual(south);
      expect(lat, `${area.name} lat`).toBeLessThanOrEqual(north);
    }
  });

  it("orders every bbox west<east, south<north", () => {
    for (const area of AREAS) {
      const [west, south, east, north] = area.bbox;
      expect(west, area.name).toBeLessThan(east);
      expect(south, area.name).toBeLessThan(north);
    }
  });

  it("keeps every bbox inside Kenya's national envelope", () => {
    for (const area of AREAS) {
      const [west, south, east, north] = area.bbox;
      expect(west, area.name).toBeGreaterThanOrEqual(KENYA_ENVELOPE.minLon);
      expect(south, area.name).toBeGreaterThanOrEqual(KENYA_ENVELOPE.minLat);
      expect(east, area.name).toBeLessThanOrEqual(KENYA_ENVELOPE.maxLon);
      expect(north, area.name).toBeLessThanOrEqual(KENYA_ENVELOPE.maxLat);
    }
  });

  /**
   * The test that catches a drifted projection.
   *
   * `geo.project()` and the baked paths are two different code paths reaching
   * the same maths. If they ever diverge, every projected point lands somewhere
   * plausible but wrong, and nothing else in the suite notices: labels just sit
   * in the wrong county. Projecting each centroid and each bbox corner and
   * checking containment ties the runtime projection to the build-time one.
   */
  it("projects every centroid inside its own projected bbox", () => {
    for (const area of AREAS) {
      const [west, south, east, north] = area.bbox;
      // Y is flipped by the projection, so the north-west corner is top-left.
      const [left, top] = geo.project([west, north]);
      const [right, bottom] = geo.project([east, south]);
      const [x, y] = geo.project(area.centroid);
      expect(left, area.name).toBeLessThan(right);
      expect(top, area.name).toBeLessThan(bottom);
      expect(x, `${area.name} x`).toBeGreaterThanOrEqual(left);
      expect(x, `${area.name} x`).toBeLessThanOrEqual(right);
      expect(y, `${area.name} y`).toBeGreaterThanOrEqual(top);
      expect(y, `${area.name} y`).toBeLessThanOrEqual(bottom);
    }
  });

  /**
   * Stronger than the bbox check and the reason the build script nudges a
   * centroid that escapes: a label anchor is only useful if it is inside the
   * shape being labelled, and for a concave county the bbox is not evidence of
   * that.
   */
  it("puts every projected centroid inside its own drawn boundary", () => {
    for (const area of AREAS) {
      const rings = parseRings(area.path);
      const point = geo.project(area.centroid);
      expect(evenOddContains(point, rings), `${area.name} centroid ${JSON.stringify(point)}`).toBe(true);
    }
  });
});

/**
 * A second, independent path parser and point-in-polygon test.
 *
 * Deliberately not the service's own `geometry.ts`: if the containment tests
 * above used the same code the service uses, a bug in that code would make them
 * agree with the service and pass. Twelve duplicated lines is the cost of the
 * tests being able to disagree.
 */
function parseRings(path: string): number[][][] {
  return path
    .split("M")
    .filter((chunk) => chunk !== "")
    .map((chunk) =>
      chunk
        .replace(/Z$/, "")
        .split("L")
        .map((pair) => pair.split(" ").map(Number)),
    );
}

function evenOddContains(point: readonly [number, number], rings: number[][][]): boolean {
  const [x, y] = point;
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}
