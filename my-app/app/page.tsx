import Link from "next/link";
import { TOPICS } from "@/lib/analysis/topics";
import { MODELS } from "@/lib/analysis/models";

/**
 * The homepage.
 *
 * A server component: it is four links and some copy, so there is no reason to
 * ship it as client JavaScript.
 *
 * Laid out as full-width bands rather than one narrow column, so each part
 * gets room: the statement of purpose, the four topics, how a request is put
 * together, and what the models are. The cards are driven entirely by the
 * registry, so adding a topic to lib/analysis/topics.ts adds a card here and a
 * working route with no edit to this file.
 */

const STEPS = [
  {
    title: "Pick a topic",
    body: "Four questions, each with its own model stack and inputs.",
  },
  {
    title: "Choose the scope",
    body: "One location in detail, or several ranked side by side.",
  },
  {
    title: "Select the areas",
    body: "Click the map, draw a shape, type a coordinate, or upload a shapefile.",
  },
  {
    title: "Run the model",
    body: "Random Forest, XGBoost, or both ensembled with their agreement shown.",
  },
];

export default function Home() {
  return (
    <>
      {/* Statement of purpose. Generous, because it is read once and it has to
          land: what this is, and what it produces. */}
      <section className="border-b border-edge bg-surface">
        <div className="mx-auto grid w-full max-w-[1440px] items-start gap-12 px-6 py-16 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-14 lg:px-10 lg:py-20">
          <div className="max-w-3xl">
            <p className="font-mono text-xs font-medium uppercase tracking-[0.14em] text-accent">
              Kenya Space Agency &middot; Earth observation
            </p>
            {/*
              The h1 names the app, not a tagline. Someone jumping straight to
              the first heading with a screen reader should hear what this is,
              and the value statement reads perfectly well as the lead below it.
            */}
            <h1 className="mt-5 text-4xl font-semibold leading-[1.1] tracking-tight lg:text-6xl">
              Rangeland Awareness
            </h1>
            <p className="mt-6 max-w-2xl text-xl leading-relaxed text-ink lg:text-2xl">
              Turn satellite and climate data into rangeland decisions.
            </p>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-ink-muted lg:text-lg">
              Run machine learning analysis over Kenya&apos;s rangelands. Choose
              a topic, select one area or several to compare, pick the model,
              and get a result you can trace back to its inputs.
            </p>

            <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-ink-faint">
              <span className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="h-1.5 w-1.5 rounded-full bg-accent"
                />
                {TOPICS.length} analysis topics
              </span>
              <span className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="h-1.5 w-1.5 rounded-full bg-accent"
                />
                {MODELS.length} model options
              </span>
              <span className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="h-1.5 w-1.5 rounded-full bg-accent"
                />
                Four ways to select an area
              </span>
            </div>
          </div>

          {/*
            A working entry point in the fold, rather than leaving half the
            hero empty and making the reader scroll to find the topics. These
            are the same four links as the cards below, compact.
          */}
          <nav
            aria-label="Start an analysis"
            className="rounded-2xl border border-edge bg-surface p-2 shadow-raised lg:sticky lg:top-24"
          >
            <p className="px-3 pb-2 pt-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-faint">
              Start an analysis
            </p>
            <ul>
              {TOPICS.map((topic) => (
                <li key={topic.slug}>
                  <Link
                    href={`/topics/${topic.slug}`}
                    className="group flex items-center gap-3 rounded-xl px-3 py-3 hover:bg-sunken"
                  >
                    <span
                      aria-hidden="true"
                      className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg border text-[13px] font-bold ${topic.accent.tile} ${topic.accent.border} ${topic.accent.text}`}
                    >
                      {topic.name.slice(0, 1)}
                    </span>
                    <span className="min-w-0 flex-1 text-sm font-semibold tracking-tight">
                      {topic.name}
                    </span>
                    <span
                      aria-hidden="true"
                      className="text-ink-faint transition-transform group-hover:translate-x-0.5 group-hover:text-accent"
                    >
                      &rarr;
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </section>

      {/* The four topics. The main event, so it gets the widest band and the
          largest cards. */}
      <section className="mx-auto w-full max-w-[1440px] px-6 py-14 lg:px-10 lg:py-20">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
          <h2 className="text-2xl font-semibold tracking-tight">
            Choose a topic
          </h2>
          <p className="text-sm text-ink-faint">
            Each topic answers one question and returns one kind of result.
          </p>
        </div>

        {/*
          Named, because the hero also links every topic. Two routes to the
          same place is good for a repeat user, but it means neither list can
          be addressed by link text alone.
        */}
        <ul aria-label="Analysis topics" className="mt-8 grid gap-5 md:grid-cols-2">
          {TOPICS.map((topic) => (
            <li key={topic.slug}>
              <Link
                href={`/topics/${topic.slug}`}
                // The hover border is a neutral token, not the topic accent:
                // Tailwind only sees class names that appear literally in the
                // source, so `hover:${accent.border}` would compile to nothing.
                className="group flex h-full flex-col rounded-2xl border border-edge bg-surface p-7 shadow-card transition-all hover:-translate-y-0.5 hover:border-edge-strong hover:shadow-raised lg:p-8"
              >
                <span
                  aria-hidden="true"
                  className={`grid h-11 w-11 place-items-center rounded-xl border text-base font-bold ${topic.accent.tile} ${topic.accent.border} ${topic.accent.text}`}
                >
                  {topic.name.slice(0, 1)}
                </span>

                <h3
                  className={`mt-5 text-xl font-semibold tracking-tight ${topic.accent.text}`}
                >
                  {topic.name}
                </h3>

                {/* The question, not a restatement of the name. */}
                <p className="mt-2 text-[15px] font-medium leading-relaxed text-ink">
                  {topic.question}
                </p>

                <p className="mt-3 text-sm leading-relaxed text-ink-muted">
                  {topic.output}
                </p>

                <div className="mt-6 border-t border-edge pt-5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-faint">
                    Inputs
                  </p>
                  <p className="mt-2 flex flex-wrap gap-1.5">
                    {topic.inputs.map((input) => (
                      <span
                        key={input}
                        className="rounded-md bg-sunken px-2 py-1 text-xs font-medium text-ink-muted"
                      >
                        {input}
                      </span>
                    ))}
                  </p>
                </div>

                <p className="mt-6 flex items-center gap-1.5 text-sm font-semibold text-accent">
                  Start analysis
                  <span
                    aria-hidden="true"
                    className="transition-transform group-hover:translate-x-0.5"
                  >
                    &rarr;
                  </span>
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* How a request is built. Four steps across the full width, so the flow
          reads as a sequence rather than a stacked list. */}
      <section className="border-y border-edge bg-surface">
        <div className="mx-auto w-full max-w-[1440px] px-6 py-14 lg:px-10 lg:py-20">
          <h2 className="text-2xl font-semibold tracking-tight">
            How an analysis is put together
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-muted">
            Four decisions, all on one screen, in any order. Nothing is
            submitted until every one of them is made.
          </p>

          <ol className="mt-10 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step, index) => (
              <li key={step.title} className="relative">
                <span
                  aria-hidden="true"
                  className="grid h-9 w-9 place-items-center rounded-full border border-accent-border bg-accent-soft font-mono text-sm font-semibold text-accent"
                >
                  {index + 1}
                </span>
                <h3 className="mt-4 text-base font-semibold tracking-tight">
                  {step.title}
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">
                  {step.body}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* The models, with their trade-offs. Read once, on the way in, so the
          choice on the topic page is not a guess. */}
      <section className="mx-auto w-full max-w-[1440px] px-6 py-14 lg:px-10 lg:py-20">
        <h2 className="text-2xl font-semibold tracking-tight">
          The models
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-muted">
          The same three are available for every topic. Pick on the trade-off,
          not the name.
        </p>

        <dl className="mt-8 grid gap-5 lg:grid-cols-3">
          {MODELS.map((model) => (
            <div
              key={model.id}
              className="rounded-2xl border border-edge bg-surface p-6 shadow-card"
            >
              <dt className="font-mono text-sm font-semibold tracking-tight">
                {model.label}
              </dt>
              <dd className="mt-2 text-sm leading-relaxed text-ink-muted">
                {model.tradeoff}
              </dd>
            </div>
          ))}
        </dl>

        <p className="mt-8 rounded-xl border border-edge bg-sunken px-5 py-4 text-sm leading-relaxed text-ink-muted">
          <span className="font-semibold text-ink">Note.</span> The model
          backend is not connected yet. Running an analysis validates your
          request and shows the exact payload the service will receive, so the
          selection flow can be used and reviewed today.
        </p>
      </section>
    </>
  );
}
