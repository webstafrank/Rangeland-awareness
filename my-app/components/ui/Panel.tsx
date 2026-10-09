import type { ReactNode } from "react";
import type { Tone } from "./tone";

interface PanelProps {
  children: ReactNode;
  /** Accepted for compatibility. There is one light theme. */
  tone?: Tone;
  /** Section heading, set as a Fluent subtitle2 in the card's header row. */
  title?: ReactNode;
  /** Sits opposite the title: a control, a count, a unit note. */
  action?: ReactNode;
  pad?: "none" | "tight" | "normal";
  className?: string;
  /** Renders as a landmark region so the results screen is navigable. */
  as?: "div" | "section" | "article" | "aside";
}

/* Fluent spacing inside a card: M (12px) tight, L (16px) normal, rising to
   XL (20px) on a wide screen where a table has room to breathe. */
const pads = { none: "", tight: "p-3", normal: "p-4 lg:p-5" } as const;

/**
 * A card: one chart, one table, one summary.
 *
 * The `card` utility: colorNeutralBackground1, a hairline edge, shadow-4 and
 * borderRadiusXLarge (10px), the same card every page uses. The title row is
 * a 44px Fluent card header in subtitle2 with its action opposite, closed by
 * a hairline, which is structure rather than decoration. Not interactive, so
 * there is no hover lift.
 */
export function Panel({
  children,
  title,
  action,
  pad = "normal",
  className = "",
  as: Tag = "section",
}: PanelProps) {
  return (
    <Tag className={`card flex min-w-0 flex-col text-ink ${className}`}>
      {title ? (
        <header className="flex min-h-11 items-center justify-between gap-3 border-b border-edge px-4 py-2.5 lg:px-5">
          <h3 className="type-subtitle2 text-ink">{title}</h3>
          {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
        </header>
      ) : null}
      <div className={`min-w-0 flex-1 ${pads[pad]}`}>{children}</div>
    </Tag>
  );
}
