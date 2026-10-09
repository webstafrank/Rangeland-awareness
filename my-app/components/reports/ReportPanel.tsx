import type { Topic } from "@/services/analysis/topics";
import { ReportEmptyBody } from "./ReportEmptyBody";
import { ReportHeader } from "./ReportHeader";

/**
 * One topic's report, the body of its tab.
 *
 * A server component, rendered by app/reports/page.tsx for the topic in the
 * URL, so whatever data a report comes to need is fetched here on the server
 * and the tab switch's loading state is real waiting, not a timer.
 *
 * One card, edge to edge: a header row, then the body. What each report
 * contains is still being specified, so the body is the honest empty state
 * (ReportEmptyBody, inset: no box inside the card) instead of invented
 * figures.
 */
export function ReportPanel({ topic }: { topic: Topic }) {
  return (
    <article aria-labelledby="report-title" className="card overflow-hidden">
      <ReportHeader name={topic.name} question={topic.question} titleId="report-title" />
      <ReportEmptyBody slug={topic.slug} name={topic.name} testId="report-body" />
    </article>
  );
}
