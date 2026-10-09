"use client";

/**
 * A labelled group of radio cards.
 *
 * Native `input[type=radio]` inside an explicit `role="radiogroup"`, rather
 * than buttons with aria-checked. Two reasons: the browser gives arrow-key
 * navigation and roving focus inside a radio group for free, and a screen
 * reader announces "2 of 3" without any work here. A div of buttons has to
 * reimplement both and usually gets the roving tabindex wrong.
 *
 * `fieldset` is deliberately not used: it maps to role="group", not
 * "radiogroup", so an assistive technology would not announce the choice as a
 * single-select.
 */

import { useId } from "react";
import { Warning12Filled } from "@/components/ui/icons";

export interface RadioCardOption<T extends string> {
  id: T;
  label: string;
  /** One line on what this choice means or costs. */
  description?: string;
  disabled?: boolean;
  /** Extra note rendered under the description, e.g. a consequence warning. */
  note?: string;
  /**
   * A short fact pinned to the right of the title, e.g. "1 area". Sits in the
   * title row so it costs no height, and is part of the label, so it is read
   * with the choice.
   */
  badge?: string;
}

export interface RadioCardsProps<T extends string> {
  /** Accessible name for the group. Also rendered as its visible label. */
  legend: string;
  /** Shared input name, which is what makes it one native radio group. */
  name: string;
  value: T;
  options: readonly RadioCardOption<T>[];
  onChange: (value: T) => void;
  /** Cards side by side, or stacked. Stacked reads better in a narrow panel. */
  layout?: "row" | "stack";
  /**
   * Hide the visible legend while keeping the accessible name.
   * Used where a section heading already says what the group is, so the label
   * is not printed twice. The group stays named for assistive technology.
   */
  hideLegend?: boolean;
  /** Compact drops the description, for a dense toolbar. */
  compact?: boolean;
}

export default function RadioCards<T extends string>({
  legend,
  name,
  value,
  options,
  onChange,
  layout = "row",
  compact = false,
  hideLegend = false,
}: RadioCardsProps<T>) {
  const labelId = useId();

  return (
    <div>
      <span
        id={labelId}
        className={
          hideLegend
            ? "sr-only"
            : "type-body1 block font-semibold text-ink"
        }
      >
        {legend}
      </span>

      <div
        role="radiogroup"
        aria-labelledby={labelId}
        className={[
          hideLegend ? "" : "mt-2",
          compact ? "gap-1.5" : "gap-3",
          layout === "row"
            ? "grid grid-cols-1 sm:grid-flow-col sm:auto-cols-fr"
            : "flex flex-col",
        ].join(" ")}
      >
        {options.map((option) => {
          const inputId = `${labelId}-${option.id}`;
          const descId = `${inputId}-desc`;
          const noteId = `${inputId}-note`;
          const checked = option.id === value;

          // Point the input at its description and its consequence note, so a
          // screen reader hears the warning before the choice is made. The
          // visible note alone only informs people who can see it, and the
          // no-confirmation-modal design depends on the warning landing.
          const describedBy =
            [
              !compact && option.description ? descId : null,
              option.note ? noteId : null,
            ]
              .filter(Boolean)
              .join(" ") || undefined;

          return (
            <div key={option.id} className="relative">
              {/*
                The input is transparent but stretched over the whole card, so
                it is the actual click target and keeps native radio behaviour
                (arrow keys, roving focus, Space). It is deliberately NOT
                collapsed to 0x0: a zero-size control cannot be clicked by a
                pointer at all, and automated drivers refuse it outright.
                peer-* on the label paints the selected and focused states.
              */}
              <input
                type="radio"
                id={inputId}
                name={name}
                value={option.id}
                checked={checked}
                disabled={option.disabled}
                onChange={() => onChange(option.id)}
                aria-describedby={describedBy}
                className="peer absolute inset-0 z-10 h-full w-full cursor-pointer appearance-none opacity-0 disabled:cursor-not-allowed"
              />
              <label
                htmlFor={inputId}
                className={[
                  // A selectable card: the card hairline and shadow-4 at
                  // rest, a stronger edge and shadow-8 on hover (it acts, so
                  // it lifts), and when chosen the accent stroke doubled by
                  // an inset ring on the soft accent fill. Selection is the
                  // stroke AND the fill AND the filled radio dot, never one.
                  "type-body1 flex h-full cursor-pointer flex-col border bg-surface transition-[box-shadow,background-color,border-color] duration-150",
                  // Compact is a dense tool list inside a panel: flat rows,
                  // no lift, since the panel already carries the elevation.
                  compact
                    ? "rounded-fluent-medium px-3 py-2"
                    : "rounded-fluent-xlarge px-4 py-3.5 shadow-4",
                  "peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent",
                  checked
                    ? "border-accent bg-accent-soft ring-1 ring-inset ring-accent"
                    : compact
                      ? "border-edge hover:border-edge-strong hover:bg-surface-subtle"
                      : "border-edge hover:border-edge-strong hover:shadow-8",
                  option.disabled ? "cursor-not-allowed text-ink-faint shadow-none" : "",
                ].join(" ")}
              >
                <span className="flex items-center gap-2.5 font-semibold text-ink">
                  <span
                    aria-hidden="true"
                    className={[
                      "grid h-4 w-4 shrink-0 place-items-center rounded-full border bg-surface",
                      // ink-faint, not edge-strong. The ring is the only thing
                      // saying "not selected", so it is a meaningful graphic
                      // and WCAG 1.4.11 wants 3:1 against the card behind it.
                      // edge-strong (#d1d1d1) is about 1.5:1 on white and
                      // fails; ink-muted (#424242, Fluent's
                      // colorNeutralStrokeAccessible family) passes easily.
                      checked ? "border-accent" : "border-ink-muted",
                    ].join(" ")}
                  >
                    {checked && (
                      <span className="h-2.5 w-2.5 rounded-full bg-accent" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">{option.label}</span>
                  {option.badge && (
                    <span className="type-caption1 shrink-0 rounded-fluent-circular bg-sunken px-2 py-0.5 font-semibold text-ink-muted">
                      {option.badge}
                    </span>
                  )}
                </span>

                {!compact && option.description && (
                  <span
                    id={descId}
                    className="type-body1 mt-1 pl-6.5 text-ink-muted"
                  >
                    {option.description}
                  </span>
                )}

                {option.note && (
                  <span
                    id={noteId}
                    className="type-caption1 mt-1.5 flex gap-1 pl-6.5 font-semibold text-warn"
                  >
                    <Warning12Filled aria-hidden="true" className="mt-0.5 shrink-0" />
                    {option.note}
                  </span>
                )}
              </label>
            </div>
          );
        })}
      </div>
    </div>
  );
}
