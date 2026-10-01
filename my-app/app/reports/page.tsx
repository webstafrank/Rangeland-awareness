import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight20Regular } from "@/components/ui/icons";
import { PageHero, PageSection, InfoGrid } from "@/components/shell/Page";
import { buttonClasses } from "@/components/ui/button-classes";

export const metadata: Metadata = {
  title: "Reports",
  description:
    "Reports on Disaster Monitor are on the way: finished analysis runs written up to read, print and share.",
};

/**
 * Reports, announced rather than faked.
 *
 * There is no reports feature behind this yet, so the page says so and points
 * at what does exist instead of rendering an empty table that looks broken.
 * Its claims are kept to what the app does today: a flood-risk run is stored
 * on the analysis service under its `?run=r_<id>` id, so its result page
 * reloads anywhere; the other three topics stop at a request receipt held in
 * the browser's session storage, which a shared link cannot bring back. The
 * planned items are deliberately not the account page's saved runs, history
 * and comparison, so the two pages never describe one feature twice.
 */

const PLANNED = [
  {
    label: "A report for every run",
    description:
      "One page per finished run: the map, the class table, the criteria and weights, and how to trace each back to its inputs.",
  },
  {
    label: "Print and send",
    description:
      "The same report as a document you can print, attach to an email or file with a situation brief.",
  },
  {
    label: "Every topic",
    description:
      "Reports for drought, rangeland dynamics and food security as each gains an analysis method, not flood risk alone.",
  },
] as const;

export default function ReportsPage() {
  return (
    <>
      <PageHero
        eyebrow="Coming soon"
        title="Reports"
        lead="Finished analysis runs, written up as reports you can read, print and share."
      >
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/#topics" className={buttonClasses({ appearance: "primary" })}>
            Run an analysis
            <ArrowRight20Regular aria-hidden="true" />
          </Link>
          <Link href="/data" className={buttonClasses()}>
            Explore the data
          </Link>
        </div>
      </PageHero>

      <PageSection
        eyebrow="Planned"
        title="What reports will do"
        intro="Reports gather what a run already produces into something you can keep and hand on."
      >
        <InfoGrid items={PLANNED} />
      </PageSection>

      <PageSection
        tier="panel"
        title="Until then"
        intro={
          <p>
            A flood-risk run already has a result page that works as its report: the class
            table, the breaks and each criterion&apos;s contribution, with CSV, GeoJSON and
            JSON downloads. The run is kept on the analysis service, so that page&apos;s link
            brings the same result back for anyone you send it to. The other three topics
            stop at a request receipt for now, which lives only in the browser that made it.
          </p>
        }
      />
    </>
  );
}
