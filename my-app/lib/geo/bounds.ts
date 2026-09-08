/**
 * Bounds math. Pure, no Leaflet import, so it is testable in the node gate lane
 * and the map component stays a thin adapter over it.
 *
 * Convention: a BoundsTuple is [[south, west], [north, east]] — the same shape
 * Leaflet's fitBounds accepts, in [lat, lng] order. GeoJSON is [lng, lat], and
 * that flip is the single most common bug in this kind of code, so it happens
 * in exactly one place: boundsOfGeometry.
 */

import type { Feature, FeatureCollection, Geometry, Position } from "geojson";

export type BoundsTuple = [[number, number], [number, number]];

export interface BoundsAccumulator {
  south: number;
  west: number;
  north: number;
  east: number;
}

/** Walk every coordinate in any geometry type, including nested collections. */
function eachPosition(geometry: Geometry, visit: (p: Position) => void): void {
  switch (geometry.type) {
    case "Point":
      visit(geometry.coordinates);
      return;
    case "MultiPoint":
    case "LineString":
      geometry.coordinates.forEach(visit);
      return;
    case "MultiLineString":
    case "Polygon":
      geometry.coordinates.forEach((ring) => ring.forEach(visit));
      return;
    case "MultiPolygon":
      geometry.coordinates.forEach((poly) =>
        poly.forEach((ring) => ring.forEach(visit)),
      );
      return;
    case "GeometryCollection":
      geometry.geometries.forEach((g) => eachPosition(g, visit));
      return;
  }
}

/**
 * Bounds of a geometry, or null if it carries no usable coordinate.
 *
 * Returns null rather than throwing because empty geometries are a legitimate
 * thing to find inside a user-supplied shapefile, and the caller (the upload
 * path) needs to skip them, not blow up.
 */
export function boundsOfGeometry(geometry: Geometry): BoundsTuple | null {
  let south = Infinity;
  let west = Infinity;
  let north = -Infinity;
  let east = -Infinity;

  eachPosition(geometry, ([lng, lat]) => {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    if (lat < south) south = lat;
    if (lat > north) north = lat;
    if (lng < west) west = lng;
    if (lng > east) east = lng;
  });

  if (!Number.isFinite(south) || !Number.isFinite(west)) return null;
  return [
    [south, west],
    [north, east],
  ];
}

/** Bounds covering a set of already-computed bounds. Null if the list is empty. */
export function unionBounds(
  all: readonly (BoundsTuple | null)[],
): BoundsTuple | null {
  const usable = all.filter((b): b is BoundsTuple => b !== null);
  if (usable.length === 0) return null;

  return usable.reduce<BoundsTuple>(
    (acc, [[s, w], [n, e]]) => [
      [Math.min(acc[0][0], s), Math.min(acc[0][1], w)],
      [Math.max(acc[1][0], n), Math.max(acc[1][1], e)],
    ],
    usable[0],
  );
}

/**
 * Grow degenerate bounds into something fitBounds can zoom to.
 *
 * A clicked point, or a polygon thinner than a few metres, produces bounds
 * where south === north. Leaflet's fitBounds on a zero-area box jumps to max
 * zoom, which is a disorienting 20-level slam. Padding the box to a minimum
 * span turns that into a sensible neighbourhood-level view.
 *
 * `minSpanDeg` of 0.05 is roughly 5.5 km of latitude, chosen so a clicked point
 * lands at about zoom 11 on a 800px-tall map: close enough to read the place,
 * wide enough to keep context.
 */
export function padBounds(
  bounds: BoundsTuple,
  minSpanDeg = 0.05,
): BoundsTuple {
  const [[south, west], [north, east]] = bounds;

  const latSpan = north - south;
  const lngSpan = east - west;
  const latGrow = Math.max(0, minSpanDeg - latSpan) / 2;
  const lngGrow = Math.max(0, minSpanDeg - lngSpan) / 2;

  // Latitude clamps to the Web Mercator usable range; longitude is left
  // unclamped so a box spanning the antimeridian is not silently mangled here.
  return [
    [Math.max(-85, south - latGrow), west - lngGrow],
    [Math.min(85, north + latGrow), east + lngGrow],
  ];
}

/** Bounds of a Feature or FeatureCollection, padded and ready for fitBounds. */
export function fitBoundsFor(
  input: Feature | FeatureCollection | Geometry,
  minSpanDeg?: number,
): BoundsTuple | null {
  let raw: BoundsTuple | null;

  if (input.type === "FeatureCollection") {
    raw = unionBounds(
      input.features.map((f) => (f.geometry ? boundsOfGeometry(f.geometry) : null)),
    );
  } else if (input.type === "Feature") {
    raw = input.geometry ? boundsOfGeometry(input.geometry) : null;
  } else {
    raw = boundsOfGeometry(input);
  }

  return raw === null ? null : padBounds(raw, minSpanDeg);
}

/** Centre of a bounds box, in [lat, lng]. */
export function centerOf(bounds: BoundsTuple): [number, number] {
  const [[south, west], [north, east]] = bounds;
  return [(south + north) / 2, (west + east) / 2];
}
