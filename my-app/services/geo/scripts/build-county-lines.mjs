#!/usr/bin/env node
/**
 * Bakes `data/raw/geoBoundaries-KEN-ADM1_simplified.geojson` into
 * `public/geo/kenya-counties.geojson`.
 *
 *   node services/geo/scripts/build-county-lines.mjs      (or: npm run geo:build)
 *
 * The 47 county boundaries as lon/lat GeoJSON, for the data explorer, which
 * draws them over every layer so the counties stay readable whatever is on
 * the map. counties.generated.ts cannot serve here: its paths are projected
 * into MAP_FRAME for SVG, and MapLibre wants lon/lat.
 *
 * A static file in public/ rather than a TypeScript module, because the
 * explorer hands MapLibre its URL: MapLibre fetches and parses it in a worker,
 * and the boundaries never enter the JavaScript bundle.
 *
 * Each feature keeps the county's `id` (the same slug counties.generated.ts
 * uses, so the two never disagree) and its `name`.
 *
 * Plain Node ESM with no dependencies, for the same reason as the other two
 * scripts: regenerating committed data must not need `npm install`.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SERVICE_DIR = join(HERE, "..");
const APP_DIR = join(SERVICE_DIR, "..", "..");
const RAW_PATH = join(SERVICE_DIR, "data", "raw", "geoBoundaries-KEN-ADM1_simplified.geojson");
const OUT_PATH = join(APP_DIR, "public", "geo", "kenya-counties.geojson");

/**
 * Douglas-Peucker tolerance, in degrees. Chosen by measurement on this file
 * (19591 points in):
 *
 *   0.001  (~110m)  18257 points, 316KB
 *   0.003  (~330m)   8292 points, 147KB, ~45KB gzipped   <- this
 *   0.005  (~550m)   5483 points,  99KB
 *
 * A boundary overlay is read at zoom 5 to 10, where a pixel is 150m to 5km;
 * 330m is within two pixels at zoom 10 and invisible below it. 0.001 doubles
 * the download for detail nobody sees; 0.005 starts to cut corners at zoom 10.
 */
const TOLERANCE = 0.003;

/** Decimal places kept: 4 is ~11m, finer than the tolerance above. */
const PRECISION = 4;

const EXPECTED_COUNTIES = 47;
const MIN_RING_POINTS = 4;

/** The same slug build-counties.mjs makes, so ids match counties.generated.ts. */
function slugify(name) {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['‘’ʼ.]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Distance from `p` to the segment `a`-`b` (not the infinite line). */
function segmentDistance(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** Douglas-Peucker, iterative; keeps both endpoints, so a closed ring stays closed. */
function simplify(points, tolerance) {
  if (points.length < 3) return points.slice();
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [first, last] = stack.pop();
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

const round = (n) => Number(n.toFixed(PRECISION));

function cleanRing(ring) {
  const rounded = simplify(ring, TOLERANCE).map(([lon, lat]) => [round(lon), round(lat)]);
  return rounded.filter(
    (p, i) => i === 0 || p[0] !== rounded[i - 1][0] || p[1] !== rounded[i - 1][1],
  );
}

const raw = JSON.parse(readFileSync(RAW_PATH, "utf8"));
let pointsIn = 0;
let pointsOut = 0;
const features = raw.features.map((feature) => {
  const name = feature.properties.shapeName;
  const polygons =
    feature.geometry.type === "Polygon"
      ? [feature.geometry.coordinates]
      : feature.geometry.type === "MultiPolygon"
        ? feature.geometry.coordinates
        : null;
  if (polygons === null) throw new Error(`${name}: unexpected ${feature.geometry.type}`);
  const kept = [];
  for (const polygon of polygons) {
    const rings = [];
    let outerKept = false;
    for (const [index, ring] of polygon.entries()) {
      pointsIn += ring.length;
      const clean = cleanRing(ring);
      if (clean.length < MIN_RING_POINTS) continue;
      if (index === 0) outerKept = true;
      rings.push(clean);
    }
    // A polygon whose outer ring simplified away takes its holes with it;
    // otherwise a surviving hole would be emitted as the outer ring.
    if (!outerKept) continue;
    pointsOut += rings.reduce((sum, ring) => sum + ring.length, 0);
    kept.push(rings);
  }
  if (kept.length === 0) throw new Error(`${name}: simplified to nothing`);
  return {
    type: "Feature",
    properties: { id: slugify(name), name },
    geometry: { type: "MultiPolygon", coordinates: kept },
  };
});

if (features.length !== EXPECTED_COUNTIES) {
  throw new Error(`expected ${EXPECTED_COUNTIES} counties, found ${features.length}`);
}
const ids = new Set(features.map((f) => f.properties.id));
if (ids.size !== features.length) throw new Error("two counties share an id");
features.sort((a, b) => a.properties.id.localeCompare(b.properties.id));

const out = JSON.stringify({ type: "FeatureCollection", features });
mkdirSync(dirname(OUT_PATH), { recursive: true });
writeFileSync(OUT_PATH, `${out}\n`);
console.log(
  `wrote ${relative(APP_DIR, OUT_PATH)}: ${features.length} counties, ${pointsIn} -> ${pointsOut} points, ${(out.length / 1024).toFixed(1)}KB`,
);
