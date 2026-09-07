import Link from "next/link";
import type { Metadata } from "next";
import { continueAsGuestAction } from "@/services/auth/actions";
import { Button } from "@/components/ui/Button";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { SignUpForm } from "./SignUpForm";

export const metadata: Metadata = {
  title: "Create an account",
  description: "Create a Rangeland Watch account to save and revisit your analysis runs.",
};

export default function SignUpPage() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Eyebrow>Sign up</Eyebrow>
        <h1 className="text-3xl font-bold tracking-tight">Create your account</h1>
        <p className="text-ink-light-secondary text-sm leading-relaxed">
          Already have one?{" "}
          <Link href="/login" className="text-scarlet-ink-light rounded font-semibold hover:underline">
            Sign in
          </Link>
          .
        </p>
      </div>

      <SignUpForm />

      <div className="border-edge flex flex-col gap-3 border-t pt-6">
        <p className="text-caption text-ink-light-muted">
          In a hurry? Skip the account and go straight to the topics.
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
