"use client";

/**
 * The run button and the one reason it is disabled.
 *
 * Split from the result panel on purpose. The button belongs in the sticky
 * action bar, where it is reachable at any scroll position; the payload it
 * produces belongs in the page, where it has room to be read. One component
 * rendering in both places would mean two buttons and two copies of every id.
 *
 * Rubric T8: the reason is printed on the page, not hidden in a tooltip, so it
 * is available to a screen reader and to anyone who never hovers.
 *
 * Two exports because StepShell places them in two slots: the button where the
 * other three steps put Continue, the reason where a refusing Continue prints
 * its own. Same skin as Continue (footer-controls.ts), so forward is one
 * control all the way through the flow, enabled or not.
 */

import { Play20Filled } from "@/components/ui/icons";
import {
  footerNoteClass,
  forwardClasses,
  shortAreaReason,
} from "@/components/topic/footer-controls";
import type { AnalysisType } from "@/services/analysis/models";
import { blockingReason, type ValidationResult } from "@/services/analysis/request";

export interface RunActionProps {
  validation: ValidationResult;
  onRun: () => void;
}

/**
 * Why Run is disabled, or nothing when it is not. The area rule is the only
 * one a user can fail, and it gets the same short line Continue uses; any
 * other problem falls back to services' own sentence.
 */
export function RunBlockedReason({
  validation,
  areaCount,
  spec,
}: {
  validation: ValidationResult;
  areaCount: number;
  spec: AnalysisType;
}) {
  if (validation.ok) return null;
  const reason =
    validation.problems.every((problem) => problem.field === "areas")
      ? (shortAreaReason(areaCount, spec) ?? blockingReason(validation))
      : blockingReason(validation);
  if (reason === null) return null;
  return (
    <p data-testid="run-blocked-reason" className={footerNoteClass}>
      {reason}
    </p>
  );
}

export default function RunAction({ validation, onRun }: RunActionProps) {
  return (
    // Primary, like Continue: Run is the last step of the same forward
    // movement, and a secondary skin would make the only irreversible control
    // on the site look optional. Same size as Continue: one button scale.
    // Play is Fluent's own icon for starting a job.
    <button
      type="button"
      disabled={!validation.ok}
      onClick={onRun}
      className={forwardClasses}
    >
      <Play20Filled aria-hidden="true" />
      Run analysis
    </button>
  );
}
