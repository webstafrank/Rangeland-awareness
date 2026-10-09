/**
 * The one count badge: a small pill holding a number beside a label (layer
 * categories, selected areas, list totals). Zero is drawn in the same shape,
 * just quieter, so a column of counts lines up whatever the values are.
 */
export function CountBadge({
  count,
  className = "",
}: {
  count: number;
  className?: string;
}) {
  return (
    <span
      className={`type-caption1 inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 font-semibold tabular-nums ${
        count === 0 ? "bg-surface-subtle text-ink-faint" : "bg-accent-soft text-accent"
      } ${className}`}
    >
      {count}
    </span>
  );
}
