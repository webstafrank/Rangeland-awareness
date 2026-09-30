"use client";

import { useId, useMemo, useState } from "react";
import type { Area, ClimateZone } from "@/contracts/geo";

interface AreaPickerProps {
  areas: readonly Area[];
  selected: readonly string[];
  onChange: (ids: readonly string[]) => void;
  /** Hard cap. Reached, unselected rows are disabled with a stated reason. */
  max: number;
  /** Replaces the whole selection when a single area is picked. */
  single: boolean;
}

const ZONE_LABEL: Record<ClimateZone, string> = {
  arid: "Arid",
  "semi-arid": "Semi-arid",
  humid: "Humid and sub-humid",
};

const ZONE_ORDER: readonly ClimateZone[] = ["arid", "semi-arid", "humid"];

/**
 * Picks counties for the run.
 *
 * 47 rows is too many to scan cold, so the list is searchable and grouped by
 * climate zone: someone studying drought or rangeland is almost always working
 * in the arid and semi-arid counties, and grouping puts those first without
 * hiding the rest.
 *
 * In single mode the rows are radios and picking one replaces the selection.
 * In comparison mode they are checkboxes with a cap. The control type changes
 * with the mode rather than staying a checkbox that silently deselects
 * something, because a checkbox that unchecks a different row when you click
 * it is a control that lies about what it does.
 */
export function AreaPicker({ areas, selected, onChange, max, single }: AreaPickerProps) {
  const [query, setQuery] = useState("");
  const searchId = useId();

  const grouped = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matching = needle
      ? areas.filter((area) => area.name.toLowerCase().includes(needle))
      : areas;

    return ZONE_ORDER.map((zone) => ({
      zone,
      rows: matching.filter((area) => area.climateZone === zone),
    })).filter((group) => group.rows.length > 0);
  }, [areas, query]);

  const atCap = !single && selected.length >= max;

  function toggle(id: string) {
    if (single) {
      onChange([id]);
      return;
    }
    if (selected.includes(id)) {
      onChange(selected.filter((s) => s !== id));
      return;
    }
    if (selected.length >= max) return;
    onChange([...selected, id]);
  }

  const selectedAreas = selected
    .map((id) => areas.find((a) => a.id === id))
    .filter((a): a is Area => Boolean(a));

  return (
    <div className="flex flex-col gap-3">
      {/* Selection lives above the list, so what you have chosen is never
          scrolled out of sight while you choose the next one. */}
      <div className="flex min-h-9 flex-wrap items-center gap-2" aria-live="polite">
        {selectedAreas.length === 0 ? (
          <span className="type-caption1 text-ink-faint">No area selected yet.</span>
        ) : (
          selectedAreas.map((area, index) => (
            <span
              key={area.id}
              className="type-caption1 inline-flex items-center gap-2 rounded-fluent-circular border border-accent/30 bg-accent-soft py-0.5 pr-0.5 pl-2.5 font-semibold text-accent"
            >
              {/* The index is the series colour order on the results charts,
                  so showing it here makes the map/chart legend predictable. */}
              <span className="type-caption2 text-ink-faint tabular-nums">{index + 1}</span>
              {area.name}
              <button
                type="button"
                onClick={() => toggle(area.id)}
                className="flex h-6 w-6 items-center justify-center rounded-fluent-circular text-ink-muted hover:bg-surface hover:text-ink"
                aria-label={`Remove ${area.name}`}
              >
                <span aria-hidden="true">&times;</span>
              </button>
            </span>
          ))
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={searchId} className="sr-only">
          Search counties
        </label>
        <input
          id={searchId}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search all 47 counties"
          className="type-body1 h-8 w-full rounded-fluent-medium border border-edge-strong border-b-edge-input bg-surface px-2.5 text-ink placeholder:text-ink-faint focus:border-b-accent"
        />
      </div>

      {atCap ? (
        <p className="type-caption1 rounded-fluent-medium bg-page px-3 py-2 text-ink-muted" role="status">
          {max} areas selected, which is the maximum. Remove one to pick a different county.
        </p>
      ) : null}

      <div className="card max-h-72 overflow-y-auto">
        {grouped.length === 0 ? (
          <p className="type-caption1 px-3 py-4 text-ink-faint">
            No county matches &ldquo;{query}&rdquo;.
          </p>
        ) : (
          grouped.map((group) => (
            <fieldset key={group.zone} className="border-edge border-b last:border-b-0">
              <legend className="sr-only">{ZONE_LABEL[group.zone]} counties</legend>
              <p
                className="eyebrow sticky top-0 border-b border-edge bg-surface-subtle px-3 py-1.5"
                aria-hidden="true"
              >
                {ZONE_LABEL[group.zone]}
              </p>

              {group.rows.map((area) => {
                const isSelected = selected.includes(area.id);
                const disabled = atCap && !isSelected;

                return (
                  <label
                    key={area.id}
                    className={`type-body1 flex min-h-10 items-center gap-3 px-3 py-2 transition-colors duration-100 ${
                      disabled
                        ? "cursor-not-allowed text-ink-faint"
                        : "cursor-pointer hover:bg-page"
                    }`}
                  >
                    <input
                      type={single ? "radio" : "checkbox"}
                      name={single ? "area-single" : `area-${area.id}`}
                      checked={isSelected}
                      disabled={disabled}
                      onChange={() => toggle(area.id)}
                      className="h-4 w-4 shrink-0 accent-accent"
                    />
                    <span className="min-w-0 flex-1 truncate text-ink">
                      {area.name}
                    </span>
                    {area.asal ? (
                      <span className="type-caption2 shrink-0 rounded-fluent-small bg-page px-1.5 py-0.5 font-semibold text-ink-muted">
                        ASAL
                      </span>
                    ) : null}
                  </label>
                );
              })}
            </fieldset>
          ))
        )}
      </div>
    </div>
  );
}
