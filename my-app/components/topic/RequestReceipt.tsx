"use client";

/**
 * A one-line restatement of the whole request, always visible.
 *
 * The rail is taller than the viewport once a few areas are selected, so the
 * model the analyst chose scrolls out of sight while they are still working.
 * This is the line that keeps all four decisions readable at every scroll
 * position, in every state, without opening anything.
 *
 * The chip for whatever is currently blocking the run becomes a small warning
 * badge, so the gap is pointed at here as well as stated beside the button.
 */

import type { ValidationResult } from "@/services/analysis/request";
import type { AnalysisType, ModelChoice } from "@/services/analysis/models";
import type { Topic } from "@/services/analysis/topics";

export interface RequestReceiptProps {
  topic: Topic;
  analysisType: AnalysisType;
  model: ModelChoice;
  areaCount: number;
  validation: ValidationResult;
}

export default function RequestReceipt({
  topic,
  analysisType,
  model,
  areaCount,
  validation,
}: RequestReceiptProps) {
  const blockedField = validation.ok ? null : validation.problems[0].field;

  const chip = (field: string, text: string) => (
    <span
      key={field}
      className={
        // The gap is a small warning badge, not an underline: a dotted line
        // under "0 areas" read as a spelling mark rather than as "this is
        // what is missing".
        blockedField === field
          ? "rounded-fluent-circular bg-warn-soft px-1.5 font-semibold text-warn"
          : "text-ink"
      }
    >
      {text}
    </span>
  );

  return (
    /*
     * One line below `sm`, wrapping above it.
     *
     * Wrapping on a phone cost a second row in a sticky bar that already eats
     * a fifth of a 640px viewport. `overflow-x-auto` with `whitespace-nowrap`
     * keeps every one of the four decisions reachable — nothing is truncated
     * away, it scrolls — while the bar stays one row tall. `min-w-0` is what
     * lets it actually shrink inside the bar's flex row rather than forcing
     * the bar wider than the screen.
     */
    <p
      data-testid="request-receipt"
      className="type-caption1 flex min-h-7 min-w-0 items-center gap-x-1.5 gap-y-1 overflow-x-auto whitespace-nowrap rounded-fluent-medium bg-page px-3 py-1 sm:min-h-8 sm:py-1.5 text-ink-muted sm:flex-wrap sm:overflow-visible sm:whitespace-normal"
    >
      {chip("topic", topic.name)}
      <span aria-hidden="true" className="text-ink-faint">
        &middot;
      </span>
      {chip("analysisType", analysisType.label)}
      <span aria-hidden="true" className="text-ink-faint">
        &middot;
      </span>
      {chip("model", model.label)}
      <span aria-hidden="true" className="text-ink-faint">
        &middot;
      </span>
      {chip(
        "areas",
        areaCount === 1 ? "1 area" : `${areaCount} areas`,
      )}
    </p>
  );
}
