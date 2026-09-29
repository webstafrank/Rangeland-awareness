import type { ReactNode } from "react";
import { ErrorCircle12Filled } from "@/components/ui/icons";
import type { Tone } from "./tone";

interface FieldProps {
  /** The visible label. Wired to the control through `htmlFor`/`id`. */
  label: string;
  /** The control's id. Required, because a label with no target is decoration. */
  htmlFor: string;
  children: ReactNode;
  /** Why this input matters, or what unit it takes. */
  hint?: ReactNode;
  /** Validation message. Announced, and it replaces the hint when present. */
  error?: string;
  /** Accepted for compatibility. There is one light theme. */
  tone?: Tone;
  /** Step number, for a one-decision-at-a-time form. */
  step?: number;
  className?: string;
}

/**
 * Label, control, and exactly one message beneath it: Fluent's `Field` layout.
 *
 * The `error` is wired with `aria-describedby` on the caller's control via the
 * ids `${htmlFor}-hint` / `${htmlFor}-error`, which is why `htmlFor` is not
 * optional: the accessible name and the error announcement both hang off it.
 *
 * An error is icon plus text in the danger foreground, never a red border
 * alone: the design system's rule is that a form error does not rely on
 * colour, and the icon is what a reader with no colour vision sees change.
 */
export function Field({ label, htmlFor, children, hint, error, step, className = "" }: FieldProps) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <div className="flex items-baseline gap-2">
        {step !== undefined ? (
          <span
            className="type-caption1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-soft font-semibold text-accent tabular-nums"
            aria-hidden="true"
          >
            {step}
          </span>
        ) : null}
        <label htmlFor={htmlFor} className="type-body1 font-semibold text-ink">
          {label}
        </label>
      </div>

      {children}

      {error ? (
        <p
          id={`${htmlFor}-error`}
          className="type-caption1 flex items-start gap-1 text-danger"
          role="alert"
        >
          <ErrorCircle12Filled className="mt-0.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : hint ? (
        <p id={`${htmlFor}-hint`} className="type-caption1 text-ink-faint">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
