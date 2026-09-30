import type { ReactNode } from "react";
import type { Tone } from "./tone";

interface EyebrowProps {
  children: ReactNode;
  /** Accepted for compatibility. There is one light theme. */
  tone?: Tone;
  /**
   * Prefixes a short brand-blue tick. The old kit drew this in scarlet; with
   * one brand hue it is the accent, at its smallest useful size.
   */
  marked?: boolean;
  className?: string;
}

/**
 * The small label above a heading. It carries the section's category so the
 * heading itself can stay short.
 *
 * Fluent caption1Strong in sentence case, not the tracked all-caps overline
 * the old kit used: the design system's content rule is sentence case for
 * every label, and the `eyebrow` utility in globals.css holds the one recipe.
 */
export function Eyebrow({ children, marked = false, className = "" }: EyebrowProps) {
  return (
    <p className={`eyebrow flex items-center gap-2 ${className}`}>
      {marked ? (
        <span className="inline-block h-3 w-[3px] shrink-0 rounded-full bg-accent" aria-hidden="true" />
      ) : null}
      {children}
    </p>
  );
}
