import type { Route } from "next";
import { ButtonLink } from "@/components/ui/Button";
import { StateBlock } from "@/components/ui/StateBlock";
import { ArrowRight16Regular, DocumentText20Regular, Map20Regular } from "@/components/ui/icons";
import type { TopicSlug } from "@/services/analysis/topics";

/**
 * A report's body while what it contains is still being specified.
 *
 * Says so plainly instead of inventing figures, and points at the two things
 * that do exist today: the topic's own analysis (its first step lives at
 * /topics/<slug>) and the data explorer with the layers behind it.
 *
 * Its own component because the skeleton renders an invisible copy of it to
 * take exactly its height at every width (ReportSkeleton), which is what
 * keeps the swap from moving the page (evals/reports.spec.ts R10, R11).
 *
 * The heading is h3: the panel's one h2 is the topic name in ReportHeader.
 */
export function ReportEmptyBody({
  slug,
  name,
  testId,
}: {
  slug: TopicSlug;
  name: string;
  testId?: string;
}) {
  return (
    <StateBlock
      data-testid={testId}
      tone="info"
      headingLevel={3}
      inset
      icon={<DocumentText20Regular />}
      title="No report published yet"
      actions={
        // Stacked at one width on a phone, side by side from sm.
        <div className="flex w-full max-w-xs flex-col gap-2 sm:w-auto sm:max-w-none sm:flex-row">
          <ButtonLink
            variant="primary"
            href={`/topics/${slug}` as Route}
            icon={<ArrowRight16Regular aria-hidden="true" />}
            iconAfter
            className="w-full sm:w-auto"
          >
            Start an analysis
          </ButtonLink>
          <ButtonLink
            href="/data"
            icon={<Map20Regular aria-hidden="true" />}
            className="w-full sm:w-auto"
          >
            Explore the data layers
          </ButtonLink>
        </div>
      }
    >
      What the {name.toLowerCase()} report will contain is still being specified, so this
      panel shows no figures yet. You can already run a {name.toLowerCase()} analysis for an
      area and read its results on a map.
    </StateBlock>
  );
}
