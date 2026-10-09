import Link from "next/link";
import { ArrowRight16Regular, Home20Regular, Search16Regular } from "@/components/ui/icons";
import { TOPICS } from "@/services/analysis/topics";
import { FRAME, PageHero } from "@/components/shell/Page";
import { buttonClasses } from "@/components/ui/button-classes";
import { StateBlock } from "@/components/ui/StateBlock";

/**
 * The 404.
 *
 * Compact: the page header is the standard PageHero, so the one `h1` sits where every
 * other page puts it (journey C4 asserts a visible level-one heading). The
 * body is the app's one empty-state shape, StateBlock, and it is not a dead
 * end: its actions are the four real topics, one link each, named by the
 * topic so C4 can find every one by name and check its href, plus a quiet
 * way home. The StateBlock is `inset`, straight on the canvas: the hero
 * already frames the page, so a dashed box under it would be a box in a box.
 *
 * A wrong address under /topics/ lands here too (an unknown slug calls
 * notFound()), which is why the way out is the topics rather than only the
 * homepage.
 */
export default function NotFound() {
  return (
    <>
      <PageHero
        eyebrow="Error 404"
        title="That page does not exist"
        lead="The address you followed does not match anything in this app."
      />

      <section className={`${FRAME} py-4 lg:py-6`}>
        <StateBlock
          inset
          icon={<Search16Regular />}
          title="Start an analysis instead"
          actions={
            <nav aria-label="Analysis topics" className="flex flex-col items-center gap-4">
              <ul className="flex flex-wrap justify-center gap-2">
                {TOPICS.map((topic) => (
                  <li key={topic.slug}>
                    <Link href={`/topics/${topic.slug}`} className={buttonClasses()}>
                      {topic.name}
                      <ArrowRight16Regular aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
              <Link href="/" className={buttonClasses({ appearance: "subtle" })}>
                <Home20Regular aria-hidden="true" />
                Back to home
              </Link>
            </nav>
          }
        >
          If you were part-way through an analysis, your selections were not saved. Pick a topic
          to start again.
        </StateBlock>
      </section>
    </>
  );
}
