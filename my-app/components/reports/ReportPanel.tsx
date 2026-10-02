import type { Topic } from "@/services/analysis/topics";
import { REPORT_BODY_HEIGHT, ReportHeader } from "./ReportHeader";

/**
 * One topic's report, the body of its tab.
 *
 * A server component, rendered by app/reports/page.tsx for the topic in the
 * URL, so whatever data a report comes to need is fetched here on the server
 * and the tab switch's loading state is real waiting, not a timer.
 *
 * What each report contains is still being specified, so the body says so
 * plainly instead of inventing figures. The header is final: the topic's tile,
 * name and the question it answers, the same three things a topic card leads
 * with on the homepage.
 */
export function ReportPanel({ topic }: { topic: Topic }) {
  return (
    <article aria-labelledby="report-title" className="card p-5 lg:p-6">
      <ReportHeader
        slug={topic.slug}
        name={topic.name}
        question={topic.question}
        titleId="report-title"
      />

      <div
        data-testid="report-body"
        className={`mt-6 grid ${REPORT_BODY_HEIGHT} place-items-center rounded-fluent-large border border-dashed border-edge-strong bg-surface-subtle p-6 text-center`}
      >
        <p className="type-body1 max-w-md text-ink-muted">
          What the {topic.name.toLowerCase()} report shows is still being decided. Its
          sections will appear here.
        </p>
      </div>
    </article>
  );
}
