import type { ReactNode } from "react";
import type { Tone } from "./tone";

interface EyebrowProps {
  children: ReactNode;
  /** Accepted for compatibility. There is one light theme. */
  tone?: Tone;
  /**
   * Accepted for compatibility, and ignored. It used to prefix a brand-blue
   * tick, but only some eyebrows had it, which made one label pattern look
   * like two. Every eyebrow is now the same plain label.
   */
  marked?: boolean;
  className?: string;
}

/**
 * The small label above a heading. It carries the section's category so the
 * heading itself can stay short.
 *
 * caption1 strong in sentence case, not a tracked all-caps overline: sentence
 * case for every label, and the `eyebrow` utility in globals.css holds the one
 * recipe.
 */
export function Eyebrow({ children, className = "" }: EyebrowProps) {
  return <p className={`eyebrow ${className}`}>{children}</p>;
}
