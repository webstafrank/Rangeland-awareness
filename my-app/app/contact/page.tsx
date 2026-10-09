import type { Metadata } from "next";
import {
  Handshake20Regular,
  Mail20Regular,
  Megaphone20Regular,
  QuestionCircle20Regular,
  Wrench20Regular,
} from "@/components/ui/icons";
import { PageHero, PageSection } from "@/components/shell/Page";
import { buttonClasses } from "@/components/ui/button-classes";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Get in touch with the Disaster Monitor team at the Kenya Space Agency.",
};

const CHANNELS = [
  {
    label: "General enquiries",
    Icon: QuestionCircle20Regular,
    value: "info@rangeland-awareness.go.ke",
    description: "Questions about the platform or its data.",
  },
  {
    label: "Technical support",
    Icon: Wrench20Regular,
    value: "support@rangeland-awareness.go.ke",
    description: "Issues with the platform or your account.",
  },
  {
    label: "Partnerships",
    Icon: Handshake20Regular,
    value: "partnerships@ksa.go.ke",
    description: "Collaboration and data sharing enquiries.",
  },
  {
    label: "Media",
    Icon: Megaphone20Regular,
    value: "communications@ksa.go.ke",
    description: "Press and media enquiries.",
  },
] as const;

const LOCATION = [
  ["Address", "Kenya Space Agency, National Space Secretariat, Off Mombasa Road, Nairobi, Kenya"],
  ["Website", "www.ksa.go.ke"],
  ["Hours", "Monday to Friday, 08:00 to 17:00 EAT"],
] as const;

/**
 * Contact: one card per enquiry type, each address a real mailto link, then
 * the agency's address and hours, then the feedback route.
 *
 * The addresses span two domains: the platform's own
 * (rangeland-awareness.go.ke) for enquiries and support, the agency's
 * (ksa.go.ke) for partnerships and media. Neither reads as a typo of the
 * other, so both are kept as written.
 */
export default function ContactPage() {
  return (
    <>
      <PageHero
        eyebrow="Support"
        title="Get in touch"
        lead="Questions, feedback, or partnership enquiries."
      />

      <PageSection
        eyebrow="Contact information"
        title="Reach the team"
        intro="The Disaster Monitor team is based at the Kenya Space Agency. We respond to enquiries within two working days."
      >
        <ul className="grid gap-4 sm:grid-cols-2">
          {CHANNELS.map((channel) => (
            <li key={channel.label} className="card flex gap-3 p-4 lg:p-5">
              <span
                aria-hidden="true"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-fluent-large bg-accent-soft text-accent"
              >
                <channel.Icon />
              </span>
              <div className="min-w-0">
                <h3 className="type-subtitle2 text-ink">{channel.label}</h3>
                <p className="type-caption1 mt-0.5 text-ink-faint">{channel.description}</p>
                <a
                  href={`mailto:${channel.value}`}
                  className="type-body1 mt-2 inline-block rounded-fluent-small font-semibold break-all text-accent-link hover:underline"
                >
                  {channel.value}
                </a>
              </div>
            </li>
          ))}
        </ul>
      </PageSection>

      <PageSection
        eyebrow="Location"
        title="Kenya Space Agency"
        intro="The Kenya Space Agency is the national space agency responsible for coordinating and promoting Kenya's space activities. Disaster Monitor is one of its earth observation initiatives."
      >
        <dl className="card divide-y divide-edge">
          {LOCATION.map(([term, value]) => (
            <div key={term} className="grid gap-0.5 px-4 py-3 sm:grid-cols-[6rem_minmax(0,1fr)] sm:gap-6 lg:px-5">
              <dt className="type-body1 text-ink-faint">{term}</dt>
              <dd className="type-body1 text-ink">{value}</dd>
            </div>
          ))}
        </dl>
      </PageSection>

      <PageSection
        eyebrow="Feedback"
        title="Help us improve"
        intro="We welcome feedback on the platform. Whether you have found a bug, have a feature request, or want to share how you use the analysis results, we would like to hear from you."
      >
        <div className="card flex flex-col items-start gap-4 p-4 sm:flex-row sm:items-center sm:justify-between lg:p-5">
          <p className="type-body1 max-w-2xl text-ink-muted">
            The fastest way to report a bug or request a feature is by email. Include as much
            detail as you can: what you were doing, what you expected, and what happened
            instead. Screenshots are helpful but not required.
          </p>
          <a
            href="mailto:support@rangeland-awareness.go.ke"
            className={buttonClasses({ appearance: "primary", className: "shrink-0" })}
          >
            <Mail20Regular aria-hidden="true" />
            Send feedback
          </a>
        </div>
      </PageSection>
    </>
  );
}
