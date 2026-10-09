import type { Metadata } from "next";
import Link from "next/link";
import { ChevronDown16Regular } from "@/components/ui/icons";
import { PageHero, PageSection } from "@/components/shell/Page";
import { StepMarker } from "@/components/ui/StepMarker";
import { buttonClasses } from "@/components/ui/button-classes";

export const metadata: Metadata = {
  title: "Help",
  description:
    "How to use Disaster Monitor: guides for running analysis, selecting areas, and interpreting results.",
};

const QUICK_START = [
  {
    title: "Choose a topic",
    description:
      "Pick the question you need answered: flood risk, drought, rangeland condition, or food security.",
  },
  {
    title: "Pick a model",
    description:
      "Select between accuracy and speed, or run both and see where they disagree.",
  },
  {
    title: "Select areas",
    description:
      "Click on the map, type coordinates, or upload a shapefile. Mix these freely.",
  },
  {
    title: "Review and run",
    description:
      "Check the request, then run. The payload is validated before anything is submitted.",
  },
] as const;

const FAQ = [
  {
    question: "Do I need an account to run an analysis?",
    answer:
      "No. All four topics, all 47 counties, and all three models are available to guests. In this build an account only puts your name on the session; saving runs to an account is not built yet.",
  },
  {
    question: "How accurate are the results?",
    answer:
      "No model is trained yet, so there is no accuracy to report. Flood risk runs a weighted overlay on the analysis service and says so on its result page; the other topics validate your request and show the exact payload the service will receive.",
  },
  {
    question: "Can I use my own data?",
    answer:
      "Yes. You can upload shapefiles (.zip holding .shp, .shx, .dbf and .prj) for polygon areas, or enter coordinates directly. The analysis runs against satellite data, but your areas of interest can come from anywhere.",
  },
  {
    question: "What counties are covered?",
    answer:
      "All 47 counties, including the 23 arid and semi-arid counties the rangeland topics are built for. The county selector on the areas step lists every one.",
  },
] as const;

/**
 * Help, as a guide you can scan: the four steps first, then the questions
 * people actually ask as native disclosures.
 *
 * The steps are one card holding a numbered list, each with the app's one
 * step indicator (StepMarker, upcoming): a row per step on a phone, four
 * columns from lg up. The FAQ is `<details>`/`<summary>`, so keyboard, screen
 * reader and find-in-page support come from the browser; the first answer
 * starts open so the pattern is visible. Written guides do not exist yet, and
 * the FAQ intro says so in one line rather than listing six empty titles.
 *
 * The eyebrow names the section ("Support"), not the page: the top bar
 * already says "Help".
 */
export default function HelpPage() {
  return (
    <>
      <PageHero
        eyebrow="Support"
        title="Using Disaster Monitor"
        lead="How to run an analysis, select areas, and read the results."
        actions={
          <Link href="/contact" className={buttonClasses()}>
            Contact support
          </Link>
        }
      />

      <PageSection
        eyebrow="Quick start"
        title="Four steps to your first analysis"
        intro="Every analysis follows the same four-step flow. Each decision gets its own screen, and the step rail across the top keeps the other three one click away."
      >
        <ol className="card grid divide-y divide-edge lg:grid-cols-4 lg:divide-x lg:divide-y-0">
          {QUICK_START.map((item, index) => (
            <li key={item.title} className="flex gap-3 px-4 py-3.5 lg:flex-col lg:p-5">
              <StepMarker number={index + 1} state="upcoming" />
              <div className="min-w-0">
                <h3 className="type-subtitle2 text-ink">
                  <span className="sr-only">Step {index + 1}: </span>
                  {item.title}
                </h3>
                <p className="type-body1 mt-0.5 text-ink-muted">{item.description}</p>
              </div>
            </li>
          ))}
        </ol>
      </PageSection>

      <PageSection
        tier="panel"
        eyebrow="FAQ"
        title="Common questions"
        intro="Open a question to read the answer. Written guides for each step are in progress."
      >
        <div className="card divide-y divide-edge">
          {FAQ.map((item, index) => (
            <details key={item.question} className="group" open={index === 0}>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3.5 transition-colors duration-150 hover:bg-surface-subtle lg:px-5 [&::-webkit-details-marker]:hidden">
                <h3 className="type-subtitle2 text-ink">{item.question}</h3>
                <ChevronDown16Regular
                  aria-hidden="true"
                  className="shrink-0 text-ink-faint transition-transform duration-150 group-open:rotate-180"
                />
              </summary>
              <p className="type-body1 max-w-3xl px-4 pb-4 text-ink-muted lg:px-5">{item.answer}</p>
            </details>
          ))}
        </div>
      </PageSection>
    </>
  );
}
