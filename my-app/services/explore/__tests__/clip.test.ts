import { describe, expect, it } from "vitest";
import {
  KENYA_CLIP_BOUNDS,
  clipToKenya,
  lonLatToMercator,
  planTile,
  projectRings,
  tileBboxFromUrl,
  toPixels,
  unwrapClipUrl,
  type MercatorBox,
  type PixelRing,
} from "@/services/explore";

const GIBS = "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&LAYERS=x";

/** The EPSG:3857 box of a lon/lat box, the way MapLibre writes BBOX. */
function boxOf(west: number, south: number, east: number, north: number): MercatorBox {
  const [minX, minY] = lonLatToMercator(west, south);
  const [maxX, maxY] = lonLatToMercator(east, north);
  return [minX, minY, maxX, maxY];
}

/** Even-odd ray cast, the same fill rule the canvas clip uses. */
function inside(rings: readonly PixelRing[], [px, py]: readonly [number, number]): boolean {
  let hit = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) hit = !hit;
    }
  }
  return hit;
}

/** Where a lon/lat lands in a 256px tile cut from `box`. */
function pixelOf(box: MercatorBox, lon: number, lat: number): [number, number] {
  const [x, y] = lonLatToMercator(lon, lat);
  return [((x - box[0]) / (box[2] - box[0])) * 256, ((box[3] - y) / (box[3] - box[1])) * 256];
}

/** Is this lon/lat drawn, for the tile `box`, by the plan as the handler runs it? */
function kept(box: MercatorBox, lon: number, lat: number): boolean {
  const plan = planTile(box);
  if (plan.kind === "outside") return false;
  if (plan.kind === "inside") return true;
  return inside(toPixels(plan.rings, box, 256, 256), pixelOf(box, lon, lat));
}

const square = projectRings([
  [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
    [0, 0],
  ],
]);

describe("clip URLs", () => {
  it("wraps a tile URL in the kenya-clip scheme and unwraps it unchanged", () => {
    const template = `${GIBS}&BBOX={bbox-epsg-3857}`;
    const wrapped = clipToKenya(template);
    expect(wrapped).toBe(`kenya-clip://${template}`);
    expect(unwrapClipUrl(wrapped)).toBe(template);
  });

  it("does not wrap twice, and leaves an empty URL (an unavailable layer) empty", () => {
    expect(clipToKenya(clipToKenya(GIBS))).toBe(`kenya-clip://${GIBS}`);
    expect(clipToKenya("")).toBe("");
  });

  it("refuses to unwrap a URL that is not a clip URL", () => {
    expect(unwrapClipUrl(GIBS)).toBeNull();
  });
});

describe("tileBboxFromUrl", () => {
  it("reads the box MapLibre substituted", () => {
    expect(tileBboxFromUrl(`${GIBS}&BBOX=1,2,3,4.5`)).toEqual([1, 2, 3, 4.5]);
  });

  it.each([
    ["no BBOX", GIBS],
    ["the unfilled placeholder", `${GIBS}&BBOX={bbox-epsg-3857}`],
    ["three numbers", `${GIBS}&BBOX=1,2,3`],
    ["a word", `${GIBS}&BBOX=1,2,east,4`],
    ["an inverted box", `${GIBS}&BBOX=3,2,1,4`],
    ["an empty box", `${GIBS}&BBOX=1,2,1,4`],
    ["not a URL", "gibs tile"],
  ])("is null for %s", (_, url) => {
    expect(tileBboxFromUrl(url)).toBeNull();
  });
});

describe("lonLatToMercator", () => {
  it("matches EPSG:3857 at the origin, the antimeridian and the projection's edge", () => {
    const [x0, y0] = lonLatToMercator(0, 0);
    expect(x0).toBe(0);
    expect(y0).toBeCloseTo(0, 6);
    expect(lonLatToMercator(180, 0)[0]).toBeCloseTo(20037508.34, 1);
    expect(lonLatToMercator(0, 85.0511287798)[1]).toBeCloseTo(20037508.34, 0);
  });
});

describe("planTile, on a unit square", () => {
  it("is inside for a tile the square wholly contains", () => {
    expect(planTile(boxOf(0.4, 0.4, 0.6, 0.6), square).kind).toBe("inside");
  });

  it("is outside for a tile within the square's box reach but past its edge", () => {
    expect(planTile(boxOf(1.1, 0.4, 1.3, 0.6), square).kind).toBe("outside");
  });

  it("clips a tile the edge crosses, and a tile that wholly contains the square", () => {
    expect(planTile(boxOf(0.9, 0.4, 1.1, 0.6), square).kind).toBe("clip");
    expect(planTile(boxOf(-1, -1, 2, 2), square).kind).toBe("clip");
  });

  it("clips a tile only a corner of the square pokes into", () => {
    expect(planTile(boxOf(0.95, 0.95, 1.5, 1.5), square).kind).toBe("clip");
  });

  it("drops rings whose box misses the tile", () => {
    const two = projectRings([
      [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 0],
      ],
      [
        [10, 10],
        [11, 10],
        [11, 11],
        [10, 10],
      ],
    ]);
    const plan = planTile(boxOf(0.5, -0.5, 1.5, 0.5), two);
    expect(plan.kind === "clip" && plan.rings.length).toBe(1);
  });
});

describe("toPixels", () => {
  it("puts a ring's corners on the tile's corners, y pointing down", () => {
    const [ring] = toPixels(square, boxOf(0, 0, 1, 1), 256, 256);
    // South-west is bottom-left, north-east is top-right.
    expect(ring[0][0]).toBeCloseTo(0, 6);
    expect(ring[0][1]).toBeCloseTo(256, 6);
    expect(ring[2][0]).toBeCloseTo(256, 6);
    expect(ring[2][1]).toBeCloseTo(0, 6);
  });

  it("scales to the image NASA actually sent, not to a fixed 256", () => {
    const [ring] = toPixels(square, boxOf(0, 0, 1, 1), 512, 512);
    expect(ring[2][0]).toBeCloseTo(512, 6);
  });
});

describe("planTile against Kenya", () => {
  it.each([
    ["Mogadishu", [45, 1.5, 46.5, 3]],
    ["Kampala", [32.3, 0.1, 32.8, 0.6]],
    ["the Pacific", [-170, -60, -100, -10]],
  ] as const)("fetches nothing for %s, beyond Kenya's extent", (_, [w, s, e, n]) => {
    expect(planTile(boxOf(w, s, e, n)).kind).toBe("outside");
  });

  // These sit INSIDE Kenya's bounding box, so MapLibre's source `bounds` still
  // asks for them; only the outline test keeps them off the network.
  it.each([
    ["the Indian Ocean off Kilifi", [41.3, -4.3, 41.8, -3.8]],
    ["Somalia west of Kismayo", [41.3, 0.5, 41.8, 1.5]],
    ["Ethiopia south of the Omo", [36.6, 4.9, 37.4, 5.4]],
    ["Tanzania by Kilimanjaro", [36.8, -3.6, 37.4, -3.2]],
  ] as const)("fetches nothing for %s, within Kenya's box", (_, [w, s, e, n]) => {
    expect(planTile(boxOf(w, s, e, n)).kind).toBe("outside");
  });

  it("draws a tile wholly inside the country without a mask: central Nairobi", () => {
    expect(planTile(boxOf(36.7, -1.4, 36.95, -1.15)).kind).toBe("inside");
  });

  it("cuts a tile across the Somali border, keeping only the Kenyan side", () => {
    // Liboi, on the border near 41E. Garissa side kept, Somali side dropped.
    const box = boxOf(40.5, -0.5, 41.5, 0.5);
    expect(planTile(box).kind).toBe("clip");
    expect(kept(box, 40.6, 0.0)).toBe(true);
    expect(kept(box, 41.4, 0.0)).toBe(false);
  });

  it("cuts a tile across the Ugandan border at Busia", () => {
    const box = boxOf(33.8, 0.2, 34.4, 0.8);
    expect(planTile(box).kind).toBe("clip");
    expect(kept(box, 34.2, 0.55)).toBe(true);
    expect(kept(box, 33.9, 0.55)).toBe(false);
  });

  it("keeps the islands: Lamu", () => {
    const box = boxOf(40.8, -2.4, 41.0, -2.2);
    expect(kept(box, 40.9, -2.28)).toBe(true);
  });

  it("exposes the outline's extent as the layer bounds", () => {
    const [west, south, east, north] = KENYA_CLIP_BOUNDS;
    expect(west).toBeCloseTo(33.91, 1);
    expect(south).toBeCloseTo(-4.7, 1);
    expect(east).toBeCloseTo(41.91, 1);
    expect(north).toBeCloseTo(5.43, 1);
  });
});
