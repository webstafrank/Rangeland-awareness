import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { catalog } from "@/services/catalog";
import { geo } from "@/services/geo";
import { Band } from "@/components/ui/Band";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { SeverityChip } from "@/components/ui/SeverityChip";
import { PreAnalysisForm, type ModelOption, type PickerArea } from "./PreAnalysisForm";

export async function generateMetadata(props: PageProps<"/analysis/[topic]">): Promise<Metadata> {
  const { topic: topicId } = await props.params;
  const topic = catalog.findTopic(topicId);
  if (!topic) return { title: "Topic not found" };
  return {
    title: `Configure ${topic.label}`,
    description: `${topic.description} Choose the analysis type, areas of interest, date range and model.`,
  };
}

/**
 * Pre-rendered for the four known topics. An unknown topic still 404s at
 * request time through `notFound()`, so a typo in the URL cannot render an
 * empty form.
 */
export function generateStaticParams() {
  return catalog.listTopics().map((topic) => ({ topic: topic.id }));
}

export default async function PreAnalysisPage(props: PageProps<"/analysis/[topic]">) {
  const { topic: topicId } = await props.params;
  const topic = catalog.findTopic(topicId);
  if (!topic) notFound();

  // Only the four fields the picker reads. The projected SVG paths are large
  // and are not needed until the results map, so they stay on the server.
  const areas: PickerArea[] = geo.listAreas().map(({ id, name, climateZone, asal }) => ({
    id,
    name,
    climateZone,
    asal,
  }));

  const models: ModelOption[] = topic.models.map((id) => {
    const model = catalog.getModel(id);
    return { id: model.id, label: model.label, blurb: model.blurb, strength: model.strength };
  });

  const today = new Date().toISOString().slice(0, 10);
  const defaultStart = defaultWindowStart(today, topic.dataStart);

  return (
    <>
      <Band ground="navy" width="wide" pad="tight">
        <nav aria-label="Breadcrumb">
          <Link
            href="/analysis"
            className="text-caption text-ink-dark-secondary hover:text-ink-dark-primary inline-flex items-center gap-2 rounded font-medium"
          >
            <span aria-hidden="true">&larr;</span> All topics
          </Link>
        </nav>

        <div className="mt-6 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Eyebrow tone="dark">Step 2 of 2 · Configure the run</Eyebrow>
            <h1 className="mt-5 text-4xl font-bold tracking-tight">{topic.label}</h1>
            <p className="text-ink-dark-secondary mt-3 max-w-2xl leading-relaxed">
              {topic.description}
            </p>
          </div>

          <dl className="border-navy-700 flex shrink-0 gap-8 border-t pt-5 lg:border-t-0 lg:pt-0">
            <div className="flex flex-col gap-1">
              <dt className="text-micro text-ink-dark-muted font-semibold tracking-[0.14em] uppercase">
                Indicator
              </dt>
              <dd className="text-sm font-semibold">
                {topic.indicator.label}
                {topic.indicator.unit ? (
                  <span className="text-ink-dark-muted font-normal"> ({topic.indicator.unit})</span>
                ) : null}
              </dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-micro text-ink-dark-muted font-semibold tracking-[0.14em] uppercase">
                Coverage from
              </dt>
              <dd className="tabular text-sm font-semibold">{topic.dataStart}</dd>
            </div>
          </dl>
        </div>
      </Band>

      <Band ground="white" width="wide" pad="normal">
        <PreAnalysisForm
          topicId={topic.id}
          topicLabel={topic.label}
          indicatorLabel={topic.indicator.label}
          indicatorUnit={topic.indicator.unit}
          areas={areas}
          models={models}
          dataStart={topic.dataStart}
          today={today}
          defaultStart={defaultStart}
        />
      </Band>

      {/* The band table is reference material, so it sits below the form
          rather than competing with it, but it is on the page because a
          reader cannot judge a result without knowing the thresholds. */}
      <Band ground="paper" width="wide" pad="normal">
        <Eyebrow>Reference</Eyebrow>
        <h2 className="mt-4 text-2xl font-bold tracking-tight">
          How {topic.indicator.label} is classified
        </h2>
        <p className="text-ink-light-secondary mt-3 max-w-2xl text-sm leading-relaxed">
          {topic.indicator.source}
        </p>

        <div className="border-edge mt-8 overflow-x-auto rounded border bg-white">
          <table className="w-full min-w-md border-collapse text-sm">
            <caption className="sr-only">
              Classification bands for {topic.indicator.longLabel}
            </caption>
            <thead>
              <tr className="border-edge bg-paper border-b text-left">
                <th scope="col" className="text-micro text-ink-light-muted px-4 py-2.5 font-semibold tracking-[0.14em] uppercase">
                  Range
                </th>
                <th scope="col" className="text-micro text-ink-light-muted px-4 py-2.5 font-semibold tracking-[0.14em] uppercase">
                  Classification
                </th>
              </tr>
            </thead>
            <tbody>
              {topic.indicator.bands.map((band) => (
                <tr key={band.label} className="border-edge border-b last:border-b-0">
                  <td className="text-ink-light-secondary px-4 py-2.5 whitespace-nowrap">
                    {band.max === null
                      ? `${band.min} and above`
                      : `${band.min} to ${band.max}`}
                    {topic.indicator.unit ? ` ${topic.indicator.unit}` : ""}
                  </td>
                  <td className="px-4 py-2.5">
                    <SeverityChip severity={band.severity} label={band.label} size="sm" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Band>
    </>
  );
}

/**
 * Default window: the last full 12 months, clamped to the topic's coverage
 * start. Twelve months is the shortest window that shows a full seasonal cycle
 * for Kenya's two rainy seasons, so the first chart a user sees is readable
 * rather than a stub of three points.
 */
function defaultWindowStart(today: string, dataStart: string): string {
  const end = new Date(`${today}T00:00:00Z`);
  const start = new Date(end);
  start.setUTCFullYear(start.getUTCFullYear() - 1);
  const iso = start.toISOString().slice(0, 10);
  return iso < dataStart ? dataStart : iso;
}
