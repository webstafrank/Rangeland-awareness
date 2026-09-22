/**
 * A stable id for a validated analysis request.
 *
 * This exists to pair a results URL with the areas held in sessionStorage. The
 * config (topic, type, model) travels in the query string, which is what makes
 * a result link shareable; the areas cannot travel there, because one drawn
 * polygon is kilobytes of coordinates. So the areas go to sessionStorage under
 * this id, and services/handoff/areas.ts refuses to hand them back when the id in
 * the URL does not match the id they were stored under.
 *
 * That refusal is the whole point. Without it, editing `model=` in the address
 * bar would re-render yesterday's areas beside today's configuration and look
 * entirely correct. A confidently wrong answer is the failure mode this guards.
 *
 * The hashing itself is NOT reimplemented here. `hashToId` and `areaSeedKey`
 * come from services/run/hash.ts, which is the one hash implementation in the app;
 * this module only decides what string to feed it. When the backend wiring
 * lands, a run's real id comes from the service and this becomes the
 * pre-submission id only.
 */

import { areaSeedKey, hashToId } from "@/services/run/hash";
import type { AnalysisRequest } from "@/services/analysis/request";

/**
 * The canonical string an id is derived from.
 *
 * Three rules, each mirroring canonicalConfigString in services/run/hash.ts so the
 * two cannot drift into disagreeing about what "the same request" means:
 *
 *   - Keys are written in alphabetical order, never in the order the object
 *     happens to hold them, so a request built by the form and one rebuilt
 *     from a URL hash identically.
 *   - Areas are sorted. Which area was clicked first is presentation, not
 *     identity: comparing A with B is the same study as comparing B with A.
 *   - The leading version tag lets a later change to this encoding invalidate
 *     old ids deliberately rather than collide with them.
 *
 * `areaSeedKey` keys an area by its rounded bounding box and lowercased label,
 * not by its `aoi-<n>` id. Those ids are assigned in selection order, so two
 * identical selections made in a different order would otherwise produce
 * different requests.
 */
export function canonicalRequestString(request: AnalysisRequest): string {
  const areas = request.areas.map(areaSeedKey).sort().join(";");
  return [
    "r1",
    `areas=${areas}`,
    `model=${request.model}`,
    `topic=${request.topic}`,
    `type=${request.analysisType}`,
  ].join("|");
}

/** Stable id for a request. Same alphabet and length as a run id. */
export function requestId(request: AnalysisRequest): string {
  return hashToId(canonicalRequestString(request));
}

/** The query parameter the results page reads the id back from. */
export const RUN_PARAM = "run";
