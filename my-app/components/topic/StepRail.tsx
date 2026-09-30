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
 * Drawn as a Fluent TabList: flush items on the panel tier, the current one
 * carrying the 3px brand indicator along its bottom edge. It is NOT a real
 * TabList, and should not be: these are links between routes, so `<nav><ol>`
 * with aria-current is the correct semantics and `role="tab"` would be a lie.
 *
 * Colour does three jobs here and none of them alone: the current step is
 * brand AND underlined AND filled AND marked aria-current; a completed step
 * carries a checkmark icon AND is a link; an unreachable one is faint AND
 * plain text with the reason spoken. Nothing is carried by colour by itself.
 */

import Link from "next/link";
import { CheckmarkCircle16Filled } from "@/components/ui/icons";
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
      <ol className="flex items-stretch gap-0.5 sm:gap-1">
        {STEPS.map((step, index) => {
          const isCurrent = step.id === current;
          const isDone = index < currentIndex;
          const reachable = isStepReachable(step.id, canReview);

          const marker = [
            "grid h-5 w-5 shrink-0 place-items-center rounded-full font-mono text-[10px] font-semibold tabular-nums sm:text-[11px]",
            isCurrent
              ? "bg-accent text-white"
              : isDone
                ? "text-accent"
                : reachable
                  ? "border border-ink-faint text-ink-muted"
                  : "border border-edge-strong text-ink-faint",
          ].join(" ");

          const body = (
            <>
              <span aria-hidden="true" className={marker}>
                {/* A completed step shows a checkmark, not its number: the
                    number is what is still ahead of you, the check is what
                    is behind. Fluent's CheckmarkCircle, the design system's
                    "succeeded" icon. */}
                {isDone ? <CheckmarkCircle16Filled className="h-5 w-5" /> : index + 1}
              </span>
              <span className="type-caption1 whitespace-nowrap sm:type-body1">{step.label}</span>
            </>
          );

          // Sized so four of these fit one row at 360px. At a larger size the
          // rail wrapped to two rows on a phone and cost 125px of a 640px
          // viewport; all four labels still ship, because a numbered marker
          // with no word next to it tells you where you are and not what it is.
          //
          // The indicator is an inset box-shadow rather than a border so the
          // three states share one box and the label never shifts by 3px.
          const shell =
            "flex min-h-10 items-center justify-center gap-1.5 rounded-t-fluent-medium px-1.5 transition-colors sm:min-h-11 sm:gap-2 sm:px-3";

          return (
            <li key={step.id} className="min-w-0 flex-1 sm:flex-none">
              {isCurrent ? (
                <span
                  aria-current="step"
                  className={`${shell} font-semibold text-ink shadow-[inset_0_-3px_0_var(--color-accent)]`}
                >
                  {body}
                  <span className="sr-only">, current step</span>
                </span>
              ) : reachable ? (
                <Link
                  href={stepHref(topic, step, query)}
                  className={`${shell} text-ink-muted hover:bg-page hover:text-ink hover:shadow-[inset_0_-3px_0_var(--color-edge-strong)]`}
                >
                  {body}
                </Link>
              ) : (
                <span className={`${shell} text-ink-faint`}>
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
