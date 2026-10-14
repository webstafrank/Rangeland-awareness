"use client";

/**
 * The explorer's header row: All, Flood, Drought, Famine, Landslide. Picking
 * one narrows the layer panel, KSA and NASA layers alike, to what bears
 * on that hazard (services/explore/hazards.ts says which).
 *
 * Real radio inputs in a fieldset, like BasemapSwitch and SegmentedControl:
 * the browser gives arrow-key movement, one tab stop and the checked state for
 * free. Drawn as tabs, an underline under the current one, because it reads as
 * "which view of the page" rather than a form field. The underline, the colour
 * and the weight all mark the current tab, never the colour alone.
 *
 * Each tab carries its layer count, so an empty view is visible before it is
 * opened. On a phone the row scrolls sideways rather than wrapping.
 */

import { CountBadge } from "@/components/ui/CountBadge";
import { HAZARD_VIEWS, hazardFor, type HazardView } from "@/services/explore";

const labelFor = (view: HazardView) => hazardFor(view)?.label ?? "All layers";

export function HazardTabs({
  value,
  onChange,
  counts,
}: {
  value: HazardView;
  onChange: (view: HazardView) => void;
  /** Layers in each view, as the panel lists them. */
  counts: Readonly<Record<HazardView, number>>;
}) {
  return (
    <fieldset
      className="min-w-0 border-b border-edge bg-surface"
      data-testid="hazard-tabs"
    >
      <legend className="sr-only">Hazard</legend>
      <div className="flex gap-1 overflow-x-auto px-gutter lg:px-4">
        {HAZARD_VIEWS.map((view) => {
          const selected = view === value;
          return (
            <label
              key={view}
              className={`type-body1 relative inline-flex h-11 shrink-0 cursor-pointer items-center gap-1.5 px-3 transition-colors duration-150 has-focus-visible:outline-2 has-focus-visible:-outline-offset-2 has-focus-visible:outline-accent ${
                selected
                  ? "font-semibold text-accent"
                  : "text-ink-muted hover:bg-surface-subtle hover:text-ink"
              }`}
            >
              <input
                type="radio"
                name="explore-hazard"
                value={view}
                checked={selected}
                onChange={() => onChange(view)}
                className="sr-only"
              />
              {labelFor(view)}
              <CountBadge count={counts[view]} />
              {/* The current tab's underline, over the strip's own border. */}
              <span
                aria-hidden="true"
                className={`absolute inset-x-2 -bottom-px h-0.5 rounded-full ${selected ? "bg-accent" : "bg-transparent"}`}
              />
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
