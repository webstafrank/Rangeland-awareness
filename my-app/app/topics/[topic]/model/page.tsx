import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getTopic } from "@/lib/analysis/topics";
import { readSearchParamSelection } from "@/lib/analysis/url-state";
import ModelStep from "@/components/topic/ModelStep";

/**
 * Step 2: the model.
 *
 * Same shape as every other step route, and the repetition is the feature: a
 * step is a route, a route resolves its own topic and 404s on a bad slug, and
 * nothing about step two is knowable from step one's file. The shared parts
 * (the topic band, the rail, the receipt) live in the layout and in StepShell.
 */

export async function generateMetadata({
  params,
}: PageProps<"/topics/[topic]/model">): Promise<Metadata> {
  const { topic: slug } = await params;
  const topic = getTopic(slug);
  if (!topic) return { title: "Page not found" };
  return { title: `${topic.name}: model`, description: topic.output };
}

export default async function ModelPage({
  params,
  searchParams,
}: PageProps<"/topics/[topic]/model">) {
  const { topic: slug } = await params;
  const topic = getTopic(slug);
  if (!topic) notFound();

  const initial = readSearchParamSelection(await searchParams);

  return <ModelStep topic={topic} initial={initial} />;
}
