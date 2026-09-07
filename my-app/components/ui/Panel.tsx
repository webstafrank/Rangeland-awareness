import type { ReactNode } from "react";
import type { Tone } from "./tone";

interface PanelProps {
  children: ReactNode;
  tone?: Tone;
  /** Section heading. Rendered as the panel's labelled region when given. */
  title?: ReactNode;
  /** Sits opposite the title: a control, a count, a unit note. */
  action?: ReactNode;
  pad?: "none" | "tight" | "normal";
  className?: string;
  /** Renders as a landmark region so the results screen is navigable. */
  as?: "div" | "section" | "article" | "aside";
}

const pads = { none: "", tight: "p-4", normal: "p-5 sm:p-6" } as const;

/**
 * A bounded surface inside a band: one chart, one table, one summary.
 *
 * On a navy band the panel lifts one step to navy-800; on a light band it
 * stays white and takes a hairline. Both directions keep the panel readable as
 * a distinct object without a drop shadow, which at this density would just
 * add noise.
 */
export function Panel({
  children,
  tone = "light",
  title,
  action,
  pad = "normal",
  className = "",
  as: Tag = "section",
}: PanelProps) {
  const skin =
    tone === "dark"
      ? "bg-navy-800 border-navy-700 text-ink-dark-primary"
      : "bg-white border-edge text-ink-light-primary";
  const headRule = tone === "dark" ? "border-navy-700" : "border-edge";
  const titleInk = tone === "dark" ? "text-ink-dark-secondary" : "text-ink-light-secondary";

  return (
    <Tag className={`flex min-w-0 flex-col rounded border ${skin} ${className}`}>
      {title ? (
        <header
          className={`flex items-center justify-between gap-3 border-b px-4 py-3 sm:px-5 ${headRule}`}
        >
          <h3 className={`text-micro font-semibold tracking-[0.14em] uppercase ${titleInk}`}>
            {title}
          </h3>
          {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
        </header>
      ) : null}
      <div className={`min-w-0 flex-1 ${pads[pad]}`}>{children}</div>
    </Tag>
  );
}
