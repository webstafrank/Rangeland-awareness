import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getTopic } from "@/lib/analysis/topics";
import { readSearchParamSelection } from "@/lib/analysis/url-state";
import AreasStep from "@/components/topic/AreasStep";

/**
 * Step 3: the areas.
 *
 * The only step carrying the map, and still a server component: MapPanel is
 * the ssr:false boundary and it is reached from inside the client step, so
 * this route renders server-side without Leaflet touching `window`.
 */

export async function generateMetadata({
  params,
}: PageProps<"/topics/[topic]/areas">): Promise<Metadata> {
  const { topic: slug } = await params;
  const topic = getTopic(slug);
  if (!topic) return { title: "Page not found" };
  return { title: `${topic.name}: areas`, description: topic.output };
}

export default async function AreasPage({
  params,
  searchParams,
}: PageProps<"/topics/[topic]/areas">) {
  const { topic: slug } = await params;
  const topic = getTopic(slug);
  if (!topic) notFound();

  const initial = readSearchParamSelection(await searchParams);

  return <AreasStep topic={topic} initial={initial} />;
}
