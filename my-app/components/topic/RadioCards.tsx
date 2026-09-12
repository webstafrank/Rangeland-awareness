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

export interface RadioCardOption<T extends string> {
  id: T;
  label: string;
  /** One line on what this choice means or costs. */
  description?: string;
  disabled?: boolean;
  /** Extra note rendered under the description, e.g. a consequence warning. */
  note?: string;
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
            : "block eyebrow"
        }
      >
        {legend}
      </span>

      <div
        role="radiogroup"
        aria-labelledby={labelId}
        className={[
          hideLegend ? "gap-2.5" : "mt-2 gap-2.5",
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
                  "flex h-full cursor-pointer flex-col rounded-lg border px-3.5 py-3 text-sm transition-colors",
                  "peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent",
                  checked
                    ? "border-accent bg-accent-soft"
                    : "border-edge bg-surface hover:border-edge-strong hover:bg-sunken",
                  option.disabled ? "cursor-not-allowed opacity-50" : "",
                ].join(" ")}
              >
                <span className="flex items-center gap-2 font-medium">
                  <span
                    aria-hidden="true"
                    className={[
                      "grid h-4 w-4 shrink-0 place-items-center rounded-full border-[1.5px] bg-surface",
                      // ink-faint, not edge-strong. The ring is the only thing
                      // saying "not selected", so it is a meaningful graphic
                      // and WCAG 1.4.11 wants 3:1 against the card behind it.
                      // edge-strong (#d0d5dd) is 1.24:1 on white and fails;
                      // ink-faint (#667085) is about 5:1 and passes.
                      checked ? "border-accent" : "border-ink-faint",
                    ].join(" ")}
                  >
                    {checked && (
                      <span className="h-2 w-2 rounded-full bg-accent" />
                    )}
                  </span>
                  {option.label}
                </span>

                {!compact && option.description && (
                  <span
                    id={descId}
                    className="mt-1.5 pl-6 text-xs leading-relaxed text-ink-muted"
                  >
                    {option.description}
                  </span>
                )}

                {option.note && (
                  <span
                    id={noteId}
                    className="mt-1.5 pl-6 text-xs font-medium leading-relaxed text-warn"
                  >
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
