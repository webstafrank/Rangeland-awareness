/**
 * The small pieces the result sections share. Server-safe: no state, no
 * browser API, so every section that uses them stays a server component.
 */

import type { ReactNode } from "react";
import { formatPercent } from "./view-model";

/**
 * The class colour, as a mark that never carries meaning on its own.
 *
 * Same rule `<SeverityChip>` enforces, applied to an ordered ramp instead of
 * the reserved status scale: the swatch is `aria-hidden` and there is no code
 * path that renders it without the class label next to it. The 1px ring keeps
 * the pale end of the ramp from dissolving into a white card.
 */
export function Swatch({ colour }: { colour: string }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-3 w-3 shrink-0 rounded-fluent-small align-middle ring-1 ring-edge-strong"
      style={{ backgroundColor: colour }}
    />
  );
}

/** A labelled fact in a definition list. Used for the provenance block. */
export function Fact({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="min-w-0 border-t border-edge pt-2.5">
      <dt className="type-caption1 text-ink-faint">{term}</dt>
      <dd className="type-body1 mt-0.5 break-words text-ink">{children}</dd>
    </div>
  );
}

/**
 * A percentage cell under a "Share (%)" header.
 *
 * DataTable's rule is units in the header, never repeated in the cell, so the
 * sign is not DRAWN. It is still in the text, visually hidden, so a screen
 * reader that lands on one cell hears "31.0 percent" rather than a bare
 * number, and so the cell's text is the value a copy-paste should carry.
 */
export function Percent({ value }: { value: number }) {
  const text = formatPercent(value);
  return (
    <>
      {text.replace("%", "")}
      <span className="sr-only">%</span>
    </>
  );
}

/**
 * The longer explanation behind a native disclosure.
 *
 * The page leads with numbers; the reasoning that qualifies them is one click
 * away rather than in the way. Native <details>, so it needs no script, works
 * with the keyboard and a screen reader as is, and the text stays in the DOM
 * (find-in-page and the gate tests still reach it).
 */
export function More({ summary, children }: { summary: string; children: ReactNode }) {
  return (
    <details className="group mt-3">
      <summary className="type-caption1 inline-flex cursor-pointer list-none items-center gap-1 rounded-fluent-small font-semibold text-accent-link hover:underline [&::-webkit-details-marker]:hidden">
        <span
          aria-hidden="true"
          className="inline-block transition-transform duration-150 group-open:rotate-90"
        >
          ›
        </span>
        {summary}
      </summary>
      <div className="type-caption1 mt-2 text-ink-muted">{children}</div>
    </details>
  );
}

/* DataTable conventions, once: 40px rows, a surface-subtle header in
   caption-strong, hairline dividers, numbers right-aligned in tabular figures. */
export const TH = "type-caption1 px-3 py-2.5 font-semibold whitespace-nowrap text-ink-muted sm:px-4";
export const RH = "type-body1 px-3 py-2 text-left font-semibold text-ink sm:px-4";
export const TD = "type-body1 px-3 py-2 whitespace-nowrap tabular-nums sm:px-4";

/** A section heading inside the result body: eyebrow-sized label plus title. */
export function SectionHead({
  id,
  title,
  lead,
}: {
  id: string;
  title: string;
  lead?: ReactNode;
}) {
  return (
    <div className="mb-4">
      <h3 id={id} className="type-subtitle1 text-ink">
        {title}
      </h3>
      {lead ? <p className="type-body1 mt-0.5 text-ink-muted">{lead}</p> : null}
    </div>
  );
}
