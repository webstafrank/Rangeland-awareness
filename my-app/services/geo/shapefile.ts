/**
 * Shapefile ingestion. Runs entirely in the browser: nothing is uploaded to a
 * server, which is why there is no route handler for this.
 *
 * shpjs does the binary parsing and, when a .prj is present, reprojects to
 * WGS84 through proj4. Everything else here is our problem: a shapefile is a
 * multi-file format arriving as a user-chosen file, so most of this module is
 * the failure paths (rubric T9), not the happy one.
 */

import shp, { parseShp } from "shpjs";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import { draftAreaFromGeometry, type DraftArea } from "@/services/analysis/selection";
import { ZipStructureError, auditShapefileZip } from "@/services/geo/zip";

/** A failure the user can act on. The message is shown verbatim in the UI. */
export class ShapefileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ShapefileError";
  }
}

export interface ShapefileResult {
  areas: DraftArea[];
  /** Non-fatal notes: skipped empty geometries, dropped non-area features. */
  warnings: string[];
}

/** Bytes we are willing to parse on the main thread before saying no. */
export const MAX_SHAPEFILE_BYTES = 64 * 1024 * 1024;

const AREA_TYPES = new Set<Geometry["type"]>([
  "Polygon",
  "MultiPolygon",
  "GeometryCollection",
]);

/**
 * Property keys that commonly hold a human name, in the order we trust them.
 * Matched case-insensitively, so NAME_1, name_1 and Name_1 all hit.
 */
const NAME_KEYS = [
  "name",
  "name_en",
  "admin",
  "admin2",
  "adm2_en",
  "adm1_en",
  "county",
  "district",
  "ward",
  "subcounty",
  "sub_county",
  "region",
  "label",
  "title",
  "id",
];

/** Pull the best available label out of a feature's attribute table. */
export function labelFromProperties(
  properties: Feature["properties"],
  fallback: string,
): string {
  if (!properties) return fallback;

  const lowered = new Map<string, unknown>();
  for (const [key, value] of Object.entries(properties)) {
    lowered.set(key.toLowerCase(), value);
  }

  for (const key of NAME_KEYS) {
    const value = lowered.get(key);
    if (typeof value === "string" && value.trim() !== "") return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }

  // Some name_1 / NAME_2 style columns are not in the list above; take the
  // first string column whose key starts with a known prefix.
  for (const [key, value] of lowered) {
    if (
      NAME_KEYS.some((k) => key.startsWith(k)) &&
      typeof value === "string" &&
      value.trim() !== ""
    ) {
      return value.trim();
    }
  }

  return fallback;
}

/**
 * True when a coordinate pair is plausible WGS84.
 *
 * A shapefile in UTM with no .prj sibling parses fine and yields coordinates in
 * metres, which render as a dot near null island and look like a bug in the
 * map rather than a bug in the input. Catching it here turns a mystery into a
 * sentence.
 */
function looksLikeDegrees(geometry: Geometry): boolean {
  const bounds = boundsCheck(geometry);
  if (bounds === null) return true; // nothing to judge; other checks handle it
  const [minLat, minLng, maxLat, maxLng] = bounds;
  return (
    minLat >= -90 && maxLat <= 90 && minLng >= -180 && maxLng <= 180
  );
}

/** [minLat, minLng, maxLat, maxLng] or null. Local to the degrees check. */
function boundsCheck(
  geometry: Geometry,
): [number, number, number, number] | null {
  let minLat = Infinity;
  let minLng = Infinity;
  let maxLat = -Infinity;
  let maxLng = -Infinity;

  const visit = (position: number[]) => {
    const [lng, lat] = position;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
  };

  const walk = (g: Geometry) => {
    switch (g.type) {
      case "Point":
        visit(g.coordinates);
        break;
      case "MultiPoint":
      case "LineString":
        g.coordinates.forEach(visit);
        break;
      case "MultiLineString":
      case "Polygon":
        g.coordinates.forEach((r) => r.forEach(visit));
        break;
      case "MultiPolygon":
        g.coordinates.forEach((p) => p.forEach((r) => r.forEach(visit)));
        break;
      case "GeometryCollection":
        g.geometries.forEach(walk);
        break;
    }
  };

  walk(geometry);
  return Number.isFinite(minLat) ? [minLat, minLng, maxLat, maxLng] : null;
}

/**
 * Turn whatever shpjs returned into DraftAreas.
 *
 * Exported separately from readShapefile so the gate tests can exercise the
 * normalization rules on plain GeoJSON without going through a File.
 */
export function normalizeCollections(
  collections: readonly (FeatureCollection & { fileName?: string })[],
): ShapefileResult {
  const areas: DraftArea[] = [];
  const warnings: string[] = [];
  let skippedEmpty = 0;
  let skippedNonArea = 0;
  let skippedProjected = 0;

  for (const collection of collections) {
    const layer = collection.fileName?.replace(/\.shp$/i, "") ?? "shapefile";
    const features = collection.features ?? [];

    features.forEach((feature, index) => {
      const geometry = feature.geometry;
      if (!geometry) {
        skippedEmpty += 1;
        return;
      }
      if (!AREA_TYPES.has(geometry.type)) {
        skippedNonArea += 1;
        return;
      }
      if (!looksLikeDegrees(geometry)) {
        skippedProjected += 1;
        return;
      }

      const label = labelFromProperties(
        feature.properties,
        features.length === 1 ? layer : `${layer} ${index + 1}`,
      );

      const draft = draftAreaFromGeometry(
        geometry,
        "shapefile",
        label,
        feature.properties,
      );
      if (draft === null) {
        skippedEmpty += 1;
        return;
      }
      areas.push(draft);
    });
  }

  if (skippedNonArea > 0) {
    warnings.push(
      `Skipped ${skippedNonArea} point or line feature(s): an area of interest ` +
        `needs a polygon.`,
    );
  }
  if (skippedEmpty > 0) {
    warnings.push(`Skipped ${skippedEmpty} feature(s) with no usable geometry.`);
  }
  if (skippedProjected > 0) {
    warnings.push(
      `Skipped ${skippedProjected} feature(s) whose coordinates are not ` +
        `latitude and longitude. Include the .prj file so the projection can ` +
        `be read, or reproject to EPSG:4326 first.`,
    );
  }

  if (areas.length === 0) {
    throw new ShapefileError(
      warnings.length > 0
        ? `No usable areas found. ${warnings.join(" ")}`
        : `No usable areas found in this shapefile.`,
    );
  }

  return { areas, warnings };
}

/** Accepted upload extensions, for the file input and the error message. */
export const ACCEPTED_EXTENSIONS = [".zip", ".shp"] as const;

/**
 * Read a user-selected shapefile into DraftAreas.
 *
 * Throws ShapefileError with a readable message for every rejection path. The
 * caller shows `error.message` and keeps its existing selection: a bad upload
 * never clears prior work (rubric T9).
 */
export async function readShapefile(file: File): Promise<ShapefileResult> {
  const name = file.name.toLowerCase();

  if (!ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext))) {
    throw new ShapefileError(
      `"${file.name}" is not a shapefile. Upload a .zip containing .shp, .shx ` +
        `and .dbf, or the .shp itself.`,
    );
  }
  if (file.size === 0) {
    throw new ShapefileError(`"${file.name}" is empty.`);
  }
  if (file.size > MAX_SHAPEFILE_BYTES) {
    throw new ShapefileError(
      `"${file.name}" is ${Math.round(file.size / 1024 / 1024)}MB. The limit ` +
        `is ${MAX_SHAPEFILE_BYTES / 1024 / 1024}MB. Clip or simplify it first.`,
    );
  }

  const bytes = await file.arrayBuffer();

  // A lone .shp has no attribute table and no index. parseShp reads it
  // directly; shp() would try to unzip it and fail.
  return name.endsWith(".shp")
    ? readBareShp(bytes, file.name)
    : readZippedShapefile(bytes, file.name);
}

/**
 * The zipped path.
 *
 * The audit runs before shpjs is handed anything, because a buffer that starts
 * with "PK" but has no central directory hangs shpjs synchronously and would
 * freeze the tab. See services/geo/zip.ts for the measurement.
 */
async function readZippedShapefile(
  bytes: ArrayBuffer,
  fileName: string,
): Promise<ShapefileResult> {
  let audit;
  try {
    audit = auditShapefileZip(bytes);
  } catch (cause) {
    if (cause instanceof ZipStructureError) {
      throw new ShapefileError(`"${fileName}": ${cause.message}`);
    }
    throw new ShapefileError(
      `Could not read "${fileName}". ` +
        `(${cause instanceof Error ? cause.message : String(cause)})`,
    );
  }

  let parsed: Awaited<ReturnType<typeof shp>>;
  try {
    parsed = await shp(bytes);
  } catch (cause) {
    throw new ShapefileError(
      `Could not read the shapefile inside "${fileName}". It may be corrupt. ` +
        `(${cause instanceof Error ? cause.message : String(cause)})`,
    );
  }

  const collections = Array.isArray(parsed) ? parsed : [parsed];
  const result = normalizeCollections(collections);

  // Missing siblings are not fatal, but they explain unnamed areas and
  // coordinates that arrive unprojected, so the user gets told.
  for (const [layer, missing] of Object.entries(audit.missingSiblings)) {
    const reasons = missing
      .map((ext) =>
        ext === ".dbf"
          ? "no .dbf, so areas have no names from the attribute table"
          : "no .prj, so the projection had to be assumed to be WGS84",
      )
      .join("; ");
    result.warnings.push(`Layer "${layer}": ${reasons}.`);
  }

  return result;
}

/** The bare .shp path: geometry only, no attributes, no projection. */
function readBareShp(bytes: ArrayBuffer, fileName: string): ShapefileResult {
  let geometries: Geometry[];
  try {
    geometries = parseShp(bytes) as Geometry[];
  } catch (cause) {
    throw new ShapefileError(
      `Could not read "${fileName}" as a shapefile. It may be corrupt or ` +
        `truncated. ` +
        `(${cause instanceof Error ? cause.message : String(cause)})`,
    );
  }

  const collection: FeatureCollection & { fileName?: string } = {
    type: "FeatureCollection",
    fileName: fileName.replace(/\.shp$/i, ""),
    features: geometries.map((geometry) => ({
      type: "Feature" as const,
      properties: null,
      geometry,
    })),
  };

  const result = normalizeCollections([collection]);
  result.warnings.unshift(
    `Read geometry only: a lone .shp carries no attribute table and no ` +
      `projection, so areas are unnamed and coordinates are assumed to be ` +
      `WGS84. Upload the zipped set to keep names and projection.`,
  );
  return result;
}
