import Link from "next/link";
import type { Metadata } from "next";
import { continueAsGuestAction } from "@/services/auth/actions";
import { Button } from "@/components/ui/Button";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to Rangeland Awareness to reach your saved analysis runs.",
};

export default function LoginPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Eyebrow marked>Sign in</Eyebrow>
        <h1 className="type-title2 text-ink">Welcome back</h1>
        <p className="type-body1 text-ink-muted">
          No account yet?{" "}
          <Link href="/signup" className="rounded-fluent-small font-semibold text-accent-link hover:underline">
            Create one
          </Link>
          .
        </p>
      </div>

      <LoginForm />

      <div className="flex flex-col gap-3 border-t border-edge pt-5">
        <p className="type-caption1 text-ink-faint">
          You do not need an account to run an analysis.
        </p>
        <form action={continueAsGuestAction}>
          <Button type="submit" variant="secondary" size="lg" block>
            Continue as guest
          </Button>
        </form>
      </div>
    </div>
  );
}
