import type { Metadata } from "next";
import { PageHero, PageSection } from "@/components/shell/Page";

export const metadata: Metadata = {
  title: "Help",
  description:
    "How to use Rangeland Awareness: guides for running analysis, selecting areas, and interpreting results.",
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

const guides = [
  {
    slug: "getting-started",
    title: "Getting started",
    description:
      "How to run your first analysis in four steps: choose a topic, pick a model, select areas, and review.",
  },
  {
    slug: "selecting-areas",
    title: "Selecting areas",
    description:
      "Three ways to define your area of interest: click on the map, enter coordinates, or upload a shapefile.",
  },
  {
    slug: "choosing-a-model",
    title: "Choosing a model",
    description:
      "The trade-offs between Random Forest, Gradient Boosting, and Combined, and when to pick each.",
  },
  {
    slug: "interpreting-results",
    title: "Interpreting results",
    description:
      "How to read the analysis output, what the scores mean, and how to trace results back to inputs.",
  },
  {
    slug: "saving-runs",
    title: "Saving and sharing runs",
    description:
      "How accounts work, what gets saved, and how to share a link to a specific analysis configuration.",
  },
  {
    slug: "data-sources",
    title: "Data sources",
    description:
      "The satellite imagery and climate data that feed the analysis, their resolution, and coverage.",
  },
];

const FAQ = [
  {
    question: "Do I need an account to run an analysis?",
    answer:
      "No. All four topics, all 47 counties, and all three models are available to guests. An account saves your runs so you can revisit results and compare configurations.",
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
      "All 23 arid and semi-arid counties in Kenya, plus additional coverage. The full list is available in the county selector on the areas step.",
  },
] as const;

export default function HelpPage() {
  return (
    <>
      <PageHero
        eyebrow="Help and documentation"
        title="Using Rangeland Awareness"
        lead="Guides for running analysis, selecting areas, and interpreting results."
      />

      <PageSection
        eyebrow="Quick start"
        title="Four steps to your first analysis"
        intro="Every analysis follows the same four-step flow. Each decision gets its own screen, and the step rail across the top keeps the other three one click away."
      >
        <ol className="grid gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
          {QUICK_START.map((item, index) => (
            <li key={item.title}>
              <div className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className="type-body1 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent font-semibold text-white tabular-nums"
                >
                  {index + 1}
                </span>
                <span aria-hidden="true" className="hidden h-px flex-1 bg-edge-strong lg:block" />
              </div>
              <h3 className="type-subtitle2 mt-3 text-ink">{item.title}</h3>
              <p className="type-body1 mt-1 text-ink-muted">{item.description}</p>
            </li>
          ))}
        </ol>
      </PageSection>

      <PageSection
        tier="panel"
        eyebrow="Guides"
        title="In-depth documentation"
        intro="Detailed guides for every part of the platform."
      >
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {guides.map((guide) => (
            <li key={guide.slug} className="card flex h-full flex-col p-4 lg:p-5">
              <h3 className="type-subtitle2 text-ink">{guide.title}</h3>
              <p className="type-body1 mt-1 flex-1 text-ink-muted">{guide.description}</p>
              {/* Not a link: there is nothing to link to yet, and a control
                  that looks clickable and goes nowhere is worse than a label. */}
              <p className="type-caption1 mt-3 self-start rounded-fluent-medium bg-page px-2 py-0.5 font-semibold text-ink-muted">
                Coming soon
              </p>
            </li>
          ))}
        </ul>
      </PageSection>

      <PageSection eyebrow="FAQ" title="Common questions">
        <dl className="card divide-y divide-edge">
          {FAQ.map((item) => (
            <div key={item.question} className="px-4 py-4 lg:px-5">
              <dt className="type-subtitle2 text-ink">{item.question}</dt>
              <dd className="type-body1 mt-1 max-w-3xl text-ink-muted">{item.answer}</dd>
            </div>
          ))}
        </dl>
      </PageSection>
    </>
  );
}
