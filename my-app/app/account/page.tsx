import type { Metadata } from "next";
import Link from "next/link";
import { LockClosed16Regular } from "@/components/ui/icons";
import { InfoGrid, PageHero, PageSection } from "@/components/shell/Page";
import { buttonClasses } from "@/components/ui/button-classes";

export const metadata: Metadata = {
  title: "Account",
  description:
    "Manage your Rangeland Awareness account, saved runs, and preferences.",
};

const BENEFITS = [
  {
    label: "Saved runs",
    description: "Every analysis you run is kept as a shareable link you can return to.",
  },
  {
    label: "Recent areas",
    description: "Your recently used areas of interest, ready to reuse in new analyses.",
  },
  {
    label: "No paywall",
    description: "Everything is free. The account is for convenience, not access.",
  },
  {
    label: "Shareable links",
    description: "Send a link to a colleague and they see the same configuration.",
  },
  {
    label: "Comparison",
    description: "Run the same areas with different models and compare results side by side.",
  },
  {
    label: "History",
    description: "A timeline of your analyses, so you can track how conditions change.",
  },
] as const;

const SETTINGS = [
  ["Profile", "Name, email, and organisation"],
  ["Notifications", "Email alerts for completed analyses"],
  ["Data and privacy", "What we store and how to delete it"],
] as const;

export default function AccountPage() {
  return (
    <>
      <PageHero
        eyebrow="Account"
        title="Your account"
        lead="Manage your profile, saved runs, and preferences."
      />

      <PageSection
        eyebrow="Account status"
        title="Not signed in"
        intro="You are browsing as a guest. All analysis features are available, but your runs will not be saved."
      >
        <div className="flex flex-wrap gap-2">
          <Link href="/login" className={buttonClasses({ appearance: "primary", size: "lg" })}>
            Sign in
          </Link>
          <Link href="/signup" className={buttonClasses({ size: "lg" })}>
            Create account
          </Link>
        </div>
      </PageSection>

      <PageSection
        tier="panel"
        eyebrow="What an account gives you"
        title="Saved runs, nothing gated"
        intro="An account does not unlock analysis: guests get all four topics, all 47 counties, and all three models. It saves your runs so you can come back to a result and compare it against a later window."
      >
        <InfoGrid items={BENEFITS} />
      </PageSection>

      <PageSection
        eyebrow="Settings"
        title="Account settings"
        intro="Sign in to manage your profile, notification preferences, and data settings."
      >
        <ul className="card divide-y divide-edge">
          {SETTINGS.map(([label, description]) => (
            <li key={label} className="flex items-center justify-between gap-4 px-4 py-3 lg:px-5">
              <div>
                <p className="type-body1 font-semibold text-ink">{label}</p>
                <p className="type-caption1 mt-0.5 text-ink-muted">{description}</p>
              </div>
              <span className="type-caption1 inline-flex shrink-0 items-center gap-1 text-ink-faint">
                <LockClosed16Regular aria-hidden="true" />
                Sign in required
              </span>
            </li>
          ))}
        </ul>
      </PageSection>
    </>
  );
}
