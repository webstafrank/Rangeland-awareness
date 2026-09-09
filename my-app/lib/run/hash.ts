/**
 * The content hash behind `runId`, and the geometry seed behind every number.
 *
 * A run id is the identity of a result and the whole of its storage: there is
 * no run table. Two analysts who build the same config on two machines must
 * land on the same id, and that id must still resolve to the same numbers next
 * year, so nothing ambient may enter the hash — no clock, no `Math.random`, no
 * `crypto.randomUUID`, no object key order, no locale.
 *
 * FNV-1a, twice, with two offset bases, mixed into base36 digits. A few lines,
 * no platform dependency beyond `Math.imul` and uint32 arithmetic, about 57
 * usable bits at RUN_ID_LENGTH. Not cryptographic and does not need to be:
 * nothing here is a security boundary, it is a cache key for a pure function.
 *
 * THE DEPARTURE FROM `rangeland-pages`: that branch hashed a county slug, so an
 * area's identity was a word. Here an area is geometry, so its identity is a
 * rounded bounding box plus its label. See `areaSeedKey`.
 */

import type { RequestArea } from "@/lib/analysis/request";
import type { RunConfig } from "@/lib/run/config";
import { RUN_ID_LENGTH } from "@/lib/run/constants";
import { mulberry32 } from "@/lib/run/rng";

/** Standard FNV-1a 32-bit offset basis. */
export const FNV_OFFSET_BASIS = 0x811c9dc5;
/** A second basis, so one string yields two independent-looking words. Any odd constant works. */
export const FNV_ALT_BASIS = 0x1000193;
const FNV_PRIME = 0x01000193;

const BASE36 = "0123456789abcdefghijklmnopqrstuvwxyz";

/**
 * FNV-1a over the UTF-16 code units of `input`.
 *
 * Code units rather than bytes because every input here is ASCII (slugs, ISO
 * dates, fixed-point numbers) where the two agree, and staying in code units
 * avoids depending on a `TextEncoder` that Node and the browser could in
 * principle disagree about.
 */
export function fnv1a32(input: string, basis: number = FNV_OFFSET_BASIS): number {
  let hash = basis >>> 0;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
  }
  return hash >>> 0;
}

/**
 * Decimal places the seed key keeps from a bound. Four is about 11 metres at
 * the equator.
 *
 * The rounding is the point, not an economy. A polygon that survives a
 * shapefile reprojection, a JSON round trip through `sessionStorage` and a
 * float multiply comes back with its corners moved in the fifteenth decimal
 * place, and an unrounded key would give the same drawn area a different result
 * after a page reload. Coarser than four and two genuinely adjacent clicks
 * would collide into one result.
 */
const SEED_PRECISION = 4;

/** Fixed-point, so -0 and 0 write the same and no locale can get in. */
function fixed(value: number): string {
  if (!Number.isFinite(value)) return "nan";
  const text = value.toFixed(SEED_PRECISION);
  return text === `-${(0).toFixed(SEED_PRECISION)}` ? (0).toFixed(SEED_PRECISION) : text;
}

/**
 * The identity of an area, for seeding and for the run id.
 *
 * Bounds plus label, and deliberately NOT the id: `aoi-1` is a session ordinal
 * from `selectionReducer`, so hashing it would mean the same polygon drawn
 * first or second produced two different results, and reloading a page that
 * renumbered its areas would change every number on it.
 *
 * The label is in because two analysts who draw the same box and name it
 * differently are studying it as different places, and because a label is the
 * only thing distinguishing two shapefile features with identical extents.
 * The source is deliberately out: a box typed as a coordinate and the same box
 * drawn on the map are the same place, and should read the same.
 */
export function areaSeedKey(area: Pick<RequestArea, "label" | "bounds">): string {
  const [[south, west], [north, east]] = area.bounds;
  return [
    fixed(south),
    fixed(west),
    fixed(north),
    fixed(east),
    // Trimmed and lowercased so " Turkana" and "turkana" are one place. Not
    // stripped further: an analyst who types two distinguishable names means
    // two things.
    area.label.trim().toLowerCase(),
  ].join(",");
}

/**
 * The one canonical string form of a config.
 *
 * Fields are written in alphabetical order of key, never in the order the
 * calling object happens to hold them, so a config assembled by a form, by a
 * URL parse and by a test literal all hash identically.
 *
 * Areas and formulas are both sorted. Order in each is presentation — which
 * line the chart draws first, which chip renders first — not identity.
 * Comparing A with B is the same study as comparing B with A, and one id for it
 * means one shared URL. The result's own arrays still follow the caller's order.
 *
 * The leading version tag means a later change to this encoding can invalidate
 * old ids deliberately instead of colliding with them.
 */
export function canonicalConfigString(
  config: RunConfig,
  options: { readonly includeModel?: boolean } = {},
): string {
  const includeModel = options.includeModel ?? true;
  const areas = config.areas.map(areaSeedKey).sort().join(";");
  const formulas = [...config.formulas].sort().join(",");
  const parts = [
    "v2",
    `areas=${areas}`,
    `formulas=${formulas}`,
    `from=${config.dateWindow.start}`,
    ...(includeModel ? [`model=${config.model}`] : []),
    `to=${config.dateWindow.end}`,
    `topic=${config.topic}`,
    `type=${config.analysisType}`,
  ];
  return parts.join("|");
}

/**
 * Seed for everything belonging to the study rather than to the model.
 *
 * The same window over the same geometry feeds every model the same inputs, so
 * the data-side noise has to be identical whichever model is picked. That is
 * what makes "XGBoost scores a little better than Random Forest on this config"
 * true by construction rather than true on average: the only thing moving
 * between the two runs is the cost-weighted skill term.
 */
export function studySeed(config: RunConfig): number {
  return fnv1a32(canonicalConfigString(config, { includeModel: false }));
}

/** Stable id for a config: RUN_ID_LENGTH base36 characters. */
export function runIdFor(config: RunConfig): string {
  return hashToId(canonicalConfigString(config));
}

/**
 * The id derivation, exposed for its own tests.
 *
 * The two hash words seed a mulberry32 stream that emits the digits, which
 * spreads a single-character input change across the whole id rather than
 * across one position. Two neighbouring configs therefore look nothing alike in
 * a URL or a filename, which is what makes them distinguishable at a glance.
 */
export function hashToId(canonical: string): string {
  const a = fnv1a32(canonical, FNV_OFFSET_BASIS);
  const b = fnv1a32(canonical, FNV_ALT_BASIS);
  const rng = mulberry32((a ^ Math.imul(b, 0x9e3779b1)) >>> 0);
  let out = "";
  for (let i = 0; i < RUN_ID_LENGTH; i += 1) {
    out += BASE36[Math.floor(rng() * 36)];
  }
  return out;
}

/**
 * A purpose-specific seed from a run id and a label path.
 *
 * Every generator draws from its own stream, so the year-on-year draw does not
 * shift because the series gained a month.
 *
 * The separator exists at all because the reference implementation joined on
 * the empty string, which makes `("a", "bc")` and `("ab", "c")` one seed. The
 * labels passed here end in a user-typed area name, so that collision is
 * reachable rather than theoretical: two areas whose names differ only by where
 * the purpose suffix would begin would share a stream and report identical
 * numbers. A separator does not make collisions impossible (a label may contain
 * one), but every key here opens with a fixed-width bounding box, so two keys
 * that differ at all differ before the label is reached.
 */
const SEED_SEPARATOR = "|";

export function seedFor(runId: string, ...labels: readonly string[]): number {
  return fnv1a32([runId, ...labels].join(SEED_SEPARATOR));
}
