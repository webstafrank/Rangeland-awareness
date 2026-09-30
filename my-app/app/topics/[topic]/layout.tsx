import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight12Regular } from "@/components/ui/icons";
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
 * an effect — a flash of the defaults on every shared link.
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
        One row, not three.

        This band repeats on all four steps, so every pixel it takes is taken
        four times. Measured at 170px tall (205 on a phone) when the
        breadcrumb, the glyph, the name and the question each had their own
        line: with the header and the rail above the fold too, the step's own
        question started 360px down the page and a 640px phone had about 80px
        left for the actual decision.

        So the breadcrumb runs inline with the name, and the question sits
        beside it on a wide screen rather than under it. Nothing was removed —
        the same four things are on screen, on one line instead of three.
      */}
      {/*
        Fluent's neutral chrome, continuing down from the app header: the
        header says which app, this says which topic, and the white step rail
        below is where the page itself begins. The breadcrumb is Fluent's
        Breadcrumb in miniature: a link, a chevron, the current item.
      */}
      <section className="band-chrome border-b border-edge">
        <div className="mx-auto flex w-full max-w-band flex-wrap items-center gap-x-4 gap-y-2 px-gutter py-3 lg:px-gutter-lg">
          <TopicIcon slug={topic.slug} />

          <div className="min-w-0">
            <nav
              aria-label="Breadcrumb"
              className="type-caption1 flex items-center gap-0.5 text-ink-faint"
            >
              <Link
                href="/"
                className="rounded-fluent-small text-accent-link hover:underline"
              >
                All topics
              </Link>
              <ChevronRight12Regular aria-hidden="true" />
              <span aria-current="page">{topic.name}</span>
            </nav>
            <h1 className="type-subtitle1 text-ink">{topic.name}</h1>
          </div>

          {/* The question. Beside the name where there is room, under it where
              there is not, and never a third row on its own. */}
          <p className="type-body1 min-w-0 basis-full text-ink-muted sm:basis-auto sm:border-l sm:border-edge-strong sm:pl-4">
            {topic.question}
          </p>
        </div>
      </section>

      {children}
    </div>
  );
}
