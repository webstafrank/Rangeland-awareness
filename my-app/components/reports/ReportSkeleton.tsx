import { TOPICS, type TopicSlug } from "@/services/analysis/topics";
import { ReportEmptyBody } from "./ReportEmptyBody";
import { ReportHeader } from "./ReportHeader";

/**
 * The loading state of a report panel, with a shimmer passing over its grey
 * blocks (`.skeleton` in app/globals.css).
 *
 * Exactly the panel's height at every width, so the swap to the real report
 * moves nothing on the page (evals/reports.spec.ts R10, R11). It gets there
 * without a single height constant: each grey block sits over an invisible,
 * inert copy of the real thing it stands for, which sizes it.
 *
 *   - Switching tabs, the topic is known, so the header is the real one and
 *     only the body shimmers.
 *   - Arriving from another page (loading.tsx), the topic is not known yet,
 *     so the header is grey bars sized on the first topic's header, the one
 *     the navbar's Reports link opens. Another topic's question can wrap
 *     differently on a phone, which a header that does not know the topic
 *     cannot predict.
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
  const sizer = topic ?? TOPICS[0];
  return (
    <div data-testid="report-skeleton" className="card overflow-hidden">
      {topic ? (
        <ReportHeader name={topic.name} question={topic.question} />
      ) : (
        <div aria-hidden="true" inert className="relative">
          <div className="invisible">
            <ReportHeader name={sizer.name} question={sizer.question} />
          </div>
          <div className="absolute inset-x-4 inset-y-3 flex flex-col justify-center gap-1.5 lg:inset-x-5">
            <div className="skeleton h-3 w-24 rounded-fluent-small" />
            <div className="skeleton h-4 w-80 max-w-full rounded-fluent-small" />
          </div>
        </div>
      )}
      <div aria-hidden="true" inert className="relative">
        <div className="invisible">
          <ReportEmptyBody slug={sizer.slug} name={sizer.name} />
        </div>
        {/* Positioned by a wrapper: `.skeleton` sets its own position:
            relative, unlayered, which would beat an `absolute` utility. */}
        <div className="absolute inset-4 lg:inset-5">
          <div className="skeleton h-full rounded-fluent-large" />
        </div>
      </div>
    </div>
  );
}
