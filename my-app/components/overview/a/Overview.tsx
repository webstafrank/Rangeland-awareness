import { Suspense, type CSSProperties } from "react";
import Link from "next/link";
import { ArrowRight16Regular, ArrowRight20Regular } from "@/components/ui/icons";
import { TOPICS } from "@/services/analysis/topics";
import { MODELS } from "@/services/analysis/models";
import { STEPS } from "@/services/analysis/steps";
import TopicIcon from "@/components/topic/TopicIcon";
import TopicsArrival from "@/components/shell/TopicsArrival";
import { FRAME } from "@/components/shell/Page";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Notice } from "@/components/ui/Notice";
import { StatTile } from "@/components/ui/StatTile";
import { StepMarker } from "@/components/ui/StepMarker";
import { buttonClasses } from "@/components/ui/button-classes";
import CatalogStatus, { CatalogStatusSkeleton } from "./CatalogStatus";
import { RecentRuns } from "./RecentRuns";
import { ServiceRow } from "./ServiceRow";
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
 * The homepage, as the home of an operations tool.
 *
 * Top to bottom:
 * 1. A compact header: the app's name, one line, the two calls to action.
 * 2. The operational strip: the runs this browser started, the analysis
 *    service and layer catalogue states, and, as supporting context, four
 *    figures and Kenya's counties by climate zone.
 * 3. The four topics, as a 2x2 of short cards that is also the quick start.
 * 4. One white band at the bottom: the workflow in one row, the models in
 *    one row, and the note on which topics have a method today.
 *
 * Real data only: run history from this browser's storage, the service state
 * from /api/health, the catalogue from the backend, everything else from the
 * registries in services/analysis and the shipped county geometry.
 *
 * Contracts this layout keeps (evals/journey.spec.ts, "homepage", "motion"):
 * - The first `main section` is the header. It holds the links "Run Analysis"
 *   (/#topics) and "Explore Data" (/data), the two labels the evals pin in
 *   title case, and has no min-height. On 1280x900 the header and the strip
 *   leave "Choose a topic" on screen.
 * - nav "Start an analysis" wraps the `ul` "Analysis topics", so the quick
 *   start (topicQuickStart) and the cards (topicCard) are the same four
 *   links: one list of topics on the page instead of two.
 * - #topics carries scroll-mt-16 and TopicsArrival, its h2 takes focus, and
 *   each card sits in a `topic-arrive` li with its stagger index in --i.
 *   After the focus move, the next Tab is the first card (M5).
 * - Exactly three `.reveal` sections, topics first (M2, M3, M4). The strip
 *   is not one: it is above the fold on load.
 * - Every STEPS label is an exact h3 (H2).
 */
export default function Overview() {
  return (
    <>
      {/* Header: title, one line, actions to the right on a desktop. */}
      <section className="border-b border-edge bg-surface">
        <div
          className={`${FRAME} flex flex-col gap-3 py-5 sm:flex-row sm:items-center sm:justify-between sm:gap-6`}
        >
          <div className="min-w-0">
            <h1 className="type-title3 text-ink">Disaster Monitor</h1>
            <p className="type-body1 mt-0.5 text-ink-muted">
              Flood, drought, rangeland and food security analysis for Kenya.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
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
        </div>
      </section>

      {/* The operational strip. Runs and status first; the figures and the
          map are context, so they sit under them. */}
      <section aria-labelledby="overview-operations" className={`${FRAME} pt-5 lg:pt-6`}>
        <h2 id="overview-operations" className="sr-only">
          Operations
        </h2>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
          <div className="flex min-w-0 flex-col gap-4">
            <div className="flex flex-1 flex-col [&>section]:flex-1">
              <RecentRuns />
            </div>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
              <StatTile compact label="Analysis topics" value={String(TOPICS.length)} />
              <StatTile compact label="Models" value={String(MODELS.length)} />
              <StatTile compact label="Counties" value={String(COUNTY_COUNT)} />
              <StatTile compact label="ASAL counties" value={String(ASAL_COUNT)} />
            </dl>
          </div>

          <div className="flex min-w-0 flex-col gap-4">
            <section aria-labelledby="overview-status" className="card p-4 lg:p-5">
              <h3 id="overview-status" className="type-subtitle2 text-ink">
                Status
              </h3>
              <dl className="mt-3 divide-y divide-edge">
                <ServiceRow />
                <Suspense fallback={<CatalogStatusSkeleton />}>
                  <CatalogStatus />
                </Suspense>
              </dl>
            </section>

            {/* Kenya by climate zone, from the shipped county geometry: the
                country the tool covers, and which of it is rangeland. */}
            <figure className="card m-0 flex flex-1 items-center gap-5 p-4 lg:p-5">
              <KenyaMap className="h-[112px] w-[89px] shrink-0" />
              <figcaption className="min-w-0 flex-1">
                <p className="type-subtitle2 text-ink">Counties by climate zone</p>
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
        </div>
      </section>

      {/* The four topics. The quick start and the cards are one list. */}
      <section id="topics" className={`${FRAME} reveal scroll-mt-16 py-8 lg:py-10`}>
        <TopicsArrival id="topics" />
        <div>
          <Eyebrow>Analysis</Eyebrow>
          {/* Focusable by script only, for TopicsArrival's focus move. */}
          <h2 tabIndex={-1} className="type-subtitle1 mt-1 text-ink">
            Choose a topic
          </h2>
          <p className="type-body1 mt-1 text-ink-muted">
            Each topic answers one question and returns one kind of result.
          </p>
        </div>

        <nav aria-label="Start an analysis" className="mt-4">
          {/*
            Each card is a three-row subgrid (heading, inputs, action) of the
            list's grid, so across a row the inputs rule and the action line
            up whatever the length of the question above them.
          */}
          <ul aria-label="Analysis topics" className="grid gap-x-4 gap-y-4 md:grid-cols-2">
            {TOPICS.map((topic, index) => (
              <li
                key={topic.slug}
                className="topic-arrive row-span-3 grid grid-rows-subgrid gap-0"
                // The card's place in the stagger, read by topic-arrive.
                style={{ "--i": index } as CSSProperties}
              >
                <Link
                  href={`/topics/${topic.slug}`}
                  className="card group row-span-3 grid grid-rows-subgrid gap-y-3 p-4 transition-shadow duration-150 hover:shadow-8 lg:p-5"
                >
                  <div className="flex items-start gap-3">
                    <TopicIcon slug={topic.slug} size="sm" />
                    <div className="min-w-0 flex-1">
                      <h3 className="type-subtitle2 text-ink">{topic.name}</h3>
                      {/* The question, not a restatement of the name. */}
                      <p className="type-body1 mt-0.5 text-ink-muted">{topic.question}</p>
                    </div>
                  </div>

                  <div className="self-end border-t border-edge pt-3">
                    <p className="sr-only">Inputs:</p>
                    <p className="flex flex-wrap gap-1.5">
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

                  <p className="type-body1 flex items-center gap-1 font-semibold text-accent-link group-hover:underline">
                    Start analysis
                    <ArrowRight16Regular aria-hidden="true" />
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </section>

      {/* One white band for the reference material: how a run is built and
          which model to pick. Two sections, because the motion evals count
          three reveals, drawn as one band. */}
      <section className="reveal border-t border-edge bg-surface">
        <div className={`${FRAME} pt-6 pb-5 lg:pt-8`}>
          <h2 className="type-subtitle1 text-ink">How a run is built</h2>
          <p className="type-body1 mt-1 text-ink-muted">
            Four steps, one screen each. Nothing is submitted until every step is made.
          </p>
          <ol className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
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

      <section className="reveal bg-surface">
        <div className={`${FRAME} pb-8 lg:pb-10`}>
          <div className="border-t border-edge pt-5">
            <h2 className="type-subtitle1 text-ink">Models</h2>
            <p className="type-body1 mt-1 text-ink-muted">
              The same three run for every topic. Pick on the trade-off, not the name.
            </p>
            <dl className="mt-4 grid gap-4 lg:grid-cols-3">
              {MODELS.map((model) => (
                <div key={model.id} className="min-w-0 border-l-2 border-edge-strong pl-3">
                  <dt className="type-subtitle2 text-ink">{model.label}</dt>
                  <dd className="type-body1 mt-0.5 text-ink-muted">{model.tradeoff}</dd>
                </div>
              ))}
            </dl>
            <Notice intent="info" title="Note." className="mt-5">
              Flood risk runs a real weighted overlay on the analysis service. The
              other three topics have no method behind them yet: running one
              validates your request and shows the exact payload the service will
              receive.
            </Notice>
          </div>
        </div>
      </section>
    </>
  );
}
