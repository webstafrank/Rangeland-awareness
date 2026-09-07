/**
 * Gate tests for the `GeoService` surface: lookup, ordering, the frame, the
 * projection round trip and the overlay grid.
 *
 * Everything here goes through the public `geo` object, because that is what
 * other services are allowed to touch.
 */
import { describe, expect, it, vi } from "vitest";

import { geo } from "..";
import { unprojectPoint } from "../projection";

describe("frame", () => {
  it("has a positive width and height", () => {
    const frame = geo.frame();
    expect(frame.width).toBeGreaterThan(0);
    expect(frame.height).toBeGreaterThan(0);
  });

  it("orders its bounds minLon<maxLon, minLat<maxLat", () => {
    const [minLon, minLat, maxLon, maxLat] = geo.frame().bounds;
    expect(minLon).toBeLessThan(maxLon);
    expect(minLat).toBeLessThan(maxLat);
  });

  it("fits the bounds it claims: the corners land on the frame corners", () => {
    const frame = geo.frame();
    const [minLon, minLat, maxLon, maxLat] = frame.bounds;
    const [x0, y0] = geo.project([minLon, maxLat]);
    const [x1, y1] = geo.project([maxLon, minLat]);
    expect(x0).toBeCloseTo(0, 6);
    expect(y0).toBeCloseTo(0, 6);
    expect(x1).toBeCloseTo(frame.width, 6);
    // Height is rounded to one decimal for a tidy viewBox, so the bottom edge is
    // within that rounding rather than exact.
    expect(y1).toBeCloseTo(frame.height, 1);
  });

  it("preserves the aspect ratio of the corrected bounds", () => {
    const frame = geo.frame();
    const [minLon, minLat, maxLon, maxLat] = frame.bounds;
    const k = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
    // If width and height were chosen independently, this ratio would drift and
    // Kenya would render stretched.
    const geographic = (maxLat - minLat) / ((maxLon - minLon) * k);
    expect(frame.height / frame.width).toBeCloseTo(geographic, 3);
  });

  it("returns the same frame object every call", () => {
    expect(geo.frame()).toBe(geo.frame());
  });
});

describe("project", () => {
  it("round-trips through the inverse", () => {
    const samples: readonly [number, number][] = [
      [33.911819, -4.702209], // south-west corner of the fitted bounds
      [41.906258, 5.430648], // north-east corner
      [36.8219, -1.2921], // Nairobi
      [39.6682, -4.0435], // Mombasa
      [35.6, 3.5], // Turkana
      [40.9, 3.9], // Mandera
      [34.75, -0.1], // Kisumu, near the equator
    ];
    for (const lonLat of samples) {
      const [lon, lat] = unprojectPoint(geo.frame(), geo.project(lonLat));
      expect(lon, `lon of ${JSON.stringify(lonLat)}`).toBeCloseTo(lonLat[0], 9);
      expect(lat, `lat of ${JSON.stringify(lonLat)}`).toBeCloseTo(lonLat[1], 9);
    }
  });

  it("round-trips frame coordinates back to themselves", () => {
    const frame = geo.frame();
    for (const xy of [
      [0, 0],
      [frame.width, frame.height],
      [400, 500],
      [123.4, 987.6],
    ] as const) {
      const [x, y] = geo.project(unprojectPoint(frame, xy));
      expect(x).toBeCloseTo(xy[0], 6);
      expect(y).toBeCloseTo(xy[1], 6);
    }
  });

  it("flips the y axis, so north is up", () => {
    const [, yNorth] = geo.project([37, 4]);
    const [, ySouth] = geo.project([37, -4]);
    expect(yNorth).toBeLessThan(ySouth);
  });

  it("increases x eastward", () => {
    const [xWest] = geo.project([34, 0]);
    const [xEast] = geo.project([41, 0]);
    expect(xWest).toBeLessThan(xEast);
  });

  it("puts a projected centroid where the county is: Mombasa is south-east of Turkana", () => {
    const [mx, my] = geo.project(geo.getArea("mombasa").centroid);
    const [tx, ty] = geo.project(geo.getArea("turkana").centroid);
    expect(mx).toBeGreaterThan(tx);
    expect(my).toBeGreaterThan(ty);
  });
});

describe("lookup", () => {
  it("getArea returns the county", () => {
    expect(geo.getArea("turkana").name).toBe("Turkana");
  });

  it("getArea throws a message naming the missing id", () => {
    expect(() => geo.getArea("atlantis")).toThrow(/atlantis/);
  });

  it("findArea returns undefined for an unknown id", () => {
    expect(geo.findArea("atlantis")).toBeUndefined();
    expect(geo.findArea("")).toBeUndefined();
    expect(geo.findArea("TURKANA")).toBeUndefined();
  });

  it("findArea returns the same object as getArea", () => {
    expect(geo.findArea("nairobi")).toBe(geo.getArea("nairobi"));
  });
});

describe("pickAreas", () => {
  it("preserves the order it is given", () => {
    // Order drives chart series colours, so this is behaviour and not a detail.
    const ids = ["turkana", "mombasa", "baringo"];
    expect(geo.pickAreas(ids).map((a) => a.id)).toEqual(ids);
    const reversed = [...ids].reverse();
    expect(geo.pickAreas(reversed).map((a) => a.id)).toEqual(reversed);
  });

  it("skips unknown ids silently and keeps the rest in order", () => {
    expect(geo.pickAreas(["atlantis", "turkana", "narnia", "wajir"]).map((a) => a.id)).toEqual([
      "turkana",
      "wajir",
    ]);
  });

  it("returns nothing for an empty or all-unknown list", () => {
    expect(geo.pickAreas([])).toEqual([]);
    expect(geo.pickAreas(["atlantis", "narnia"])).toEqual([]);
  });

  it("keeps duplicates, because dropping one would shift every later colour", () => {
    expect(geo.pickAreas(["turkana", "turkana"]).map((a) => a.id)).toEqual(["turkana", "turkana"]);
  });
});

describe("gridFor", () => {
  const constant = () => 1;

  it("returns cells only for the requested areas", () => {
    const areas = geo.pickAreas(["turkana", "mombasa"]);
    const cells = geo.gridFor(areas, 20, constant);
    expect(cells.length).toBeGreaterThan(0);
    for (const cell of cells) {
      expect(["turkana", "mombasa"]).toContain(cell.areaId);
    }
  });

  it("puts every cell centre inside the area it was assigned", () => {
    const areas = geo.pickAreas(["turkana", "garissa", "kisumu"]);
    const cells = geo.gridFor(areas, 15, constant);
    const rings = new Map(areas.map((a) => [a.id, parseRings(a.path)]));
    for (const cell of cells) {
      const centre: readonly [number, number] = [cell.x + cell.size / 2, cell.y + cell.size / 2];
      expect(
        evenOddContains(centre, rings.get(cell.areaId) as number[][][]),
        `${cell.areaId} cell at ${JSON.stringify(centre)}`,
      ).toBe(true);
    }
  });

  it("excludes cells that fall outside the requested areas", () => {
    // Nairobi is a small county wholly inside the national frame, so a grid over
    // it must be far smaller than the grid over its bounding box.
    const nairobi = geo.pickAreas(["nairobi"]);
    const cells = geo.gridFor(nairobi, 4, constant);
    const [west, south, east, north] = nairobi[0].bbox;
    const [left, top] = geo.project([west, north]);
    const [right, bottom] = geo.project([east, south]);
    const boxCells = Math.ceil((right - left) / 4) * Math.ceil((bottom - top) / 4);
    expect(cells.length).toBeGreaterThan(0);
    expect(cells.length).toBeLessThan(boxCells);
  });

  it("is byte-identical across two calls", () => {
    const areas = geo.pickAreas(["kilifi", "tana-river", "lamu"]);
    const a = geo.gridFor(areas, 12, (id, lonLat) => lonLat[0] + lonLat[1] + id.length);
    const b = geo.gridFor(areas, 12, (id, lonLat) => lonLat[0] + lonLat[1] + id.length);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("iterates row-major, so the output order is stable", () => {
    const cells = geo.gridFor(geo.pickAreas(["nakuru"]), 10, constant);
    for (let i = 1; i < cells.length; i++) {
      const prev = cells[i - 1];
      const cur = cells[i];
      expect(cur.y > prev.y || (cur.y === prev.y && cur.x > prev.x)).toBe(true);
    }
  });

  it("yields fewer cells as cellSize grows", () => {
    const areas = geo.pickAreas(["turkana"]);
    const fine = geo.gridFor(areas, 10, constant).length;
    const coarse = geo.gridFor(areas, 25, constant).length;
    expect(fine).toBeGreaterThan(coarse);
    expect(coarse).toBeGreaterThan(0);
  });

  it("calls valueAt once per cell, with that cell's area and its centre in lon/lat", () => {
    const areas = geo.pickAreas(["nairobi"]);
    const valueAt = vi.fn(() => 42);
    const cells = geo.gridFor(areas, 5, valueAt);
    expect(valueAt).toHaveBeenCalledTimes(cells.length);
    for (const [i, cell] of cells.entries()) {
      const [id, lonLat] = valueAt.mock.calls[i] as unknown as [string, [number, number]];
      expect(id).toBe(cell.areaId);
      const [west, south, east, north] = geo.getArea(cell.areaId).bbox;
      expect(lonLat[0]).toBeGreaterThanOrEqual(west);
      expect(lonLat[0]).toBeLessThanOrEqual(east);
      expect(lonLat[1]).toBeGreaterThanOrEqual(south);
      expect(lonLat[1]).toBeLessThanOrEqual(north);
    }
  });

  it("stores what valueAt returned", () => {
    const cells = geo.gridFor(geo.pickAreas(["nairobi"]), 8, () => -3.5);
    expect(cells.length).toBeGreaterThan(0);
    for (const cell of cells) expect(cell.value).toBe(-3.5);
  });

  it("gives every cell the requested size", () => {
    for (const cell of geo.gridFor(geo.pickAreas(["nairobi"]), 6, constant)) {
      expect(cell.size).toBe(6);
    }
  });

  it("snaps cell origins to the cellSize lattice, so the overlay does not shimmer", () => {
    // The same county drawn on its own and inside a wider selection must produce
    // cells at the same coordinates.
    const alone = geo.gridFor(geo.pickAreas(["nairobi"]), 8, constant);
    const together = geo
      .gridFor(geo.pickAreas(["nairobi", "turkana"]), 8, constant)
      .filter((c) => c.areaId === "nairobi");
    expect(together.map((c) => [c.x, c.y])).toEqual(alone.map((c) => [c.x, c.y]));
    for (const cell of alone) {
      expect(cell.x / 8).toBeCloseTo(Math.round(cell.x / 8), 9);
      expect(cell.y / 8).toBeCloseTo(Math.round(cell.y / 8), 9);
    }
  });

  it("returns nothing for no areas, without calling valueAt", () => {
    const valueAt = vi.fn(() => 1);
    expect(geo.gridFor([], 10, valueAt)).toEqual([]);
    expect(valueAt).not.toHaveBeenCalled();
  });

  it("rejects a cellSize that cannot produce a grid", () => {
    const areas = geo.pickAreas(["nairobi"]);
    for (const bad of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => geo.gridFor(areas, bad, constant), `cellSize ${bad}`).toThrow(/cellSize/);
    }
  });

  it("assigns a shared boundary cell to exactly one area", () => {
    // Kenya's counties tile with no gaps, so a grid over two neighbours has cells
    // whose centres sit on the shared edge. Each must be claimed once.
    const cells = geo.gridFor(geo.pickAreas(["kiambu", "nairobi"]), 5, constant);
    const seen = new Set(cells.map((c) => `${c.x},${c.y}`));
    expect(seen.size).toBe(cells.length);
  });
});

/** Independent parser/containment pair, kept out of the service on purpose. */
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
