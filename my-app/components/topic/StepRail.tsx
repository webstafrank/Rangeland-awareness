"use client";

/**
 * The four steps, as a rail across the top of every step page.
 *
 * A wizard that hides its shape feels longer than it is: the analyst cannot
 * tell whether Continue leads to two more screens or ten, so every step is a
 * small gamble. The rail answers that before the first click, and doubles as
 * the way back to a decision already made.
 *
 * An ordered list of links, not a row of divs. The steps ARE a sequence and
 * they ARE navigation, so `<nav><ol>` is what a screen reader should hear, and
 * the current one carries aria-current="step".
 *
 * Colour does three jobs here and none of them alone: the current step is red
 * AND filled AND marked aria-current; a completed step is navy AND a link; an
 * unreachable one is faint AND rendered as plain text with the reason on the
 * list. Nothing in this component is carried by colour by itself.
 */

import Link from "next/link";
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

export default function StepRail({
  topic,
  current,
  query,
  canReview,
}: StepRailProps) {
  const currentIndex = stepIndex(current);

  return (
    <nav aria-label="Analysis steps" data-testid="step-rail">
      <ol className="flex items-stretch gap-1.5 sm:flex-wrap sm:gap-3">
        {STEPS.map((step, index) => {
          const isCurrent = step.id === current;
          const isDone = index < currentIndex;
          const reachable = isStepReachable(step.id, canReview);

          const marker = [
            "grid h-5 w-5 shrink-0 place-items-center rounded-full border font-mono text-[10px] font-bold sm:h-6 sm:w-6 sm:text-[11px]",
            isCurrent
              ? "border-action bg-action text-white"
              : isDone
                ? "border-accent bg-accent text-white"
                : reachable
                  ? "border-edge-strong bg-surface text-ink-muted"
                  : "border-edge bg-sunken text-ink-faint",
          ].join(" ");

          const body = (
            <>
              <span aria-hidden="true" className={marker}>
                {/* A completed step shows a tick, not its number: the number is
                    what is still ahead of you, the tick is what is behind. */}
                {isDone ? "✓" : index + 1}
              </span>
              <span className="whitespace-nowrap text-[11px] font-semibold tracking-tight sm:text-[13px]">
                {step.label}
              </span>
            </>
          );

          // Sized so four of these fit one row at 360px. At the previous size
          // the rail wrapped to two rows on a phone and cost 125px of a 640px
          // viewport; all four labels still ship, because a numbered pill with
          // no word next to it tells you where you are and not what it is.
          const shell =
            "flex items-center justify-center gap-1.5 rounded-lg border px-1.5 py-1.5 transition-colors sm:gap-2 sm:px-3 sm:py-2";

          return (
            <li key={step.id} className="min-w-0 flex-1 sm:flex-none">
              {isCurrent ? (
                <span
                  aria-current="step"
                  className={`${shell} border-action-border bg-action-soft text-action`}
                >
                  {body}
                  <span className="sr-only">, current step</span>
                </span>
              ) : reachable ? (
                <Link
                  href={stepHref(topic, step, query)}
                  className={`${shell} border-edge bg-surface text-ink hover:border-accent-border hover:bg-accent-soft`}
                >
                  {body}
                </Link>
              ) : (
                <span className={`${shell} border-edge bg-sunken text-ink-faint`}>
                  {body}
                  {/*
                    Said out loud rather than implied by the grey, because the
                    grey is invisible to the people most likely to be stuck.

                    Deliberately NOT aria-disabled: on a bare span with no
                    role, that attribute is inert to every assistive
                    technology, so it would read as coverage while doing
                    nothing. The text is what actually carries the state.
                  */}
                  <span className="sr-only">, not yet available</span>
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
