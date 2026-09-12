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
  tone?: Tone;
  /** Visually hides the legend when the surrounding Field already labels it. */
  hideLegend?: boolean;
}

/**
 * Built on real radio inputs inside a fieldset.
 *
 * A div-with-onClick version of this would need roving tabindex, arrow-key
 * handling, and manual ARIA to match what the browser already does for free,
 * and would still lose form autofill and native validation. The inputs are
 * visually hidden with `sr-only` rather than `display:none`, because
 * `display:none` removes them from the tab order and from the accessibility
 * tree, which is the whole thing being preserved.
 */
export function SegmentedControl<T extends string>({
  name,
  legend,
  segments,
  value,
  onChange,
  tone = "light",
  hideLegend = false,
}: SegmentedControlProps<T>) {
  const shell = tone === "dark" ? "border-navy-700 bg-navy-950" : "border-edge bg-paper";
  const legendInk = tone === "dark" ? "text-ink-dark-secondary" : "text-ink-light-secondary";

  return (
    <fieldset className="min-w-0">
      <legend className={hideLegend ? "sr-only" : `text-caption mb-2 font-semibold ${legendInk}`}>
        {legend}
      </legend>

      <div className={`grid gap-1.5 rounded border p-1.5 sm:grid-cols-2 ${shell}`}>
        {segments.map((segment) => {
          const selected = segment.value === value;
          const id = `${name}-${segment.value}`;

          const selectedSkin =
            tone === "dark" ? "bg-white text-navy-900" : "bg-navy-900 text-white";
          const restSkin =
            tone === "dark"
              ? "text-ink-dark-secondary hover:bg-white/10 hover:text-white"
              : "text-ink-light-secondary hover:bg-navy-900/6 hover:text-navy-900";

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
                className={`peer-focus-visible:outline-scarlet-mark flex cursor-pointer flex-col gap-1 rounded px-3.5 py-2.5 transition-colors duration-150 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 ${
                  selected ? selectedSkin : restSkin
                }`}
              >
                <span className="text-sm font-semibold">{segment.label}</span>
                {segment.hint ? (
                  <span className={`text-caption ${selected ? "opacity-75" : "opacity-90"}`}>
                    {segment.hint}
                  </span>
                ) : null}
              </label>
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}
