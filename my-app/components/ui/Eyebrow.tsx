import type { ReactNode } from "react";
import type { Tone } from "./tone";

interface EyebrowProps {
  children: ReactNode;
  tone?: Tone;
  /** Prefixes a short scarlet tick. The accent, at its smallest useful size. */
  marked?: boolean;
  className?: string;
}

/**
 * The small tracked label above a heading. It carries the section's category so
 * the heading itself can stay short, which is what keeps the type scale from
 * collapsing into three sizes of the same thing.
 */
export function Eyebrow({ children, tone = "light", marked = true, className = "" }: EyebrowProps) {
  const ink = tone === "dark" ? "text-ink-dark-secondary" : "text-ink-light-secondary";
  return (
    <p
      className={`flex items-center gap-2.5 text-micro font-semibold tracking-[0.16em] uppercase ${ink} ${className}`}
    >
      {marked ? (
        <span className="bg-scarlet-mark inline-block h-[2px] w-6 shrink-0" aria-hidden="true" />
      ) : null}
      {children}
    </p>
  );
}
