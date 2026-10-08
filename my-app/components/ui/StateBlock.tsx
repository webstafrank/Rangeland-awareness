import type { ReactNode } from "react";

/**
 * The one shape for "there is nothing to show here yet": an empty list, a
 * page that failed, a service that is not answering. A tinted icon tile, a
 * title, a sentence of explanation and the way forward, centred in a dashed
 * panel so it reads as a placeholder rather than as content.
 *
 * Every page's empty, error and offline states use this, so they look like
 * one product rather than one product per screen. `tone` only colours the
 * icon tile; the text stays ink, because a whole block in danger red is
 * alarming without being any clearer.
 */

const TILE = {
  neutral: "bg-sunken text-ink-faint",
  info: "bg-accent-soft text-accent",
  danger: "bg-danger-soft text-danger",
  warn: "bg-warn-soft text-warn",
} as const;

export function StateBlock({
  icon,
  title,
  children,
  actions,
  tone = "neutral",
  headingLevel = 2,
  className = "",
  ...rest
}: {
  icon?: ReactNode;
  title: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  tone?: keyof typeof TILE;
  headingLevel?: 2 | 3;
  className?: string;
  "data-testid"?: string;
}) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <div
      className={`flex flex-col items-center rounded-fluent-xlarge border border-dashed border-edge-strong bg-surface px-6 py-10 text-center ${className}`}
      {...rest}
    >
      {icon ? (
        <span
          aria-hidden="true"
          className={`grid h-11 w-11 place-items-center rounded-fluent-large ${TILE[tone]}`}
        >
          {icon}
        </span>
      ) : null}
      <Heading className={`type-subtitle2 text-ink ${icon ? "mt-3" : ""}`}>{title}</Heading>
      {children ? (
        <div className="type-body1 mt-1.5 max-w-md text-ink-muted">{children}</div>
      ) : null}
      {actions ? <div className="mt-5 flex flex-wrap justify-center gap-2">{actions}</div> : null}
    </div>
  );
}
