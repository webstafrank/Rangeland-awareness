import type { z } from "zod";
import { SignInInputSchema, SignUpInputSchema, type FormState } from "@/contracts/auth";

/**
 * The pure half of the sign-up and sign-in actions.
 *
 * It lives outside `actions.ts` because a `"use server"` module may only
 * export async functions, which makes it awkward to unit test and impossible
 * to import from a client component. Keeping validation here means the same
 * rules can be exercised by a fast gate test with no request context.
 */

export function fieldErrorsOf(error: z.ZodError): Readonly<Record<string, readonly string[]>> {
  const flat: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    (flat[key] ??= []).push(issue.message);
  }
  return flat;
}

function run<T>(schema: z.ZodType<T>, input: unknown): FormState & { data?: T } {
  const parsed = schema.safeParse(input);
  if (parsed.success) return { ok: true, data: parsed.data };
  return {
    ok: false,
    message: "Check the highlighted fields.",
    fieldErrors: fieldErrorsOf(parsed.error),
  };
}

export function validateSignUp(input: unknown) {
  return run(SignUpInputSchema, input);
}

export function validateSignIn(input: unknown) {
  return run(SignInInputSchema, input);
}

/** Reads a FormData into the shape the sign-up schema expects. */
export function signUpInputFrom(formData: FormData) {
  return {
    name: formData.get("name"),
    email: formData.get("email"),
    organisation: formData.get("organisation") || undefined,
  };
}
