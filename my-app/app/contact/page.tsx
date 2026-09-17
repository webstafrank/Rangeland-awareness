import type { Metadata } from "next";
import Link from "next/link";
import { Eyebrow } from "@/components/ui/Eyebrow";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Get in touch with the Rangeland Awareness team at the Kenya Space Agency.",
};

export default function ContactPage() {
  return (
    <>
      {/* Hero band */}
      <section className="band-chrome">
        <div className="mx-auto w-full max-w-band px-gutter py-16 lg:px-gutter-lg lg:py-24">
          <div className="max-w-3xl">
            <p className="flex items-center gap-3 font-mono text-xs font-medium uppercase tracking-[0.14em] text-on-chrome-muted">
              <span aria-hidden="true" className="h-[3px] w-8 bg-action" />
              Contact
            </p>
            <h1 className="mt-6 text-4xl font-semibold leading-[1.05] tracking-tight text-white lg:text-6xl">
              Get in touch
            </h1>
            <p className="mt-6 max-w-2xl text-xl leading-relaxed text-white lg:text-2xl">
              Questions, feedback, or partnership enquiries.
            </p>
          </div>
        </div>
      </section>

      {/* Contact info */}
      <section className="mx-auto w-full max-w-band px-gutter py-14 lg:px-gutter-lg lg:py-20">
        <div className="max-w-3xl">
          <Eyebrow>Contact information</Eyebrow>
          <h2 className="mt-4 text-2xl font-semibold tracking-tight lg:text-3xl">
            Reach the team
          </h2>
          <p className="mt-4 text-base leading-relaxed text-ink-muted lg:text-lg">
            The Rangeland Awareness team is based at the Kenya Space Agency.
            We respond to enquiries within two working days.
          </p>
        </div>

        <dl className="mt-8 grid gap-5 sm:grid-cols-2">
          {[
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
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-2xl border border-edge bg-surface p-6 shadow-card"
            >
              <dt className="font-mono text-sm font-semibold tracking-tight text-accent">
                {item.label}
              </dt>
              <dd className="mt-2 text-sm font-medium">{item.value}</dd>
              <dd className="mt-1 text-sm text-ink-muted">{item.description}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Location */}
      <section className="border-y border-edge bg-surface">
        <div className="mx-auto w-full max-w-band px-gutter py-14 lg:px-gutter-lg lg:py-20">
          <div className="max-w-3xl">
            <Eyebrow>Location</Eyebrow>
            <h2 className="mt-4 text-2xl font-semibold tracking-tight lg:text-3xl">
              Kenya Space Agency
            </h2>
            <p className="mt-4 text-base leading-relaxed text-ink-muted lg:text-lg">
              The Kenya Space Agency is the national space agency responsible for
              coordinating and promoting Kenya&apos;s space activities. Rangeland
              Awareness is one of its earth observation initiatives.
            </p>
          </div>

          <div className="mt-8 rounded-2xl border border-edge bg-surface p-6 shadow-card lg:p-7">
            <dl className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-x-6 gap-y-1">
                <dt className="text-sm font-semibold">Address</dt>
                <dd className="text-sm text-ink-muted">
                  Kenya Space Agency, National Space Secretariat, Off Mombasa
                  Road, Nairobi, Kenya
                </dd>
              </div>
              <div className="flex flex-wrap gap-x-6 gap-y-1">
                <dt className="text-sm font-semibold">Website</dt>
                <dd className="text-sm text-ink-muted">www.ksa.go.ke</dd>
              </div>
              <div className="flex flex-wrap gap-x-6 gap-y-1">
                <dt className="text-sm font-semibold">Hours</dt>
                <dd className="text-sm text-ink-muted">
                  Monday to Friday, 8:00 AM to 5:00 PM EAT
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </section>

      {/* Feedback */}
      <section className="mx-auto w-full max-w-band px-gutter py-14 lg:px-gutter-lg lg:py-20">
        <div className="max-w-3xl">
          <Eyebrow>Feedback</Eyebrow>
          <h2 className="mt-4 text-2xl font-semibold tracking-tight lg:text-3xl">
            Help us improve
          </h2>
          <p className="mt-4 text-base leading-relaxed text-ink-muted lg:text-lg">
            We welcome feedback on the platform. Whether you have found a bug,
            have a feature request, or want to share how you use the analysis
            results, we would like to hear from you.
          </p>
        </div>

        <div className="mt-8 rounded-2xl border border-edge bg-surface p-6 shadow-card lg:p-7">
          <p className="text-sm leading-relaxed text-ink-muted">
            The fastest way to report a bug or request a feature is by email.
            Include as much detail as you can: what you were doing, what you
            expected, and what happened instead. Screenshots are helpful but not
            required.
          </p>
          <div className="mt-4">
            <Link
              href="mailto:support@rangeland-awareness.go.ke"
              className="rounded-lg bg-action px-6 py-3 text-sm font-semibold text-white shadow-card transition-colors hover:bg-action-hover"
            >
              Send feedback{" "}
              <span aria-hidden="true">&rarr;</span>
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
