import type { ComponentProps } from "react";
import type { Tone } from "./tone";

type TextInputProps = ComponentProps<"input"> & {
  tone?: Tone;
  invalid?: boolean;
};

/**
 * One input skin for the whole app.
 *
 * `invalid` drives both the border and `aria-invalid`, so the visual state and
 * the announced state cannot disagree. That pairing is the point: a red border
 * alone tells a sighted mouse user something and tells a screen reader user
 * nothing.
 */
export function TextInput({ tone = "light", invalid = false, className = "", ...rest }: TextInputProps) {
  const skin =
    tone === "dark"
      ? "bg-navy-950 border-navy-700 text-ink-dark-primary placeholder:text-ink-dark-muted"
      : "bg-white border-edge text-ink-light-primary placeholder:text-ink-light-muted";
  const invalidSkin = invalid
    ? tone === "dark"
      ? "border-scarlet-ink-dark"
      : "border-scarlet-ink-light"
    : "";

  return (
    <input
      aria-invalid={invalid || undefined}
      className={`h-11 w-full rounded border px-3.5 text-sm transition-colors duration-150 ${skin} ${invalidSkin} ${className}`}
      {...rest}
    />
  );
}

type SelectProps = ComponentProps<"select"> & { tone?: Tone; invalid?: boolean };

export function Select({ tone = "light", invalid = false, className = "", children, ...rest }: SelectProps) {
  const skin =
    tone === "dark"
      ? "bg-navy-950 border-navy-700 text-ink-dark-primary"
      : "bg-white border-edge text-ink-light-primary";
  const invalidSkin = invalid
    ? tone === "dark"
      ? "border-scarlet-ink-dark"
      : "border-scarlet-ink-light"
    : "";

  return (
    <select
      aria-invalid={invalid || undefined}
      className={`h-11 w-full rounded border px-3 text-sm transition-colors duration-150 ${skin} ${invalidSkin} ${className}`}
      {...rest}
    >
      {children}
    </select>
  );
}
