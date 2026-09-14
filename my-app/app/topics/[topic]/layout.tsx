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
      <section className="band-chrome">
        <div className="mx-auto w-full max-w-band px-gutter py-7 lg:px-gutter-lg lg:py-9">
          <nav aria-label="Breadcrumb" className="text-xs text-on-chrome-muted">
            <Link
              href="/"
              className="rounded font-medium hover:text-white hover:underline"
            >
              All topics
            </Link>
            <span aria-hidden="true" className="px-2">
              /
            </span>
            <span>{topic.name}</span>
          </nav>

          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-3">
            <span
              aria-hidden="true"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-white/25 bg-white/10 text-xs font-bold tracking-tight text-white"
            >
              {topic.glyph}
            </span>
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight lg:text-3xl">
                {topic.name}
              </h1>
              <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-on-chrome-muted lg:text-[15px]">
                {topic.question}
              </p>
            </div>
          </div>
        </div>
      </section>

      {children}
    </div>
  );
}
