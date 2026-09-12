import type { ReactNode } from "react";
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
  tone?: Tone;
  /** Step number, for the pre-analysis page's one-decision-at-a-time reading. */
  step?: number;
  className?: string;
}

/**
 * Label, control, and exactly one message beneath it.
 *
 * The `error` is wired with `aria-describedby` on the caller's control via the
 * returned ids (`${htmlFor}-hint` / `${htmlFor}-error`), which is why `htmlFor`
 * is not optional: the accessible name and the error announcement both hang off
 * it. Rubric F7 fails a control that changes state without announcing it.
 */
export function Field({
  label,
  htmlFor,
  children,
  hint,
  error,
  tone = "light",
  step,
  className = "",
}: FieldProps) {
  const labelInk = tone === "dark" ? "text-white" : "text-navy-900";
  const hintInk = tone === "dark" ? "text-ink-dark-muted" : "text-ink-light-muted";
  const errorInk = tone === "dark" ? "text-scarlet-ink-dark" : "text-scarlet-ink-light";
  const stepSkin =
    tone === "dark" ? "bg-white/10 text-ink-dark-secondary" : "bg-navy-900/6 text-ink-light-secondary";

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <div className="flex items-baseline gap-2.5">
        {step !== undefined ? (
          <span
            className={`text-micro tabular mt-px inline-flex h-5 w-5 shrink-0 items-center justify-center rounded font-bold ${stepSkin}`}
            aria-hidden="true"
          >
            {step}
          </span>
        ) : null}
        <label htmlFor={htmlFor} className={`text-sm font-semibold ${labelInk}`}>
          {label}
        </label>
      </div>

      {children}

      {error ? (
        <p id={`${htmlFor}-error`} className={`text-caption font-medium ${errorInk}`} role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={`${htmlFor}-hint`} className={`text-caption ${hintInk}`}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}
