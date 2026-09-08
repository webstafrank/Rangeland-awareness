/**
 * Build an area from typed coordinates.
 *
 * This is the keyboard path to a real polygon. Without it the only ways to
 * select an area are the map (pointer only) and a shapefile (needs a file), so
 * an analyst reading coordinates off a radio call or a field report has no way
 * in, and rubric T11 is unmet.
 *
 * Pure, so it is gate-tested in node with the rest of lib/geo.
 */

import type { Geometry } from "geojson";

/** Kenya's extent, used only to warn, never to block. */
const KENYA = { south: -4.9, west: 33.8, north: 5.6, east: 42.1 };

export interface ParsedCoordinate {
  lat: number;
  lng: number;
}

/**
 * Parse a coordinate a human typed or pasted.
 *
 * Accepts what coordinates actually arrive as: "2.4512, 36.8203",
 * "2.4512 36.8203", "-1.29/36.82", and the same with degree symbols or
 * N/S/E/W suffixes. Latitude first, which is the convention every report and
 * radio call uses, and the opposite of GeoJSON.
 */
export function parseCoordinatePair(input: string): ParsedCoordinate | null {
  const cleaned = input
    .trim()
    .replace(/[°]/g, " ")
    .replace(/[,;/]+/g, " ")
    .replace(/\s+/g, " ");
  if (cleaned === "") return null;

  // Capture a number with an optional hemisphere letter on either side.
  const token = /([NSEW])?\s*(-?\d+(?:\.\d+)?)\s*([NSEW])?/gi;
  const found: { value: number; hemisphere: string | null }[] = [];

  for (const match of cleaned.matchAll(token)) {
    const hemisphere = (match[1] ?? match[3] ?? "").toUpperCase() || null;
    found.push({ value: Number(match[2]), hemisphere });
    if (found.length === 2) break;
  }

  if (found.length !== 2) return null;
  if (found.some((f) => !Number.isFinite(f.value))) return null;

  // A hemisphere letter decides which number is which, so "36.82E, 2.45N"
  // parses correctly even though it is written longitude first.
  const byHemisphere = (letters: string) =>
    found.find((f) => f.hemisphere !== null && letters.includes(f.hemisphere));

  const latToken = byHemisphere("NS");
  const lngToken = byHemisphere("EW");

  let lat: number;
  let lng: number;

  if (latToken && lngToken) {
    lat = Math.abs(latToken.value) * (latToken.hemisphere === "S" ? -1 : 1);
    lng = Math.abs(lngToken.value) * (lngToken.hemisphere === "W" ? -1 : 1);
  } else {
    // No letters: latitude first, the reporting convention.
    lat = found[0].value;
    lng = found[1].value;
  }

  if (lat < -90 || lat > 90) return null;
  if (lng < -180 || lng > 180) return null;

  return { lat, lng };
}

/** True when a coordinate is outside Kenya. A warning, not a rejection. */
export function isOutsideKenya({ lat, lng }: ParsedCoordinate): boolean {
  return (
    lat < KENYA.south || lat > KENYA.north || lng < KENYA.west || lng > KENYA.east
  );
}

/** Metres per degree of latitude. Constant enough at this scale. */
const M_PER_DEG_LAT = 111_320;

/**
 * A square polygon of the given radius around a point, or a Point when the
 * radius is zero.
 *
 * "Radius" means half-width, so radius 10 gives a 20km by 20km box. Longitude
 * degrees shrink with latitude, so the east-west span is divided by
 * cos(latitude); without that the box would be visibly taller than wide in
 * northern Kenya and badly wrong at high latitudes.
 */
export function boxAroundPoint(
  { lat, lng }: ParsedCoordinate,
  radiusKm: number,
): Geometry {
  if (!(radiusKm > 0)) {
    return { type: "Point", coordinates: [lng, lat] };
  }

  const dLat = (radiusKm * 1000) / M_PER_DEG_LAT;
  // Clamped so a coordinate at the pole cannot divide by zero.
  const cosLat = Math.max(0.01, Math.cos((lat * Math.PI) / 180));
  const dLng = (radiusKm * 1000) / (M_PER_DEG_LAT * cosLat);

  const south = Math.max(-90, lat - dLat);
  const north = Math.min(90, lat + dLat);
  const west = lng - dLng;
  const east = lng + dLng;

  return {
    type: "Polygon",
    coordinates: [
      [
        [west, south],
        [east, south],
        [east, north],
        [west, north],
        [west, south],
      ],
    ],
  };
}

/** How a typed area is labelled in the selection list. */
export function labelForCoordinate(
  { lat, lng }: ParsedCoordinate,
  radiusKm: number,
): string {
  const ns = `${Math.abs(lat).toFixed(4)}${lat >= 0 ? "N" : "S"}`;
  const ew = `${Math.abs(lng).toFixed(4)}${lng >= 0 ? "E" : "W"}`;
  return radiusKm > 0 ? `${ns} ${ew} +${radiusKm}km` : `${ns} ${ew}`;
}
