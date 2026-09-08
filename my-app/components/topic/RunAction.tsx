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
 */

import { blockingReason, type ValidationResult } from "@/lib/analysis/request";

export interface RunActionProps {
  validation: ValidationResult;
  onRun: () => void;
}

export default function RunAction({ validation, onRun }: RunActionProps) {
  const reason = blockingReason(validation);

  return (
    <div className="flex flex-col items-stretch gap-2 lg:flex-row lg:items-center lg:gap-4">
      {reason !== null && (
        <p
          data-testid="run-blocked-reason"
          className="order-2 max-w-md text-xs leading-snug text-ink-muted lg:order-1 lg:text-right"
        >
          {reason}
        </p>
      )}

      <button
        type="button"
        disabled={!validation.ok}
        onClick={onRun}
        className="order-1 rounded-lg bg-accent px-6 py-2.5 text-sm font-semibold text-white shadow-card transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-sunken disabled:text-ink-faint disabled:shadow-none lg:order-2"
      >
        Run analysis
      </button>
    </div>
  );
}
