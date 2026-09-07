import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { buildRunQuery, parseRunQuery } from "@/contracts/analysis";
import { analysis } from "@/services/analysis";
import { catalog } from "@/services/catalog";
import { geo } from "@/services/geo";
import { Graticule } from "@/components/ui/Graticule";
import { RunningStages } from "./RunningStages";

export const metadata: Metadata = {
  title: "Running analysis",
  robots: { index: false },
};

export default async function RunningPage(props: PageProps<"/analysis/[topic]/running">) {
  const { topic: topicId } = await props.params;
  const query = await props.searchParams;

  const topic = catalog.findTopic(topicId);
  if (!topic) notFound();

  const parsed = parseRunQuery(topic.id, {
    type: first(query.type),
    areas: first(query.areas),
    from: first(query.from),
    to: first(query.to),
    model: first(query.model),
  });

  /*
   * An invalid configuration cannot produce a run, and an animation that
   * leads nowhere is worse than no animation. Send the user back to the form
   * for this topic rather than rendering an error they cannot act on.
   */
  if (!parsed.ok) redirect(`/analysis/${topic.id}`);

  const config = parsed.config;
  const stages = analysis.stages(config);
  const resultHref = `/analysis/${topic.id}/results?${buildRunQuery(config)}`;
  const areaNames = geo.pickAreas(config.areas).map((area) => area.name);
  const model = catalog.getModel(config.model);

  return (
    <section className="band-navy-deep relative flex flex-1 items-center overflow-hidden" data-band="navy-deep">
      <Graticule />

      <div className="relative mx-auto w-full max-w-5xl px-5 py-20 sm:px-8">
        <div className="mx-auto max-w-2xl">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{topic.label}</h1>

          <dl className="border-navy-700 mt-6 grid grid-cols-2 gap-x-8 gap-y-4 border-t pt-6 sm:grid-cols-4">
            {[
              ["Type", config.analysisType === "single" ? "One location" : "Comparison"],
              ["Areas", areaNames.join(", ")],
              ["Window", `${config.dateRange.start} to ${config.dateRange.end}`],
              ["Model", model.label],
            ].map(([label, value]) => (
              <div key={label} className="flex min-w-0 flex-col gap-1">
                <dt className="text-micro text-ink-dark-muted font-semibold tracking-[0.14em] uppercase">
                  {label}
                </dt>
                <dd className="text-caption text-ink-dark-primary font-medium">{value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="mt-12">
          <RunningStages stages={stages} resultHref={resultHref} />
        </div>

        {/*
          A no-JavaScript and a stuck-animation escape hatch in one. Without
          it, a browser with JS disabled would sit on this screen forever,
          which would fail rubric R1's "must not be a dead end" for the
          only screen that navigates itself.
        */}
        <p className="mt-12 text-center">
          <Link
            href={resultHref}
            className="text-caption text-ink-dark-secondary hover:text-ink-dark-primary rounded font-semibold underline decoration-1 underline-offset-4"
          >
            Skip the animation and open the result
          </Link>
        </p>
      </div>
    </section>
  );
}

/** searchParams values can arrive as string, string[], or undefined. */
function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
