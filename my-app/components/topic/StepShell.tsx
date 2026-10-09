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
 *   the movement  Back, and the one primary control that goes forward.
 *
 * Continue is a Link, not a button with a router.push. It is a real navigation
 * to a real URL, so it should be middle-clickable, openable in a new tab and
 * visible in the status bar — all of which a button throws away.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import { ArrowLeft20Regular, ArrowRight20Regular } from "@/components/ui/icons";
import RequestReceipt from "@/components/topic/RequestReceipt";
import { backClasses, footerNoteClass, forwardClasses } from "@/components/topic/footer-controls";
import StepRail from "@/components/topic/StepRail";
import { getStep, nextStep, previousStep, stepHref, type StepId } from "@/services/analysis/steps";
import type { Topic } from "@/services/analysis/topics";
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
  /**
   * Printed beside `action`, in the slot a refusing Continue uses for its
   * reason. The review step passes why Run is disabled, styled with
   * `footerNoteClass` (footer-controls.ts) so the two match.
   */
  actionNote?: ReactNode;
  /** Wider than `step` for the areas step, which has a map to house. */
  width?: "step" | "band";
  /**
   * A side rail beside the step's content from lg (under it below lg). Scope
   * and model pass the request so far, which is what lets them use the band's
   * width instead of stopping at a reading column.
   */
  aside?: ReactNode;
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
  actionNote,
  width = "step",
  aside,
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
  const column = width === "band" || aside ? "w-full" : "w-full max-w-step";

  /*
   * Why forward is refusing, printed in the footer. A step's own Continue
   * reason, or the note the review step passes beside Run. One slot, so the
   * two read in the same place and the same type.
   */
  const reason =
    actionNote ??
    (action === undefined && forward !== null && blockedReason !== null ? (
      <p data-testid="step-blocked-reason" className={footerNoteClass}>
        {blockedReason}
      </p>
    ) : null);

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
          it reads as a property of the topic rather than of this one step.
          data-step-rail tells the step template (app/topics/[topic]/template.tsx)
          that this page has furniture to hold still, so it fades step-body
          below instead of the whole page. */}
      <div data-step-rail className="border-b border-edge bg-surface">
        <div className={container}>
          <StepRail
            topic={topic.slug}
            current={step}
            query={query}
            canReview={canReview}
          />
        </div>
      </div>

      <div className={`${container} pt-5 lg:pt-6`}>
        {/* The part of the page that is this step's own, and the only part
            that fades in when the flow moves (step-body in globals.css). */}
        <div className={`step-body ${column}`}>
          <h2
            ref={headingRef}
            tabIndex={-1}
            className="type-subtitle1 text-ink outline-none lg:type-title3"
          >
            {spec.title}
          </h2>
          <p className="type-body1 mt-1 max-w-2xl text-ink-muted">
            {spec.hint}
          </p>

          {aside ? (
            // A step with a side rail: the decision on the left, the rail on
            // the right from lg, under the decision below it. The step uses
            // the band's width, so it does not stop at 980px while the rail
            // and the header run the full band.
            <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
              <div className="min-w-0">{children}</div>
              <aside className="min-w-0">{aside}</aside>
            </div>
          ) : (
            <div className="mt-5">{children}</div>
          )}
        </div>
      </div>

      {/*
        No spacer above the bar. The bar is sticky, not fixed, so at the end
        of the page it sits in the flow under the last control and can never
        cover it; the h-16 spacer that used to live here only added 64px of
        empty canvas (190px on a phone, with the bar). pb-6 is breathing room.
      */}
      <div aria-hidden="true" className="h-6" />

      {/*
        The bar is kept short on purpose, and the receipt is what makes that
        hard. Measured at 360x640 it was 125px of a 640px viewport — the
        receipt wrapping to two lines, then the buttons under it — which pushed
        the scope step's second radio card off the fold on the one screen where
        the choice is the whole point.

        The receipt stays, because the other three decisions live on other URLs
        now and this is the only place all four are readable at once. What
        gives way is the padding, and the receipt's own wrapping: see
        RequestReceipt, which is one scrollable line below `sm`.
      */}
      <div className="sticky bottom-0 z-action-bar mt-auto border-t border-edge bg-surface shadow-up">
        <div
          className={`${container} flex flex-col gap-2 py-2 lg:flex-row lg:items-center lg:gap-6 lg:py-2.5`}
        >
          <RequestReceipt
            topic={topic}
            analysisType={wizard.spec}
            model={model}
            areaCount={state.areas.length}
            validation={validation}
          />

          {/*
            The movement: one row at every width. Any refusal reason takes
            the room to the left of the buttons, one short line (two at most
            on a phone, never taller than the buttons), so the bar stays two
            rows on a phone and one from lg.
          */}
          <div className="flex min-h-8 items-center gap-3 lg:ml-auto lg:shrink-0 lg:gap-4">
            {reason}

            <div className="ml-auto flex shrink-0 items-center gap-2">
              {back !== null && (
                <Link
                  href={stepHref(topic.slug, back, query)}
                  className={backClasses}
                >
                  <ArrowLeft20Regular aria-hidden="true" />
                  {back.label}
                </Link>
              )}

              {action ??
                (forward !== null &&
                  (blockedReason === null ? (
                    <Link
                      href={stepHref(topic.slug, forward, query)}
                      data-testid="step-continue"
                      className={forwardClasses}
                    >
                      Continue
                      <ArrowRight20Regular aria-hidden="true" />
                    </Link>
                  ) : (
                    // A disabled anchor is not a thing, so a refusing Continue
                    // is a real disabled button, wearing the same skin as the
                    // link it becomes (footer-controls.ts), with its reason
                    // printed beside it rather than hidden in a tooltip.
                    <button
                      type="button"
                      disabled
                      data-testid="step-continue"
                      className={forwardClasses}
                    >
                      Continue
                      <ArrowRight20Regular aria-hidden="true" />
                    </button>
                  )))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
