import type { ReactNode } from "react";
import type { Tone } from "./tone";

export type BandGround = "navy-deep" | "navy" | "white" | "paper";

const grounds: Record<BandGround, string> = {
  "navy-deep": "band-navy-deep",
  navy: "band-navy",
  white: "band-white",
  paper: "band-paper",
};

/** Which tone children on this ground must use. */
export const groundTone: Record<BandGround, Tone> = {
  "navy-deep": "dark",
  navy: "dark",
  white: "light",
  paper: "light",
};

const widths = {
  narrow: "max-w-2xl",
  prose: "max-w-3xl",
  content: "max-w-5xl",
  wide: "max-w-7xl",
  full: "max-w-none",
} as const;

interface BandProps {
  ground: BandGround;
  children: ReactNode;
  /** Inner measure. Long-form copy needs a narrow one; a map needs `full`. */
  width?: keyof typeof widths;
  /** Vertical rhythm. `flush` is for bands that manage their own padding. */
  pad?: "flush" | "tight" | "normal" | "loose";
  /** Opens the band with a short scarlet rule. Use sparingly, once per page. */
  rule?: boolean;
  id?: string;
  className?: string;
  as?: "section" | "div" | "header" | "footer" | "main";
}

const pads = {
  flush: "",
  tight: "py-10 sm:py-12",
  normal: "py-16 sm:py-20",
  loose: "py-24 sm:py-32",
} as const;

/**
 * One horizontal band of the page.
 *
 * The brand is dark blue and white ALTERNATING, which is a constraint on
 * sequences, not on single elements: two adjacent bands must not share a
 * ground. `components/ui/__tests__/Band.test.tsx` asserts the alternation for
 * every page in the app by walking the rendered output, so a new section
 * cannot quietly break the rhythm.
 */
export function Band({
  ground,
  children,
  width = "content",
  pad = "normal",
  rule = false,
  id,
  className = "",
  as: Tag = "section",
}: BandProps) {
  return (
    <Tag id={id} data-band={ground} className={`${grounds[ground]} ${className}`}>
      {rule ? <div className="rule-scarlet h-[3px] w-full" aria-hidden="true" /> : null}
      <div className={`mx-auto w-full px-5 sm:px-8 ${widths[width]} ${pads[pad]}`}>{children}</div>
    </Tag>
  );
}
