import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getTopic } from "@/lib/analysis/topics";
import { readSearchParamSelection } from "@/lib/analysis/url-state";
import ResultsStep from "@/components/results/ResultsStep";

/**
 * Where a run lands.
 *
 * Not a step: it has no rail pill and no Continue, because it is the
 * consequence of the four decisions rather than a fifth one. It is declared in
 * TERMINAL_SEGMENTS so the on-disk registry check still covers it.
 *
 * The configuration is read here, on the server, the same way every step reads
 * it, so a shared link renders the right configuration on first paint. The
 * areas cannot come from the URL and are collected on the client from
 * sessionStorage, paired by the id in `?run=`.
 */

export async function generateMetadata({
  params,
}: PageProps<"/topics/[topic]/results">): Promise<Metadata> {
  const { topic: slug } = await params;
  const topic = getTopic(slug);
  if (!topic) return { title: "Page not found" };
  return {
    title: `${topic.name}: request`,
    description: `The validated analysis request for ${topic.name}, and its exports.`,
  };
}

export default async function ResultsPage({
  params,
  searchParams,
}: PageProps<"/topics/[topic]/results">) {
  const { topic: slug } = await params;
  const topic = getTopic(slug);
  if (!topic) notFound();

  const initial = readSearchParamSelection(await searchParams);

  return (
    // ResultsStep reads `?run=` with useSearchParams, which Next requires to
    // sit under a Suspense boundary so the rest of the route can still be
    // rendered without waiting on the client.
    <Suspense fallback={null}>
      <ResultsStep topic={topic} initial={initial} />
    </Suspense>
  );
}
