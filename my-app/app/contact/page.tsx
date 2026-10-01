import type { Metadata } from "next";
import { Mail20Regular } from "@/components/ui/icons";
import { InfoGrid, PageHero, PageSection } from "@/components/shell/Page";
import { buttonClasses } from "@/components/ui/button-classes";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Get in touch with the Disaster Monitor team at the Kenya Space Agency.",
};

const CHANNELS = [
  {
    label: "General enquiries",
    value: "info@rangeland-awareness.go.ke",
    description: "Questions about the platform or its data.",
  },
  {
    label: "Technical support",
    value: "support@rangeland-awareness.go.ke",
    description: "Issues with the platform or your account.",
  },
  {
    label: "Partnerships",
    value: "partnerships@ksa.go.ke",
    description: "Collaboration and data sharing enquiries.",
  },
  {
    label: "Media",
    value: "communications@ksa.go.ke",
    description: "Press and media enquiries.",
  },
] as const;

const LOCATION = [
  ["Address", "Kenya Space Agency, National Space Secretariat, Off Mombasa Road, Nairobi, Kenya"],
  ["Website", "www.ksa.go.ke"],
  ["Hours", "Monday to Friday, 08:00 to 17:00 EAT"],
] as const;

export default function ContactPage() {
  return (
    <>
      <PageHero
        eyebrow="Contact"
        title="Get in touch"
        lead="Questions, feedback, or partnership enquiries."
      />

      <PageSection
        eyebrow="Contact information"
        title="Reach the team"
        intro="The Disaster Monitor team is based at the Kenya Space Agency. We respond to enquiries within two working days."
      >
        <InfoGrid items={CHANNELS} columns={2} />
      </PageSection>

      <PageSection
        tier="panel"
        eyebrow="Location"
        title="Kenya Space Agency"
        intro="The Kenya Space Agency is the national space agency responsible for coordinating and promoting Kenya's space activities. Disaster Monitor is one of its earth observation initiatives."
      >
        <dl className="card divide-y divide-edge">
          {LOCATION.map(([term, value]) => (
            <div key={term} className="flex flex-wrap gap-x-6 gap-y-0.5 px-4 py-3 lg:px-5">
              <dt className="type-body1 w-20 shrink-0 font-semibold text-ink">{term}</dt>
              <dd className="type-body1 text-ink-muted">{value}</dd>
            </div>
          ))}
        </dl>
      </PageSection>

      <PageSection
        eyebrow="Feedback"
        title="Help us improve"
        intro="We welcome feedback on the platform. Whether you have found a bug, have a feature request, or want to share how you use the analysis results, we would like to hear from you."
      >
        <div className="card p-4 lg:p-5">
          <p className="type-body1 max-w-3xl text-ink-muted">
            The fastest way to report a bug or request a feature is by email. Include as much
            detail as you can: what you were doing, what you expected, and what happened
            instead. Screenshots are helpful but not required.
          </p>
          <a
            href="mailto:support@rangeland-awareness.go.ke"
            className={buttonClasses({ appearance: "primary", className: "mt-4" })}
          >
            <Mail20Regular aria-hidden="true" />
            Send feedback
          </a>
        </div>
      </PageSection>
    </>
  );
}
