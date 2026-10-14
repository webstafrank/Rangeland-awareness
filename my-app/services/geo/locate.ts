/**
 * Which county, sub-county and ward a point on the map falls in.
 *
 * The other direction of the by-name picker: the picker turns a typed name
 * into a place on the map, and this turns a click on the map into a name. It
 * reuses the per-county boundary files the picker already loads
 * (services/geo/admin.ts), so a click costs one county file, usually already
 * cached, and no server.
 *
 * Which files to open is decided by each file's own box (ADMIN_FILE_BBOX), not
 * the county's outline: Buret's wards are filed under Kericho but lie inside
 * Bomet's outline, and a box built from the county outline sent those clicks
 * to Bomet's file, which names only the county.
 */

import type { MultiPolygon, Position } from "geojson";

import { ADMIN_BY_ID, type AdminLevel, type AdminUnit } from "./admin";
import {
  ADMIN_FILE_BBOX,
  ADMIN_GEOMETRY_LOADERS,
  type AdminGeometryFile,
} from "./data/admin-geometry.generated";

/**
 * Even-odd ray cast against one ring, in lon/lat.
 *
 * Planar, which is exact enough here: rings are a few kilometres to a few
 * hundred across and the question is only inside or out.
 */
export function pointInRing(lon: number, lat: number, ring: readonly Position[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Inside any polygon of a MultiPolygon. Each polygon's rings are counted
 * together, so a point in a hole (a lake, an enclosed ward) is outside it.
 */
export function pointInMultiPolygon(lon: number, lat: number, geometry: MultiPolygon): boolean {
  return geometry.coordinates.some(
    (polygon) => polygon.filter((ring) => pointInRing(lon, lat, ring)).length % 2 === 1,
  );
}

const LEVEL_RANK: Record<AdminLevel, number> = { ward: 0, subcounty: 1, county: 2 };

/**
 * The most specific unit in one county file that holds the point: a ward if
 * any does, else its sub-county, else the county. Wards and sub-counties are
 * simplified separately, so a point on a shared edge can fall in a hairline
 * gap between wards; the sub-county or county still names it.
 */
export function unitInFile(
  lon: number,
  lat: number,
  file: AdminGeometryFile,
  byId: ReadonlyMap<string, AdminUnit> = ADMIN_BY_ID,
): AdminUnit | null {
  let best: AdminUnit | null = null;
  for (const [id, geometry] of Object.entries(file)) {
    const unit = byId.get(id);
    if (unit === undefined) continue;
    if (best !== null && LEVEL_RANK[unit.level] >= LEVEL_RANK[best.level]) continue;
    if (pointInMultiPolygon(lon, lat, geometry)) best = unit;
  }
  return best;
}

type Box = readonly [number, number, number, number];

/**
 * The county files whose box holds the point: one or two inland, a few on a
 * border. The boxes are built from exactly the shapes the files hold, so no
 * slack is needed.
 */
export function countiesAround(
  lon: number,
  lat: number,
  boxes: Readonly<Record<string, Box>> = ADMIN_FILE_BBOX,
): string[] {
  return Object.entries(boxes)
    .filter(([, [w, s, e, n]]) => lon >= w && lon <= e && lat >= s && lat <= n)
    .map(([id]) => id);
}

/**
 * The most specific unit under a point, or null outside every county (the
 * sea, a neighbouring country, the lakes the counties leave out).
 *
 * Candidate counties are tried in order and the first ward found wins; a
 * sub-county or county is kept only if no candidate has a ward there.
 */
export async function locateAdminUnit(
  lon: number,
  lat: number,
  loaders: Readonly<Record<string, () => Promise<AdminGeometryFile>>> = ADMIN_GEOMETRY_LOADERS,
): Promise<AdminUnit | null> {
  let best: AdminUnit | null = null;
  for (const county of countiesAround(lon, lat)) {
    const load = loaders[county];
    if (load === undefined) continue;
    const found = unitInFile(lon, lat, await load());
    if (found === null) continue;
    if (found.level === "ward") return found;
    if (best === null || LEVEL_RANK[found.level] < LEVEL_RANK[best.level]) best = found;
  }
  return best;
}
