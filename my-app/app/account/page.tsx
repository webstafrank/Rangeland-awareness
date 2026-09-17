import type { Metadata } from "next";
import Link from "next/link";
import { Eyebrow } from "@/components/ui/Eyebrow";

export const metadata: Metadata = {
  title: "Account",
  description:
    "Manage your Rangeland Awareness account, saved runs, and preferences.",
};

export default function AccountPage() {
  return (
    <>
      {/* Hero band */}
      <section className="band-chrome">
        <div className="mx-auto w-full max-w-band px-gutter py-16 lg:px-gutter-lg lg:py-24">
          <div className="max-w-3xl">
            <p className="flex items-center gap-3 font-mono text-xs font-medium uppercase tracking-[0.14em] text-on-chrome-muted">
              <span aria-hidden="true" className="h-[3px] w-8 bg-action" />
              Account
            </p>
            <h1 className="mt-6 text-4xl font-semibold leading-[1.05] tracking-tight text-white lg:text-6xl">
              Your account
            </h1>
            <p className="mt-6 max-w-2xl text-xl leading-relaxed text-white lg:text-2xl">
              Manage your profile, saved runs, and preferences.
            </p>
          </div>
        </div>
      </section>

      {/* Account status */}
      <section className="mx-auto w-full max-w-band px-gutter py-14 lg:px-gutter-lg lg:py-20">
        <div className="max-w-3xl">
          <Eyebrow>Account status</Eyebrow>
          <h2 className="mt-4 text-2xl font-semibold tracking-tight lg:text-3xl">
            Not signed in
          </h2>
          <p className="mt-4 text-base leading-relaxed text-ink-muted lg:text-lg">
            You are browsing as a guest. All analysis features are available,
            but your runs will not be saved.
          </p>

          <div className="mt-8 flex flex-wrap gap-4">
            <Link
              href="/login"
              className="rounded-lg bg-action px-6 py-3 text-sm font-semibold text-white shadow-card transition-colors hover:bg-action-hover"
            >
              Sign in
            </Link>
            <Link
              href="/signup"
              className="rounded-lg border border-edge-strong bg-surface px-6 py-3 text-sm font-semibold text-ink-muted transition-colors hover:bg-sunken hover:text-ink"
            >
              Create account
            </Link>
          </div>
        </div>
      </section>

      {/* What an account gives you */}
      <section className="border-y border-edge bg-surface">
        <div className="mx-auto w-full max-w-band px-gutter py-14 lg:px-gutter-lg lg:py-20">
          <div className="max-w-3xl">
            <Eyebrow>What an account gives you</Eyebrow>
            <h2 className="mt-4 text-2xl font-semibold tracking-tight lg:text-3xl">
              Saved runs, nothing gated
            </h2>
            <p className="mt-4 text-base leading-relaxed text-ink-muted lg:text-lg">
              An account does not unlock analysis: guests get all four topics,
              all 47 counties, and all three models. It saves your runs so you
              can come back to a result and compare it against a later window.
            </p>
          </div>

          <dl className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                label: "Saved runs",
                description:
                  "Every analysis you run is kept as a shareable link you can return to.",
              },
              {
                label: "Recent areas",
                description:
                  "Your recently used areas of interest, ready to reuse in new analyses.",
              },
              {
                label: "No paywall",
                description:
                  "Everything is free. The account is for convenience, not access.",
              },
              {
                label: "Shareable links",
                description:
                  "Send a link to a colleague and they see the same configuration.",
              },
              {
                label: "Comparison",
                description:
                  "Run the same areas with different models and compare results side by side.",
              },
              {
                label: "History",
                description:
                  "A timeline of your analyses, so you can track how conditions change.",
              },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-2xl border border-edge bg-surface p-6 shadow-card"
              >
                <dt className="font-mono text-sm font-semibold tracking-tight text-accent">
                  {item.label}
                </dt>
                <dd className="mt-2 text-sm leading-relaxed text-ink-muted">
                  {item.description}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* Settings preview */}
      <section className="mx-auto w-full max-w-band px-gutter py-14 lg:px-gutter-lg lg:py-20">
        <div className="max-w-3xl">
          <Eyebrow>Settings</Eyebrow>
          <h2 className="mt-4 text-2xl font-semibold tracking-tight lg:text-3xl">
            Account settings
          </h2>
          <p className="mt-4 text-base leading-relaxed text-ink-muted lg:text-lg">
            Sign in to manage your profile, notification preferences, and data
            settings.
          </p>
        </div>

        <div className="mt-8 rounded-2xl border border-edge bg-surface p-6 shadow-card lg:p-7">
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-edge pb-4">
              <div>
                <p className="text-sm font-semibold">Profile</p>
                <p className="mt-1 text-sm text-ink-muted">
                  Name, email, and organisation
                </p>
              </div>
              <span className="text-sm text-ink-faint">Sign in required</span>
            </div>
            <div className="flex items-center justify-between border-b border-edge pb-4">
              <div>
                <p className="text-sm font-semibold">Notifications</p>
                <p className="mt-1 text-sm text-ink-muted">
                  Email alerts for completed analyses
                </p>
              </div>
              <span className="text-sm text-ink-faint">Sign in required</span>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">Data &amp; privacy</p>
                <p className="mt-1 text-sm text-ink-muted">
                  What we store and how to delete it
                </p>
              </div>
              <span className="text-sm text-ink-faint">Sign in required</span>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
