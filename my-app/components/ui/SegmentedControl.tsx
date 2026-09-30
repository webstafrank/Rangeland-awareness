"use client";

import type { Tone } from "./tone";

export interface Segment<T extends string> {
  value: T;
  label: string;
  /** One line under the label. Use it to say what the choice implies. */
  hint?: string;
}

interface SegmentedControlProps<T extends string> {
  name: string;
  /** Accessible name for the whole group. */
  legend: string;
  segments: readonly Segment<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Accepted for compatibility. There is one light theme. */
  tone?: Tone;
  /** Visually hides the legend when the surrounding Field already labels it. */
  hideLegend?: boolean;
}

/**
 * Built on real radio inputs inside a fieldset.
 *
 * A div-with-onClick version of this would need roving tabindex, arrow-key
 * handling, and manual ARIA to match what the browser already does for free.
 * The inputs are visually hidden with `sr-only` rather than `display:none`,
 * because `display:none` removes them from the tab order and from the
 * accessibility tree, which is the whole thing being preserved.
 *
 * Skinned as a Fluent segmented choice: a colorNeutralBackground3 well, the
 * selected segment lifted onto colorNeutralBackground1 with shadow4 and a
 * brand label. Selection is carried by the lift AND the colour AND the radio's
 * checked state, never the colour alone.
 */
export function SegmentedControl<T extends string>({
  name,
  legend,
  segments,
  value,
  onChange,
  hideLegend = false,
}: SegmentedControlProps<T>) {
  return (
    <fieldset className="min-w-0">
      <legend className={hideLegend ? "sr-only" : "type-body1 mb-1 font-semibold text-ink"}>
        {legend}
      </legend>

      <div className="grid gap-1 rounded-fluent-large bg-page p-1 sm:grid-cols-2">
        {segments.map((segment) => {
          const selected = segment.value === value;
          const id = `${name}-${segment.value}`;

          return (
            <div key={segment.value} className="min-w-0">
              <input
                type="radio"
                id={id}
                name={name}
                value={segment.value}
                checked={selected}
                onChange={() => onChange(segment.value)}
                className="peer sr-only"
              />
              <label
                htmlFor={id}
                className={`flex cursor-pointer flex-col gap-0.5 rounded-fluent-medium px-3 py-2 transition-colors duration-100 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent ${
                  selected ? "bg-surface text-accent shadow-4" : "text-ink-muted hover:bg-sunken hover:text-ink"
                }`}
              >
                <span className="type-body1 font-semibold">{segment.label}</span>
                {segment.hint ? (
                  <span className="type-caption1 text-ink-faint">{segment.hint}</span>
                ) : null}
              </label>
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}
