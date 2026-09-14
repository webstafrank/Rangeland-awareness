import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { TOPICS, getTopic } from "@/lib/analysis/topics";
import { readSearchParamSelection } from "@/lib/analysis/url-state";
import ScopeStep from "@/components/topic/ScopeStep";

/**
 * Step 1 of the analysis flow, and the topic's own URL.
 *
 * The first step has no path segment of its own (see lib/analysis/steps.ts),
 * so a link from the homepage lands directly on the first decision instead of
 * on a redirect. The remaining three are sibling routes under this one, and
 * they all share app/topics/[topic]/layout.tsx.
 *
 * Nothing here imports Leaflet, directly or transitively. The map is loaded
 * with ssr:false from inside the areas step, which is the only legal place for
 * it, so every route in this segment renders on the server without touching
 * `window`.
 */

/**
 * The four known topic slugs. The registry is the source, so a topic added to
 * lib/analysis/topics.ts gets a route with no edit here.
 *
 * Note that this route still reports as dynamic, not static, because the page
 * reads searchParams (see below). Outside partial prerendering there is no way
 * to read a search param and keep a static shell, so this is a deliberate
 * trade rather than an oversight:
 *
 *   dynamic route  correct 404 status, no flash of default choices, and the
 *                  query validated on the server before first paint
 *   static route   CDN-cacheable HTML for four pages that render in single
 *                  digit milliseconds anyway
 *
 * For an internal analyst tool the first column is worth more than the second.
 * generateStaticParams is kept because it still documents the valid slugs and
 * would resume prerendering the moment the searchParams read goes away.
 */
export function generateStaticParams() {
  return TOPICS.map((topic) => ({ topic: topic.slug }));
}

/*
 * Two things deliberately absent here, both measured rather than assumed:
 *
 * `dynamicParams = false` would also produce a 404, but by refusing the
 * request before the page runs, which logs an internal NoFallbackError on
 * every miss. The notFound() call below reaches the same 404 through the
 * normal path with no spurious server error.
 *
 * A `loading.tsx` for this segment was written and then removed. It turns the
 * route into a streamed response, so the shell is sent with status 200 and the
 * notFound() boundary resolves inside the stream: an unknown slug then returns
 * 200 with the 404 page in the body, which is a soft 404 (verified with curl).
 * Since generateStaticParams prerenders all four topics, the only navigation
 * that could ever show that skeleton is the 404 itself, so it bought nothing
 * and cost the correct status.
 */

export async function generateMetadata({
  params,
}: PageProps<"/topics/[topic]">): Promise<Metadata> {
  const { topic: slug } = await params;
  const topic = getTopic(slug);
  if (!topic) return { title: "Page not found" };

  return {
    title: topic.name,
    description: `${topic.question} ${topic.output}`,
  };
}

export default async function ScopePage({
  params,
  searchParams,
}: PageProps<"/topics/[topic]">) {
  const { topic: slug } = await params;
  const topic = getTopic(slug);
  if (!topic) notFound();

  // Type and model are read here, on the server, so a bookmarked link renders
  // correct on the first paint rather than flashing the defaults and then
  // correcting itself in an effect. Unrecognised values are dropped, not
  // treated as errors: a stale bookmark should still open the page.
  const initial = readSearchParamSelection(await searchParams);

  return <ScopeStep topic={topic} initial={initial} />;
}
