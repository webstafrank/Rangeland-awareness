import Link from "next/link";
import { TOPICS } from "@/lib/analysis/topics";

/**
 * The 404.
 *
 * Built from the same tokens and the same card shape as the homepage, because
 * a 404 that looks like a different product reads as a broken deploy rather
 * than a wrong address. It is also a dead end unless it offers a way out, so
 * it lists the four real topics rather than only apologising.
 */
export default function NotFound() {
  return (
    <section className="mx-auto flex w-full max-w-band flex-1 flex-col justify-center px-gutter py-20 lg:px-gutter-lg lg:py-28">
      <div className="max-w-2xl">
        <p className="flex items-center gap-3 font-mono text-xs font-medium uppercase tracking-[0.14em] text-action">
          <span aria-hidden="true" className="h-[3px] w-8 bg-action" />
          Error 404
        </p>
        <h1 className="mt-5 text-3xl font-semibold tracking-tight lg:text-5xl">
          That page does not exist
        </h1>
        <p className="mt-5 text-base leading-relaxed text-ink-muted lg:text-lg">
          The address you followed does not match anything in this app. If you
          were part-way through an analysis, your selections were not saved.
          Start again from a topic below.
        </p>
      </div>

      <nav aria-label="Analysis topics" className="mt-12">
        <h2 className="eyebrow">
          Start an analysis
        </h2>

        <ul className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {TOPICS.map((topic) => (
            <li key={topic.slug}>
              <Link
                href={`/topics/${topic.slug}`}
                className="group flex h-full flex-col rounded-2xl border border-edge bg-surface p-5 shadow-card transition-all hover:-translate-y-0.5 hover:border-edge-strong hover:shadow-raised"
              >
                <span
                  aria-hidden="true"
                  className={`grid h-9 w-9 place-items-center rounded-lg border text-[11px] font-bold tracking-tight ${topic.accent.tile} ${topic.accent.border} ${topic.accent.tileText}`}
                >
                  {topic.glyph}
                </span>

                <span
                  className={`mt-4 text-base font-semibold tracking-tight ${topic.accent.text}`}
                >
                  {topic.name}
                </span>

                <span className="mt-1.5 flex-1 text-sm leading-relaxed text-ink-muted">
                  {topic.question}
                </span>

                <span className="mt-4 flex items-center gap-1.5 text-sm font-semibold text-accent">
                  Start
                  <span
                    aria-hidden="true"
                    className="transition-transform group-hover:translate-x-0.5"
                  >
                    &rarr;
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </section>
  );
}
