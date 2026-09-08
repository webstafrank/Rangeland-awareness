import Link from "next/link";
import { TOPICS } from "@/lib/analysis/topics";

/**
 * The homepage.
 *
 * A server component: it is four links and some copy, so there is no reason to
 * ship it as client JavaScript.
 *
 * The cards are driven entirely by the topic registry. Adding a topic to
 * lib/analysis/topics.ts adds a card here and a working route, with no edit to
 * this file.
 */
export default function Home() {
  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6 sm:py-14">
      <div className="max-w-2xl">
        <p className="font-mono text-xs uppercase tracking-widest text-foreground-faint">
          Earth observation analysis
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
          Rangeland Awareness
        </h1>
        <p className="mt-4 text-base leading-relaxed text-foreground-muted sm:text-lg">
          Run machine learning analysis over satellite and climate data for
          Kenya&apos;s rangelands. Pick a topic, choose one area or several to
          compare, and select the model to process it.
        </p>
      </div>

      <h2 className="mt-12 text-xs font-semibold uppercase tracking-wide text-foreground-faint">
        Choose a topic
      </h2>

      <ul className="mt-4 grid gap-4 sm:grid-cols-2">
        {TOPICS.map((topic) => (
          <li key={topic.slug}>
            <Link
              href={`/topics/${topic.slug}`}
              className={`group flex h-full flex-col rounded-xl border border-edge bg-surface p-5 ring-2 ring-transparent transition-colors hover:border-edge-strong ${topic.accent.ring}`}
            >
              <span
                aria-hidden="true"
                className={`grid h-9 w-9 place-items-center rounded-lg text-sm font-bold ${topic.accent.tile} ${topic.accent.text}`}
              >
                {topic.name.slice(0, 1)}
              </span>

              <span
                className={`mt-3.5 text-lg font-semibold tracking-tight ${topic.accent.text}`}
              >
                {topic.name}
              </span>

              {/* The question, not a restatement of the name. Rubric H3. */}
              <span className="mt-1.5 text-sm leading-relaxed text-foreground">
                {topic.question}
              </span>

              <span className="mt-2.5 text-sm leading-relaxed text-foreground-muted">
                {topic.output}
              </span>

              <span className="mt-4 flex flex-wrap gap-1.5 border-t border-edge pt-3.5">
                {topic.inputs.map((input) => (
                  <span
                    key={input}
                    className="rounded-md bg-surface-muted px-2 py-0.5 text-[11px] font-medium text-foreground-muted"
                  >
                    {input}
                  </span>
                ))}
              </span>

              <span className="mt-4 text-sm font-semibold text-foreground-muted group-hover:text-foreground">
                Start analysis
                <span aria-hidden="true" className="ml-1 inline-block">
                  &rarr;
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <div className="mt-12 max-w-2xl rounded-xl border border-edge bg-surface-muted p-5">
        <h2 className="text-sm font-semibold">How an analysis is put together</h2>
        <ol className="mt-2.5 space-y-1.5 text-sm leading-relaxed text-foreground-muted">
          <li>1. Pick the topic you are asking about.</li>
          <li>
            2. Choose a single location, or several locations to compare side by
            side.
          </li>
          <li>
            3. Select the areas: click the map, draw a shape, or upload a
            shapefile.
          </li>
          <li>4. Choose the model, then run it.</li>
        </ol>
      </div>
    </div>
  );
}
