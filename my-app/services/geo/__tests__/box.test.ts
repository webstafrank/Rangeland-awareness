import { describe, expect, it } from "vitest";
import {
  boxAroundPoint,
  isOutsideKenya,
  labelForCoordinate,
  parseCoordinatePair,
} from "@/services/geo/box";
import { areaKm2 } from "@/services/geo/area";
import { boundsOfGeometry } from "@/services/geo/bounds";

describe("parseCoordinatePair", () => {
  it("parses the comma form coordinates actually arrive in", () => {
    expect(parseCoordinatePair("2.4512, 36.8203")).toEqual({
      lat: 2.4512,
      lng: 36.8203,
    });
  });

  it("parses a bare space-separated pair", () => {
    expect(parseCoordinatePair("2.4512 36.8203")).toEqual({
      lat: 2.4512,
      lng: 36.8203,
    });
  });

  it("takes latitude first, the reporting convention", () => {
    // Not GeoJSON order. A report and a radio call both say lat then lng.
    const parsed = parseCoordinatePair("-1.29, 36.82");
    expect(parsed?.lat).toBeCloseTo(-1.29, 6);
    expect(parsed?.lng).toBeCloseTo(36.82, 6);
  });

  it("accepts negatives for south and west", () => {
    expect(parseCoordinatePair("-4.05, -12.5")).toEqual({ lat: -4.05, lng: -12.5 });
  });

  it("accepts slash and semicolon separators", () => {
    expect(parseCoordinatePair("2.45/36.82")).toEqual({ lat: 2.45, lng: 36.82 });
    expect(parseCoordinatePair("2.45; 36.82")).toEqual({ lat: 2.45, lng: 36.82 });
  });

  it("accepts degree symbols", () => {
    expect(parseCoordinatePair("2.45° 36.82°")).toEqual({ lat: 2.45, lng: 36.82 });
  });

  it("uses hemisphere letters to order the pair, even written longitude first", () => {
    expect(parseCoordinatePair("36.82E, 2.45N")).toEqual({
      lat: 2.45,
      lng: 36.82,
    });
    expect(parseCoordinatePair("2.45S 36.82W")).toEqual({
      lat: -2.45,
      lng: -36.82,
    });
  });

  it("handles a hemisphere letter written before the number", () => {
    expect(parseCoordinatePair("N2.45 E36.82")).toEqual({ lat: 2.45, lng: 36.82 });
  });

  it("tolerates surrounding whitespace and collapsed spacing", () => {
    expect(parseCoordinatePair("   2.45 ,   36.82  ")).toEqual({
      lat: 2.45,
      lng: 36.82,
    });
  });

  it("returns null rather than a half-parsed coordinate", () => {
    expect(parseCoordinatePair("")).toBeNull();
    expect(parseCoordinatePair("   ")).toBeNull();
    expect(parseCoordinatePair("2.45")).toBeNull();
    expect(parseCoordinatePair("Marsabit")).toBeNull();
  });

  it("rejects values outside the coordinate domain", () => {
    expect(parseCoordinatePair("91, 36")).toBeNull();
    expect(parseCoordinatePair("2.45, 181")).toBeNull();
    expect(parseCoordinatePair("-91, 36")).toBeNull();
  });

  it("accepts the exact domain edges", () => {
    expect(parseCoordinatePair("90, 180")).toEqual({ lat: 90, lng: 180 });
    expect(parseCoordinatePair("-90, -180")).toEqual({ lat: -90, lng: -180 });
  });

  it("ignores anything after the first two numbers", () => {
    // An altitude or accuracy field tacked on must not shift the pair.
    expect(parseCoordinatePair("2.45, 36.82, 1200")).toEqual({
      lat: 2.45,
      lng: 36.82,
    });
  });
});

describe("isOutsideKenya", () => {
  it("accepts a point in the northern rangelands", () => {
    expect(isOutsideKenya({ lat: 2.33, lng: 37.99 })).toBe(false);
  });

  it("accepts Nairobi", () => {
    expect(isOutsideKenya({ lat: -1.29, lng: 36.82 })).toBe(false);
  });

  it("flags a point well outside", () => {
    expect(isOutsideKenya({ lat: 51.5, lng: -0.12 })).toBe(true);
    expect(isOutsideKenya({ lat: 9.0, lng: 38.7 })).toBe(true);
  });
});

describe("boxAroundPoint", () => {
  const at = { lat: 2.33, lng: 37.99 };

  it("gives a Point when the radius is zero", () => {
    expect(boxAroundPoint(at, 0)).toEqual({
      type: "Point",
      coordinates: [37.99, 2.33],
    });
  });

  it("treats a negative or NaN radius as zero", () => {
    expect(boxAroundPoint(at, -5).type).toBe("Point");
    expect(boxAroundPoint(at, Number.NaN).type).toBe("Point");
  });

  it("gives a closed polygon for a positive radius", () => {
    const geometry = boxAroundPoint(at, 10);
    expect(geometry.type).toBe("Polygon");
    const ring = (geometry as { coordinates: number[][][] }).coordinates[0];
    expect(ring).toHaveLength(5);
    expect(ring[0]).toEqual(ring[4]);
  });

  it("centres the box on the point", () => {
    const bounds = boundsOfGeometry(boxAroundPoint(at, 10));
    expect(bounds).not.toBeNull();
    const [[south, west], [north, east]] = bounds as [
      [number, number],
      [number, number],
    ];
    expect((south + north) / 2).toBeCloseTo(at.lat, 6);
    expect((west + east) / 2).toBeCloseTo(at.lng, 6);
  });

  it("makes radius mean half-width, so radius 10 is a 20km box", () => {
    // 20km on a side is 400 km2. Anything near 100 would mean radius was
    // being used as the full width.
    const value = areaKm2(boxAroundPoint(at, 10)) as number;
    expect(value).toBeGreaterThan(390);
    expect(value).toBeLessThan(410);
  });

  it("stays square on the ground, not square in degrees", () => {
    // Longitude degrees are shorter than latitude degrees away from the
    // equator. Without the cos(lat) correction the box would be visibly
    // taller than wide, so compare the ground spans, not the degree spans.
    const high = { lat: 60, lng: 20 };
    const bounds = boundsOfGeometry(boxAroundPoint(high, 10));
    const [[south, west], [north, east]] = bounds as [
      [number, number],
      [number, number],
    ];

    const latSpanKm = (north - south) * 111.32;
    const lngSpanKm =
      (east - west) * 111.32 * Math.cos((high.lat * Math.PI) / 180);

    expect(latSpanKm).toBeCloseTo(20, 1);
    expect(lngSpanKm).toBeCloseTo(20, 1);
    // And in raw degrees it is deliberately NOT square.
    expect(east - west).toBeGreaterThan((north - south) * 1.5);
  });

  it("clamps latitude at the poles instead of running past 90", () => {
    const bounds = boundsOfGeometry(boxAroundPoint({ lat: 89.99, lng: 0 }, 50));
    const [, [north]] = bounds as [[number, number], [number, number]];
    expect(north).toBeLessThanOrEqual(90);
  });

  it("scales area with the square of the radius", () => {
    const small = areaKm2(boxAroundPoint(at, 5)) as number;
    const large = areaKm2(boxAroundPoint(at, 10)) as number;
    expect(large / small).toBeGreaterThan(3.9);
    expect(large / small).toBeLessThan(4.1);
  });
});

describe("labelForCoordinate", () => {
  it("labels a point with hemispheres", () => {
    expect(labelForCoordinate({ lat: 2.33, lng: 37.99 }, 0)).toBe(
      "2.3300N 37.9900E",
    );
  });

  it("labels southern and western coordinates", () => {
    expect(labelForCoordinate({ lat: -1.29, lng: -36.82 }, 0)).toBe(
      "1.2900S 36.8200W",
    );
  });

  it("names the radius when there is one", () => {
    expect(labelForCoordinate({ lat: 2.33, lng: 37.99 }, 10)).toBe(
      "2.3300N 37.9900E +10km",
    );
  });
});
