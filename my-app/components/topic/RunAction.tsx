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
 * It renders in the review step's footer, in the slot the other three steps
 * give to Continue, which is why it is the same Fluent primary button: one
 * brand-blue control for "forward", all the way through the flow.
 */

import { Play20Filled } from "@/components/ui/icons";
import { Button } from "@/components/ui/Button";
import { blockingReason, type ValidationResult } from "@/services/analysis/request";

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
          className="type-caption1 order-2 max-w-md text-ink-muted lg:order-1 lg:text-right"
        >
          {reason}
        </p>
      )}

      {/*
        Primary, like Continue: Run is the last step of the same forward
        movement, and a secondary skin would make the only irreversible
        control on the site look optional. The Play icon is Fluent's own
        glyph for starting a job.
      */}
      <Button
        type="button"
        variant="primary"
        disabled={!validation.ok}
        onClick={onRun}
        icon={<Play20Filled />}
        className="order-1 lg:order-2"
      >
        Run analysis
      </Button>
    </div>
  );
}
