import { Suspense, type CSSProperties } from "react";
import Link from "next/link";
import { ArrowRight16Regular, ArrowRight20Regular, Info20Regular } from "@/components/ui/icons";
import { TOPICS } from "@/services/analysis/topics";
import { MODELS } from "@/services/analysis/models";
import { STEPS } from "@/services/analysis/steps";
import TopicIcon from "@/components/topic/TopicIcon";
import TopicsArrival from "@/components/shell/TopicsArrival";
import { FRAME } from "@/components/shell/Page";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { StepMarker } from "@/components/ui/StepMarker";
import { buttonClasses } from "@/components/ui/button-classes";
import { Metric } from "./Metric";
import CatalogStatus, { CatalogStatusSkeleton } from "./CatalogStatus";
import {
  ASAL_COUNT,
  COUNTY_COUNT,
  KenyaMap,
  ZONES,
  ZONE_COUNTS,
  ZONE_LABEL,
  ZoneSwatch,
} from "./KenyaMap";

/**
 * The homepage, as the home of an operations tool rather than a landing page.
 *
 * Top to bottom: what this is and where to start (header band: title, one
 * line, both calls to action, a row of quick-start chips, and Kenya's ASAL
 * counties on the right), four figures that are always real plus one quiet
 * line for the live layer catalogue, the four topics as the main grid, then
 * the workflow and the models as two short strips.
 *
 * A server component. What reaches the client is the icons (a client module,
 * see components/ui/icons.ts) and TopicsArrival, which renders nothing. Only
 * the catalogue line waits on the backend, behind <Suspense>.
 *
 * Contracts this layout keeps (evals/journey.spec.ts, "homepage" and
 * "motion"):
 * - The first `main section` is the header band, with Run Analysis
 *   (/#topics) and Explore Data (/data), no min-height, and short enough that
 *   on 1280x900 the band plus the figures row leave "Choose a topic" on screen.
 * - nav "Start an analysis" links every topic (topicQuickStart in H1).
 * - Exactly three `.reveal` sections, topics first (M2, M3, M4 index them).
 *   The figures row is not one: it is above the fold on load.
 * - #topics carries scroll-mt-16 and TopicsArrival, its h2 takes focus, each
 *   card sits in a `topic-arrive` li with its stagger index in --i.
 * - Every STEPS label is an h3 (H2).
 *
 * Every list is driven by a registry or the shipped geometry, so a topic,
 * step or model added in services/ shows up here with no edit to this file.
 */
export default function Overview() {
  return (
    <>
      {/* Header band, on white so the page's one accent is Run Analysis. */}
      <section className="border-b border-edge bg-surface">
        <div
          className={`${FRAME} grid items-center gap-6 py-6 md:grid-cols-[minmax(0,1fr)_auto] lg:gap-10 lg:py-8`}
        >
          <div className="min-w-0 max-w-2xl">
            <Eyebrow marked>Kenya Space Agency &middot; Earth observation</Eyebrow>
            {/* The h1 names the app, so a screen reader jumping to it hears
                what this is. */}
            <h1 className="type-title2 mt-2 text-ink">Disaster Monitor</h1>
            <p className="type-body2 mt-2 text-ink-muted">
              Turn satellite and climate data into rangeland decisions.
              <span className="hidden sm:inline">
                {" "}
                Pick a topic, choose a model, select the areas, and run a request
                you can trace back to its inputs.
              </span>
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              {/* next/link on purpose, so Next owns the history entry and Back
                  from a topic works; TopicsArrival says why. */}
              <Link href="/#topics" className={buttonClasses({ appearance: "primary" })}>
                Run Analysis
                <ArrowRight20Regular aria-hidden="true" />
              </Link>
              <Link href="/data" className={buttonClasses()}>
                Explore Data
              </Link>
            </div>

            {/* Quick start: one row of chips straight into a topic, for someone
                who already knows which one they came for. */}
            <nav aria-label="Start an analysis" className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1.5">
              <span className="type-caption1 mr-1 text-ink-faint">Quick start</span>
              {TOPICS.map((topic) => (
                <Link
                  key={topic.slug}
                  href={`/topics/${topic.slug}`}
                  className="type-caption1 inline-flex h-7 items-center rounded-full border border-edge bg-surface px-3 font-semibold text-ink transition-colors duration-150 hover:border-accent hover:text-accent"
                >
                  {topic.name}
                </Link>
              ))}
            </nav>
          </div>

          {/* Kenya by climate zone, from the shipped county geometry: the
              country the tool covers, and which of it is rangeland. Tablet and
              up only; on a phone the figures below carry the same counts. */}
          <figure className="m-0 hidden items-center gap-5 md:flex">
            <KenyaMap className="h-[200px] w-[158px]" />
            <figcaption className="min-w-0">
              <p className="type-caption1 text-ink-faint">Counties by climate zone</p>
              <ul aria-label="Climate zone" className="mt-2 flex flex-col gap-1.5">
                {ZONES.map((zone) => (
                  <li key={zone} className="type-caption1 flex items-center gap-2 text-ink-muted">
                    <ZoneSwatch zone={zone} />
                    <span className="flex-1">{ZONE_LABEL[zone]}</span>
                    <span className="tabular-nums text-ink">{ZONE_COUNTS[zone]}</span>
                  </li>
                ))}
              </ul>
            </figcaption>
          </figure>
        </div>
      </section>

      {/* Figures that are always real, and one line for the live catalogue. */}
      <section aria-labelledby="overview-glance" className={`${FRAME} pt-5 lg:pt-8`}>
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <h2 id="overview-glance" className="eyebrow">
            At a glance
          </h2>
          <Suspense fallback={<CatalogStatusSkeleton />}>
            <CatalogStatus />
          </Suspense>
        </div>
        <dl className="mt-2.5 grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-4">
          <Metric
            label="Analysis topics"
            value={String(TOPICS.length)}
            caption={`${STEPS.length} steps each`}
          />
          <Metric label="Models" value={String(MODELS.length)} caption="Available to every topic" />
          <Metric label="Counties" value={String(COUNTY_COUNT)} caption="Mapped boundaries" />
          <Metric
            label="ASAL counties"
            value={String(ASAL_COUNT)}
            caption="Arid and semi-arid lands"
          />
        </dl>
      </section>

      {/* The four topics: the main event, so the widest grid on the page. */}
      <section id="topics" className={`${FRAME} reveal scroll-mt-16 py-8 lg:py-10`}>
        <TopicsArrival id="topics" />
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-1">
          <div>
            <Eyebrow>Analysis</Eyebrow>
            {/* Focusable by script only, for TopicsArrival's focus move. */}
            <h2 tabIndex={-1} className="type-title3 mt-1 text-ink">
              Choose a topic
            </h2>
          </div>
          <p className="type-body1 text-ink-faint">
            Each topic answers one question and returns one kind of result.
          </p>
        </div>

        {/* Named, because the quick start also links every topic, so neither
            list can be addressed by link text alone. */}
        <ul aria-label="Analysis topics" className="mt-5 grid gap-4 md:grid-cols-2">
          {TOPICS.map((topic, index) => (
            <li
              key={topic.slug}
              className="topic-arrive"
              // The card's place in the stagger, read by topic-arrive.
              style={{ "--i": index } as CSSProperties}
            >
              <Link
                href={`/topics/${topic.slug}`}
                className="card group flex h-full flex-col p-5 transition-shadow duration-150 hover:shadow-8"
              >
                <div className="flex items-start gap-3">
                  <TopicIcon slug={topic.slug} size="md" />
                  <div className="min-w-0 flex-1">
                    <h3 className="type-subtitle2 text-ink">{topic.name}</h3>
                    {/* The question, not a restatement of the name. */}
                    <p className="type-body1 mt-0.5 text-ink">{topic.question}</p>
                  </div>
                </div>

                <p className="type-body1 mt-3 text-ink-muted">{topic.output}</p>

                {/* mt-auto here, not on the link: cards in a row share a
                    height, and the slack goes above the rule, so the inputs and
                    the link keep the same gaps on every card. */}
                <div className="mt-auto pt-4">
                  <div className="border-t border-edge pt-3">
                    <p className="eyebrow">Inputs</p>
                    <p className="mt-1.5 flex flex-wrap gap-1.5">
                      {topic.inputs.map((input) => (
                        <span
                          key={input}
                          className="type-caption1 rounded-fluent-medium bg-sunken px-2 py-0.5 text-ink-muted"
                        >
                          {input}
                        </span>
                      ))}
                    </p>
                  </div>
                  <p className="type-body1 mt-4 flex items-center gap-1 font-semibold text-accent-link group-hover:underline">
                    Start analysis
                    <ArrowRight16Regular aria-hidden="true" />
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* The workflow as one strip: the same four steps the flow walks, from
          the same registry, with the marker the step rail uses. */}
      <section className="reveal border-y border-edge bg-surface">
        <div className={`${FRAME} py-6 lg:py-8`}>
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
            <h2 className="type-subtitle1 text-ink">Four steps, one screen each</h2>
            <p className="type-caption1 text-ink-faint">
              Nothing is submitted until every step is made.
            </p>
          </div>
          <ol className="mt-4 grid grid-cols-2 gap-x-4 gap-y-4 lg:grid-cols-4">
            {STEPS.map((step, index) => (
              <li key={step.id} className="flex min-w-0 items-start gap-2.5">
                <StepMarker number={index + 1} state="upcoming" size="md" />
                <div className="min-w-0">
                  <h3 className="type-subtitle2 text-ink">{step.label}</h3>
                  <p className="type-caption1 text-ink-muted">{step.title}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* The models in one row, read once on the way in so the choice on step
          two is not a guess. */}
      <section className={`${FRAME} reveal py-6 lg:py-8`}>
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          <h2 className="type-subtitle1 text-ink">The models</h2>
          <p className="type-caption1 text-ink-faint">
            The same three run for every topic. Pick on the trade-off, not the name.
          </p>
        </div>

        <dl className="mt-4 grid gap-2.5 sm:gap-4 lg:grid-cols-3">
          {MODELS.map((model) => (
            <div key={model.id} className="card px-4 py-3">
              <dt className="flex flex-wrap items-center justify-between gap-2">
                <span className="type-subtitle2 text-ink">{model.label}</span>
                {/* The id the analysis request carries, for anyone reading a
                    payload on the review step. */}
                <code className="type-caption1 rounded-fluent-medium bg-sunken px-1.5 py-0.5 font-mono text-ink-muted">
                  {model.id}
                </code>
              </dt>
              <dd className="type-caption1 mt-1 text-ink-muted">{model.tradeoff}</dd>
            </div>
          ))}
        </dl>

        <p className="type-caption1 mt-4 flex items-start gap-1.5 text-ink-muted">
          <Info20Regular aria-hidden="true" className="h-4 w-4 shrink-0 text-accent" />
          <span>
            Flood risk runs a real weighted overlay on the analysis service. The
            other three topics have no method behind them yet: running one
            validates your request and shows the exact payload the service will
            receive.
          </span>
        </p>
      </section>
    </>
  );
}
