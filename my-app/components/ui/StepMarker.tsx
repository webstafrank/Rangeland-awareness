import { Checkmark16Regular } from "./icons";

/**
 * The one step marker: the numbered circle used by the wizard's step rail,
 * the Overview's workflow and Help's quick start, so a step looks the same
 * wherever the app talks about steps.
 *
 *   complete   filled accent, a check
 *   current    filled accent, the number, with a soft ring
 *   upcoming   outlined, the number
 *   locked     drawn exactly as upcoming; why it is locked is said in text
 *              beside it, never by a different outline or an icon alone
 *
 * Complete is the heaviest state on purpose: work already done should read as
 * solid, and what is ahead as open. Decorative: the caller names the step and
 * its state in text, so the marker is aria-hidden.
 */

export type StepMarkerState = "complete" | "current" | "upcoming" | "locked";

const SIZE = {
  sm: "h-5 w-5 type-caption1",
  md: "h-6 w-6 type-caption1",
  lg: "h-8 w-8 type-body1",
} as const;

const STATE: Record<StepMarkerState, string> = {
  complete: "bg-accent text-white",
  current: "bg-accent text-white ring-4 ring-accent-soft",
  upcoming: "border border-edge-strong bg-surface text-ink-muted",
  // Same as upcoming, on purpose: one idle style. What makes a step locked
  // is said in text beside it ("not yet available"), never by a second
  // outline that reads as a different kind of step.
  locked: "border border-edge-strong bg-surface text-ink-muted",
};

export function StepMarker({
  number,
  state = "upcoming",
  size = "md",
  className = "",
}: {
  number: number;
  state?: StepMarkerState;
  size?: keyof typeof SIZE;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={`grid shrink-0 place-items-center rounded-full font-semibold tabular-nums transition-colors duration-150 ${SIZE[size]} ${STATE[state]} ${className}`}
    >
      {state === "complete" ? <Checkmark16Regular className="h-3.5 w-3.5" /> : number}
    </span>
  );
}
