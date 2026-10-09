/**
 * A report's header row: the topic's name as a quiet label, and the question
 * the report answers.
 *
 * The selected tab already says which topic this is in large type, so the
 * name here is an eyebrow-sized h2 (the panel's one h2, which also labels
 * the article) and the question carries the row.
 *
 * Its own component because two things render it: ReportPanel, and the
 * skeleton while that panel loads, which shows the real header when it knows
 * the topic and sizes its grey bars on an invisible copy when it does not.
 */
export function ReportHeader({
  name,
  question,
  titleId,
}: {
  name: string;
  question: string;
  /** Set on the panel's heading, which labels the article. */
  titleId?: string;
}) {
  return (
    <header className="border-b border-edge px-4 py-3 lg:px-5">
      <h2 id={titleId} className="eyebrow">
        {name}
      </h2>
      <p className="type-body1 mt-0.5 text-ink">{question}</p>
    </header>
  );
}
