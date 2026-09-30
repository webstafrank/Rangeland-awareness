import type { ReactNode } from "react";
import { Eyebrow } from "@/components/ui/Eyebrow";

/**
 * The furniture of a content page (about, help, contact, account).
 *
 * Four pages each carried their own copy of the same hero band, section
 * wrapper and card grid, with the class strings drifting slightly between
 * them. They are one shape, so they are one component each, on the Fluent
 * type ramp: title1 page title, subtitle1 lead, title3 section heading.
 */

const FRAME = "mx-auto w-full max-w-band px-gutter lg:px-gutter-lg";

/**
 * The page title block, on the panel tier with a colorNeutralStroke2 rule
 * beneath it, so the canvas-grey sections below read as the page's body.
 * Fluent has no dark hero band; this replaces the navy one.
 */
export function PageHero({
  eyebrow,
  title,
  lead,
  children,
}: {
  eyebrow: string;
  title: string;
  lead: string;
  children?: ReactNode;
}) {
  return (
    <section className="border-b border-edge bg-surface">
      <div className={`${FRAME} py-8 lg:py-12`}>
        <div className="max-w-3xl">
          <Eyebrow marked>{eyebrow}</Eyebrow>
          <h1 className="type-title1 mt-3 text-ink lg:type-large-title">{title}</h1>
          <p className="type-subtitle1 mt-3 font-normal text-ink-muted">{lead}</p>
          {children ? <div className="mt-6">{children}</div> : null}
        </div>
      </div>
    </section>
  );
}

/** One section of a content page: a label, a heading, an intro, then its body. */
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
  /** `panel` puts the section on white between two strokes, for rhythm. */
  tier?: "canvas" | "panel";
}) {
  const ground = tier === "panel" ? "border-y border-edge bg-surface" : "";
  return (
    <section className={ground}>
      <div className={`${FRAME} py-8 lg:py-12`}>
        <div className="max-w-3xl">
          {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
          <h2 className={`type-title3 text-ink ${eyebrow ? "mt-2" : ""}`}>{title}</h2>
          {intro ? <div className="type-body2 mt-2 text-ink-muted">{intro}</div> : null}
        </div>
        {children ? <div className="mt-6">{children}</div> : null}
      </div>
    </section>
  );
}

/**
 * A grid of term-and-description cards, as one `<dl>`.
 *
 * `description` is text, rendered as text. The about page used to pass HTML
 * entities through `dangerouslySetInnerHTML` to get an apostrophe; a string
 * holds a real one.
 */
export function InfoGrid({
  items,
  columns = 3,
}: {
  items: readonly { label: string; value?: string; description: string }[];
  columns?: 2 | 3;
}) {
  return (
    <dl
      className={`grid gap-4 sm:grid-cols-2 ${columns === 3 ? "lg:grid-cols-3" : ""}`}
    >
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
