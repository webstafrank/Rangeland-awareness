import { ReportSkeleton } from "@/components/reports/ReportSkeleton";
import { ReportTabsPlaceholder } from "@/components/reports/ReportTabs";
import { ReportsFrame } from "@/components/reports/ReportsFrame";
import { TOPICS } from "@/services/analysis/topics";

/**
 * Shown while the Reports page renders after a navigation from another page:
 * the real heading, the real tab row (disabled, nothing selected), and the
 * panel skeleton. Same frame, same tab-row height and same panel height as
 * the page, so nothing moves when it lands (evals/reports.spec.ts R11).
 *
 * loading.tsx gets no searchParams, so which topic is coming is not known
 * here: the tabs show no selection and the skeleton's header is grey.
 */
export default function Loading() {
  return (
    <ReportsFrame>
      <ReportTabsPlaceholder names={TOPICS.map((topic) => topic.name)} />
      <div className="mt-6">
        <ReportSkeleton />
      </div>
    </ReportsFrame>
  );
}
