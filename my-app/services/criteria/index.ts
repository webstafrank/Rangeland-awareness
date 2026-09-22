/**
 * Which method each topic runs, and its criteria if it runs an overlay.
 *
 * Two topics are weighted overlays today (flood risk, landslide) and three are
 * on the model track. `methodFor` is the single place that decides, so a page
 * cannot render a model picker for a topic that has no model, or a weight form
 * for one that has no criteria.
 */

import { FLOOD_METHOD } from "@/services/criteria/flood";
import { LANDSLIDE_METHOD } from "@/services/criteria/landslide";
import type { Criterion, TopicMethod } from "@/services/criteria/types";

export * from "@/services/criteria/types";
export { FLOOD_CRITERIA, FLOOD_DEFAULT_WEIGHTS, FLOOD_METHOD } from "@/services/criteria/flood";
export { LANDSLIDE_CRITERIA, LANDSLIDE_METHOD } from "@/services/criteria/landslide";

/**
 * Keyed by topic slug. A topic absent from this table runs a model, which is
 * the default rather than an error: the three remaining topics are on the ML
 * track and will get their methods when a backend exists.
 */
const METHODS: Readonly<Record<string, TopicMethod>> = {
  "flood-risk": FLOOD_METHOD,
  landslide: LANDSLIDE_METHOD,
};

const MODEL_METHOD: TopicMethod = { kind: "model" };

export function methodFor(topic: string): TopicMethod {
  return METHODS[topic] ?? MODEL_METHOD;
}

/** True when the topic is scored by weighted overlay rather than by a model. */
export function isOverlayTopic(topic: string): boolean {
  return methodFor(topic).kind === "weighted-overlay";
}

/** The criteria for an overlay topic, or an empty list for a model topic. */
export function criteriaFor(topic: string): readonly Criterion[] {
  const method = methodFor(topic);
  return method.kind === "weighted-overlay" ? method.criteria : [];
}

export function criterionFor(topic: string, id: string): Criterion | undefined {
  return criteriaFor(topic).find((c) => c.id === id);
}

/**
 * Criteria whose class tables cannot be used as shipped.
 *
 * Rendered as a blocking reason: an overlay run against an unfilled table
 * produces nodata for that criterion, and since the weighted sum drops any
 * pixel where a criterion is missing, the result would be an empty map rather
 * than a wrong one. Better to say so before the run than after it.
 */
export function unfilledCriteria(topic: string): readonly Criterion[] {
  return criteriaFor(topic).filter((criterion) => {
    if (criterion.calibration !== "required") return false;
    const { scale } = criterion;
    if (scale.kind === "categorical") return scale.classes.length === 0;
    if (scale.kind === "continuous") return scale.classes.length === 0;
    return false;
  });
}
