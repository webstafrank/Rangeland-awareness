#!/usr/bin/env node
/**
 * Bakes `data/raw/geoBoundaries-KEN-ADM1_simplified.geojson` into
 * `data/counties.generated.ts`.
 *
 *   node services/geo/scripts/build-counties.mjs      (or: npm run geo:build)
 *
 * Why a build step rather than reading GeoJSON at runtime:
 *
 *   - The raw file is ~861KB of lon/lat coordinates. Shipping it to a browser
 *     means shipping a projection library too, and then projecting 19k points on
 *     every mount. Baking SVG path strings in the shared frame moves all of that
 *     to build time, and the client draws strings it can hand straight to the
 *     DOM.
 *   - The county id scheme has to be stable forever, because ids end up in URLs
 *     and in saved comparisons. Deriving them once, with an assertion that they
 *     are unique and that there are exactly 47, makes a data refresh that would
 *     silently change an id fail loudly here instead of quietly in production.
 *
 * Plain Node ESM with no dependencies on purpose: Douglas-Peucker and a polygon
 * centroid are twenty lines each, and a build script that needs `npm install` to
 * regenerate committed data is a build script that stops working.
 *
 * The projection is imported from `../projection.mjs` rather than reimplemented,
 * so runtime `geo.project()` and these baked paths cannot disagree. See that
 * file's header for the reasoning.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { makeFrame, projectPoint } from "../projection.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SERVICE_DIR = join(HERE, "..");
const REPO_DIR = join(SERVICE_DIR, "..", "..");
const RAW_PATH = join(SERVICE_DIR, "data", "raw", "geoBoundaries-KEN-ADM1_simplified.geojson");
const META_PATH = join(SERVICE_DIR, "data", "raw", "geoBoundaries-KEN-ADM1-metadata.json");
const OUT_PATH = join(SERVICE_DIR, "data", "counties.generated.ts");

/** Kenya has 47 counties (Constitution of Kenya 2010, First Schedule). */
const EXPECTED_COUNTY_COUNT = 47;

/**
 * Frame width in abstract units. Only the width is chosen: the height comes out
 * of the fitted aspect ratio in `makeFrame`, because picking both is how a map
 * ends up stretched. Everything downstream scales the whole viewBox, so this
 * number is a precision budget rather than a pixel size: 800 units across
 * Kenya's ~8 degrees of longitude puts roughly 100 units on a degree, so
 * coordinates rounded to 0.1 units carry about 100m of positional precision,
 * far finer than the boundary data itself.
 */
const FRAME_WIDTH = 800;

/**
 * Douglas-Peucker tolerance, in frame units. One frame unit is ~0.01 degrees
 * (~1.1km), so this is a positional error budget of about 165m.
 *
 * Chosen by measurement, not by feel. The sweep, on this dataset, of tolerance
 * against the generated file's size:
 *
 *   0.10 -> 212.9KB (92.1% of points kept)
 *   0.15 -> 165.2KB (70.4%)     <- chosen
 *   0.20 -> 135.8KB (57.0%)
 *   0.30 -> 102.2KB (41.8%)
 *   0.60 ->  62.6KB (23.9%)
 *   1.00 ->  43.5KB (15.1%)
 *
 * The budget for the generated file is 220KB, so 0.15 sits comfortably inside it
 * while keeping the detail that makes the map read as Kenya: Winam Gulf's inlets
 * around Kisumu and Homa Bay, the Lamu archipelago's coast, and the Turkana
 * wedge up to the Ilemi triangle. The error budget is finer than the source data
 * itself, which is geoBoundaries' already-simplified release, so pulling the
 * tolerance further down buys bytes and no accuracy. Going the other way is
 * where it starts to hurt: by 0.6 the smaller Winam Gulf peninsulas are gone and
 * the map looks wrong rather than simplified.
 */
const SIMPLIFY_TOLERANCE = 0.15;

/** Decimal places kept in emitted path coordinates. See FRAME_WIDTH. */
const PATH_PRECISION = 1;

/**
 * A ring with fewer than four points has no interior worth drawing (three
 * points is a triangle that, at this scale, is a sliver of a few pixels), and
 * an over-simplified ring can collapse to two points, which SVG renders as a
 * hairline. Dropping them is a size win and removes visual noise.
 */
const MIN_RING_POINTS = 4;

/**
 * Kenya's arid and semi-arid lands (ASAL), keyed by county name as published by
 * the boundary source.
 *
 * ONE constant, deliberately, because this classification is the single most
 * arguable thing in this service and it must be reviewable in one place. It
 * follows the grouping used in Kenya's ASAL policy framing (the 23 counties
 * commonly described as ASAL, split into the 8 arid counties of the north and
 * north-east and the 15 semi-arid counties), and it drives nothing but grouping
 * and filtering in the area picker.
 *
 * It is NOT an authoritative list. County-level aridity is a spectrum, several
 * counties are partly arid and partly not (Meru and Embu especially), and the
 * official county grouping has been restated more than once. Confirm against the
 * current NDMA county list before this is used for anything a decision rests
 * on. See `../README.md`.
 */
const ASAL_CLASSIFICATION = {
  arid: [
    "Turkana",
    "Marsabit",
    "Mandera",
    "Wajir",
    "Garissa",
    "Tana River",
    "Isiolo",
    "Samburu",
  ],
  "semi-arid": [
    "West Pokot",
    "Baringo",
    "Laikipia",
    "Kajiado",
    "Narok",
    "Kitui",
    "Makueni",
    "Machakos",
    "Embu",
    "Tharaka",
    "Meru",
    "Kilifi",
    "Kwale",
    "Lamu",
    "Taita Taveta",
  ],
};

/**
 * Counties whose published boundary name is not the county's official name.
 *
 * geoBoundaries carries the 2020 RCMRD spelling, which is the right thing for
 * traceability and the wrong thing to print on screen for a Kenyan audience.
 * Tharaka-Nithi is the only case in this release: the county was formed from
 * the former Tharaka and Meru South (Nithi) districts and has been
 * Tharaka-Nithi since 2013, so showing "Tharaka" would read as an error to
 * anyone who lives there.
 *
 * The slug still derives from the source spelling, so an override changes what
 * is displayed and never what a URL points at. `shapeId` on every area keeps
 * the row traceable back upstream regardless.
 *
 * @type {Record<string, string>}
 */
const DISPLAY_NAME_OVERRIDES = {
  Tharaka: "Tharaka-Nithi",
};

/**
 * Turns an official county name into its permanent slug.
 *
 * The output must satisfy `AreaIdSchema` (`^[a-z][a-z0-9-]*[a-z0-9]$`), which
 * rules out leading/trailing dashes and any punctuation. The cases that actually
 * occur in this dataset:
 *
 *   "Murang'a"        -> "muranga"          apostrophe dropped, not dashed:
 *                                           "murang-a" would be ugly in a URL
 *                                           and is not how the name is written
 *                                           in ASCII elsewhere.
 *   "Elgeyo-Marakwet" -> "elgeyo-marakwet"  existing hyphen kept.
 *   "Taita Taveta"    -> "taita-taveta"     space becomes a hyphen.
 *   "Homa Bay"        -> "homa-bay"
 *   "Trans Nzoia"     -> "trans-nzoia"
 *   "Tharaka"         -> "tharaka"          single word, unchanged.
 *
 * @param {string} name
 * @returns {string}
 */
function slugify(name) {
  return name
    .toLowerCase()
    .normalize("NFD")
    // Strip combining marks, so an accented source spelling folds to ASCII
    // rather than being replaced by a dash.
    .replace(/[\u0300-\u036f]/g, "")
    // Apostrophes and the like vanish; every other run of non-alphanumerics
    // becomes a single separator.
    .replace(/['‘’ʼ.]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Every ring of a geometry, as a flat list, ignoring the Polygon/MultiPolygon
 * distinction. Outer rings and holes come back together and in source order,
 * which is what the even-odd fill rule needs and what keeps output stable.
 *
 * @param {{ type: string, coordinates: unknown }} geometry
 * @returns {number[][][]} rings, each an array of [lon, lat]
 */
function ringsOf(geometry) {
  if (geometry.type === "Polygon") return /** @type {number[][][]} */ (geometry.coordinates);
  if (geometry.type === "MultiPolygon") {
    return /** @type {number[][][][]} */ (geometry.coordinates).flat();
  }
  throw new Error(`unsupported geometry type: ${geometry.type}`);
}

/**
 * Polygons grouped as the source has them: one entry per Polygon, each entry a
 * list of rings (outer first, then holes). Used only to pick the largest outer
 * ring for the centroid.
 *
 * @param {{ type: string, coordinates: unknown }} geometry
 * @returns {number[][][][]}
 */
function polygonsOf(geometry) {
  if (geometry.type === "Polygon") return [/** @type {number[][][]} */ (geometry.coordinates)];
  if (geometry.type === "MultiPolygon") return /** @type {number[][][][]} */ (geometry.coordinates);
  throw new Error(`unsupported geometry type: ${geometry.type}`);
}

/**
 * Signed area of a ring, by the shoelace formula, in square degrees.
 *
 * Sign carries orientation, which the centroid formula needs; magnitude is only
 * used to compare rings against each other, so working in degrees rather than
 * projecting to an equal-area system is fine here.
 *
 * @param {number[][]} ring
 * @returns {number}
 */
function signedArea(ring) {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    sum += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  }
  return sum / 2;
}

/**
 * Area-weighted centroid of a ring, in lon/lat.
 *
 * Deliberately not the bbox centre. A bbox centre falls outside any sufficiently
 * concave shape, and Kenya has several: the label for Homa Bay would sit in Lake
 * Victoria and Tana River's would sit in Garissa. The centroid of a simple
 * polygon can still fall outside a very crescent-shaped one, so the caller
 * checks the result and falls back if it does.
 *
 * @param {number[][]} ring
 * @returns {[number, number]}
 */
function ringCentroid(ring) {
  let cx = 0;
  let cy = 0;
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const cross = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
    a += cross;
    cx += (ring[j][0] + ring[i][0]) * cross;
    cy += (ring[j][1] + ring[i][1]) * cross;
  }
  a *= 0.5;
  if (a === 0) {
    // Degenerate ring (zero area): fall back to the mean of its vertices rather
    // than dividing by zero.
    const n = ring.length || 1;
    return [ring.reduce((s, p) => s + p[0], 0) / n, ring.reduce((s, p) => s + p[1], 0) / n];
  }
  return [cx / (6 * a), cy / (6 * a)];
}

/**
 * Ray-cast point-in-ring test (even-odd), used only to sanity check a computed
 * centroid before it is written out. The runtime service has its own copy of
 * this test against the baked paths; this one works in lon/lat on the raw rings.
 *
 * @param {readonly [number, number]} point
 * @param {number[][]} ring
 * @returns {boolean}
 */
function pointInRing(point, ring) {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Perpendicular distance from `p` to the segment `a`-`b`.
 *
 * Distance to the segment, not to the infinite line: Douglas-Peucker on a closed
 * ring regularly hands this function a segment whose endpoints are nearly
 * coincident, and the infinite-line form then returns a meaningless value and
 * keeps points it should drop.
 *
 * @param {number[]} p
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number}
 */
function segmentDistance(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/**
 * Douglas-Peucker line simplification, iterative rather than recursive so a
 * 12,000-point ring cannot overflow the stack.
 *
 * The algorithm keeps the two endpoints, finds the point furthest from the line
 * between them, and recurses on both halves if that distance exceeds the
 * tolerance. Points that no longer change the shape by more than `tolerance` are
 * dropped. It preserves the endpoints exactly, which is what lets a closed ring
 * stay closed.
 *
 * @param {number[][]} points
 * @param {number} tolerance
 * @returns {number[][]}
 */
function simplify(points, tolerance) {
  if (points.length < 3) return points.slice();
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  /** @type {Array<[number, number]>} */
  const stack = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [first, last] = /** @type {[number, number]} */ (stack.pop());
    let maxDist = -1;
    let maxIndex = -1;
    for (let i = first + 1; i < last; i++) {
      const d = segmentDistance(points[i], points[first], points[last]);
      if (d > maxDist) {
        maxDist = d;
        maxIndex = i;
      }
    }
    if (maxIndex !== -1 && maxDist > tolerance) {
      keep[maxIndex] = 1;
      stack.push([first, maxIndex], [maxIndex, last]);
    }
  }
  return points.filter((_, i) => keep[i] === 1);
}

/**
 * One ring, projected, simplified, rounded, and rendered as an SVG subpath.
 *
 * Order matters: project first so the tolerance is a visual distance in frame
 * units rather than a distance in degrees (which would be anisotropic), then
 * simplify, then round. Rounding last is where most of the size win comes from:
 * "36.1234567" becomes "36.1", and the neighbouring points that collapse onto
 * each other afterwards are dropped.
 *
 * @param {number[][]} ring lon/lat
 * @param {{ width: number, bounds: readonly [number, number, number, number] }} frame
 * @returns {{ subpath: string, points: number } | null} null if the ring collapsed
 */
function ringToSubpath(ring, frame) {
  // A GeoJSON ring repeats its first point as its last; drop the repeat so
  // simplification is not anchored to a duplicate, and let `Z` close the path.
  const open =
    ring.length > 1 &&
    ring[0][0] === ring[ring.length - 1][0] &&
    ring[0][1] === ring[ring.length - 1][1]
      ? ring.slice(0, -1)
      : ring;
  const projected = open.map((p) => projectPoint(frame, /** @type {[number, number]} */ (p)));
  const simplified = simplify(projected, SIMPLIFY_TOLERANCE);
  /** @type {string[]} */
  const coords = [];
  let prev = "";
  for (const [x, y] of simplified) {
    const s = `${round(x)} ${round(y)}`;
    // Consecutive points that round to the same place add bytes and nothing
    // else.
    if (s !== prev) {
      coords.push(s);
      prev = s;
    }
  }
  // A closed ring can also round its last point onto its first.
  if (coords.length > 1 && coords[coords.length - 1] === coords[0]) coords.pop();
  if (coords.length < MIN_RING_POINTS) return null;
  return { subpath: `M${coords.join("L")}Z`, points: coords.length };
}

/**
 * @param {number} n
 * @returns {number}
 */
function round(n) {
  const f = 10 ** PATH_PRECISION;
  // `+ 0` normalises -0 to 0, which otherwise emits "-0" and makes the output
  // depend on which side of the frame edge a point fell.
  return Math.round(n * f) / f + 0;
}

/** @param {unknown} condition @param {string} message */
function assert(condition, message) {
  if (!condition) throw new Error(`build-counties: ${message}`);
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

const rawText = readFileSync(RAW_PATH, "utf8");
const raw = JSON.parse(rawText);
const meta = JSON.parse(readFileSync(META_PATH, "utf8"));

assert(raw.type === "FeatureCollection", `expected a FeatureCollection, got ${raw.type}`);
assert(
  raw.features.length === EXPECTED_COUNTY_COUNT,
  `expected ${EXPECTED_COUNTY_COUNT} counties, got ${raw.features.length}`,
);

/** Name -> climate zone, inverted from the one classification constant. */
const ZONE_BY_NAME = new Map();
for (const [zone, names] of Object.entries(ASAL_CLASSIFICATION)) {
  for (const name of names) {
    assert(!ZONE_BY_NAME.has(name), `${name} appears twice in ASAL_CLASSIFICATION`);
    ZONE_BY_NAME.set(name, zone);
  }
}
assert(
  ZONE_BY_NAME.size === 23,
  `ASAL_CLASSIFICATION should name Kenya's 23 ASAL counties, names ${ZONE_BY_NAME.size}`,
);

// Pass 1: national bounds, so every county is projected into one shared frame.
// Two passes are needed because the frame depends on all 47 counties and the
// paths depend on the frame.
let minLon = Infinity;
let minLat = Infinity;
let maxLon = -Infinity;
let maxLat = -Infinity;
let rawPointCount = 0;
for (const feature of raw.features) {
  for (const ring of ringsOf(feature.geometry)) {
    rawPointCount += ring.length;
    for (const [lon, lat] of ring) {
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
  }
}
const bounds = /** @type {[number, number, number, number]} */ ([
  round6(minLon),
  round6(minLat),
  round6(maxLon),
  round6(maxLat),
]);
const frame = makeFrame(bounds, FRAME_WIDTH);

/** Six decimals is ~10cm: enough that the frame bounds are lossless in practice. */
function round6(n) {
  return Math.round(n * 1e6) / 1e6;
}

// Pass 2: one record per county.
/** @type {Array<Record<string, unknown>>} */
const counties = [];
const seenIds = new Set();
let keptPointCount = 0;
let droppedRings = 0;

for (const feature of raw.features) {
  const sourceName = feature.properties.shapeName;
  // The slug comes from the SOURCE spelling, so an override can never move a
  // county to a new id and break existing result URLs.
  const id = slugify(sourceName);
  const name = DISPLAY_NAME_OVERRIDES[sourceName] ?? sourceName;
  assert(
    /^[a-z][a-z0-9-]*[a-z0-9]$/.test(id) && id.length >= 2 && id.length <= 40,
    `slug "${id}" from "${name}" does not satisfy AreaIdSchema`,
  );
  assert(!seenIds.has(id), `duplicate slug "${id}" (from "${name}")`);
  seenIds.add(id);

  const rings = ringsOf(feature.geometry);

  // County bbox from the RAW rings, not the simplified ones: the bbox is used
  // for map fitting and for the "is this point in this county" pre-filter, and a
  // bbox that has shrunk with simplification would exclude real coastline.
  let bMinLon = Infinity;
  let bMinLat = Infinity;
  let bMaxLon = -Infinity;
  let bMaxLat = -Infinity;
  for (const ring of rings) {
    for (const [lon, lat] of ring) {
      if (lon < bMinLon) bMinLon = lon;
      if (lon > bMaxLon) bMaxLon = lon;
      if (lat < bMinLat) bMinLat = lat;
      if (lat > bMaxLat) bMaxLat = lat;
    }
  }

  // Centroid of the largest outer ring. Largest, because Mombasa, Lamu and Tana
  // River are MultiPolygons whose smaller parts are islands and sandbars: an
  // average over all parts would drag the label offshore.
  const outerRings = polygonsOf(feature.geometry).map((poly) => poly[0]);
  const largest = outerRings.reduce((best, ring) =>
    Math.abs(signedArea(ring)) > Math.abs(signedArea(best)) ? ring : best,
  );
  let centroid = ringCentroid(largest);
  if (!pointInRing(centroid, largest)) {
    // Crescent-shaped county: the area centroid landed outside its own ring, so
    // a label there would point at a neighbour. Walk the ring for the vertex
    // nearest the centroid and step slightly inward from it. Reported below so
    // this never happens silently.
    const nearest = largest.reduce((best, p) =>
      Math.hypot(p[0] - centroid[0], p[1] - centroid[1]) <
      Math.hypot(best[0] - centroid[0], best[1] - centroid[1])
        ? p
        : best,
    );
    const fixed = [
      nearest[0] + (centroid[0] - nearest[0]) * 0.1,
      nearest[1] + (centroid[1] - nearest[1]) * 0.1,
    ];
    console.warn(
      `  note: ${name}'s area centroid fell outside its own ring, nudged to [${round6(fixed[0])}, ${round6(fixed[1])}]`,
    );
    centroid = /** @type {[number, number]} */ (fixed);
  }
  // Clamp into the county bbox so the invariant the tests check ("centroid is
  // inside its own bbox") holds by construction rather than by luck.
  centroid = [
    Math.min(Math.max(centroid[0], bMinLon), bMaxLon),
    Math.min(Math.max(centroid[1], bMinLat), bMaxLat),
  ];

  /** @type {string[]} */
  const subpaths = [];
  for (const ring of rings) {
    const built = ringToSubpath(ring, frame);
    if (built === null) {
      droppedRings += 1;
      continue;
    }
    subpaths.push(built.subpath);
    keptPointCount += built.points;
  }
  assert(subpaths.length > 0, `${name} simplified away to nothing`);

  // Keyed on the SOURCE name: ASAL_CLASSIFICATION is written against the
  // boundary source's spellings, so a display-name override must not silently
  // drop a county out of the ASAL group.
  const zone = ZONE_BY_NAME.get(sourceName) ?? "humid";
  counties.push({
    id,
    name,
    shapeId: feature.properties.shapeID,
    climateZone: zone,
    asal: zone !== "humid",
    centroid: [round6(centroid[0]), round6(centroid[1])],
    bbox: [round6(bMinLon), round6(bMinLat), round6(bMaxLon), round6(bMaxLat)],
    path: subpaths.join(""),
  });
}

assert(counties.length === EXPECTED_COUNTY_COUNT, `built ${counties.length} counties`);
assert(seenIds.size === EXPECTED_COUNTY_COUNT, `${seenIds.size} unique slugs`);

// Sorted by id so the generated file's diff is readable when the source data is
// refreshed, and so the output is byte-identical run to run regardless of the
// source file's feature order.
counties.sort((a, b) => String(a.id).localeCompare(String(b.id), "en"));

const asalCount = counties.filter((c) => c.asal).length;
assert(asalCount === 23, `expected 23 ASAL counties, marked ${asalCount}`);

const sourceRel = relative(REPO_DIR, RAW_PATH).replaceAll("\\", "/");
const scriptRel = relative(REPO_DIR, fileURLToPath(import.meta.url)).replaceAll("\\", "/");

const body = `/**
 * GENERATED FILE. DO NOT EDIT BY HAND.
 *
 * Generated by  ${scriptRel}
 * From          ${sourceRel}
 * Regenerate    npm run geo:build
 *
 * Any hand edit here is lost the next time the boundary data is refreshed. The
 * id scheme, the ASAL classification and the projection all live in the script
 * and in ../projection.mjs; change them there.
 *
 * Boundary source: ${meta.boundarySource} (${meta.boundaryYearRepresented}),
 * published via geoBoundaries ${meta.boundaryID} (gbOpen). License: ${meta.boundaryLicense}.
 * See ./README.md for the full provenance record.
 *
 * Coordinates in \`path\` are frame units in MAP_FRAME, rounded to ${PATH_PRECISION} decimal,
 * simplified with Douglas-Peucker at a tolerance of ${SIMPLIFY_TOLERANCE} frame units.
 * \`centroid\` and \`bbox\` are lon/lat (EPSG:4326) computed from the unsimplified
 * rings.
 */
import type { Area, MapFrame } from "@/contracts/geo";

/** The shared projected canvas every \`path\` below is expressed in. */
export const MAP_FRAME: MapFrame = ${JSON.stringify(frame)};

/** Kenya's ${EXPECTED_COUNTY_COUNT} counties (ADM1), sorted by id. */
export const COUNTIES: readonly Area[] = [
${counties.map((c) => `  ${JSON.stringify(c)},`).join("\n")}
];
`;

writeFileSync(OUT_PATH, body, "utf8");

const rawBytes = Buffer.byteLength(rawText, "utf8");
const outBytes = Buffer.byteLength(body, "utf8");
const kb = (n) => `${(n / 1024).toFixed(1)}KB`;
const pct = (n, of) => `${((n / of) * 100).toFixed(1)}%`;

console.log(`build-counties: wrote ${relative(REPO_DIR, OUT_PATH).replaceAll("\\", "/")}`);
console.log(`  frame        ${frame.width} x ${frame.height}  bounds ${JSON.stringify(frame.bounds)}`);
console.log(`  counties     ${counties.length}  (ASAL ${asalCount}: arid ${ASAL_CLASSIFICATION.arid.length}, semi-arid ${ASAL_CLASSIFICATION["semi-arid"].length})`);
console.log(`  points       ${rawPointCount} raw -> ${keptPointCount} kept  (${pct(keptPointCount, rawPointCount)}, tolerance ${SIMPLIFY_TOLERANCE} frame units)`);
console.log(`  rings        ${droppedRings} dropped for having fewer than ${MIN_RING_POINTS} points after simplification`);
console.log(`  bytes        ${kb(rawBytes)} raw geojson -> ${kb(outBytes)} generated ts  (${pct(outBytes, rawBytes)})`);
