import Link from "next/link";
import { TOPICS } from "@/lib/analysis/topics";
import { MODELS } from "@/lib/analysis/models";
import { STEPS } from "@/lib/analysis/steps";

/**
 * The homepage.
 *
 * A server component: it is four links and some copy, so there is no reason to
 * ship it as client JavaScript.
 *
 * Three bands, alternating ground: a dark blue hero, the four topics on the
 * page ground, and the flow plus the models on white. The alternation is what
 * gives a long page its sections without a single divider line, and the dark
 * hero is where the four colours introduce themselves — navy ground, white
 * type, red rule, red call to action.
 *
 * The cards and the step list are driven entirely by the registries, so adding
 * a topic to lib/analysis/topics.ts or a step to lib/analysis/steps.ts changes
 * this page with no edit to it.
 */

export default function Home() {
  const first = TOPICS[0];

  return (
    <>
      {/* The hero. Dark blue, because it is the one place on the site where the
          app gets to state what it is before being useful. */}
      <section className="band-chrome">
        <div className="mx-auto grid w-full max-w-band items-start gap-12 px-gutter py-16 lg:grid-cols-[minmax(0,1fr)_420px] lg:gap-16 lg:px-gutter-lg lg:py-24">
          <div className="max-w-3xl">
            <p className="flex items-center gap-3 font-mono text-xs font-medium uppercase tracking-[0.14em] text-on-chrome-muted">
              <span aria-hidden="true" className="h-[3px] w-8 bg-action" />
              Kenya Space Agency &middot; Earth observation
            </p>
            {/*
              The h1 names the app, not a tagline. Someone jumping straight to
              the first heading with a screen reader should hear what this is,
              and the value statement reads perfectly well as the lead below it.
            */}
            <h1 className="mt-6 text-4xl font-semibold leading-[1.05] tracking-tight text-white lg:text-6xl">
              Rangeland Awareness
            </h1>
            <p className="mt-6 max-w-2xl text-xl leading-relaxed text-white lg:text-2xl">
              Turn satellite and climate data into rangeland decisions.
            </p>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-on-chrome-muted lg:text-lg">
              Run machine learning analysis over Kenya&apos;s rangelands. Four
              steps, one screen each: choose the scope, pick the model, select
              the areas, then review and run a request you can trace back to its
              inputs.
            </p>

            <div className="mt-10 flex flex-wrap items-center gap-4">
              <Link
                href={`/topics/${first.slug}`}
                className="rounded-lg bg-action px-6 py-3 text-sm font-semibold text-white shadow-card transition-colors hover:bg-action-hover"
              >
                Start with {first.name.toLowerCase()}{" "}
                <span aria-hidden="true">&rarr;</span>
              </Link>
              <a
                href="#topics"
                className="rounded-lg border border-white/30 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/10"
              >
                See all {TOPICS.length} topics
              </a>
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
            <p className="px-3 pb-2 pt-3 eyebrow">Start an analysis</p>
            <ul>
              {TOPICS.map((topic) => (
                <li key={topic.slug}>
                  <Link
                    href={`/topics/${topic.slug}`}
                    className="group flex items-center gap-3 rounded-xl px-3 py-3 hover:bg-accent-soft"
                  >
                    <span
                      aria-hidden="true"
                      className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg border text-[11px] font-bold tracking-tight ${topic.accent.tile} ${topic.accent.border} ${topic.accent.tileText}`}
                    >
                      {topic.glyph}
                    </span>
                    <span className="min-w-0 flex-1 text-sm font-semibold tracking-tight text-ink">
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
      <section
        id="topics"
        className="mx-auto w-full max-w-band px-gutter py-14 lg:px-gutter-lg lg:py-20"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
          <h2 className="text-2xl font-semibold tracking-tight lg:text-3xl">
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
        <ul
          aria-label="Analysis topics"
          className="mt-8 grid gap-5 md:grid-cols-2"
        >
          {TOPICS.map((topic) => (
            <li key={topic.slug}>
              <Link
                href={`/topics/${topic.slug}`}
                // The hover border is a neutral token, not the topic accent:
                // Tailwind only sees class names that appear literally in the
                // source, so `hover:${accent.border}` would compile to nothing.
                className="group flex h-full flex-col rounded-2xl border border-edge bg-surface p-7 shadow-card transition-all hover:-translate-y-0.5 hover:border-edge-strong hover:shadow-raised lg:p-8"
              >
                {/* A coloured stripe down the leading edge was tried here and
                    removed: two of the four topic tiles are washes, so the
                    stripe was invisible on half the cards and read as a
                    rendering fault rather than as a signal. The glyph tile and
                    the heading carry the topic's colour, and the name carries
                    it in words. */}
                <span
                  aria-hidden="true"
                  className={`grid h-11 w-11 place-items-center rounded-xl border text-xs font-bold tracking-tight ${topic.accent.tile} ${topic.accent.border} ${topic.accent.tileText}`}
                >
                  {topic.glyph}
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
                  <p className="eyebrow">Inputs</p>
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

                {/* Navy, not red, even though this link does start the flow.
                    Two of the four topics ARE red, so on those cards a red
                    link sat directly under a red heading and neither colour
                    said anything. The card is one big link; the arrow and the
                    hover lift are what mark it as one. */}
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

      {/* How a request is built. The same four steps the wizard walks, read
          from the same registry, so this can never describe a flow the app
          does not have. */}
      <section className="border-y border-edge bg-surface">
        <div className="mx-auto w-full max-w-band px-gutter py-14 lg:px-gutter-lg lg:py-20">
          <h2 className="text-2xl font-semibold tracking-tight lg:text-3xl">
            Four steps, one screen each
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-muted">
            Each decision gets the screen to itself, and the rail across the top
            keeps the other three one click away. Nothing is submitted until
            every one of them is made.
          </p>

          <ol className="mt-10 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step, index) => (
              <li key={step.id} className="relative">
                <span
                  aria-hidden="true"
                  className="grid h-9 w-9 place-items-center rounded-full border border-accent bg-accent font-mono text-sm font-semibold text-white"
                >
                  {index + 1}
                </span>
                <h3 className="mt-4 text-base font-semibold tracking-tight">
                  {step.label}
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">
                  {step.title}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* The models, with their trade-offs. Read once, on the way in, so the
          choice on step two is not a guess. */}
      <section className="mx-auto w-full max-w-band px-gutter py-14 lg:px-gutter-lg lg:py-20">
        <h2 className="text-2xl font-semibold tracking-tight lg:text-3xl">
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
              <dt className="font-mono text-sm font-semibold tracking-tight text-accent">
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
