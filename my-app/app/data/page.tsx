import type { Metadata } from "next";
import { PageHero } from "@/components/shell/Page";
import { ExploreView } from "@/components/explore/ExploreView";

export const metadata: Metadata = {
  title: "Explore data",
  description:
    "Browse the satellite layers behind Disaster Monitor on a map, independent of any analysis run.",
};

export default function DataPage() {
  return (
    <>
      <PageHero
        eyebrow="Data"
        title="Explore the satellite layers"
        lead="Every layer behind the four analysis topics, on its own map. Turn one on to see what it covers, its date and its legend — no topic, no run, no area selection required."
      />

      <section className="mx-auto flex w-full max-w-band flex-1 flex-col px-gutter py-8 lg:px-gutter-lg lg:py-10">
        <div className="flex h-[clamp(480px,calc(100svh-280px),760px)] min-h-0 flex-col">
          <ExploreView />
        </div>
      </section>
    </>
  );
}
