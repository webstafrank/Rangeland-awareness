import type { ReactNode } from "react";
import type { Tone } from "./tone";

/**
 * The four ground names this kit shipped with, mapped onto Fluent's neutral
 * tiers. The names are kept so no caller breaks; what they paint changed.
 *
 *   navy-deep, navy   were the dark bands. Fluent has no dark band in a light
 *                     theme, so both are now the header's own neutral chrome
 *                     (colorNeutralBackground4, `band-chrome`) with dark ink.
 *   white             colorNeutralBackground1, the panel tier.
 *   paper             colorNeutralBackground3, the app canvas.
 */
export type BandGround = "navy-deep" | "navy" | "white" | "paper";

const grounds: Record<BandGround, string> = {
  "navy-deep": "band-chrome border-b border-edge",
  navy: "band-chrome border-b border-edge",
  white: "bg-surface text-ink border-y border-edge",
  paper: "bg-page text-ink",
};

/** Which tone children on this ground use. Light everywhere now. */
export const groundTone: Record<BandGround, Tone> = {
  "navy-deep": "light",
  navy: "light",
  white: "light",
  paper: "light",
};

/**
 * The inner measure. `wide` and `full` share the app's band ceiling and
 * gutter, so a Band lines up with the header, the step rail and the sticky
 * action bar instead of sitting on its own grid.
 */
const widths = {
  narrow: "max-w-2xl px-gutter",
  prose: "max-w-3xl px-gutter",
  content: "max-w-5xl px-gutter",
  wide: "max-w-band px-gutter lg:px-gutter-lg",
  full: "max-w-none px-gutter lg:px-gutter-lg",
} as const;

interface BandProps {
  ground: BandGround;
  children: ReactNode;
  /** Inner measure. Long-form copy needs a narrow one; a map needs `full`. */
  width?: keyof typeof widths;
  /** Vertical rhythm. `flush` is for bands that manage their own padding. */
  pad?: "flush" | "tight" | "normal" | "loose";
  /** Opens the band with a 3px brand-blue rule. Use sparingly, once per page. */
  rule?: boolean;
  id?: string;
  className?: string;
  as?: "section" | "div" | "header" | "footer" | "main";
}

/* Fluent spacing: xxl (24px) inside a band on a phone, xxxl (32px) and up on
   a wide screen. Denser than the old kit's marketing rhythm on purpose: this
   is a data tool, and the reader came for the numbers. */
const pads = {
  flush: "",
  tight: "py-6 lg:py-8",
  normal: "py-8 lg:py-12",
  loose: "py-12 lg:py-16",
} as const;

/** One horizontal band of the page: a ground, and a centred measure on it. */
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
      {rule ? <div className="rule-action h-[3px] w-full" aria-hidden="true" /> : null}
      <div className={`mx-auto w-full ${widths[width]} ${pads[pad]}`}>{children}</div>
    </Tag>
  );
}
