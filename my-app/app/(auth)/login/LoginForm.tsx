"use client";

import { useActionState } from "react";
import type { FormState } from "@/contracts/auth";
import { signInAction } from "@/services/auth/actions";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { TextInput } from "@/components/ui/TextInput";

const initial: FormState = { ok: false };

export function LoginForm() {
  const [state, formAction, pending] = useActionState(signInAction, initial);
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

      <Field label="Work email" htmlFor="email" error={err("email")}>
        <TextInput
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@ksa.go.ke"
          invalid={Boolean(err("email"))}
          aria-describedby={err("email") ? "email-error" : undefined}
        />
      </Field>

      {/*
        No password field here on purpose. There is no credential check in this
        build (see services/auth/README.md), and rendering a password box that
        accepts anything would misrepresent what the screen does. The note
        below says so out loud instead.
      */}
      <p className="text-caption text-ink-light-muted border-edge rounded border bg-paper px-3.5 py-2.5">
        This build has no credential check yet. Entering an email signs you in so the flow can be
        reviewed end to end.
      </p>

      <Button type="submit" variant="scarlet" size="lg" tone="light" block disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
