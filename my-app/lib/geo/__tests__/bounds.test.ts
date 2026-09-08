import { describe, expect, it } from "vitest";
import {
  boundsOfGeometry,
  centerOf,
  fitBoundsFor,
  padBounds,
  unionBounds,
} from "@/lib/geo/bounds";
import { areaKm2, formatArea } from "@/lib/geo/area";
import type { BoundsTuple } from "@/lib/geo/bounds";
import type { Geometry } from "geojson";

const polygon = (ring: number[][]): Geometry => ({
  type: "Polygon",
  coordinates: [ring],
});

describe("boundsOfGeometry", () => {
  it("returns [[south, west], [north, east]] from GeoJSON lng/lat order", () => {
    // The ring is in [lng, lat]; the result must come back in [lat, lng].
    expect(
      boundsOfGeometry(
        polygon([
          [37.9, 2.2],
          [38.1, 2.2],
          [38.1, 2.4],
          [37.9, 2.4],
          [37.9, 2.2],
        ]),
      ),
    ).toEqual([
      [2.2, 37.9],
      [2.4, 38.1],
    ]);
  });

  it("handles a point as a zero-area box", () => {
    expect(boundsOfGeometry({ type: "Point", coordinates: [36.8, -1.29] })).toEqual([
      [-1.29, 36.8],
      [-1.29, 36.8],
    ]);
  });

  it("covers every ring of a MultiPolygon, holes included", () => {
    const geometry: Geometry = {
      type: "MultiPolygon",
      coordinates: [
        [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 0],
          ],
        ],
        [
          [
            [10, 10],
            [11, 10],
            [11, 11],
            [10, 10],
          ],
        ],
      ],
    };
    expect(boundsOfGeometry(geometry)).toEqual([
      [0, 0],
      [11, 11],
    ]);
  });

  it("descends into a GeometryCollection", () => {
    expect(
      boundsOfGeometry({
        type: "GeometryCollection",
        geometries: [
          { type: "Point", coordinates: [5, 5] },
          { type: "Point", coordinates: [-5, -5] },
        ],
      }),
    ).toEqual([
      [-5, -5],
      [5, 5],
    ]);
  });

  it("returns null for an empty geometry instead of Infinity bounds", () => {
    expect(boundsOfGeometry({ type: "Polygon", coordinates: [] })).toBeNull();
    expect(boundsOfGeometry({ type: "MultiPoint", coordinates: [] })).toBeNull();
  });

  it("ignores NaN coordinates rather than poisoning the box", () => {
    expect(
      boundsOfGeometry({
        type: "MultiPoint",
        coordinates: [
          [1, 1],
          [Number.NaN, 5],
          [3, 3],
        ],
      }),
    ).toEqual([
      [1, 1],
      [3, 3],
    ]);
  });
});

describe("unionBounds", () => {
  it("covers all inputs", () => {
    const a: BoundsTuple = [
      [1, 1],
      [2, 2],
    ];
    const b: BoundsTuple = [
      [-3, 5],
      [0, 9],
    ];
    expect(unionBounds([a, b])).toEqual([
      [-3, 1],
      [2, 9],
    ]);
  });

  it("skips nulls and returns null when everything is null", () => {
    const a: BoundsTuple = [
      [1, 1],
      [2, 2],
    ];
    expect(unionBounds([null, a, null])).toEqual(a);
    expect(unionBounds([null, null])).toBeNull();
    expect(unionBounds([])).toBeNull();
  });
});

describe("padBounds", () => {
  it("grows a zero-area box to the minimum span, centred on the point", () => {
    const padded = padBounds(
      [
        [2.3, 38.0],
        [2.3, 38.0],
      ],
      0.05,
    );
    expect(padded[1][0] - padded[0][0]).toBeCloseTo(0.05, 10);
    expect(padded[1][1] - padded[0][1]).toBeCloseTo(0.05, 10);
    expect(centerOf(padded)[0]).toBeCloseTo(2.3, 10);
    expect(centerOf(padded)[1]).toBeCloseTo(38.0, 10);
  });

  it("leaves a box already wider than the minimum untouched", () => {
    const wide: BoundsTuple = [
      [0, 0],
      [5, 5],
    ];
    expect(padBounds(wide, 0.05)).toEqual(wide);
  });

  it("pads a box that is wide but not tall on the short axis only", () => {
    const padded = padBounds(
      [
        [2.3, 30],
        [2.3, 40],
      ],
      0.05,
    );
    expect(padded[1][0] - padded[0][0]).toBeCloseTo(0.05, 10);
    expect(padded[0][1]).toBe(30);
    expect(padded[1][1]).toBe(40);
  });

  it("clamps latitude to the Web Mercator range", () => {
    const padded = padBounds(
      [
        [-85, 0],
        [85, 1],
      ],
      10,
    );
    expect(padded[0][0]).toBe(-85);
    expect(padded[1][0]).toBe(85);
  });
});

describe("fitBoundsFor", () => {
  it("pads a clicked point so fitBounds does not slam to max zoom", () => {
    const fitted = fitBoundsFor({ type: "Point", coordinates: [38, 2.3] });
    expect(fitted).not.toBeNull();
    expect((fitted as BoundsTuple)[1][0]).toBeGreaterThan(
      (fitted as BoundsTuple)[0][0],
    );
  });

  it("covers a whole FeatureCollection", () => {
    const fitted = fitBoundsFor({
      type: "FeatureCollection",
      features: [
        { type: "Feature", properties: null, geometry: { type: "Point", coordinates: [0, 0] } },
        { type: "Feature", properties: null, geometry: { type: "Point", coordinates: [10, 10] } },
      ],
    });
    expect(fitted).not.toBeNull();
    expect((fitted as BoundsTuple)[0][0]).toBeLessThanOrEqual(0);
    expect((fitted as BoundsTuple)[1][0]).toBeGreaterThanOrEqual(10);
  });

  it("returns null for a collection with nothing in it", () => {
    expect(fitBoundsFor({ type: "FeatureCollection", features: [] })).toBeNull();
  });
});

describe("areaKm2", () => {
  it("matches the closed-form area of a 1 by 1 degree cell at the equator", () => {
    // Independent check, deliberately not the same formula as the code under
    // test. The exact area of a cell bounded by two parallels and two meridians
    // is R^2 * dLng * (sin lat2 - sin lat1), which needs no line integral.
    const R_KM = 6371.0088;
    const rad = (d: number) => (d * Math.PI) / 180;
    const closedForm =
      R_KM * R_KM * rad(1) * (Math.sin(rad(0.5)) - Math.sin(rad(-0.5)));

    const value = areaKm2(
      polygon([
        [0, -0.5],
        [1, -0.5],
        [1, 0.5],
        [0, 0.5],
        [0, -0.5],
      ]),
    );

    expect(value).not.toBeNull();
    // ~12,364 km2. Agreement to 4 significant figures pins both the formula
    // and the Earth-radius constant.
    expect(value as number).toBeCloseTo(closedForm, 1);
    expect(closedForm).toBeGreaterThan(12360);
    expect(closedForm).toBeLessThan(12370);
  });

  it("shrinks the same box towards the pole", () => {
    const equator = areaKm2(
      polygon([
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
        [0, 0],
      ]),
    ) as number;
    const high = areaKm2(
      polygon([
        [0, 60],
        [1, 60],
        [1, 61],
        [0, 61],
        [0, 60],
      ]),
    ) as number;
    // cos(60) = 0.5, so the high-latitude cell is about half the area.
    expect(high / equator).toBeGreaterThan(0.45);
    expect(high / equator).toBeLessThan(0.55);
  });

  it("is independent of ring winding order", () => {
    const cw = areaKm2(
      polygon([
        [0, 0],
        [0, 1],
        [1, 1],
        [1, 0],
        [0, 0],
      ]),
    );
    const ccw = areaKm2(
      polygon([
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
        [0, 0],
      ]),
    );
    expect(cw).toBeCloseTo(ccw as number, 6);
  });

  it("subtracts holes from the outer ring", () => {
    const solid = areaKm2(
      polygon([
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
        [0, 0],
      ]),
    ) as number;
    const withHole = areaKm2({
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
          [0, 0],
        ],
        [
          [0.25, 0.25],
          [0.75, 0.25],
          [0.75, 0.75],
          [0.25, 0.75],
          [0.25, 0.25],
        ],
      ],
    }) as number;
    // The hole is a quarter of the box by side length, so 1/4 of the area.
    expect(withHole / solid).toBeGreaterThan(0.7);
    expect(withHole / solid).toBeLessThan(0.8);
  });

  it("sums the parts of a MultiPolygon", () => {
    const one = areaKm2(
      polygon([
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
        [0, 0],
      ]),
    ) as number;
    const two = areaKm2({
      type: "MultiPolygon",
      coordinates: [
        [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
            [0, 0],
          ],
        ],
        [
          [
            [10, 0],
            [11, 0],
            [11, 1],
            [10, 1],
            [10, 0],
          ],
        ],
      ],
    }) as number;
    expect(two / one).toBeGreaterThan(1.95);
    expect(two / one).toBeLessThan(2.05);
  });

  it("returns null, not zero, for geometries that have no area", () => {
    expect(areaKm2({ type: "Point", coordinates: [1, 1] })).toBeNull();
    expect(
      areaKm2({
        type: "LineString",
        coordinates: [
          [0, 0],
          [1, 1],
        ],
      }),
    ).toBeNull();
  });

  it("returns 0 for a degenerate ring rather than a negative number", () => {
    expect(
      areaKm2(
        polygon([
          [0, 0],
          [0, 0],
          [0, 0],
        ]),
      ),
    ).toBe(0);
  });
});

describe("formatArea", () => {
  it("says point when there is no area", () => {
    expect(formatArea(null)).toBe("point");
  });

  it("keeps two decimals under a square kilometre", () => {
    expect(formatArea(0.128)).toBe("0.13 km2");
  });

  it("rounds to whole kilometres in the middle range", () => {
    expect(formatArea(487.4)).toBe("487 km2");
  });

  it("groups thousands", () => {
    expect(formatArea(66923.7)).toBe("66,924 km2");
  });
});
