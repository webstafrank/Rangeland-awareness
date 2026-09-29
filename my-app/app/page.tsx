import Link from "next/link";
import { ArrowRight16Regular, ArrowRight20Regular, ChevronRight16Regular } from "@/components/ui/icons";
import { TOPICS } from "@/services/analysis/topics";
import { MODELS } from "@/services/analysis/models";
import { STEPS } from "@/services/analysis/steps";
import { CoverStrip } from "@/components/shell/CoverStrip";
import TopicIcon from "@/components/topic/TopicIcon";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Notice } from "@/components/ui/Notice";
import { buttonClasses } from "@/components/ui/button-classes";

/**
 * The homepage.
 *
 * A server component: it is links and copy, so there is no reason to ship it
 * as client JavaScript. The one Fluent component on it (the note at the end)
 * is its own small client island.
 *
 * Four sections: a hero on the panel tier under the design system's cover
 * strip, the four topics on the canvas, the flow on white, and the models
 * on the canvas. The alternation of the two neutral tiers is what gives a
 * long page its sections, with a colorNeutralStroke2 rule where they meet.
 *
 * The cards and the step list are driven entirely by the registries, so adding
 * a topic to services/analysis/topics.ts or a step to services/analysis/steps.ts
 * changes this page with no edit to it.
 */

const FRAME = "mx-auto w-full max-w-band px-gutter lg:px-gutter-lg";

export default function Home() {
  const first = TOPICS[0];

  return (
    <>
      <section className="border-b border-edge bg-surface">
        <div className={FRAME}>
          <CoverStrip />
        </div>

        <div
          className={`${FRAME} grid items-start gap-8 pt-8 pb-10 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-12 lg:pt-12 lg:pb-14`}
        >
          <div className="max-w-3xl">
            <Eyebrow marked>Kenya Space Agency &middot; Earth observation</Eyebrow>
            {/*
              The h1 names the app, not a tagline. Someone jumping straight to
              the first heading with a screen reader should hear what this is,
              and the value statement reads perfectly well as the lead below it.
            */}
            <h1 className="type-title1 mt-4 text-ink sm:type-large-title">
              Rangeland Awareness
            </h1>
            <p className="type-subtitle1 mt-4 max-w-2xl font-normal text-ink">
              Turn satellite and climate data into rangeland decisions.
            </p>
            <p className="type-body2 mt-3 max-w-2xl text-ink-muted">
              Run analysis over Kenya&apos;s rangelands in four steps, one screen
              each: choose the scope, pick the model, select the areas, then
              review and run a request you can trace back to its inputs.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href={`/topics/${first.slug}`}
                className={buttonClasses({ appearance: "primary", size: "lg" })}
              >
                Start with {first.name.toLowerCase()}
                <ArrowRight20Regular aria-hidden="true" />
              </Link>
              <a href="#topics" className={buttonClasses({ size: "lg" })}>
                See all {TOPICS.length} topics
              </a>
            </div>
          </div>

          {/*
            A working entry point in the fold, rather than leaving half the
            hero empty and making the reader scroll to find the topics. These
            are the same four links as the cards below, compact: a Fluent list
            of navigation rows in a card.
          */}
          <nav aria-label="Start an analysis" className="card p-2 lg:sticky lg:top-16">
            <p className="eyebrow px-3 pt-2 pb-2">Start an analysis</p>
            <ul>
              {TOPICS.map((topic) => (
                <li key={topic.slug}>
                  <Link
                    href={`/topics/${topic.slug}`}
                    className="group flex min-h-12 items-center gap-3 rounded-fluent-medium px-3 py-2 hover:bg-page"
                  >
                    <TopicIcon slug={topic.slug} size="sm" />
                    <span className="type-body1 min-w-0 flex-1 font-semibold text-ink">
                      {topic.name}
                    </span>
                    <ChevronRight16Regular
                      aria-hidden="true"
                      className="text-ink-faint group-hover:text-accent"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </section>

      {/* The four topics. The main event, so it gets the widest grid and the
          largest cards. */}
      <section id="topics" className={`${FRAME} scroll-mt-16 py-10 lg:py-14`}>
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          <h2 className="type-title3 text-ink">Choose a topic</h2>
          <p className="type-body1 text-ink-faint">
            Each topic answers one question and returns one kind of result.
          </p>
        </div>

        {/*
          Named, because the hero also links every topic. Two routes to the
          same place is good for a repeat user, but it means neither list can
          be addressed by link text alone.
        */}
        <ul aria-label="Analysis topics" className="mt-6 grid gap-4 md:grid-cols-2">
          {TOPICS.map((topic) => (
            <li key={topic.slug}>
              <Link
                href={`/topics/${topic.slug}`}
                className="card group flex h-full flex-col p-5 transition-shadow duration-150 hover:shadow-8 lg:p-6"
              >
                <div className="flex items-start gap-4">
                  <TopicIcon slug={topic.slug} size="lg" />
                  <div className="min-w-0">
                    <h3 className="type-subtitle1 text-ink">{topic.name}</h3>
                    {/* The question, not a restatement of the name. */}
                    <p className="type-body1 mt-1 font-semibold text-ink">
                      {topic.question}
                    </p>
                  </div>
                </div>

                <p className="type-body1 mt-3 text-ink-muted">{topic.output}</p>

                <div className="mt-4 border-t border-edge pt-4">
                  <p className="eyebrow">Inputs</p>
                  <p className="mt-2 flex flex-wrap gap-1.5">
                    {topic.inputs.map((input) => (
                      <span
                        key={input}
                        className="type-caption1 rounded-fluent-medium bg-page px-2 py-0.5 text-ink-muted"
                      >
                        {input}
                      </span>
                    ))}
                  </p>
                </div>

                <p className="type-body1 mt-auto flex items-center gap-1 pt-5 font-semibold text-accent-link group-hover:underline">
                  Start analysis
                  <ArrowRight16Regular
                    aria-hidden="true"
                    className="transition-transform group-hover:translate-x-0.5"
                  />
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
        <div className={`${FRAME} py-10 lg:py-14`}>
          <h2 className="type-title3 text-ink">Four steps, one screen each</h2>
          <p className="type-body1 mt-2 max-w-2xl text-ink-muted">
            Each decision gets the screen to itself, and the rail across the top
            keeps the other three one click away. Nothing is submitted until
            every one of them is made.
          </p>

          {/*
            A pipeline, drawn as one: numbered nodes on a shared rule, the same
            shape the step rail uses inside the flow.
          */}
          <ol className="mt-8 grid gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step, index) => (
              <li key={step.id} className="relative">
                <div className="flex items-center gap-3">
                  <span
                    aria-hidden="true"
                    className="type-body1 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent font-semibold text-white tabular-nums"
                  >
                    {index + 1}
                  </span>
                  <span aria-hidden="true" className="hidden h-px flex-1 bg-edge-strong lg:block" />
                </div>
                <h3 className="type-subtitle2 mt-3 text-ink">{step.label}</h3>
                <p className="type-body1 mt-1 text-ink-muted">{step.title}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* The models, with their trade-offs. Read once, on the way in, so the
          choice on step two is not a guess. */}
      <section className={`${FRAME} py-10 lg:py-14`}>
        <h2 className="type-title3 text-ink">The models</h2>
        <p className="type-body1 mt-2 max-w-2xl text-ink-muted">
          The same three are available for every topic. Pick on the trade-off,
          not the name.
        </p>

        <dl className="mt-6 grid gap-4 lg:grid-cols-3">
          {MODELS.map((model) => (
            <div key={model.id} className="card p-5">
              <dt className="type-subtitle2 text-ink">{model.label}</dt>
              <dd className="type-body1 mt-1 text-ink-muted">{model.tradeoff}</dd>
            </div>
          ))}
        </dl>

        <Notice intent="info" title="Note." className="mt-6">
          Flood risk runs a real weighted overlay on the analysis service. The
          other three topics have no method behind them yet: running one
          validates your request and shows the exact payload the service will
          receive, so the whole flow can be used and reviewed today.
        </Notice>
      </section>
    </>
  );
}
