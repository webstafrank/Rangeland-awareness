/**
 * One figure in the homepage's "At a glance" row: label, figure, one-line
 * caption, as a dt/dd pair inside a div so the row is one <dl>.
 *
 * StatTile's shape a step smaller (title3 on a phone, title2 from sm) and
 * padded tighter, so four of them fit a 2x2 grid inside a phone's first
 * screen and one row on a desktop without pushing "Choose a topic" below a
 * 900px fold. StatTile stays the tile for a result's headline number.
 *
 * Only figures that are always real belong here. The live layer catalogue,
 * which can be unreachable, is a status line beside the row (CatalogStatus),
 * never a tile that might read "Unavailable".
 */
export function Metric({
  label,
  value,
  caption,
}: {
  label: string;
  value: string;
  caption: string;
}) {
  return (
    <div className="card flex min-w-0 flex-col p-3 sm:p-4">
      <dt className="type-caption1 truncate text-ink-faint">{label}</dt>
      <dd className="type-title3 mt-0.5 text-ink tabular-nums sm:type-title2">{value}</dd>
      <dd className="type-caption1 truncate text-ink-muted" title={caption}>
        {caption}
      </dd>
    </div>
  );
}
