/**
 * Geodesic polygon area, in square kilometres.
 *
 * This exists instead of a @turf/area dependency because it is the only turf
 * function this app needs and turf ships ~500KB into a client bundle for it.
 * The formula is the standard spherical-excess one turf itself uses.
 *
 * Reference: Chamberlain & Duquette, "Some Algorithms for Polygons on a Sphere",
 * NASA/JPL 2007, eq. (2) — the line-integral form
 *
 *   A = R^2/2 * | sum_i (lng_{i+1} - lng_i) * (2 + sin lat_i + sin lat_{i+1}) |
 *
 * Accurate to well under a percent at the scale of an administrative unit,
 * which is the only scale this app reports.
 */

import type { Geometry, Position } from "geojson";

/** IUGG mean Earth radius, metres. Same constant turf uses. */
const EARTH_RADIUS_M = 6371008.8;

const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Signed area of one closed ring, in square metres. */
function ringArea(ring: readonly Position[]): number {
  if (ring.length < 3) return 0;

  let total = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const [lng1, lat1] = ring[i];
    const [lng2, lat2] = ring[(i + 1) % ring.length];
    if (
      !Number.isFinite(lng1) ||
      !Number.isFinite(lat1) ||
      !Number.isFinite(lng2) ||
      !Number.isFinite(lat2)
    ) {
      return 0;
    }
    total +=
      (toRad(lng2) - toRad(lng1)) *
      (2 + Math.sin(toRad(lat1)) + Math.sin(toRad(lat2)));
  }
  return (total * EARTH_RADIUS_M * EARTH_RADIUS_M) / 2;
}

/**
 * Area of a polygon ring set: outer ring minus its holes.
 * Absolute values, so ring winding order does not change the answer.
 */
function polygonArea(rings: readonly Position[][]): number {
  if (rings.length === 0) return 0;
  const outer = Math.abs(ringArea(rings[0]));
  const holes = rings
    .slice(1)
    .reduce((sum, ring) => sum + Math.abs(ringArea(ring)), 0);
  return Math.max(0, outer - holes);
}

/**
 * Area of any geometry in square kilometres.
 *
 * Zero-dimensional and one-dimensional geometries (points, lines) return null
 * rather than 0: "this has no area" and "this has an area of zero" are
 * different facts, and the UI shows a dash for the first and a number for the
 * second.
 */
export function areaKm2(geometry: Geometry): number | null {
  switch (geometry.type) {
    case "Polygon":
      return polygonArea(geometry.coordinates) / 1e6;
    case "MultiPolygon":
      return (
        geometry.coordinates.reduce((sum, poly) => sum + polygonArea(poly), 0) / 1e6
      );
    case "GeometryCollection": {
      const parts = geometry.geometries
        .map(areaKm2)
        .filter((v): v is number => v !== null);
      return parts.length === 0
        ? null
        : parts.reduce((sum, v) => sum + v, 0);
    }
    default:
      return null;
  }
}

/** Human-readable area for the selection list. Null becomes an em-dash-free dash. */
export function formatArea(km2: number | null): string {
  if (km2 === null) return "point";
  if (km2 < 1) return `${Math.round(km2 * 100) / 100} km2`;
  if (km2 < 1000) return `${Math.round(km2)} km2`;
  return `${Math.round(km2).toLocaleString("en-US")} km2`;
}
