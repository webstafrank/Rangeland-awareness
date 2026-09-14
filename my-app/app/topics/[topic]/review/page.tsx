import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getTopic } from "@/lib/analysis/topics";
import { readSearchParamSelection } from "@/lib/analysis/url-state";
import ReviewStep from "@/components/topic/ReviewStep";

/**
 * Step 4: review and run.
 *
 * Reachable directly, with nothing selected, on purpose. The step renders its
 * summary with the gaps visible and Run disabled with the reason printed, which
 * is more use than a redirect that discards the address the analyst typed.
 */

export async function generateMetadata({
  params,
}: PageProps<"/topics/[topic]/review">): Promise<Metadata> {
  const { topic: slug } = await params;
  const topic = getTopic(slug);
  if (!topic) return { title: "Page not found" };
  return { title: `${topic.name}: review`, description: topic.output };
}

export default async function ReviewPage({
  params,
  searchParams,
}: PageProps<"/topics/[topic]/review">) {
  const { topic: slug } = await params;
  const topic = getTopic(slug);
  if (!topic) notFound();

  const initial = readSearchParamSelection(await searchParams);

  return <ReviewStep topic={topic} initial={initial} />;
}
