import type { TopicSlug } from "@/services/analysis/topics";
import { REPORT_BODY_HEIGHT, ReportHeader } from "./ReportHeader";

/**
 * The loading state of a report panel, with a shimmer passing over its grey
 * blocks (`.skeleton` in app/globals.css).
 *
 * Built to be exactly the panel's height, so the swap to the real report
 * moves nothing on the page (evals/reports.spec.ts R10 measures it):
 *
 *   - Switching tabs, the topic is known, so the header is the real one
 *     (ReportHeader) and only the body shimmers. A name that wraps on a
 *     phone wraps here too, which no grey bar could match.
 *   - Arriving from another page (loading.tsx), the topic is not known yet,
 *     so the header is grey bars in the header's line boxes. Exact from
 *     540px for every topic; on a phone exact for the topic the navbar opens
 *     (see the comment on the bars). R11 measures the navbar path.
 *
 * The body is one block at the placeholder body's height. When reports get
 * real sections, this body changes with them.
 *
 * No hooks, so loading.tsx renders it on the server and ReportTabs on the
 * client. Purely visual: the loading announcement is ReportTabs' status line,
 * which stays mounted so screen readers hear it change.
 */
export function ReportSkeleton({
  topic,
}: {
  topic?: { slug: TopicSlug; name: string; question: string };
}) {
  return (
    <div data-testid="report-skeleton" className="card p-5 lg:p-6">
      {topic ? (
        <ReportHeader slug={topic.slug} name={topic.name} question={topic.question} />
      ) : (
        // The bars sit in the heading's line boxes: title3's 32px line, the
        // 4px gap, body1's 20px line. 56px, taller than the 48px tile.
        //
        // Below 452px the question takes a second line, because the topic
        // the navbar's Reports link opens (the first, Flood risk) wraps its
        // question there (measured: 76px up to 448px, 56px from 452px). From
        // 540px every topic's header is 56px, so this matches all of them;
        // on a phone it matches the one most arrivals land on. Other topics
        // on a phone wrap differently (up to 128px at 320px), which a header
        // that does not yet know the topic cannot predict.
        <div aria-hidden="true" className="flex items-center gap-4">
          <div className="skeleton h-12 w-12 shrink-0 rounded-fluent-large" />
          <div className="min-w-0 flex-1">
            <div className="flex h-8 items-center">
              <div className="skeleton h-6 w-48 max-w-full rounded-fluent-medium" />
            </div>
            <div className="mt-1 flex h-5 items-center">
              <div className="skeleton h-4 w-80 max-w-full rounded-fluent-medium" />
            </div>
            <div className="flex h-5 items-center min-[452px]:hidden">
              <div className="skeleton h-4 w-40 max-w-full rounded-fluent-medium" />
            </div>
          </div>
        </div>
      )}
      <div aria-hidden="true" className={`skeleton mt-6 ${REPORT_BODY_HEIGHT} rounded-fluent-large`} />
    </div>
  );
}
