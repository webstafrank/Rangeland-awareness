import { notFound } from "next/navigation";
import ChangeTopicLink from "@/components/topic/ChangeTopicLink";
import { getTopic } from "@/services/analysis/topics";
import TopicIcon from "@/components/topic/TopicIcon";

/**
 * The topic band, shared by all four steps.
 *
 * A layout rather than four copies, for the reason layouts exist: it does not
 * re-render or re-mount when the step under it changes, so the topic header is
 * genuinely still on screen during a Continue rather than being torn down and
 * rebuilt identically.
 *
 * It holds no state. The selection lives in services/analysis/selection-store.ts,
 * which is what lets it survive these navigations without a layout that has to
 * be a client component. A layout also cannot read searchParams, so putting
 * the selection here would have meant applying a bookmarked configuration in
 * an effect: a flash of the defaults on every shared link.
 *
 * The 404 is repeated from the step pages on purpose. A layout runs before its
 * children, so without this an unknown slug would render this band and only
 * then 404 underneath it.
 */
export default async function TopicLayout({
  params,
  children,
}: LayoutProps<"/topics/[topic]">) {
  const { topic: slug } = await params;
  const topic = getTopic(slug);
  if (!topic) notFound();

  return (
    <div className="flex flex-1 flex-col">
      {/*
        The topic header: the icon tile, the name, the question it answers,
        and a quiet way to switch topic.

        No breadcrumb of its own. The shell's top bar already reads
        Analysis > Topic > Step, so a second trail here repeated it and spent
        a line doing so.

        This band repeats on all four steps, so every pixel it takes is taken
        four times. evals/journey.spec.ts "fits the screen" holds the header,
        this band, the rail and the sticky bar to 300px on a desktop and 360px
        on a phone. So the name and the question stack as two short lines
        beside the tile, and the band is one row tall.
      */}
      <section className="band-chrome border-b border-edge">
        <div className="mx-auto flex w-full max-w-band items-center gap-3 px-gutter py-2.5 lg:gap-4 lg:px-gutter-lg">
          <TopicIcon slug={topic.slug} />

          <div className="min-w-0 flex-1">
            <h1 className="type-subtitle2 text-ink sm:type-subtitle1">{topic.name}</h1>
            <p className="type-caption1 text-ink-muted sm:type-body1">
              {topic.question}
            </p>
          </div>

          {/* Back to the four topics. Quiet on purpose: a way out, not what
              this screen is for. On a phone it is the only route back short
              of the drawer, because the top bar hides its breadcrumb below
              lg. Hidden while a run is in progress or shown (see the
              component). */}
          <ChangeTopicLink />
        </div>
      </section>

      {children}
    </div>
  );
}
