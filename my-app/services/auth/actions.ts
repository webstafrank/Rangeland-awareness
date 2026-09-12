"use server";

import { redirect } from "next/navigation";
import type { z } from "zod";
import { SignInInputSchema, SignUpInputSchema, type FormState } from "@/contracts/auth";
import { clearSession, makeSession, setSession } from "./session";

/**
 * Server Actions for the three entry paths on the homepage.
 *
 * Each returns a `FormState` so the form can render field-level errors without
 * client-side validation duplicating the schema. On success each one
 * redirects, and `redirect()` throws internally, so nothing after it runs.
 */

function fieldErrorsOf(error: z.ZodError): Readonly<Record<string, readonly string[]>> {
  const flat: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    (flat[key] ??= []).push(issue.message);
  }
  return flat;
}

export async function signUpAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = SignUpInputSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    organisation: formData.get("organisation") || undefined,
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: "Check the highlighted fields.",
      fieldErrors: fieldErrorsOf(parsed.error),
    };
  }

  /*
   * The form has a password field so the screen is honest about what a real
   * sign-up asks for, but the value is deliberately never read here and never
   * reaches the cookie. Storing a credential, even hashed, in a scaffold with
   * no credential store would be a liability with no upside.
   * `__tests__/actions.test.ts` asserts the password never appears in the
   * session, so a future edit cannot quietly start persisting it.
   */
  await setSession(makeSession("member", parsed.data.name, parsed.data.email));
  redirect("/");
}

export async function signInAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = SignInInputSchema.safeParse({ email: formData.get("email") });

  if (!parsed.success) {
    return {
      ok: false,
      message: "Check the highlighted fields.",
      fieldErrors: fieldErrorsOf(parsed.error),
    };
  }

  // No credential check exists, by design. The email's local part becomes the
  // display name purely so the header shows something recognisable.
  const name = parsed.data.email.split("@")[0].replace(/[._-]+/g, " ").trim() || "Analyst";
  await setSession(makeSession("member", name, parsed.data.email));
  redirect("/");
}

export async function continueAsGuestAction(): Promise<void> {
  await setSession(makeSession("guest", "Guest"));
  redirect("/");
}

export async function signOutAction(): Promise<void> {
  await clearSession();
  redirect("/");
}
