import type { Metadata } from "next";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { ExploreView } from "@/components/explore/ExploreView";

export const metadata: Metadata = {
  title: "Explore data",
  description:
    "Browse the satellite layers behind Rangeland Awareness on a map, independent of any analysis run.",
};

export default function DataPage() {
  return (
    <>
      <section className="band-chrome">
        <div className="mx-auto w-full max-w-band px-gutter py-10 lg:px-gutter-lg lg:py-14">
          <Eyebrow>Data</Eyebrow>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight lg:text-4xl">
            Explore the satellite layers
          </h1>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-ink-muted lg:text-lg">
            Every layer behind the four analysis topics, on its own map. Turn
            one on to see what it covers, its date and its legend &mdash; no
            topic, no run, no area selection required.
          </p>
        </div>
      </section>

      <section className="mx-auto flex w-full max-w-band flex-1 flex-col px-gutter py-8 lg:px-gutter-lg lg:py-10">
        <div className="flex h-[clamp(480px,calc(100svh-280px),760px)] min-h-0 flex-col">
          <ExploreView />
        </div>
      </section>
    </>
  );
}
