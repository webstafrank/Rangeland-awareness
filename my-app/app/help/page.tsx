import type { Metadata } from "next";
import { Eyebrow } from "@/components/ui/Eyebrow";

export const metadata: Metadata = {
  title: "Help",
  description:
    "How to use Rangeland Awareness: guides for running analysis, selecting areas, and interpreting results.",
};

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

export default function HelpPage() {
  return (
    <>
      {/* Hero band */}
      <section className="band-chrome">
        <div className="mx-auto w-full max-w-band px-gutter py-16 lg:px-gutter-lg lg:py-24">
          <div className="max-w-3xl">
            <p className="flex items-center gap-3 font-mono text-xs font-medium uppercase tracking-[0.14em] text-on-chrome-muted">
              <span aria-hidden="true" className="h-[3px] w-8 bg-action" />
              Help &amp; documentation
            </p>
            <h1 className="mt-6 text-4xl font-semibold leading-[1.05] tracking-tight text-white lg:text-6xl">
              Using Rangeland Awareness
            </h1>
            <p className="mt-6 max-w-2xl text-xl leading-relaxed text-white lg:text-2xl">
              Guides for running analysis, selecting areas, and interpreting
              results.
            </p>
          </div>
        </div>
      </section>

      {/* Quick start */}
      <section className="mx-auto w-full max-w-band px-gutter py-14 lg:px-gutter-lg lg:py-20">
        <div className="max-w-3xl">
          <Eyebrow>Quick start</Eyebrow>
          <h2 className="mt-4 text-2xl font-semibold tracking-tight lg:text-3xl">
            Four steps to your first analysis
          </h2>
          <p className="mt-4 text-base leading-relaxed text-ink-muted lg:text-lg">
            Every analysis follows the same four-step flow. Each decision gets
            its own screen, and the step rail across the top keeps the other
            three one click away.
          </p>
        </div>

        <ol className="mt-10 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              step: 1,
              title: "Choose a topic",
              description:
                "Pick the question you need answered: flood risk, drought, rangeland condition, or food security.",
            },
            {
              step: 2,
              title: "Pick a model",
              description:
                "Select between accuracy and speed, or run both and see where they disagree.",
            },
            {
              step: 3,
              title: "Select areas",
              description:
                "Click on the map, type coordinates, or upload a shapefile. Mix these freely.",
            },
            {
              step: 4,
              title: "Review and run",
              description:
                "Check the request, then run. The payload is validated before anything is submitted.",
            },
          ].map((item) => (
            <li key={item.step} className="relative">
              <span
                aria-hidden="true"
                className="grid h-9 w-9 place-items-center rounded-full border border-accent bg-accent font-mono text-sm font-semibold text-white"
              >
                {item.step}
              </span>
              <h3 className="mt-4 text-base font-semibold tracking-tight">
                {item.title}
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">
                {item.description}
              </p>
            </li>
          ))}
        </ol>
      </section>

      {/* Guides */}
      <section className="border-y border-edge bg-surface">
        <div className="mx-auto w-full max-w-band px-gutter py-14 lg:px-gutter-lg lg:py-20">
          <div className="max-w-3xl">
            <Eyebrow>Guides</Eyebrow>
            <h2 className="mt-4 text-2xl font-semibold tracking-tight lg:text-3xl">
              In-depth documentation
            </h2>
            <p className="mt-4 text-base leading-relaxed text-ink-muted lg:text-lg">
              Detailed guides for every part of the platform.
            </p>
          </div>

          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {guides.map((guide) => (
              <li key={guide.slug}>
                <div className="group flex h-full flex-col rounded-2xl border border-edge bg-surface p-6 shadow-card transition-all hover:-translate-y-0.5 hover:border-edge-strong hover:shadow-raised">
                  <h3 className="text-base font-semibold tracking-tight text-accent">
                    {guide.title}
                  </h3>
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-ink-muted">
                    {guide.description}
                  </p>
                  <p className="mt-4 flex items-center gap-1.5 text-sm font-semibold text-accent">
                    Coming soon
                    <span
                      aria-hidden="true"
                      className="transition-transform group-hover:translate-x-0.5"
                    >
                      &rarr;
                    </span>
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto w-full max-w-band px-gutter py-14 lg:px-gutter-lg lg:py-20">
        <div className="max-w-3xl">
          <Eyebrow>FAQ</Eyebrow>
          <h2 className="mt-4 text-2xl font-semibold tracking-tight lg:text-3xl">
            Common questions
          </h2>
        </div>

        <dl className="mt-8 flex flex-col gap-4">
          {[
            {
              question: "Do I need an account to run an analysis?",
              answer:
                "No. All four topics, all 47 counties, and all three models are available to guests. An account saves your runs so you can revisit results and compare configurations.",
            },
            {
              question: "How accurate are the results?",
              answer:
                "The model backend is not connected yet. Running an analysis validates your request and shows the exact payload the service will receive. The selection flow can be used and reviewed today.",
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
          ].map((item) => (
            <div
              key={item.question}
              className="rounded-2xl border border-edge bg-surface p-6 shadow-card"
            >
              <dt className="text-base font-semibold tracking-tight">
                {item.question}
              </dt>
              <dd className="mt-2 text-sm leading-relaxed text-ink-muted">
                {item.answer}
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </>
  );
}
