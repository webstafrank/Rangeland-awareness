"use client";

/**
 * The run action and its result.
 *
 * Rubric T8: the button is disabled with a stated reason, and the reason is on
 * the page rather than only in a tooltip, so it is readable by a screen reader
 * and by someone who never hovers.
 *
 * There is no model backend in this repo yet. Running validates and shows the
 * exact AnalysisRequest a future services/model would receive, which is the
 * honest thing to render rather than a fake progress bar.
 */

import { useState } from "react";
import {
  type AnalysisRequest,
  type ValidationResult,
  blockingReason,
} from "@/lib/analysis/request";

export interface RunPanelProps {
  validation: ValidationResult;
  /** Reset the shown request whenever the selection changes underneath it. */
  resetKey: string;
}

export default function RunPanel({ validation, resetKey }: RunPanelProps) {
  const [submitted, setSubmitted] = useState<{
    key: string;
    request: AnalysisRequest;
  } | null>(null);

  const reason = blockingReason(validation);
  const stale = submitted !== null && submitted.key !== resetKey;
  const shown = submitted !== null && !stale ? submitted.request : null;

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={!validation.ok}
        onClick={() => {
          if (validation.ok) {
            setSubmitted({ key: resetKey, request: validation.request });
          }
        }}
        // aria-describedby would be better, but the reason element only exists
        // while blocked, and pointing at a missing id announces nothing.
        className="w-full rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-foreground-faint dark:bg-teal-600 dark:hover:bg-teal-500 dark:disabled:bg-surface-muted"
      >
        Run analysis
      </button>

      {reason !== null && (
        <p
          data-testid="run-blocked-reason"
          className="text-xs leading-snug text-foreground-muted"
        >
          {reason}
        </p>
      )}

      {shown !== null && (
        <div className="mt-1 rounded-lg border border-edge bg-surface-muted p-3">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-foreground-faint">
              Analysis request
            </h2>
            <span className="font-mono text-[10px] text-foreground-faint">
              schema {shown.schemaVersion}
            </span>
          </div>
          <p className="mt-1.5 text-xs leading-snug text-foreground-muted">
            Validated and ready to send. No model backend is wired up yet, so
            this is the exact payload it will receive.
          </p>
          <pre
            data-testid="analysis-request"
            className="mt-2 max-h-64 overflow-auto rounded-md bg-surface p-2.5 font-mono text-[11px] leading-relaxed"
          >
            {JSON.stringify(shown, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
