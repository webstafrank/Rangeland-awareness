/**
 * Clipping NASA's global imagery to Kenya.
 *
 * GIBS serves the whole planet, and a satellite layer drawn as served paints
 * Somalia, Ethiopia and the Indian Ocean as loudly as Turkana. The explorer is
 * about Kenya, so its NASA layers are cut to the national outline, tile by
 * tile, in the browser.
 *
 * How: a NASA tile URL is wrapped as `kenya-clip://<real url>`. MapLibre hands
 * any URL with a registered scheme to that scheme's handler
 * (components/explore/kenyaClipProtocol.ts) instead of fetching it, after it
 * has already substituted the tile's `{bbox-epsg-3857}`. The handler reads the
 * BBOX back out of the URL and asks `planTile` here what part of Kenya the
 * tile covers: none (answer an empty tile, no network), all (draw NASA's tile
 * untouched), or some (fetch it and mask it to the outline).
 *
 * Everything in this file is pure geometry, so it is proved in node. Only the
 * canvas work lives in the component.
 *
 * Why not a server-side clip: GIBS has no clip parameter, and proxying every
 * NASA tile through the backend to mask it there would put the backend in the
 * path of a layer that works today with the backend down (eval E4).
 */

import { KENYA_OUTLINE, KENYA_OUTLINE_BBOX } from "@/services/geo";

/** The URL scheme MapLibre routes to the clip handler. */
export const CLIP_PROTOCOL = "kenya-clip";

const PREFIX = `${CLIP_PROTOCOL}://`;

/** `https://gibs/...` -> `kenya-clip://https://gibs/...`. Empty stays empty. */
export function clipToKenya(url: string): string {
  if (url === "" || url.startsWith(PREFIX)) return url;
  return `${PREFIX}${url}`;
}

/** The real URL inside a clip URL, or null if it is not one. */
export function unwrapClipUrl(url: string): string | null {
  return url.startsWith(PREFIX) ? url.slice(PREFIX.length) : null;
}

/** `[minX, minY, maxX, maxY]` in EPSG:3857 metres. */
export type MercatorBox = readonly [number, number, number, number];

/**
 * The tile's EPSG:3857 box, read from the BBOX query parameter MapLibre filled
 * in. Null when it is missing or malformed: the handler then refuses the tile
 * rather than guessing where it is.
 */
export function tileBboxFromUrl(url: string): MercatorBox | null {
  let raw: string | null;
  try {
    raw = new URL(url).searchParams.get("BBOX");
  } catch {
    return null;
  }
  if (raw === null) return null;
  const parts = raw.split(",").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  const [minX, minY, maxX, maxY] = parts;
  if (!(maxX > minX && maxY > minY)) return null;
  return [minX, minY, maxX, maxY];
}

const EARTH_RADIUS = 6378137;

/** Spherical Web Mercator, the projection MapLibre's tiles are cut in. */
export function lonLatToMercator(lon: number, lat: number): [number, number] {
  const x = (EARTH_RADIUS * lon * Math.PI) / 180;
  const y = EARTH_RADIUS * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
  return [x, y];
}

export interface ProjectedRing {
  points: readonly (readonly [number, number])[];
  box: MercatorBox;
}

function projectRing(ring: readonly (readonly [number, number])[]): ProjectedRing {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const points = ring.map(([lon, lat]) => {
    const [x, y] = lonLatToMercator(lon, lat);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    return [x, y] as const;
  });
  return { points, box: [minX, minY, maxX, maxY] };
}

/** Projected once, on first use, and shared by every tile after. */
let projectedOutline: readonly ProjectedRing[] | null = null;

function outline(): readonly ProjectedRing[] {
  projectedOutline ??= KENYA_OUTLINE.map(projectRing);
  return projectedOutline;
}

const overlaps = (a: MercatorBox, b: MercatorBox) =>
  a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];

/** Does the segment a-b touch the box? Liang-Barsky, after a cheap reject. */
function segmentHitsBox(
  [ax, ay]: readonly [number, number],
  [bx, by]: readonly [number, number],
  [x0, y0, x1, y1]: MercatorBox,
): boolean {
  if (Math.max(ax, bx) < x0 || Math.min(ax, bx) > x1) return false;
  if (Math.max(ay, by) < y0 || Math.min(ay, by) > y1) return false;
  const dx = bx - ax;
  const dy = by - ay;
  let t0 = 0;
  let t1 = 1;
  const edges: [number, number][] = [
    [-dx, ax - x0],
    [dx, x1 - ax],
    [-dy, ay - y0],
    [dy, y1 - ay],
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return false;
      continue;
    }
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
  }
  return true;
}

/** Even-odd point in polygon over every ring. */
function contains(rings: readonly ProjectedRing[], px: number, py: number): boolean {
  let hit = false;
  for (const { points } of rings) {
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const [xi, yi] = points[i];
      const [xj, yj] = points[j];
      if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) hit = !hit;
    }
  }
  return hit;
}

export type TilePlan =
  /** No part of Kenya is in this tile: answer an empty tile, fetch nothing. */
  | { kind: "outside" }
  /** All of this tile is Kenya: draw it as NASA sent it, no mask. */
  | { kind: "inside" }
  /** The border crosses this tile: keep only what these rings enclose. */
  | { kind: "clip"; rings: readonly ProjectedRing[] };

/**
 * What to do with one tile, decided from its box alone, before any fetch.
 *
 * Testing ring boxes against the tile is not enough: the mainland's box is
 * nearly the whole country's, so the Indian Ocean off Kilifi and the Somali
 * side of the border sit inside it. The question is whether the outline
 * itself crosses the tile. If no edge of it does, the tile is wholly on one
 * side, and its centre says which.
 *
 * Rings whose box misses the tile are left out of the clip: a ring that
 * misses the tile adds nothing inside it, and for the even-odd rule it adds
 * no crossing either.
 */
export function planTile(box: MercatorBox, rings: readonly ProjectedRing[] = outline()): TilePlan {
  const near = rings.filter((ring) => overlaps(ring.box, box));
  if (near.length === 0) return { kind: "outside" };
  const crossed = near.some(({ points }) =>
    points.some((point, i) => i > 0 && segmentHitsBox(points[i - 1], point, box)),
  );
  if (crossed) return { kind: "clip", rings: near };
  const centreInside = contains(near, (box[0] + box[2]) / 2, (box[1] + box[3]) / 2);
  return centreInside ? { kind: "inside" } : { kind: "outside" };
}

/** A ring in the tile's pixel space: x right, y DOWN, origin top-left. */
export type PixelRing = readonly (readonly [number, number])[];

/** A clip plan's rings, in the pixels of the image the server actually sent. */
export function toPixels(
  rings: readonly ProjectedRing[],
  [minX, minY, maxX, maxY]: MercatorBox,
  width: number,
  height: number,
): PixelRing[] {
  const sx = width / (maxX - minX);
  const sy = height / (maxY - minY);
  return rings.map(({ points }) =>
    points.map(([x, y]) => [(x - minX) * sx, (maxY - y) * sy] as const),
  );
}

/** For tests: plan against arbitrary lon/lat rings instead of Kenya's. */
export function projectRings(
  rings: readonly (readonly (readonly [number, number])[])[],
): readonly ProjectedRing[] {
  return rings.map(projectRing);
}

/** Kenya's outline extent, `[west, south, east, north]` in degrees. */
export const KENYA_CLIP_BOUNDS = KENYA_OUTLINE_BBOX;
