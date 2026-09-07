import Link from "next/link";
import type { Metadata } from "next";
import { catalog } from "@/services/catalog";
import { geo } from "@/services/geo";
import { Band } from "@/components/ui/Band";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { SeverityChip } from "@/components/ui/SeverityChip";

export const metadata: Metadata = {
  title: "Topics of study",
  description:
    "Choose a topic: flood risk, drought, food security or rangeland dynamics, each with its own indicator and band table.",
};

export default function AnalysisIndexPage() {
  const topics = catalog.listTopics();
  const areas = geo.listAreas();
  const asalCount = areas.filter((a) => a.asal).length;

  return (
    <>
      <Band ground="navy" width="wide" pad="tight">
        <Eyebrow tone="dark">Step 1 of 2</Eyebrow>
        <h1 className="mt-5 max-w-2xl text-4xl font-bold tracking-tight text-balance">
          Choose a topic of study.
        </h1>
        <p className="text-ink-dark-secondary mt-4 max-w-2xl leading-relaxed">
          Each topic reports one headline indicator with its own classification bands. You will
          pick the areas, the window and the model on the next screen.
        </p>

        <dl className="border-navy-700 mt-10 grid max-w-2xl grid-cols-3 gap-6 border-t pt-6">
          {[
            ["Counties", String(areas.length)],
            ["ASAL counties", String(asalCount)],
            ["Models", String(catalog.listModels().length)],
          ].map(([label, value]) => (
            <div key={label} className="flex flex-col gap-1">
              <dd className="text-2xl font-bold tracking-tight">{value}</dd>
              <dt className="text-micro text-ink-dark-muted font-semibold tracking-[0.14em] uppercase">
                {label}
              </dt>
            </div>
          ))}
        </dl>
      </Band>

      <Band ground="white" width="wide" pad="normal">
        <ul className="grid gap-5 lg:grid-cols-2">
          {topics.map((topic) => {
            // The band table is the topic's real content, so show its two ends:
            // what "fine" looks like and what "worst" looks like.
            const worst = topic.indicator.bands.reduce((acc, band) =>
              severityRank(band.severity) > severityRank(acc.severity) ? band : acc,
            );
            const best = topic.indicator.bands.reduce((acc, band) =>
              severityRank(band.severity) < severityRank(acc.severity) ? band : acc,
            );

            return (
              <li key={topic.id}>
                <Link
                  href={`/analysis/${topic.id}`}
                  className="border-edge hover:border-navy-900/35 group flex h-full flex-col rounded border transition-colors duration-150"
                >
                  <div className="flex flex-col gap-3 p-6">
                    <div className="flex items-start justify-between gap-4">
                      <h2 className="text-navy-900 text-2xl font-bold tracking-tight">
                        {topic.label}
                      </h2>
                      <span
                        className="text-ink-light-muted group-hover:text-scarlet-ink-light mt-1.5 transition-colors"
                        aria-hidden="true"
                      >
                        &rarr;
                      </span>
                    </div>

                    <p className="text-ink-light-secondary text-sm leading-relaxed">
                      {topic.description}
                    </p>
                  </div>

                  <dl className="border-edge bg-paper grid grid-cols-2 gap-x-6 gap-y-4 border-t px-6 py-5">
                    <div className="col-span-2 flex flex-col gap-1">
                      <dt className="text-micro text-ink-light-muted font-semibold tracking-[0.14em] uppercase">
                        Headline indicator
                      </dt>
                      <dd className="text-navy-900 text-sm font-semibold">
                        {topic.indicator.longLabel}
                        {topic.indicator.unit ? (
                          <span className="text-ink-light-muted font-normal">
                            {" "}
                            ({topic.indicator.unit})
                          </span>
                        ) : null}
                      </dd>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <dt className="text-micro text-ink-light-muted font-semibold tracking-[0.14em] uppercase">
                        Best band
                      </dt>
                      <dd>
                        <SeverityChip severity={best.severity} label={best.label} size="sm" />
                      </dd>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <dt className="text-micro text-ink-light-muted font-semibold tracking-[0.14em] uppercase">
                        Worst band
                      </dt>
                      <dd>
                        <SeverityChip severity={worst.severity} label={worst.label} size="sm" />
                      </dd>
                    </div>

                    <div className="col-span-2 flex flex-col gap-1">
                      <dt className="text-micro text-ink-light-muted font-semibold tracking-[0.14em] uppercase">
                        Input layers
                      </dt>
                      <dd className="text-ink-light-secondary text-caption">
                        {topic.drivers.join(" · ")}
                      </dd>
                    </div>
                  </dl>
                </Link>
              </li>
            );
          })}
        </ul>
      </Band>
    </>
  );
}

const ORDER = ["good", "warning", "serious", "critical"] as const;

function severityRank(severity: (typeof ORDER)[number]): number {
  return ORDER.indexOf(severity);
}
