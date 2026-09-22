/**
 * The wizard's steps, as a registry.
 *
 * The four decisions that used to sit on one scrolling page are now four
 * routes. That is a URL design, not a styling choice, so it lives here as data
 * rather than as four page files that each know a little about the others:
 *
 *   /topics/<slug>          scope    which analysis type
 *   /topics/<slug>/model    model    which model
 *   /topics/<slug>/areas    areas    where
 *   /topics/<slug>/review   review   check it, then run
 *
 * Why split at all: the single page put eight controls and a 620px map in one
 * viewport, so the two set-once decisions competed with the iterative one and
 * neither got room. Split, each step owns the screen while it is being made,
 * and the rail at the top is what stops the flow feeling longer than it is.
 *
 * Everything here is pure and gate-tested in node. The React plumbing is in
 * components/topic/, and the shared state is in selection-store.ts.
 */

import type { Route } from "next";
import type { TopicSlug } from "@/services/analysis/topics";

export const STEP_IDS = ["scope", "model", "areas", "review"] as const;
export type StepId = (typeof STEP_IDS)[number];

export interface Step {
  id: StepId;
  /**
   * The path segment under /topics/<slug>. Empty for the first step, so the
   * topic's own URL IS step one: a link from the homepage lands on the first
   * decision rather than on a redirect.
   */
  segment: string;
  /** Short label, for the rail. Two words at most, or the rail wraps at 360px. */
  label: string;
  /** What the step asks, in the step's own heading. */
  title: string;
  /** One line under the heading saying how to decide. */
  hint: string;
}

export const STEPS: readonly Step[] = [
  {
    id: "scope",
    segment: "",
    label: "Scope",
    title: "What is the scope?",
    hint: "Analyse one area in detail, or several ranked against each other. This sets how many areas the next steps will let you pick.",
  },
  {
    id: "model",
    segment: "model",
    label: "Model",
    title: "Which model should run?",
    hint: "Pick on the trade-off, not the name. Combined runs both and reports where they disagree.",
  },
  {
    id: "areas",
    segment: "areas",
    label: "Areas",
    title: "Which areas?",
    hint: "Click or draw on the map, type a coordinate, or upload a shapefile. Mix these freely; every selection zooms the map to what you picked.",
  },
  {
    id: "review",
    segment: "review",
    label: "Review",
    title: "Review and run",
    hint: "The request is validated before it is sent. Nothing is submitted until every choice above is made.",
  },
];

const STEP_BY_ID: ReadonlyMap<StepId, Step> = new Map(
  STEPS.map((step) => [step.id, step]),
);

/**
 * Non-optional, unlike getTopic: a StepId comes from this module's own union,
 * so an unknown one is a programming error rather than bad user input.
 */
export function getStep(id: StepId): Step {
  const found = STEP_BY_ID.get(id);
  if (!found) throw new Error(`unknown step: ${id}`);
  return found;
}

/** Zero-based position, which is what the rail and the next/previous helpers use. */
export function stepIndex(id: StepId): number {
  return STEP_IDS.indexOf(id);
}

/** The step before this one, or null at the start. */
export function previousStep(id: StepId): Step | null {
  const index = stepIndex(id);
  return index > 0 ? STEPS[index - 1] : null;
}

/** The step after this one, or null at the end. */
export function nextStep(id: StepId): Step | null {
  const index = stepIndex(id);
  return index < STEPS.length - 1 ? STEPS[index + 1] : null;
}

/**
 * The href for a step, carrying a query string through.
 *
 * The query is threaded rather than dropped because type and model live in the
 * URL (see url-state.ts) and a step link that lost them would silently reset
 * the analyst's configuration on every Continue. `query` is expected in the
 * form writeUrlSelection returns: "" or "?a=b".
 */
export function stepHref(
  topic: TopicSlug,
  step: Step | StepId,
  query = "",
): Route {
  const resolved = typeof step === "string" ? getStep(step) : step;
  const base = `/topics/${topic}`;
  const path = resolved.segment === "" ? base : `${base}/${resolved.segment}`;
  // Next's typed routes cannot check a path assembled at runtime, so the cast
  // is unavoidable. It is done ONCE, here, rather than at each Link: the
  // segments come from STEPS and the slugs from TOPIC_SLUGS, and
  // steps.test.ts asserts every produced href against the routes that exist.
  return `${path}${query}` as Route;
}

/**
 * How far the flow has legitimately been taken, given what has been chosen.
 *
 * Scope and model always have a value (the reducer starts on defaults), so the
 * first three steps are always reachable. Review is only reachable once the
 * areas requirement is met, because a review of an unrunnable request is a
 * page that exists only to say no.
 *
 * This is what the rail uses to decide which steps are links and which are
 * plain text, and what the areas step's Continue button reads to disable
 * itself. It is deliberately NOT a route guard: deep-linking /review with
 * nothing selected renders the review page with its blocking reason stated,
 * which is more useful than a redirect that loses the URL the analyst typed.
 */
export function furthestReachableStep(canReview: boolean): StepId {
  return canReview ? "review" : "areas";
}

/** True when `step` may be navigated to, given whether review is unlocked. */
export function isStepReachable(step: StepId, canReview: boolean): boolean {
  return stepIndex(step) <= stepIndex(furthestReachableStep(canReview));
}

/**
 * Resolve a route segment back to its step.
 *
 * Returns undefined for anything unknown so the caller decides. Only used by
 * tests and by the rail's self-check today; the routes themselves know their
 * own step by construction, which is the point of a file-per-step layout.
 */
export function stepForSegment(segment: string): Step | undefined {
  return STEPS.find((step) => step.segment === segment);
}

/**
 * Routes under /topics/<slug> that are NOT steps.
 *
 * `results` is where a run lands. It is deliberately not in STEPS, and that is
 * a product decision rather than a technical one:
 *
 *   - The rail is a map of decisions still to make. Results is not a decision,
 *     it is the consequence of all four, so a fifth pill would invite a click
 *     to somewhere there is nothing to configure.
 *   - The rail is sized so four pills fit one row at 360px. A fifth wraps, and
 *     the eval that asserts the single row is the one that would catch it.
 *   - The homepage says "four steps, one screen each" and reads the count off
 *     STEPS. A fifth entry rewrites that copy as a side effect.
 *
 * It is listed here rather than left implicit so the on-disk check below still
 * has both directions covered: every route is either a step or a declared
 * terminal, and anything else is a leftover that still answers requests.
 */
export const TERMINAL_SEGMENTS = ["results"] as const;
export type TerminalSegment = (typeof TERMINAL_SEGMENTS)[number];

/** True when `segment` is a declared non-step route under /topics/<slug>. */
export function isTerminalSegment(segment: string): segment is TerminalSegment {
  return (TERMINAL_SEGMENTS as readonly string[]).includes(segment);
}

/**
 * The href for a terminal route. Same contract as stepHref, including the
 * single cast: the segment comes from TERMINAL_SEGMENTS and the slug from
 * TOPIC_SLUGS, and steps.test.ts checks the produced href against the routes
 * that exist on disk.
 */
export function terminalHref(
  topic: TopicSlug,
  segment: TerminalSegment,
  query = "",
): Route {
  return `/topics/${topic}/${segment}${query}` as Route;
}
