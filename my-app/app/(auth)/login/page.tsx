import Link from "next/link";
import type { Metadata } from "next";
import { continueAsGuestAction } from "@/services/auth/actions";
import { Button } from "@/components/ui/Button";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to Rangeland Watch to reach your saved analysis runs.",
};

export default function LoginPage() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Eyebrow>Sign in</Eyebrow>
        <h1 className="text-3xl font-bold tracking-tight">Welcome back</h1>
        <p className="text-ink-light-secondary text-sm leading-relaxed">
          No account yet?{" "}
          <Link href="/signup" className="text-scarlet-ink-light rounded font-semibold hover:underline">
            Create one
          </Link>
          .
        </p>
      </div>

      <LoginForm />

      <div className="border-edge flex flex-col gap-3 border-t pt-6">
        <p className="text-caption text-ink-light-muted">
          You do not need an account to run an analysis.
        </p>
        <form action={continueAsGuestAction}>
          <Button type="submit" variant="outline" size="md" tone="light" block>
            Continue as guest
          </Button>
        </form>
      </div>
    </div>
  );
}
