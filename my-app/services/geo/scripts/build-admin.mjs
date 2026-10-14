#!/usr/bin/env node
/**
 * Bakes Kenya's administrative hierarchy (county > sub-county > ward) for the
 * analysis wizard's area picker.
 *
 *   node services/geo/scripts/build-admin.mjs      (or: npm run geo:build)
 *
 * Inputs, all geoBoundaries gbOpen at the commit pinned in ../data/README.md:
 *   raw/geoBoundaries-KEN-ADM1_simplified.geojson   47 counties
 *   raw/geoBoundaries-KEN-ADM2_simplified.geojson   290 sub-counties (IEBC)
 *   raw/geoBoundaries-KEN-ADM3_simplified.geojson   1452 wards
 *
 * Outputs:
 *   data/admin-index.generated.ts     every unit's id, name, level, parents and
 *                                     bbox. Small, and what the picker searches.
 *   data/admin/<county>.json          the boundaries of one county and of every
 *                                     sub-county and ward in it, fetched only
 *                                     when the analyst adds one of them.
 *   data/admin-geometry.generated.ts  one lazy loader per county file.
 *
 * The source files carry names and nothing else: no parent codes. So every
 * sub-county and ward is placed by geometry, at build time, by testing a point
 * guaranteed to lie inside it against the polygons one level up. A unit that
 * lands in no parent fails the build: a ward silently filed under nothing is a
 * ward the analyst can never find.
 *
 * County ids are read back out of counties.generated.ts by shapeId rather than
 * re-derived here, so the picker's "turkana" is the overview map's "turkana"
 * by construction, not by two copies of a slug function agreeing.
 *
 * Plain Node ESM with no dependencies, like its siblings.
 */
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SERVICE_DIR = join(HERE, "..");
const REPO_DIR = join(SERVICE_DIR, "..", "..");
const DATA_DIR = join(SERVICE_DIR, "data");
const RAW = (level) => join(DATA_DIR, "raw", `geoBoundaries-KEN-${level}_simplified.geojson`);
const COUNTIES_TS = join(DATA_DIR, "counties.generated.ts");
const INDEX_OUT = join(DATA_DIR, "admin-index.generated.ts");
const LOADERS_OUT = join(DATA_DIR, "admin-geometry.generated.ts");
const GEOMETRY_DIR = join(DATA_DIR, "admin");

/** Expected counts, from each release's own metadata (admUnitCount). */
const EXPECTED = { ADM1: 47, ADM2: 290, ADM3: 1452 };

/**
 * Douglas-Peucker tolerance per level, in degrees (~111km per degree at
 * Kenya's latitudes, isotropic within 1%). Finer for smaller units, because a
 * ward is a few km across and a 200m error is visible on one; a county is a
 * hundred km across and it is not. Chosen to keep the largest per-county file
 * (Turkana, Marsabit) under the 150KB budget; the build prints every file's
 * size and fails past the budget.
 */
const TOLERANCE = { county: 0.002, subcounty: 0.001, ward: 0.0005 };
const PRECISION = 4; // ~11m
const FILE_BUDGET = 150 * 1024;

/* ------------------------------------------------------------- geometry */

function polygonsOf(geometry) {
  if (geometry.type === "Polygon") return [geometry.coordinates];
  if (geometry.type === "MultiPolygon") return geometry.coordinates;
  throw new Error(`unexpected geometry ${geometry.type}`);
}

function ringContains(ring, [x, y]) {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/** Inside the outer ring of some polygon and outside all of its holes. */
function geometryContains(geometry, point) {
  return polygonsOf(geometry).some(
    ([outer, ...holes]) => ringContains(outer, point) && !holes.some((h) => ringContains(h, point)),
  );
}

function ringArea(ring) {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  }
  return a / 2;
}

/**
 * A point guaranteed inside the polygon: the midpoint of the widest span a
 * horizontal line through the largest part's vertical middle cuts. A centroid
 * is not good enough: a crescent-shaped ward's centroid sits in its neighbour.
 */
function interiorPoint(geometry) {
  const [outer, ...holes] = polygonsOf(geometry).reduce((best, p) =>
    Math.abs(ringArea(p[0])) > Math.abs(ringArea(best[0])) ? p : best,
  );
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [, y] of outer) {
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  // A few scanlines, in case the middle one grazes a vertex.
  for (const f of [0.5, 0.45, 0.55, 0.4, 0.6, 0.3, 0.7]) {
    const y = minY + (maxY - minY) * f;
    const xs = [];
    for (const ring of [outer, ...holes]) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i];
        const [xj, yj] = ring[j];
        if (yi > y !== yj > y) xs.push(((xj - xi) * (y - yi)) / (yj - yi) + xi);
      }
    }
    xs.sort((a, b) => a - b);
    let best = null;
    for (let i = 0; i + 1 < xs.length; i += 2) {
      if (best === null || xs[i + 1] - xs[i] > best[1] - best[0]) best = [xs[i], xs[i + 1]];
    }
    if (best !== null) {
      const point = [(best[0] + best[1]) / 2, y];
      if (geometryContains(geometry, point)) return point;
    }
  }
  throw new Error("no interior point found");
}

function bboxOf(geometry) {
  let w = Infinity;
  let s = Infinity;
  let e = -Infinity;
  let n = -Infinity;
  for (const polygon of polygonsOf(geometry)) {
    for (const [x, y] of polygon[0]) {
      w = Math.min(w, x);
      e = Math.max(e, x);
      s = Math.min(s, y);
      n = Math.max(n, y);
    }
  }
  return [w, s, e, n].map((v) => Number(v.toFixed(PRECISION)));
}

function segmentDistance([px, py], [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const len = dx * dx + dy * dy;
  if (len === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function simplifyRing(points, tolerance) {
  if (points.length < 5) return points.slice();
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

/**
 * Simplified and rounded, as a MultiPolygon. A ring that collapses below a
 * triangle is dropped; a polygon whose outer ring collapses is dropped whole.
 * If that would leave nothing (a tiny ward), the unsimplified rounded rings
 * are kept instead, so every unit always has a drawable boundary.
 */
function slim(geometry, tolerance) {
  const out = [];
  for (const polygon of polygonsOf(geometry)) {
    const rings = [];
    for (const [r, ring] of polygon.entries()) {
      const pts = simplifyRing(ring, tolerance).map(([x, y]) => [round(x), round(y)]);
      const dedup = pts.filter((p, i) => i === 0 || p[0] !== pts[i - 1][0] || p[1] !== pts[i - 1][1]);
      if (dedup.length >= 4) rings.push(dedup);
      else if (r === 0) break;
    }
    if (rings.length > 0) out.push(rings);
  }
  if (out.length === 0) {
    return {
      type: "MultiPolygon",
      coordinates: polygonsOf(geometry).map((p) => p.map((ring) => ring.map(([x, y]) => [round(x), round(y)]))),
    };
  }
  return { type: "MultiPolygon", coordinates: out };
}

/* --------------------------------------------------------------- naming */

function slugify(name) {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Collapse runs of spaces and trim: the release has a few double spaces. */
const clean = (name) => name.replace(/\s+/g, " ").trim();

/* ----------------------------------------------------------------- load */

function load(level) {
  const raw = JSON.parse(readFileSync(RAW(level), "utf8"));
  if (raw.features.length !== EXPECTED[level]) {
    throw new Error(`${level}: expected ${EXPECTED[level]} units, found ${raw.features.length}`);
  }
  return raw.features;
}

const countyIdByShape = new Map();
const countyNameById = new Map();
for (const m of readFileSync(COUNTIES_TS, "utf8").matchAll(
  /\{"id":"([^"]+)","name":"([^"]+)","shapeId":"([^"]+)"/g,
)) {
  countyIdByShape.set(m[3], m[1]);
  countyNameById.set(m[1], m[2]);
}
if (countyIdByShape.size !== EXPECTED.ADM1) {
  throw new Error(`read ${countyIdByShape.size} county ids from counties.generated.ts, expected 47`);
}

const counties = load("ADM1").map((f) => {
  const id = countyIdByShape.get(f.properties.shapeID);
  if (id === undefined) throw new Error(`county ${f.properties.shapeName} is not in counties.generated.ts`);
  return { id, name: countyNameById.get(id), geometry: f.geometry, box: bboxOf(f.geometry) };
});

const overlapsBox = (a, b) => a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];

/**
 * Which of `parents` holds most of this unit, by area.
 *
 * Not "which parent contains a point inside it": the ward and sub-county
 * releases come from different surveys, their shared borders disagree by
 * hundreds of metres, and in Nairobi a point test filed Laini Saba under
 * Lang'ata and Mabatini under Kamukunji. Overlap is what a person means by
 * "this ward is in that sub-county". Measured by sampling a grid over the
 * unit and counting, for each candidate parent, the samples that fall in both.
 * The grid is refined until at least 200 samples land inside the unit, so a
 * small ward is measured as finely as a large one.
 */
function parentOf(unit, parents, what) {
  const box = bboxOf(unit.geometry);
  const candidates = parents.filter((p) => overlapsBox(p.box, box));
  const inside = [];
  for (let n = 24; inside.length < 200 && n <= 384; n *= 2) {
    inside.length = 0;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const pt = [box[0] + ((i + 0.5) / n) * (box[2] - box[0]), box[1] + ((j + 0.5) / n) * (box[3] - box[1])];
        if (geometryContains(unit.geometry, pt)) inside.push(pt);
      }
    }
  }
  if (inside.length === 0) inside.push(interiorPoint(unit.geometry));
  const scored = candidates
    .map((p) => ({ p, n: inside.filter((pt) => geometryContains(p.geometry, pt)).length }))
    .sort((a, b) => b.n - a.n);
  if (scored.length === 0 || scored[0].n === 0) throw new Error(`${what} ${unit.name} lies in no parent`);
  shares.push(scored[0].n / inside.length);
  return scored[0].p;
}

/** Each assignment's winning share, for the build's confidence report. */
const shares = [];

/** Unique ids within a parent: a second "Township" becomes "township-2". */
function uniqueId(base, taken) {
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  taken.add(id);
  return id;
}

const takenIds = new Set();

/**
 * Sub-counties the overlap test files under the wrong county, corrected by
 * hand. Each entry is a sub-county name and the county IEBC places it in.
 *
 * The ADM1 (RCMRD 2020) and ADM2 (IEBC) releases disagree along some county
 * borders, and where a constituency sits across the disagreement, more of its
 * IEBC outline can fall inside the neighbouring RCMRD county. The test in
 * __tests__/admin.test.ts pins every county's constituency count to IEBC's
 * 290, which is how each entry here was found; it fails if a data refresh
 * moves another one.
 */
const SUBCOUNTY_COUNTY_OVERRIDES = {
  // Bureti constituency is Kericho's (IEBC). Overlap put 7 Kericho wards in Bomet.
  Buret: "kericho",
};

const subcounties = load("ADM2").map((f) => {
  const unit = { name: clean(f.properties.shapeName), geometry: f.geometry, box: bboxOf(f.geometry) };
  const override = SUBCOUNTY_COUNTY_OVERRIDES[unit.name];
  const county =
    override !== undefined
      ? counties.find((c) => c.id === override)
      : parentOf(unit, counties, "sub-county");
  if (county === undefined) throw new Error(`override for ${unit.name} names unknown county ${override}`);
  return {
    ...unit,
    id: uniqueId(`subcounty:${county.id}:${slugify(unit.name)}`, takenIds),
    county: county.id,
  };
});

const wards = load("ADM3").map((f) => {
  const unit = { name: clean(f.properties.shapeName), geometry: f.geometry };
  const sub = parentOf(unit, subcounties, "ward");
  return {
    ...unit,
    id: uniqueId(`ward:${sub.county}:${sub.id.split(":")[2]}:${slugify(unit.name)}`, takenIds),
    county: sub.county,
    subcounty: sub.id,
  };
});

/*
 * Cross-check: a ward's county by its own overlap with the county outlines
 * should be its sub-county's county. Where they differ the two surveys
 * disagree about that ward; the build lists them so each can be reviewed.
 */
const disagreements = [];
const shareCount = shares.length;
for (const w of wards) {
  const direct = parentOf({ ...w, box: bboxOf(w.geometry) }, counties, "ward");
  if (direct.id !== w.county) disagreements.push(`${w.name} (${w.id}): overlap says ${direct.id}`);
}
shares.length = shareCount;
if (process.env.ADMIN_DEBUG) console.log(disagreements.join("\n"));

/* ---------------------------------------------------------------- write */

/*
 * [id, name] pairs only. The id already says the level and both parents
 * (`ward:<county>:<sub-county>:<ward>`), so admin.ts derives those rather
 * than this file shipping them three times over. Bounds come from the
 * boundary when a unit is added, so none are stored here either.
 */
const byName = (a, b) => a.name.localeCompare(b.name, "en");
const index = [
  ...counties.slice().sort(byName).map((c) => [`county:${c.id}`, c.name]),
  ...subcounties.slice().sort(byName).map((s) => [s.id, s.name]),
  ...wards.slice().sort(byName).map((w) => [w.id, w.name]),
];

rmSync(GEOMETRY_DIR, { recursive: true, force: true });
mkdirSync(GEOMETRY_DIR, { recursive: true });
const sizes = [];
const fileBoxes = {};
for (const county of counties) {
  const shapes = {
    [`county:${county.id}`]: slim(county.geometry, TOLERANCE.county),
  };
  for (const s of subcounties.filter((x) => x.county === county.id)) shapes[s.id] = slim(s.geometry, TOLERANCE.subcounty);
  for (const w of wards.filter((x) => x.county === county.id)) shapes[w.id] = slim(w.geometry, TOLERANCE.ward);
  const body = JSON.stringify(shapes);
  if (body.length > FILE_BUDGET) {
    throw new Error(`admin/${county.id}.json is ${(body.length / 1024).toFixed(1)}KB, over the 150KB budget`);
  }
  writeFileSync(join(GEOMETRY_DIR, `${county.id}.json`), body);
  sizes.push([county.id, body.length]);
  // The box of everything the file holds, not the county's own outline: a
  // unit filed by hand under another county (Buret, under Kericho) lies
  // outside its county's outline, and a click there must still open this file.
  const boxes = Object.values(shapes).map(bboxOf);
  fileBoxes[county.id] = [
    Math.min(...boxes.map((b) => b[0])),
    Math.min(...boxes.map((b) => b[1])),
    Math.max(...boxes.map((b) => b[2])),
    Math.max(...boxes.map((b) => b[3])),
  ];
}

const script = relative(REPO_DIR, fileURLToPath(import.meta.url));
const header = (what) => `/**
 * GENERATED FILE. DO NOT EDIT BY HAND.
 *
 * Generated by  ${script}
 * Regenerate    npm run geo:build
 *
 * ${what}
 *
 * Sources: geoBoundaries gbOpen KEN ADM1 (counties), ADM2 (sub-counties; IEBC,
 * OCHA ROSEA; CC BY 3.0 IGO) and ADM3 (wards; B. A. Omare and G. Omare;
 * CC BY 4.0). Parents assigned by geometry at build time. See ./README.md.
 */
`;

writeFileSync(
  INDEX_OUT,
  `${header(`Every county (${counties.length}), sub-county (${subcounties.length}) and ward (${wards.length}) as an\n * [id, name] pair, sorted by level, then name. See admin.ts for the id scheme.`)}
export const ADMIN_UNIT_ROWS: readonly (readonly [string, string])[] = ${JSON.stringify(index)};
`,
);

writeFileSync(
  LOADERS_OUT,
  `${header("One lazy loader per county boundary file in ./admin/. Each file maps a unit id\n * to its simplified MultiPolygon, for the county and everything inside it.")}
import type { MultiPolygon } from "geojson";

export type AdminGeometryFile = Readonly<Record<string, MultiPolygon>>;

export const ADMIN_GEOMETRY_LOADERS: Readonly<Record<string, () => Promise<AdminGeometryFile>>> = {
${counties
  .map((c) => c.id)
  .sort()
  .map((id) => `  ${JSON.stringify(id)}: () => import("./admin/${id}.json").then((m) => m.default as AdminGeometryFile),`)
  .join("\n")}
};

/**
 * Each file's \`[west, south, east, north]\` in lon/lat: the box of every unit
 * it holds. Lets a map click open only the files that could contain it
 * (services/geo/locate.ts).
 */
export const ADMIN_FILE_BBOX: Readonly<Record<string, readonly [number, number, number, number]>> = {
${Object.keys(fileBoxes)
  .sort()
  .map((id) => `  ${JSON.stringify(id)}: ${JSON.stringify(fileBoxes[id])},`)
  .join("\n")}
};
`,
);

const files = readdirSync(GEOMETRY_DIR).length;
const biggest = sizes.sort((a, b) => b[1] - a[1]).slice(0, 3);
const total = sizes.reduce((s, [, n]) => s + n, 0);
console.log(
  `wrote ${relative(REPO_DIR, INDEX_OUT)} (${index.length} units, ${(readFileSync(INDEX_OUT).length / 1024).toFixed(1)}KB), ` +
    `${files} files in ${relative(REPO_DIR, GEOMETRY_DIR)} (${(total / 1024).toFixed(0)}KB total; largest ` +
    `${biggest.map(([id, n]) => `${id} ${(n / 1024).toFixed(1)}KB`).join(", ")}). ` +
    `Parent share: lowest ${(Math.min(...shares) * 100).toFixed(0)}%, ` +
    `${shares.filter((x) => x < 0.6).length} under 60%.`,
);
