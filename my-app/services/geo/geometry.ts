/**
 * Geometry helpers for the baked county paths.
 *
 * The generated data ships boundaries only as SVG path strings, and that is on
 * purpose: it is the one representation the browser can draw without any work,
 * and keeping a second copy of the same rings as coordinate arrays would double
 * the payload and create a pair of things that can disagree. So when the service
 * needs real geometry (which is only `gridFor`, for its point-in-polygon test),
 * it parses the path back rather than reading a duplicate.
 *
 * Everything here works in frame coordinates, never in lon/lat, because that is
 * what the paths contain.
 */
import type { Area } from "@/contracts/geo";

/** A closed ring in frame coordinates. The closing point is implicit. */
export type Ring = readonly (readonly [number, number])[];

/**
 * Parses a baked path string into its rings.
 *
 * Deliberately strict rather than a general SVG path parser. The only producer
 * is `scripts/build-counties.mjs`, which emits exactly `M x y L x y ... Z` per
 * ring with no other commands, so anything else here means the generated file
 * and this parser have drifted apart. A strict parser turns that into a thrown
 * error at the first grid render; a lenient one turns it into a grid that is
 * quietly missing cells.
 *
 * @throws if the path is not the shape the build script emits.
 */
export function parsePath(path: string): readonly Ring[] {
  if (!path.startsWith("M")) throw new Error(`geo: path does not start with M: ${path.slice(0, 24)}`);
  const rings: Ring[] = [];
  // Split on the ring starts, dropping the empty leading piece.
  for (const chunk of path.split("M")) {
    if (chunk === "") continue;
    const body = chunk.endsWith("Z") ? chunk.slice(0, -1) : chunk;
    const points: [number, number][] = [];
    for (const pair of body.split("L")) {
      const space = pair.indexOf(" ");
      if (space === -1) throw new Error(`geo: malformed path coordinate pair: "${pair}"`);
      const x = Number(pair.slice(0, space));
      const y = Number(pair.slice(space + 1));
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        throw new Error(`geo: non-finite path coordinate pair: "${pair}"`);
      }
      points.push([x, y]);
    }
    rings.push(points);
  }
  if (rings.length === 0) throw new Error("geo: path contained no rings");
  return rings;
}

/**
 * Ray-cast point-in-polygon over a set of rings, using the even-odd rule.
 *
 * Even-odd (rather than counting only outer rings) is what makes holes work
 * without having to know which ring is a hole: a point inside an outer ring and
 * also inside an inner ring crosses an even number of edges and comes out false.
 * The same rule is what the SVG is drawn with (`fill-rule="evenodd"`), so what
 * the test says is inside a county is exactly what is painted as that county.
 *
 * The `yi > y !== yj > y` form counts each edge on a half-open interval, which
 * is what stops a cell centre that sits exactly on a shared boundary from being
 * counted twice (once for each neighbouring edge) and flipping back to outside.
 * Kenya's counties tile without gaps, so cell centres land on shared edges
 * regularly, not rarely.
 */
export function pointInRings(point: readonly [number, number], rings: readonly Ring[]): boolean {
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

/**
 * Parsed rings for an area, memoised by path string.
 *
 * Keyed by the path rather than by the area id so a caller that hands in an
 * `Area` it built itself (a test fixture, say) cannot get another area's rings
 * back. Bounded in practice by the 47 generated paths.
 */
const ringCache = new Map<string, readonly Ring[]>();

export function ringsOfArea(area: Area): readonly Ring[] {
  const cached = ringCache.get(area.path);
  if (cached !== undefined) return cached;
  const rings = parsePath(area.path);
  ringCache.set(area.path, rings);
  return rings;
}
