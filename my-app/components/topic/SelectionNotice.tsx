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
      className="rounded-lg border border-warn-border bg-warn-soft px-3.5 py-3 text-xs leading-relaxed text-warn"
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
            className="rounded-md border border-warn-border bg-white px-2.5 py-1 font-semibold hover:bg-warn-soft"
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
