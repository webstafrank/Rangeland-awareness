"use client";

/**
 * The frame every step renders inside.
 *
 * Four routes that each drew their own rail, heading and footer would drift
 * apart within a week, and the thing that makes a split flow feel like one
 * flow is precisely that the furniture does not move between steps. So the
 * furniture lives here and a step supplies only its own content.
 *
 * The footer is sticky and carries two things:
 *
 *   the receipt   All four decisions on one line, at every step. This matters
 *                 more now than it did on the single page: the analyst can no
 *                 longer scroll up to check which model they picked, because
 *                 it is on another URL.
 *   the movement  Back, and the one red control that goes forward.
 *
 * Continue is a Link, not a button with a router.push. It is a real navigation
 * to a real URL, so it should be middle-clickable, openable in a new tab and
 * visible in the status bar — all of which a button throws away.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import RequestReceipt from "@/components/topic/RequestReceipt";
import StepRail from "@/components/topic/StepRail";
import { getStep, nextStep, previousStep, stepHref, type StepId } from "@/lib/analysis/steps";
import type { Topic } from "@/lib/analysis/topics";
import type { Wizard } from "@/components/topic/useWizard";

export interface StepShellProps {
  topic: Topic;
  step: StepId;
  wizard: Wizard;
  /**
   * Why Continue is refusing, or null when it is not. Only the areas step
   * passes this: scope and model always hold a valid value, and review has no
   * Continue at all.
   */
  blockedReason?: string | null;
  /** Replaces the Continue control entirely. The review step passes its Run action. */
  action?: ReactNode;
  /** Wider than `step` for the areas step, which has a map to house. */
  width?: "step" | "band";
  children: ReactNode;
}

/**
 * The last step path this module rendered, across mounts.
 *
 * Module scope on purpose: each step is a separate component that mounts fresh
 * on every navigation, so a ref inside one of them cannot tell "the flow just
 * moved" from "the page just loaded". Null until the first step renders, which
 * is what keeps a cold page load from stealing focus out of the address bar.
 */
let lastStepPath: string | null = null;

export default function StepShell({
  topic,
  step,
  wizard,
  blockedReason = null,
  action,
  width = "step",
  children,
}: StepShellProps) {
  const spec = getStep(step);
  const back = previousStep(step);
  const forward = nextStep(step);
  const { query, state, validation, canReview, model } = wizard;
  const pathname = usePathname();

  /*
   * The band width is the same on every step. Only the CONTENT narrows.
   *
   * The first version applied the step width to this wrapper, so the rail and
   * the footer were 980px wide on three steps and 1440px on the areas step:
   * every entry to and exit from Areas slid the rail and the run bar about
   * 230px sideways. Which is precisely the thing the file comment above says
   * must not happen, and it went unnoticed because each screenshot looks
   * correct on its own.
   *
   * So the frame is fixed and the content column is left-aligned inside it.
   * The rail, the heading and the footer now start at the same x on all four
   * steps; a narrow step simply ends sooner on the right.
   */
  const container = "mx-auto w-full max-w-band px-gutter lg:px-gutter-lg";
  const column = width === "band" ? "w-full" : "w-full max-w-step";

  /*
   * Move focus to the step's heading when the flow moves, and only then.
   *
   * Splitting one page into four made this a real regression rather than a
   * nicety. On the single page, pressing a control left focus on that control.
   * Here, Continue is a navigation: the old document's focus is gone, focus
   * resets to <body>, and a keyboard user has to tab back in from the skip
   * link on every step. Next's route announcer says the title changed, which
   * is the other half of the problem and not this one.
   *
   * tabIndex -1 makes the heading focusable without putting it in the tab
   * order, which is the standard shape for a route-change focus target.
   * preventScroll, because the browser has already put the new page at the top
   * and a scroll-into-view here would fight it.
   */
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const moved = lastStepPath !== null && lastStepPath !== pathname;
    lastStepPath = pathname;
    if (moved) headingRef.current?.focus({ preventScroll: true });
  }, [pathname]);

  return (
    <div className="flex flex-1 flex-col">
      {/* The rail sits on the page ground, directly under the topic band, so
          it reads as a property of the topic rather than of this one step. */}
      <div className="border-b border-edge bg-surface">
        <div className={`${container} py-4`}>
          <StepRail
            topic={topic.slug}
            current={step}
            query={query}
            canReview={canReview}
          />
        </div>
      </div>

      <div className={`${container} pt-10 lg:pt-12`}>
        <div className={column}>
          <h2
            ref={headingRef}
            tabIndex={-1}
            className="text-2xl font-semibold tracking-tight outline-none lg:text-3xl"
          >
            {spec.title}
          </h2>
          <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-ink-muted">
            {spec.hint}
          </p>

          <div className="mt-8">{children}</div>
        </div>
      </div>

      {/* Spacer, so the sticky bar cannot sit on top of the last control. */}
      <div aria-hidden="true" className="h-28" />

      {/*
        py-2.5 below lg, not py-4. Measured at 360x640: the bar was 139px of a
        640px viewport, which pushed the scope step's second radio card off the
        fold on the one screen where the choice is the whole point. The receipt
        is what makes it two rows on a phone, and it is worth keeping — the
        other three decisions are on other URLs now — so the padding gives way
        instead.
      */}
      <div className="sticky bottom-0 z-action-bar mt-auto border-t border-edge bg-surface shadow-lifted">
        <div
          className={`${container} flex flex-col gap-2.5 py-2.5 lg:flex-row lg:items-center lg:gap-6 lg:py-4`}
        >
          <RequestReceipt
            topic={topic}
            analysisType={wizard.spec}
            model={model}
            areaCount={state.areas.length}
            validation={validation}
          />

          <div className="flex items-center gap-3 lg:ml-auto lg:shrink-0">
            {back !== null && (
              <Link
                href={stepHref(topic.slug, back, query)}
                className="rounded-lg border border-edge-strong bg-surface px-4 py-2.5 text-sm font-semibold text-ink-muted hover:bg-sunken hover:text-ink"
              >
                <span aria-hidden="true">&larr;</span> {back.label}
              </Link>
            )}

            {action ??
              (forward !== null &&
                (blockedReason === null ? (
                  <Link
                    href={stepHref(topic.slug, forward, query)}
                    data-testid="step-continue"
                    className="rounded-lg bg-action px-6 py-2.5 text-sm font-semibold text-white shadow-card transition-colors hover:bg-action-hover"
                  >
                    Continue <span aria-hidden="true">&rarr;</span>
                  </Link>
                ) : (
                  // A disabled anchor is not a thing, so a refusing Continue is
                  // a real disabled button with its reason printed beside it
                  // rather than hidden in a tooltip.
                  <div className="flex flex-col items-stretch gap-2 lg:flex-row lg:items-center lg:gap-4">
                    <p
                      data-testid="step-blocked-reason"
                      className="order-2 max-w-xs text-xs leading-snug text-ink-muted lg:order-1 lg:text-right"
                    >
                      {blockedReason}
                    </p>
                    <button
                      type="button"
                      disabled
                      data-testid="step-continue"
                      className="order-1 cursor-not-allowed rounded-lg bg-sunken px-6 py-2.5 text-sm font-semibold text-ink-faint lg:order-2"
                    >
                      Continue <span aria-hidden="true">&rarr;</span>
                    </button>
                  </div>
                )))}
          </div>
        </div>
      </div>
    </div>
  );
}
