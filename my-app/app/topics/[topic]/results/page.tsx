import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import type { Metadata, Route } from "next";
import { getTopic } from "@/services/analysis/topics";
import { carryUrlSelection, readSearchParamSelection } from "@/services/analysis/url-state";
import { RUN_PARAM } from "@/services/analysis/request-id";
import { stepHref } from "@/services/analysis/steps";
import { runningHref } from "@/services/run-flow/links";
import { createBackendClient } from "@/services/backend-api";
import ResultsStep from "@/components/results/ResultsStep";
import ResultView from "@/components/results/ResultView";
import RunProblem from "@/components/run/RunProblem";

/**
 * Where a run lands, and where a request that was never run is read.
 *
 * Two screens behind one route, chosen by which id the URL carries:
 *
 *   ?run=r_<id>   a real computation on the service. The result is fetched
 *                 here, on the server, and rendered from that alone. That is
 *                 what makes the link shareable: the service echoes the whole
 *                 configuration back with the numbers, so a cold browser with
 *                 no session storage renders exactly what the analyst saw.
 *   ?req=<id>     the validated request, for the three topics that have no
 *                 method behind them yet. The areas come from sessionStorage,
 *                 so this one is client work and is honest about being a
 *                 receipt rather than a result.
 *
 * One route rather than two because it is one idea to an analyst ("what came of
 * my request") and because the second is what the first degrades to.
 */

export async function generateMetadata({
  params,
}: PageProps<"/topics/[topic]/results">): Promise<Metadata> {
  const { topic: slug } = await params;
  const topic = getTopic(slug);
  if (!topic) return { title: "Page not found" };
  return {
    title: `${topic.name}: result`,
    description: `The analysis result for ${topic.name}, with its class table and exports.`,
  };
}

function one(value: string | string[] | undefined): string | null {
  if (value === undefined) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export default async function ResultsPage({
  params,
  searchParams,
}: PageProps<"/topics/[topic]/results">) {
  const { topic: slug } = await params;
  const topic = getTopic(slug);
  if (!topic) notFound();

  const search = await searchParams;
  const initial = readSearchParamSelection(search);
  const query = carryUrlSelection(initial);
  const runId = one(search[RUN_PARAM]);

  /* --------------------------------------------------------- a real run */

  if (runId !== null) {
    const client = createBackendClient();
    const result = await client.runResult(runId);

    if (!result.ok) {
      const failure = result.failure;

      // 409 means the run exists and has not finished. That is not an error
      // page, it is the wrong page: the running screen is where an unfinished
      // run belongs, and sending the analyst there is what a bookmark opened
      // too early should do.
      if (failure.kind === "http" && failure.status === 409) {
        redirect(runningHref(topic.slug, query, { runId }));
      }

      const unknownRun = failure.kind === "http" && failure.status === 404;
      return (
        <RunProblem
          topic={topic}
          title={unknownRun ? "This run does not exist" : "The analysis service is not answering"}
          message={
            unknownRun
              ? `The service has no run "${runId}". A run id is a hash of its ` +
                "configuration, so a link from another deployment does not resolve here. " +
                "Run it again to compute it on this one."
              : "The result exists on the service; this page could not reach it to read. " +
                "Reload to try again."
          }
          query={query}
          receiptHref={null}
        />
      );
    }

    // Criterion labels are presentation, so a failure to read them is not a
    // failure to show the result: the contribution table falls back to the
    // criterion ids, which are readable ("dist_to_river") if not pretty.
    const criteria = await client.topicCriteria(topic.slug);
    const criterionLabels: Record<string, string> = {};
    if (criteria.ok) {
      for (const criterion of criteria.data.criteria) {
        criterionLabels[criterion.id] = criterion.label;
      }
    }

    return (
      <ResultView
        topic={topic}
        result={result.data}
        criterionLabels={criterionLabels}
        reviewHref={stepHref(topic.slug, "review", query)}
        /*
         * The areas step, not a re-POST of the same body.
         *
         * A run id is a hash of its configuration, so submitting the identical
         * request again returns this same result from the cache. "Run it
         * again" is therefore only meaningful if something changes, and the
         * areas are what an analyst changes: widen the polygon, add the
         * neighbouring county, drop the one that was a mis-click.
         */
        rerunHref={stepHref(topic.slug, "areas", query) as Route}
      />
    );
  }

  /* ------------------------------------------------------- the receipt */

  return (
    // ResultsStep reads `?req=` with useSearchParams, which Next requires to
    // sit under a Suspense boundary so the rest of the route can still be
    // rendered without waiting on the client.
    <Suspense fallback={null}>
      <ResultsStep topic={topic} initial={initial} />
    </Suspense>
  );
}
