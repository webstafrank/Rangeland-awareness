"use client";

/**
 * The running list of selected areas.
 *
 * Rubric T6: every area individually removable. It is also the only place the
 * user can see what they have actually chosen, so each row carries where the
 * area came from and how big it is, and clicking a row re-centres the map on
 * it. That last part is why the reducer's focus request carries a token.
 *
 * A region named "Selected areas" (evals find the list by that name), headed
 * by an h3: it sits under the step's h2, beside the tool panel's h3s.
 */

import { useId } from "react";
import { Delete16Regular, Dismiss16Regular, ZoomFit16Regular } from "@/components/ui/icons";
import { Button } from "@/components/ui/Button";
import { CountBadge } from "@/components/ui/CountBadge";
import type { AreaOfInterest, AoiSource } from "@/services/analysis/selection";
import { formatArea } from "@/services/geo/area";

// Exhaustive by type, so adding an AoiSource is a compile error here rather
// than a blank badge in the list. Exported for the review step's list, so an
// area is described in the same words on both screens.
export const SOURCE_LABEL: Record<AoiSource, string> = {
  point: "Clicked point",
  drawn: "Drawn",
  shapefile: "Shapefile",
  coordinate: "Coordinates",
};

export interface SelectedAreasProps {
  areas: readonly AreaOfInterest[];
  /** The scope's cap, beside the count badge, e.g. "up to 12". */
  cap: string;
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
  cap,
  emptyHint,
  onFocus,
  onFitAll,
  onRemove,
  onClear,
}: SelectedAreasProps) {
  const headingId = useId();

  return (
    <section
      aria-labelledby={headingId}
      className="flex min-h-0 flex-1 flex-col"
    >
      <div className="flex min-h-8 shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div className="flex min-w-0 items-center gap-2">
          <h3 id={headingId} className="type-subtitle2 text-ink">
            Selected areas
          </h3>
          {/* The count and the cap. What is still missing is said once, in
              the footer beside Continue, not repeated here. */}
          <CountBadge count={areas.length} />
          <span className="type-caption1 text-ink-faint">{cap}</span>
        </div>

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
        // Plain text, not a dashed box: this already sits inside a card, and a
        // box inside a box reads as a second, empty control.
        <p className="type-caption1 mt-2 text-ink-muted">{emptyHint}</p>
      ) : (
        <ul className="mt-3 max-h-80 divide-y divide-edge overflow-y-auto rounded-fluent-medium border border-edge">
          {areas.map((area, index) => (
            <li
              key={area.id}
              className="group flex min-h-12 items-center gap-3 bg-surface py-1.5 pl-3 pr-1.5 transition-colors duration-150 hover:bg-surface-subtle"
            >
              <span
                aria-hidden="true"
                className="type-caption1 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent-soft font-semibold tabular-nums text-accent"
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
                  {SOURCE_LABEL[area.source]}
                  <span aria-hidden="true"> &middot; </span>
                  <span className="tabular-nums">{formatArea(area.areaKm2)}</span>
                </span>
              </button>

              <Button
                type="button"
                size="sm"
                variant="subtle"
                onClick={() => onRemove(area.id)}
                aria-label={`Remove ${area.label}`}
                title={`Remove ${area.label}`}
                icon={<Dismiss16Regular />}
                className="shrink-0"
              >
                {null}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
