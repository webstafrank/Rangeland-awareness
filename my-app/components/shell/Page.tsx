import type { ReactNode } from "react";
import { Eyebrow } from "@/components/ui/Eyebrow";

/**
 * The furniture of a page: its header, its sections and a card grid.
 *
 * Every page in the app opens the same way (eyebrow, title, lead, optional
 * actions) so a reader learns where the page's name and purpose live once and
 * finds them in the same place everywhere. They were four drifting copies of
 * one shape; now they are one component each.
 */

export const FRAME = "mx-auto w-full max-w-band px-gutter lg:px-gutter-lg";

/**
 * The page header: a white band under the top bar, closed by a hairline, so
 * the canvas-grey sections below read as the page's body.
 *
 * The heading system, one size per level across the app: the page title (the
 * one h1) is title3, a section heading (h2) is subtitle1, a card heading (h3)
 * is subtitle2. This is an application, and the page's content is what
 * should be large, not its name.
 *
 * `actions` sit to the right of the title on a wide screen and below the lead
 * on a narrow one. `children` is anything else the header needs to hold.
 */
export function PageHero({
  eyebrow,
  title,
  lead,
  actions,
  children,
}: {
  eyebrow: string;
  title: string;
  lead: string;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="border-b border-edge bg-surface">
      <div className={`${FRAME} py-6 lg:py-8`}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between lg:gap-10">
          <div className="max-w-3xl">
            <Eyebrow>{eyebrow}</Eyebrow>
            <h1 className="type-title3 mt-1.5 text-ink">{title}</h1>
            <p className="type-body1 mt-1.5 text-ink-muted">{lead}</p>
          </div>
          {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
        </div>
        {children ? <div className="mt-5">{children}</div> : null}
      </div>
    </section>
  );
}

/**
 * A section of a page's body, always on the page grey: optional eyebrow, the
 * subtitle1 h2, an optional muted line, then its cards. Sections are told
 * apart by their headings and the cards inside them, not by alternating
 * white and grey full-bleed bands, which read as a marketing site.
 *
 * `tier` is accepted for compatibility and no longer changes the ground.
 */
export function PageSection({
  eyebrow,
  title,
  intro,
  children,
  tier = "canvas",
}: {
  eyebrow?: string;
  title: string;
  intro?: ReactNode;
  children?: ReactNode;
  tier?: "canvas" | "panel";
}) {
  void tier;
  return (
    <section>
      <div className={`${FRAME} py-6 lg:py-8`}>
        <div className="max-w-3xl">
          {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
          <h2 className={`type-subtitle1 text-ink ${eyebrow ? "mt-1.5" : ""}`}>{title}</h2>
          {intro ? <div className="type-body1 mt-1.5 text-ink-muted">{intro}</div> : null}
        </div>
        {children ? <div className="mt-5">{children}</div> : null}
      </div>
    </section>
  );
}

export function InfoGrid({
  items,
  columns = 3,
}: {
  items: readonly { label: string; value?: string; description: string }[];
  columns?: 2 | 3;
}) {
  return (
    <dl className={`grid gap-4 sm:grid-cols-2 ${columns === 3 ? "lg:grid-cols-3" : ""}`}>
      {items.map((item) => (
        <div key={item.label} className="card p-4 lg:p-5">
          <dt className="type-subtitle2 text-ink">{item.label}</dt>
          {item.value ? (
            <dd className="type-body1 mt-1 font-semibold break-words text-accent-link">
              {item.value}
            </dd>
          ) : null}
          <dd className="type-body1 mt-1 text-ink-muted">{item.description}</dd>
        </div>
      ))}
    </dl>
  );
}
