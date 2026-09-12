/**
 * services/geo: Kenya's 47 counties and the map projection.
 *
 * This is the only module allowed to read the boundary data. Everything else
 * imports the `GeoService` surface from `contracts/geo` and takes `Area` values
 * from here, which keeps the id scheme, the projection and the ASAL grouping
 * changeable in one place.
 *
 * The service is a plain object over data baked at build time, so there is no
 * async, no cache to warm and nothing to mock: `listAreas()` is a sorted array
 * that was sorted once at module load. See ./README.md.
 *
 * Contract version: 1 (GEO_CONTRACT_VERSION).
 */
import type { Area, AreaId, GeoService, MapFrame, OverlayCell } from "@/contracts/geo";

import { COUNTIES, MAP_FRAME } from "./data/counties.generated";
import { pointInRings, ringsOfArea } from "./geometry";
import { projectPoint, unprojectPoint } from "./projection";

/**
 * Counties sorted by name, which is the order the picker shows and the order
 * `listAreas()` promises. Sorted once here rather than per call: the array is
 * frozen and handed out as `readonly Area[]`, so callers cannot sort it back.
 *
 * `localeCompare` with an explicit "en" locale rather than the ambient one, so
 * the order does not change with the machine's locale. Every county name is
 * ASCII after the source's own spelling, so this is really just a stable
 * alphabetical sort, but the explicit locale is what makes it stable.
 */
const AREAS_BY_NAME: readonly Area[] = Object.freeze(
  [...COUNTIES].sort((a, b) => a.name.localeCompare(b.name, "en")),
);

/** Id lookup, so `getArea` is O(1) and does not care about the sort order. */
const BY_ID: ReadonlyMap<string, Area> = new Map(COUNTIES.map((area) => [area.id, area]));

/**
 * Union of several areas' bounding boxes, in frame coordinates.
 *
 * Note which corners are projected: a bbox is [minLon, minLat, maxLon, maxLat],
 * but the projection flips Y, so the geographic north-west corner
 * (minLon, maxLat) is the frame's top-left and the south-east corner is the
 * bottom-right. Projecting the bbox corners in their stored order would give a
 * box with a negative height.
 */
function frameBoxOf(areas: readonly Area[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const area of areas) {
    const [west, south, east, north] = area.bbox;
    const [x0, y0] = projectPoint(MAP_FRAME, [west, north]);
    const [x1, y1] = projectPoint(MAP_FRAME, [east, south]);
    if (x0 < minX) minX = x0;
    if (y0 < minY) minY = y0;
    if (x1 > maxX) maxX = x1;
    if (y1 > maxY) maxY = y1;
  }
  return { minX, minY, maxX, maxY };
}

export const geo: GeoService = {
  listAreas(): readonly Area[] {
    return AREAS_BY_NAME;
  },

  getArea(id: AreaId): Area {
    const area = BY_ID.get(id);
    if (area === undefined) {
      // Named loudly, because an unknown id here means a stale URL, a stale
      // saved comparison, or a typo in another service, and all three are much
      // easier to trace with the offending id in the message.
      throw new Error(`geo: no such area "${id}". Use geo.findArea() for ids that may not exist.`);
    }
    return area;
  },

  findArea(id: string): Area | undefined {
    return BY_ID.get(id);
  },

  /**
   * Areas for `ids`, in the order given.
   *
   * The order is load-bearing, not cosmetic: downstream charts assign series
   * colours by position, so re-sorting here would silently recolour a saved
   * comparison. Unknown ids are skipped rather than throwing, because the usual
   * source of one is a hand-edited or outdated URL and dropping it degrades the
   * page instead of breaking it. Duplicates in `ids` are kept, since the caller
   * asked for them and de-duplicating would shift every later colour.
   */
  pickAreas(ids: readonly string[]): readonly Area[] {
    const picked: Area[] = [];
    for (const id of ids) {
      const area = BY_ID.get(id);
      if (area !== undefined) picked.push(area);
    }
    return picked;
  },

  frame(): MapFrame {
    return MAP_FRAME;
  },

  project(lonLat: readonly [number, number]): readonly [number, number] {
    return projectPoint(MAP_FRAME, lonLat);
  },

  /**
   * A grid of overlay cells covering `areas`.
   *
   * The grid is laid out in frame coordinates, not geographic ones, so cells are
   * square on screen and tile without seams at any zoom. Cell origins are
   * snapped to multiples of `cellSize`, which means two different area
   * selections produce cells on the same lattice: switching counties in the
   * picker slides the overlay instead of making it shimmer.
   *
   * Iteration is row-major over integer row/column counters rather than by
   * adding `cellSize` to a running float, because repeated addition accumulates
   * error and would make the output depend on how far from the origin the grid
   * starts. That, plus first-match-wins area assignment in the caller's own
   * order, is what makes the result byte-identical across runs.
   *
   * A cell belongs to an area when its CENTRE is inside that area. Testing the
   * centre rather than any overlap is what keeps counties from claiming each
   * other's edge cells: Kenya's counties tile with no gaps, so every boundary
   * cell overlaps two of them and only one point can settle it.
   */
  gridFor(
    areas: readonly Area[],
    cellSize: number,
    valueAt: (areaId: AreaId, lonLat: readonly [number, number]) => number,
  ): readonly OverlayCell[] {
    if (!Number.isFinite(cellSize) || cellSize <= 0) {
      throw new Error(`geo: gridFor needs a positive finite cellSize, got ${cellSize}`);
    }
    if (areas.length === 0) return [];

    const box = frameBoxOf(areas);
    // Snap the origin down to the lattice so the grid does not move with the
    // selection. `floor` and not `round`: the first cell must start at or before
    // the bounding box, or the top and left edges lose their cells.
    const x0 = Math.floor(box.minX / cellSize) * cellSize;
    const y0 = Math.floor(box.minY / cellSize) * cellSize;
    const cols = Math.ceil((box.maxX - x0) / cellSize);
    const rows = Math.ceil((box.maxY - y0) / cellSize);

    // Parsed once per area rather than once per cell: a 20-unit grid over Kenya
    // is a few thousand cells and each one would otherwise re-parse a path of up
    // to a thousand points.
    const rings = areas.map((area) => ringsOfArea(area));
    const half = cellSize / 2;
    const cells: OverlayCell[] = [];

    for (let row = 0; row < rows; row++) {
      const y = y0 + row * cellSize;
      for (let col = 0; col < cols; col++) {
        const x = x0 + col * cellSize;
        const centre: readonly [number, number] = [x + half, y + half];
        for (let i = 0; i < areas.length; i++) {
          if (!pointInRings(centre, rings[i])) continue;
          const areaId = areas[i].id;
          cells.push({
            x,
            y,
            size: cellSize,
            value: valueAt(areaId, unprojectPoint(MAP_FRAME, centre)),
            areaId,
          });
          // First match wins, in the caller's order, so a cell that two areas
          // could claim (a shared vertex) resolves deterministically.
          break;
        }
      }
    }
    return cells;
  },
};

export default geo;

/**
 * Re-exported for the map component, which needs the frame to write a viewBox
 * before it has any area selected. Same object `geo.frame()` returns.
 */
export { MAP_FRAME } from "./data/counties.generated";
