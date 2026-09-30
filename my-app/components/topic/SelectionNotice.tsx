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
 *
 * A Fluent MessageBar in the warning intent: the warning icon, the tinted
 * ground and the words together, so the state never rests on colour.
 */

import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";


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
    <Notice
      intent="warning"
      role="status"
      aria-live="polite"
      data-testid="selection-notice"
      actions={
        <>
          {restoreCount > 0 && (
            // The label names what comes back, not the mode it goes back to.
            // "Undo" alone makes the user work out what they are getting.
            <Button type="button" size="sm" onClick={onUndo}>
              Restore {restoreCount === 1 ? "1 area" : `${restoreCount} areas`}
            </Button>
          )}
          <Button type="button" size="sm" variant="subtle" onClick={onDismiss}>
            Dismiss
          </Button>
        </>
      }
    >
      {message}
    </Notice>
  );
}
