import Link from "next/link";
import type { Metadata } from "next";
import { continueAsGuestAction } from "@/services/auth/actions";
import { Button } from "@/components/ui/Button";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { SignUpForm } from "./SignUpForm";

export const metadata: Metadata = {
  title: "Create an account",
  description: "Create a Disaster Monitor account to save and revisit your analysis runs.",
};

export default function SignUpPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <Eyebrow>Sign up</Eyebrow>
        <h1 className="type-title3 text-ink">Create your account</h1>
        <p className="type-body1 text-ink-muted">
          Already have one?{" "}
          <Link href="/login" className="rounded-fluent-small font-semibold text-accent-link hover:underline">
            Sign in
          </Link>
          .
        </p>
      </div>

      <SignUpForm />

      <div className="flex flex-col gap-3 border-t border-edge pt-5">
        <p className="type-caption1 text-ink-faint">
          In a hurry? Skip the account and go straight to the topics.
        </p>
        <form action={continueAsGuestAction}>
          <Button type="submit" variant="secondary" block>
            Continue as guest
          </Button>
        </form>
      </div>
    </div>
  );
}
