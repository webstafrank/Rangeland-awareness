import TopicIcon from "@/components/topic/TopicIcon";
import type { TopicSlug } from "@/services/analysis/topics";

/**
 * A report's header: the topic's tile, name and question.
 *
 * Its own component because two things render it: ReportPanel, and the
 * skeleton while that panel loads. The skeleton knows which topic is coming,
 * so it shows the real header rather than grey bars guessing its size, which
 * is what keeps the swap from moving the page (a name that wraps to two
 * lines on a phone wraps in both).
 */
export function ReportHeader({
  slug,
  name,
  question,
  titleId,
}: {
  slug: TopicSlug;
  name: string;
  question: string;
  /** Set on the panel's heading, which labels the article. */
  titleId?: string;
}) {
  return (
    <header className="flex items-center gap-4">
      <TopicIcon slug={slug} size="lg" />
      <div className="min-w-0">
        <h2 id={titleId} className="type-title3 text-ink">
          {name}
        </h2>
        <p className="type-body1 mt-1 text-ink-muted">{question}</p>
      </div>
    </header>
  );
}

/**
 * The report body's height while its contents are being specified, shared by
 * the placeholder body and the skeleton's body block so the two match.
 */
export const REPORT_BODY_HEIGHT = "min-h-56";
