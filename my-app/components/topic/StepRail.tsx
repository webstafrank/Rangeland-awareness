"use client";

/**
 * The four steps, as a stepper across the top of every step page.
 *
 * A wizard that hides its shape feels longer than it is: the analyst cannot
 * tell whether Continue leads to two more screens or ten, so every step is a
 * small gamble. The rail answers that before the first click, and doubles as
 * the way back to a decision already made.
 *
 * An ordered list of links, not a row of divs. The steps ARE a sequence and
 * they ARE navigation, so `<nav><ol>` is what a screen reader should hear, and
 * the current one carries aria-current="step". It is not a TabList and must
 * not claim to be one: these are links between routes.
 *
 * The marker is the shared StepMarker (components/ui), so a step looks the
 * same here as on the Overview and in Help. Four states, and none of them
 * rests on colour alone:
 *
 *   current    filled marker with its number and a soft ring, the label in
 *              strong ink, aria-current, and ", current step" spoken
 *   complete   filled marker with a check, a link, and ", done" spoken.
 *              Only when the step's requirement is met: see isComplete
 *   upcoming   outlined number, and a link
 *   locked     drawn as upcoming, but plain text rather than a link, and ", not yet
 *              available" spoken
 *
 * From `sm` up a hairline joins each step to the next, turning accent once
 * the step before it is done, so progress reads left to right at a glance.
 * On a phone the connectors go and the four steps share the row evenly:
 * evals/journey.spec.ts holds the rail to one row at 360px.
 */

import Link from "next/link";
import { StepMarker, type StepMarkerState } from "@/components/ui/StepMarker";
import { STEPS, isStepReachable, stepHref, stepIndex, type StepId } from "@/services/analysis/steps";
import type { TopicSlug } from "@/services/analysis/topics";

export interface StepRailProps {
  topic: TopicSlug;
  current: StepId;
  /** Threaded into every step link, so navigating never drops the configuration. */
  query: string;
  /** Whether the review step is unlocked. See furthestReachableStep. */
  canReview: boolean;
}

/**
 * Whether a step is done, which is a claim about the request, not about
 * position. Scope and model always hold a valid value, so passing them is
 * enough. Areas is done only when its requirement is met: walking past it
 * with nothing selected (the rail links ahead, and review is reachable by
 * URL) must not paint a check beside "0 areas". Review is never done; Run
 * leaves the flow.
 */
function isComplete(
  step: StepId,
  index: number,
  currentIndex: number,
  canReview: boolean,
): boolean {
  if (step === "areas") return canReview;
  if (step === "review") return false;
  return index < currentIndex;
}

const LABEL: Record<StepMarkerState, string> = {
  current: "font-semibold text-ink",
  complete: "text-ink-muted group-hover:text-ink",
  upcoming: "text-ink-muted group-hover:text-ink",
  locked: "text-ink-muted",
};

export default function StepRail({
  topic,
  current,
  query,
  canReview,
}: StepRailProps) {
  const currentIndex = stepIndex(current);
  const last = STEPS.length - 1;

  return (
    <nav aria-label="Analysis steps" data-testid="step-rail">
      <ol className="flex items-center">
        {STEPS.map((step, index) => {
          const reachable = isStepReachable(step.id, canReview);
          const state: StepMarkerState =
            step.id === current
              ? "current"
              : isComplete(step.id, index, currentIndex, canReview)
                ? "complete"
                : reachable
                  ? "upcoming"
                  : "locked";

          const body = (
            <>
              <StepMarker number={index + 1} state={state} />
              <span
                className={`type-caption1 whitespace-nowrap transition-colors duration-150 sm:type-body1 ${LABEL[state]}`}
              >
                {step.label}
              </span>
            </>
          );

          // 44px tall for a thumb, and narrow enough that four fit one row at
          // 360px: the marker and the word, with 6px between, and no more.
          const shell =
            "group flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-fluent-medium px-1 sm:shrink-0 sm:justify-start sm:gap-2 sm:px-2";

          return (
            <li
              key={step.id}
              // Each step takes an equal share of the row on a phone. From sm
              // up the step hugs its content and the connector after it takes
              // the slack, so the four sit evenly across the band.
              className={`flex min-w-0 flex-1 items-center ${index < last ? "sm:flex-1" : "sm:flex-none"}`}
            >
              {state === "current" ? (
                <span aria-current="step" className={shell}>
                  {body}
                  <span className="sr-only">, current step</span>
                </span>
              ) : state === "locked" ? (
                <span className={shell}>
                  {body}
                  {/*
                    Said out loud rather than implied: locked looks like upcoming, and
                    only this text and the missing link tell the two apart.

                    Deliberately NOT aria-disabled: on a bare span with no
                    role, that attribute is inert to every assistive
                    technology, so it would read as coverage while doing
                    nothing. The text is what actually carries the state.
                  */}
                  <span className="sr-only">, not yet available</span>
                </span>
              ) : (
                <Link
                  href={stepHref(topic, step, query)}
                  className={`${shell} hover:bg-page`}
                >
                  {body}
                  {state === "complete" && <span className="sr-only">, done</span>}
                </Link>
              )}

              {index < last && (
                <span
                  aria-hidden="true"
                  className={`mx-2 hidden h-px min-w-6 flex-1 sm:block ${
                    state === "complete" ? "bg-accent" : "bg-edge-strong"
                  }`}
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
