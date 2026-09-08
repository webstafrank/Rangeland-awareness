"use client";

/**
 * The notice banner for a selection change the user must know about.
 *
 * Placed directly under the control that caused it, not in the areas section.
 * The report belongs where the cause is: the analyst's eye and cursor are on
 * the analysis-type card they just clicked, so that is where the consequence
 * has to appear.
 *
 * No auto-hide and no modal. The message states a loss, so it stays until the
 * user acts on it or dismisses it, and it never steals focus.
 */

export interface SelectionNoticeProps {
  message: string;
  /** How many areas an undo would bring back. Zero hides the undo button. */
  restoreCount: number;
  onUndo: () => void;
  onDismiss: () => void;
}

export default function SelectionNotice({
  message,
  restoreCount,
  onUndo,
  onDismiss,
}: SelectionNoticeProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="selection-notice"
      className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs leading-snug text-amber-900 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-200"
    >
      <p className="flex gap-2">
        <span aria-hidden="true" className="font-bold">
          !
        </span>
        <span className="flex-1">{message}</span>
      </p>

      <p className="mt-2 flex gap-2 pl-5">
        {restoreCount > 0 && (
          <button
            type="button"
            onClick={onUndo}
            // The label names what comes back, not the mode it goes back to.
            // "Undo" alone makes the user work out what they are getting.
            className="rounded-md border border-amber-400 bg-amber-100 px-2 py-1 font-semibold hover:bg-amber-200 dark:border-amber-800 dark:bg-amber-900/60 dark:hover:bg-amber-900"
          >
            Restore {restoreCount === 1 ? "1 area" : `${restoreCount} areas`}
          </button>
        )}
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-md px-2 py-1 font-medium underline"
        >
          Dismiss
        </button>
      </p>
    </div>
  );
}
