"use client";

/**
 * The running list of selected areas.
 *
 * Rubric T6: every area individually removable. It is also the only place the
 * user can see what they have actually chosen, so each row carries where the
 * area came from and how big it is, and clicking a row re-centres the map on
 * it. That last part is why the reducer's focus request carries a token.
 */

import type { AreaOfInterest, AoiSource } from "@/lib/analysis/selection";
import { formatArea } from "@/lib/geo/area";

// Exhaustive by type, so adding an AoiSource is a compile error here rather
// than a blank badge in the list.
const SOURCE_LABEL: Record<AoiSource, string> = {
  point: "Clicked point",
  drawn: "Drawn",
  shapefile: "Shapefile",
  coordinate: "Coordinates",
};

export interface SelectedAreasProps {
  areas: readonly AreaOfInterest[];
  /** Shown when nothing is selected, so the panel is never just blank. */
  emptyHint: string;
  onFocus: (id: string) => void;
  /** Zoom out to cover every selected area. Only useful past one. */
  onFitAll: () => void;
  onRemove: (id: string) => void;
  onClear: () => void;
}

export default function SelectedAreas({
  areas,
  emptyHint,
  onFocus,
  onFitAll,
  onRemove,
  onClear,
}: SelectedAreasProps) {
  return (
    <section aria-label="Selected areas" className="flex min-h-0 flex-col">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="eyebrow">
          Selected areas
        </h2>

        {/*
          The count is deliberately NOT repeated here. It is already in the
          step heading above and in the sticky bar below, and a third copy in
          the panel that literally lists them adds nothing.
        */}
        {areas.length > 0 && (
          <div className="flex items-center gap-2 text-xs font-medium">
            {/*
              Adding an area zooms to that area, which is right for a single
              selection but leaves the earlier ones off screen in a comparison.
              This is the way back to seeing all of them at once.
            */}
            {areas.length > 1 && (
              <button
                type="button"
                onClick={onFitAll}
                className="rounded text-ink-muted hover:text-accent hover:underline"
              >
                Fit all
              </button>
            )}
            <button
              type="button"
              onClick={onClear}
              className="rounded text-ink-muted hover:text-ink hover:underline"
            >
              Clear all
            </button>
          </div>
        )}
      </div>

      {areas.length === 0 ? (
        <p className="mt-3 rounded-lg border border-dashed border-edge-strong bg-sunken px-3.5 py-4 text-xs leading-relaxed text-ink-muted">
          {emptyHint}
        </p>
      ) : (
        <ul className="mt-3 space-y-2 overflow-y-auto">
          {areas.map((area, index) => (
            <li
              key={area.id}
              className="group flex items-center gap-2 rounded-lg border border-edge bg-surface px-2.5 py-2"
            >
              <span
                aria-hidden="true"
                className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-accent font-mono text-[10px] font-bold text-white"
              >
                {index + 1}
              </span>

              {/*
                A button, not a bare click handler on the li, so the row is
                reachable and operable from the keyboard.
              */}
              <button
                type="button"
                onClick={() => onFocus(area.id)}
                className="min-w-0 flex-1 rounded text-left"
                title="Show this area on the map"
              >
                <span className="block truncate text-sm font-medium">
                  {area.label}
                </span>
                <span className="block text-xs text-ink-faint">
                  {SOURCE_LABEL[area.source]} &middot; {formatArea(area.areaKm2)}
                </span>
              </button>

              <button
                type="button"
                onClick={() => onRemove(area.id)}
                className="shrink-0 rounded-md border border-transparent px-2 py-1 text-xs font-medium text-ink-muted hover:border-edge-strong hover:text-ink"
                aria-label={`Remove ${area.label}`}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
