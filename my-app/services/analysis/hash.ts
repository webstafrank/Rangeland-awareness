/**
 * The content hash behind `runId`.
 *
 * A run id is the identity of a result. Two people who build the same config on
 * two machines must land on the same URL, and that URL must still resolve to the
 * same numbers next year, so the hash cannot use anything ambient: no clock, no
 * `Math.random`, no `crypto.randomUUID`, no object key order, no locale.
 *
 * FNV-1a, twice, with two offset bases, mixed into base36 digits. FNV-1a is a
 * few lines, has no platform dependency at all (only `Math.imul` and uint32
 * arithmetic), and gives about 57 usable bits at RUN_ID_LENGTH characters. That
 * is not a cryptographic hash and does not need to be: nothing here is a
 * security boundary, it is a cache key for a pure function.
 */
import type { RunConfig } from "@/contracts/analysis";
import { RUN_ID_LENGTH } from "./constants";
import { mulberry32 } from "./rng";

/** Standard FNV-1a 32-bit offset basis. */
export const FNV_OFFSET_BASIS = 0x811c9dc5;
/** A second basis, so one string yields two independent-looking words. Any odd constant works. */
export const FNV_ALT_BASIS = 0x1000193;
const FNV_PRIME = 0x01000193;

const BASE36 = "0123456789abcdefghijklmnopqrstuvwxyz";

/**
 * FNV-1a over the UTF-16 code units of `input`. Code units rather than bytes
 * because the inputs here are ASCII slugs and ISO dates, where the two agree,
 * and staying in code units avoids depending on a TextEncoder.
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
 * The one canonical string form of a config.
 *
 * Fields are written in alphabetical order of key, never in the order the
 * calling object happens to hold them, so a config assembled by a form, a URL
 * parse and a test literal all hash identically.
 *
 * Areas are sorted. Area order is presentation (which line is drawn first), not
 * identity: comparing Turkana with Marsabit is the same study as comparing
 * Marsabit with Turkana, and giving them one id means one shared URL and one
 * cached result. The result's `areas` array still follows the order the caller
 * asked for.
 *
 * The leading version tag means a later change to this encoding can invalidate
 * old ids on purpose instead of colliding with them.
 */
export function canonicalConfigString(
  config: RunConfig,
  options: { readonly includeModel?: boolean } = {},
): string {
  const includeModel = options.includeModel ?? true;
  const areas = [...config.areas].sort().join(",");
  const parts = [
    "v1",
    `areas=${areas}`,
    `from=${config.dateRange.start}`,
    ...(includeModel ? [`model=${config.model}`] : []),
    `to=${config.dateRange.end}`,
    `topic=${config.topic}`,
    `type=${config.analysisType}`,
  ];
  return parts.join("|");
}

/**
 * Seed for everything that belongs to the study rather than to the model: the
 * same window over the same counties feeds both models the same inputs, so the
 * data-side noise has to be identical whichever model is picked. That is what
 * makes "XGBoost scores slightly better than Random Forest on the same config"
 * true by construction rather than true on average: the only thing that moves
 * between the two runs is the cost-weighted skill term.
 */
export function studySeed(config: RunConfig): number {
  return fnv1a32(canonicalConfigString(config, { includeModel: false }));
}

/**
 * Stable id for a config: RUN_ID_LENGTH base36 characters.
 *
 * The two hash words seed a mulberry32 stream that emits the digits, which
 * spreads single-character input changes across the whole id. A one-field
 * change therefore looks nothing like the original, which is what makes the ids
 * distinguishable at a glance in a URL or a filename.
 */
export function runIdFor(config: RunConfig): string {
  return hashToId(canonicalConfigString(config));
}

/** The id derivation, exposed for its own tests and for hashing non-config strings. */
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
 * Derives a purpose-specific seed from a run id and a label path.
 *
 * Every generator draws from its own stream: the map overlay must not shift
 * because the series gained a month. Labels are joined with a separator that
 * cannot appear in an area id or a topic id, so `("turkana", "series")` and
 * `("turkana|series")` cannot collide.
 */
export function seedFor(runId: string, ...labels: readonly string[]): number {
  return fnv1a32([runId, ...labels].join(""));
}
