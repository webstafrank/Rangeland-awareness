import Link from "next/link";
import { notFound } from "next/navigation";
import { getTopic } from "@/lib/analysis/topics";

/**
 * The topic band, shared by all four steps.
 *
 * A layout rather than four copies, for the reason layouts exist: it does not
 * re-render or re-mount when the step under it changes, so the topic header is
 * genuinely still on screen during a Continue rather than being torn down and
 * rebuilt identically.
 *
 * It holds no state. The selection lives in lib/analysis/selection-store.ts,
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
      <section className="band-chrome">
        <div className="mx-auto flex w-full max-w-band flex-wrap items-center gap-x-5 gap-y-2 px-gutter py-3.5 lg:px-gutter-lg lg:py-4">
          <span
            aria-hidden="true"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/25 bg-white/10 text-[11px] font-bold tracking-tight text-white"
          >
            {topic.glyph}
          </span>

          <div className="min-w-0">
            <nav
              aria-label="Breadcrumb"
              className="text-[11px] leading-tight text-on-chrome-muted"
            >
              <Link
                href="/"
                className="rounded font-medium hover:text-white hover:underline"
              >
                All topics
              </Link>
              <span aria-hidden="true" className="px-1.5">
                /
              </span>
              <span>{topic.name}</span>
            </nav>
            <h1 className="text-lg font-semibold leading-tight tracking-tight lg:text-xl">
              {topic.name}
            </h1>
          </div>

          {/* The question. Beside the name where there is room, under it where
              there is not, and never a third row on its own. */}
          <p className="min-w-0 basis-full text-[13px] leading-snug text-on-chrome-muted sm:basis-auto sm:border-l sm:border-white/20 sm:pl-5">
            {topic.question}
          </p>
        </div>
      </section>

      {children}
    </div>
  );
}
