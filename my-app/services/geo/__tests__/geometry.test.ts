/**
 * Gate tests for the path parser, the even-odd containment test, and the
 * projection module's own maths on synthetic frames.
 *
 * Synthetic inputs on purpose: the real county data exercises these functions at
 * scale but tells you nothing about the edge cases (a hole, a point on an edge,
 * a malformed path), and those are where a containment test goes wrong.
 */
import { describe, expect, it } from "vitest";

import { geo } from "..";
import { parsePath, pointInRings } from "../geometry";
import { frameScale, lonScale, makeFrame, projectPoint, unprojectPoint } from "../projection";

/** A 10x10 square, counter-clockwise in frame coordinates. */
const SQUARE = "M0 0L10 0L10 10L0 10Z";

describe("parsePath", () => {
  it("parses a single ring", () => {
    expect(parsePath(SQUARE)).toEqual([
      [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
      ],
    ]);
  });

  it("parses a multi-ring path into separate rings", () => {
    const rings = parsePath(`${SQUARE}M2 2L4 2L4 4L2 4Z`);
    expect(rings).toHaveLength(2);
    expect(rings[1]).toEqual([
      [2, 2],
      [4, 2],
      [4, 4],
      [2, 4],
    ]);
  });

  it("parses negative and fractional coordinates", () => {
    expect(parsePath("M-1.5 0.5L2 -3.25L4 4Z")).toEqual([
      [
        [-1.5, 0.5],
        [2, -3.25],
        [4, 4],
      ],
    ]);
  });

  it("rejects anything the build script does not emit", () => {
    // Strict rather than lenient: a path shape this does not recognise means the
    // generated file and this parser have drifted, and that must be loud.
    expect(() => parsePath("")).toThrow(/does not start with M/);
    expect(() => parsePath("L0 0Z")).toThrow(/does not start with M/);
    expect(() => parsePath("M0 0L10Z")).toThrow(/malformed/);
    expect(() => parsePath("M0 0Lx yZ")).toThrow(/non-finite/);
  });

  it("parses every real county path without complaint", () => {
    // Guards the one assumption the strict parser makes: that the generated file
    // only ever contains M/L/Z rings. If the build script's emitter changes
    // shape, this fails before `gridFor` starts returning empty grids.
    for (const area of geo.listAreas()) {
      const rings = parsePath(area.path);
      expect(rings.length, area.name).toBeGreaterThan(0);
      for (const ring of rings) expect(ring.length, area.name).toBeGreaterThanOrEqual(4);
    }
  });
});

describe("pointInRings", () => {
  const square = parsePath(SQUARE);

  it("finds a point inside", () => {
    expect(pointInRings([5, 5], square)).toBe(true);
  });

  it("rejects points outside", () => {
    for (const p of [
      [-1, 5],
      [11, 5],
      [5, -1],
      [5, 11],
    ] as const) {
      expect(pointInRings(p, square), JSON.stringify(p)).toBe(false);
    }
  });

  it("treats an inner ring as a hole, via the even-odd rule", () => {
    // Same rule the SVG is filled with, so containment and painting agree.
    const withHole = parsePath(`${SQUARE}M4 4L6 4L6 6L4 6Z`);
    expect(pointInRings([5, 5], withHole)).toBe(false);
    expect(pointInRings([1, 1], withHole)).toBe(true);
  });

  it("claims a point on a shared edge for exactly one side", () => {
    // Two squares meeting at x = 10. A cell centre landing on the seam must be
    // counted by one of them and not both, or neighbouring counties fight over
    // every boundary cell.
    const left = parsePath(SQUARE);
    const right = parsePath("M10 0L20 0L20 10L10 10Z");
    const onSeam: readonly [number, number] = [10, 5];
    expect([pointInRings(onSeam, left), pointInRings(onSeam, right)].filter(Boolean)).toHaveLength(1);
  });

  it("claims a point on a shared horizontal edge for exactly one side", () => {
    const top = parsePath(SQUARE);
    const bottom = parsePath("M0 10L10 10L10 20L0 20Z");
    const onSeam: readonly [number, number] = [5, 10];
    expect([pointInRings(onSeam, top), pointInRings(onSeam, bottom)].filter(Boolean)).toHaveLength(1);
  });

  it("is unaffected by ring winding order", () => {
    const clockwise = parsePath("M0 0L0 10L10 10L10 0Z");
    expect(pointInRings([5, 5], clockwise)).toBe(true);
  });
});

describe("projection maths", () => {
  it("compresses longitude by cos of the mean latitude", () => {
    expect(lonScale([0, 0, 10, 0])).toBeCloseTo(1, 9);
    expect(lonScale([0, 50, 10, 70])).toBeCloseTo(Math.cos((60 * Math.PI) / 180), 9);
  });

  it("is symmetric about the equator, which is why Kenya barely shifts", () => {
    // Kenya straddles the equator, so its mean latitude is near zero and the
    // correction is small. It still matters for the aspect ratio, and this pins
    // the sign convention.
    expect(lonScale([0, -5, 10, 5])).toBeCloseTo(lonScale([0, -1, 10, 1]), 3);
  });

  it("guards against a zero scale on degenerate bounds", () => {
    // cos(90) is 0, which would make frameScale divide by zero and emit NaN for
    // every coordinate. Cannot happen for Kenya, cheap to rule out.
    expect(lonScale([0, 90, 10, 90])).toBeGreaterThan(0);
    expect(Number.isFinite(frameScale({ width: 100, bounds: [0, 90, 10, 90] }))).toBe(true);
  });

  it("derives the height from the fitted aspect ratio", () => {
    // A 10x10 degree box at the equator is square, so a 200-wide frame is 200
    // tall. Anything else means width and height were chosen independently.
    expect(makeFrame([0, -5, 10, 5], 200).height).toBeCloseTo(200, 0);
    // Twice as tall as wide in degrees stays twice as tall in the frame.
    expect(makeFrame([0, -10, 10, 10], 200).height).toBeCloseTo(400, 0);
  });

  it("maps the bounds corners onto the frame corners", () => {
    const frame = makeFrame([30, -5, 40, 5], 500);
    expect(projectPoint(frame, [30, 5])).toEqual([0, 0]);
    const [x, y] = projectPoint(frame, [40, -5]);
    expect(x).toBeCloseTo(500, 6);
    expect(y).toBeCloseTo(frame.height, 1);
  });

  it("round-trips through the inverse for an arbitrary frame", () => {
    const frame = makeFrame([-20, 35, 5, 60], 640);
    for (const lonLat of [
      [-20, 35],
      [5, 60],
      [-7.5, 47.5],
      [0, 51.5],
    ] as const) {
      const [lon, lat] = unprojectPoint(frame, projectPoint(frame, lonLat));
      expect(lon).toBeCloseTo(lonLat[0], 9);
      expect(lat).toBeCloseTo(lonLat[1], 9);
    }
  });

  it("does not read the frame height, so rounding it cannot move a coordinate", () => {
    // The whole reason `makeFrame` may round the height at all.
    const bounds = [30, -5, 40, 5] as const;
    const frame = makeFrame(bounds, 500);
    const stretched = { ...frame, height: frame.height + 137 };
    expect(projectPoint(stretched, [35, 0])).toEqual(projectPoint(frame, [35, 0]));
  });
});
