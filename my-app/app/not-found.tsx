import Link from "next/link";
import { ArrowRight16Regular } from "@/components/ui/icons";
import { TOPICS } from "@/services/analysis/topics";
import TopicIcon from "@/components/topic/TopicIcon";
import { Eyebrow } from "@/components/ui/Eyebrow";

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
    <section className="mx-auto flex w-full max-w-band flex-1 flex-col justify-center px-gutter py-12 lg:px-gutter-lg lg:py-20">
      <div className="max-w-2xl">
        <Eyebrow marked>
          <span className="font-mono">Error 404</span>
        </Eyebrow>
        <h1 className="type-title1 mt-3 text-ink lg:type-large-title">
          That page does not exist
        </h1>
        <p className="type-body2 mt-3 text-ink-muted">
          The address you followed does not match anything in this app. If you
          were part-way through an analysis, your selections were not saved.
          Start again from a topic below.
        </p>
      </div>

      <nav aria-label="Analysis topics" className="mt-10">
        <h2 className="type-subtitle2 text-ink">Start an analysis</h2>

        <ul className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {TOPICS.map((topic) => (
            <li key={topic.slug}>
              <Link
                href={`/topics/${topic.slug}`}
                className="card group flex h-full flex-col p-4 transition-shadow duration-150 hover:shadow-8"
              >
                <TopicIcon slug={topic.slug} />
                <span className="type-subtitle2 mt-3 text-ink">{topic.name}</span>
                <span className="type-body1 mt-1 flex-1 text-ink-muted">{topic.question}</span>
                <span className="type-body1 mt-3 flex items-center gap-1 font-semibold text-accent-link group-hover:underline">
                  Start
                  <ArrowRight16Regular aria-hidden="true" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </section>
  );
}
