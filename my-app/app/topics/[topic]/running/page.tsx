import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getTopic } from "@/services/analysis/topics";
import { carryUrlSelection, readSearchParamSelection } from "@/services/analysis/url-state";
import { REQUEST_PARAM, RUN_PARAM } from "@/services/analysis/request-id";
import { stepHref } from "@/services/analysis/steps";
import { createBackendClient } from "@/services/backend-api";
import type { TopicCriteria } from "@/services/backend-api";
import StartRun from "@/components/run/StartRun";
import { receiptHref, resultHref } from "@/services/run-flow/links";
import RunWatch from "@/components/run/RunWatch";
import RunProblem from "@/components/run/RunProblem";

/**
 * Where a run is created and watched.
 *
 * Two arrivals, and the route decides which by which id the URL carries:
 *
 *   ?req=<request id>   from the review step. The run does not exist yet. The
 *                       areas are in sessionStorage, which only the browser can
 *                       read, so creating it is client work: see StartRun.
 *   ?run=r_<id>         a reload, a shared link, or StartRun having just
 *                       rewritten the URL. The run exists, so this route reads
 *                       its status on the server and the screen renders with a
 *                       real stage list in the first byte of HTML rather than
 *                       after a round trip.
 *
 * The second is why this is worth being a route at all rather than a state of
 * the review step. A run is minutes long. An analyst will reload, switch tabs,
 * and send the link to a colleague, and all three of those have to work.
 *
 * Nothing here is prerendered: it reads search params, and a run's status is
 * the least cacheable thing in the app.
 */

export async function generateMetadata({
  params,
}: PageProps<"/topics/[topic]/running">): Promise<Metadata> {
  const { topic: slug } = await params;
  const topic = getTopic(slug);
  if (!topic) return { title: "Page not found" };
  return {
    title: `${topic.name}: running`,
    description: `An analysis run in progress for ${topic.name}.`,
    // A run URL is private to a working session and has no value in an index.
    robots: { index: false, follow: false },
  };
}

/** A search param, as the one string a URL can only sensibly have one of. */
function one(value: string | string[] | undefined): string | null {
  if (value === undefined) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export default async function RunningPage({
  params,
  searchParams,
}: PageProps<"/topics/[topic]/running">) {
  const { topic: slug } = await params;
  const topic = getTopic(slug);
  if (!topic) notFound();

  const search = await searchParams;
  const initial = readSearchParamSelection(search);
  const query = carryUrlSelection(initial);
  const runId = one(search[RUN_PARAM]);
  const request = one(search[REQUEST_PARAM]);

  // Neither id: somebody typed the URL, or followed a link that lost its query.
  // There is nothing to start and nothing to watch.
  if (runId === null && request === null) {
    return (
      <RunProblem
        topic={topic}
        title="There is no run on this link"
        message={
          "This address names a run but carries no run id. Start from the review " +
          "step, which builds the link as it submits."
        }
        query={query}
        receiptHref={null}
      />
    );
  }

  const client = createBackendClient();

  /* ------------------------------------------------------------ watching */

  if (runId !== null) {
    const status = await client.runStatus(runId);

    if (!status.ok) {
      const failure = status.failure;
      // A 404 is the one case with a specific, actionable meaning: the id is
      // real-looking and the service has never heard of it. Usually a link from
      // a previous deployment, since a run id is a hash of the configuration
      // and the database behind it is not shared between environments.
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
              : "The run may still be going; this page could not reach the service to ask. " +
                "Reload to try again."
          }
          query={query}
          receiptHref={
            request === null ? null : receiptHref(topic.slug, query, request)
          }
        />
      );
    }

    return (
      <RunWatch
        topic={topic}
        runId={runId}
        initialStatus={status.data.status}
        initialStages={status.data.stages}
        initialProgress={status.data.progress}
        resultHref={resultHref(topic.slug, query, runId)}
        reviewHref={stepHref(topic.slug, "review", query)}
      />
    );
  }

  /* ------------------------------------------------------------ starting */

  // The criteria are read here rather than in the browser: it is one round trip
  // that can happen while the page is being rendered instead of after it loads,
  // and it keeps the decision about what this topic can run on the server side
  // where the service's answer is authoritative.
  const criteria = await client.topicCriteria(topic.slug);
  const resolved: TopicCriteria | null = criteria.ok ? criteria.data : null;

  return (
    <StartRun
      topic={topic}
      initial={initial}
      request={request as string}
      criteria={resolved}
      criteriaFailure={criteria.ok ? null : criteria.failure}
      query={query}
    />
  );
}
