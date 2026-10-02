import type { Metadata } from "next";
import { ReportPanel } from "@/components/reports/ReportPanel";
import { ReportTabs } from "@/components/reports/ReportTabs";
import { ReportsFrame } from "@/components/reports/ReportsFrame";
import { TOPICS, topicFromParam } from "@/services/analysis/topics";

export const metadata: Metadata = {
  title: "Reports",
  description: "A report for each of Disaster Monitor's four analysis topics.",
};

/**
 * Reports: a heading, the four topics as tabs, and the selected topic's report.
 *
 * The topic is read from ?topic= here, on the server, so a linked or reloaded
 * tab renders right on the first paint. Anything missing or unknown opens the
 * first topic rather than a 404 (topicFromParam). The tabs come from the
 * registry, so a fifth topic gets a tab with no edit here.
 *
 * Switching tabs is a client-side navigation to the new ?topic=, which
 * re-renders this page for it; ReportTabs shows the skeleton meanwhile. The
 * route's loading.tsx is the same skeleton, for arriving from another page.
 */
export default async function ReportsPage({ searchParams }: PageProps<"/reports">) {
  const topic = topicFromParam((await searchParams).topic);

  return (
    <ReportsFrame>
      <ReportTabs
        tabs={TOPICS.map(({ slug, name, question }) => ({ slug, name, question }))}
        active={topic.slug}
      >
        <ReportPanel topic={topic} />
      </ReportTabs>
    </ReportsFrame>
  );
}
