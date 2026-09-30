"use client";

import type { ComponentProps } from "react";
import { Input, Select as FluentSelect } from "@fluentui/react-components";
import type { Tone } from "./tone";

type NativeInput = Omit<ComponentProps<"input">, "size" | "type">;

type TextInputProps = NativeInput & {
  type?: "text" | "email" | "password" | "search" | "tel" | "url" | "number" | "date";
  /** Accepted for compatibility. There is one light theme. */
  tone?: Tone;
  invalid?: boolean;
};

/**
 * One input for the whole app: a Fluent `Input`, large size.
 *
 * Fluent owns the parts a hand-rolled input gets wrong: the brand underline
 * that grows on focus, the colorNeutralStrokeAccessible bottom edge that gives
 * the field 3:1 against the page, and the forced-colors rendering. Large
 * (40px) rather than medium, because these are the sign-in and sign-up
 * forms, where the input is the whole screen's job.
 *
 * `invalid` drives `aria-invalid` on the real `<input>`, and Fluent paints
 * its danger border from that same attribute, so the visual state and the
 * announced state cannot disagree. The id, name, type and every aria-* prop
 * land on the native input rather than Fluent's wrapper span, which is what
 * keeps `<label htmlFor>` and the server action's FormData working unchanged.
 */
export function TextInput({ invalid = false, className, tone: _tone, ...rest }: TextInputProps) {
  void _tone;
  return (
    <Input
      size="large"
      aria-invalid={invalid || undefined}
      className={className}
      style={{ width: "100%" }}
      {...(rest as ComponentProps<typeof Input>)}
    />
  );
}

type SelectProps = Omit<ComponentProps<"select">, "size"> & { tone?: Tone; invalid?: boolean };

/** Fluent's `Select`: a native `<select>` in Fluent's field skin. */
export function Select({ invalid = false, className, children, tone: _tone, ...rest }: SelectProps) {
  void _tone;
  return (
    <FluentSelect
      size="large"
      aria-invalid={invalid || undefined}
      className={className}
      {...(rest as ComponentProps<typeof FluentSelect>)}
    >
      {children}
    </FluentSelect>
  );
}
