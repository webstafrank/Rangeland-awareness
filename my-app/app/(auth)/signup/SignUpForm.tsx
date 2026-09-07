"use client";

import { useActionState } from "react";
import type { FormState } from "@/contracts/auth";
import { signUpAction } from "@/services/auth/actions";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { TextInput } from "@/components/ui/TextInput";

const initial: FormState = { ok: false };

/**
 * Client component only because it needs `useActionState` for pending state and
 * field errors. The validation itself stays on the server, in the action, so
 * there is one set of rules and not two that can drift.
 */
export function SignUpForm() {
  const [state, formAction, pending] = useActionState(signUpAction, initial);
  const err = (field: string) => state.fieldErrors?.[field]?.[0];

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      {state.message && !state.ok ? (
        <p
          role="alert"
          className="border-scarlet-ink-light/35 text-scarlet-ink-light text-caption rounded border bg-white px-3.5 py-2.5 font-medium"
        >
          {state.message}
        </p>
      ) : null}

      <Field label="Full name" htmlFor="name" error={err("name")}>
        <TextInput
          id="name"
          name="name"
          autoComplete="name"
          required
          placeholder="Amina Yusuf"
          invalid={Boolean(err("name"))}
          aria-describedby={err("name") ? "name-error" : undefined}
        />
      </Field>

      <Field label="Work email" htmlFor="email" error={err("email")} hint="We use this as your sign-in address.">
        <TextInput
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@ksa.go.ke"
          invalid={Boolean(err("email"))}
          aria-describedby={err("email") ? "email-error" : "email-hint"}
        />
      </Field>

      <Field label="Organisation" htmlFor="organisation" error={err("organisation")} hint="Optional.">
        <TextInput
          id="organisation"
          name="organisation"
          autoComplete="organization"
          placeholder="Kenya Space Agency"
          invalid={Boolean(err("organisation"))}
          aria-describedby={err("organisation") ? "organisation-error" : "organisation-hint"}
        />
      </Field>

      {/*
        Rendered so the screen is honest about what a real sign-up asks for.
        The server action never reads this value and it never reaches the
        session cookie: see services/auth/README.md. Marked read-only-ish via
        the hint rather than disabled, so the field is still keyboard reachable
        and the note is announced with it.
      */}
      <Field
        label="Password"
        htmlFor="password"
        hint="Not stored in this build. Credential handling is not implemented yet."
      >
        <TextInput
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          placeholder="••••••••"
          aria-describedby="password-hint"
        />
      </Field>

      <Button type="submit" variant="scarlet" size="lg" tone="light" block disabled={pending}>
        {pending ? "Creating account…" : "Create account"}
      </Button>
    </form>
  );
}
