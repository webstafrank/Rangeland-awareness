/**
 * The skin of the wizard's footer controls: Back, Continue and Run.
 *
 * Continue is a link when it can go and a disabled `<button>` when it cannot
 * (a disabled anchor is not a thing). Those used to be two different
 * components, a Tailwind link and a Fluent Button, so the control visibly
 * changed shape the moment it unlocked: a different radius, height and grey.
 * Both now wear this one recipe, so unlocking reads as the same control
 * changing state, and Run on the review step is the same control again.
 *
 * One size, md (32px), on every step: the app has one button scale, and a
 * bigger Run on the last step only made the bar jump in height.
 *
 * Built on button-classes.ts, which already carries Fluent's primary and
 * secondary values for links. The disabled half mirrors its aria-disabled
 * rule for a native `disabled` button, and drops pointer events so the
 * primary hover cannot paint over the grey.
 */

import { buttonClasses } from "@/components/ui/button-classes";
import type { AnalysisType } from "@/services/analysis/models";

const DISABLED =
  "disabled:pointer-events-none disabled:border-edge disabled:bg-sunken disabled:text-ink-faint";

/** The one forward control: Continue on three steps, Run on the fourth. */
export const forwardClasses = buttonClasses({
  appearance: "primary",
  className: `min-w-28 shrink-0 ${DISABLED}`,
});

/** Back. Same height and radius as the forward control beside it. */
export const backClasses = buttonClasses({
  appearance: "secondary",
  className: "shrink-0",
});

/**
 * Why the forward control is refusing: one short line. On a phone it has its
 * own full-width line above the buttons (beside them it wrapped to three
 * lines); from lg it sits right-aligned against them. Shared by
 * Continue's reason and Run's, so both read in the same place and the same
 * type.
 */
export const footerNoteClass =
  "type-caption1 text-ink-muted lg:max-w-xs lg:text-right";

/**
 * The area rule as one short line, for the footer.
 *
 * services' blockingReason is a full sentence written for the review page
 * ("Select an area: click the map, draw a shape, or upload a shapefile."). In
 * a 32px bar beside two buttons that wrapped to two lines and repeated the
 * panel above it, so the bar says only what is missing; the tool panel says
 * how. The wording keeps "select an area" and "at least N areas", which is
 * what the evals read.
 */
export function shortAreaReason(count: number, spec: AnalysisType): string | null {
  if (count > spec.maxAreas) {
    return `Remove areas: ${spec.maxAreas} at most`;
  }
  if (count >= spec.minAreas) return null;
  if (spec.minAreas === 1) return "Select an area to continue";
  return `Select at least ${spec.minAreas} areas`;
}
