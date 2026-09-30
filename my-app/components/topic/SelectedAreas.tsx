"use client";

/**
 * The running list of selected areas.
 *
 * Rubric T6: every area individually removable. It is also the only place the
 * user can see what they have actually chosen, so each row carries where the
 * area came from and how big it is, and clicking a row re-centres the map on
 * it. That last part is why the reducer's focus request carries a token.
 */

import { Delete16Regular, ZoomFit16Regular } from "@/components/ui/icons";
import { Button } from "@/components/ui/Button";
import type { AreaOfInterest, AoiSource } from "@/services/analysis/selection";
import { formatArea } from "@/services/geo/area";

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
      <div className="flex min-h-8 flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h2 className="type-subtitle2 text-ink">Selected areas</h2>

        {/*
          The count is deliberately NOT repeated here. It is already in the
          step heading above and in the sticky bar below, and a third copy in
          the panel that literally lists them adds nothing.
        */}
        {areas.length > 0 && (
          <div className="flex items-center gap-1">
            {/*
              Adding an area zooms to that area, which is right for a single
              selection but leaves the earlier ones off screen in a comparison.
              This is the way back to seeing all of them at once.
            */}
            {areas.length > 1 && (
              <Button
                type="button"
                size="sm"
                variant="subtle"
                icon={<ZoomFit16Regular />}
                onClick={onFitAll}
              >
                Fit all
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              variant="subtle"
              icon={<Delete16Regular />}
              onClick={onClear}
            >
              Clear all
            </Button>
          </div>
        )}
      </div>

      {areas.length === 0 ? (
        <p className="type-caption1 mt-2 rounded-fluent-medium border border-dashed border-edge-strong bg-surface-subtle px-3 py-4 text-ink-muted">
          {emptyHint}
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-edge overflow-y-auto rounded-fluent-medium border border-edge">
          {areas.map((area, index) => (
            <li
              key={area.id}
              className="group flex min-h-12 items-center gap-2.5 bg-surface px-2.5 py-1.5 hover:bg-surface-subtle"
            >
              <span
                aria-hidden="true"
                className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-accent font-mono text-[10px] font-semibold text-white tabular-nums"
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
                className="min-w-0 flex-1 rounded-fluent-small text-left"
                title="Show this area on the map"
              >
                <span className="type-body1 block truncate font-semibold text-ink group-hover:text-accent-link">
                  {area.label}
                </span>
                <span className="type-caption1 block text-ink-faint">
                  {SOURCE_LABEL[area.source]} &middot; {formatArea(area.areaKm2)}
                </span>
              </button>

              <Button
                type="button"
                size="sm"
                variant="subtle"
                onClick={() => onRemove(area.id)}
                aria-label={`Remove ${area.label}`}
                className="shrink-0"
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
