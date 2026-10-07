import type { Metadata } from "next";
import Link from "next/link";
import { ExploreView } from "@/components/explore/ExploreView";
import { ChevronRight12Regular } from "@/components/ui/icons";

export const metadata: Metadata = {
  title: "Explore data",
  description:
    "KSA data layers and satellite imagery on one map.",
};

export default function DataPage() {
  return (
    <>
      {/*
        A compact title bar rather than the content pages' PageHero: on this
        page the map is the content, so the heading takes one short band and
        gives the height back to it. Same shape as the topic flow's bar
        (app/topics/[topic]/layout.tsx): a Fluent breadcrumb in miniature, the
        page name, and its one-line purpose beside it where there is room.
      */}
      <section className="band-chrome border-b border-edge">
        <div className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 lg:px-6">
          <div className="min-w-0">
            <nav
              aria-label="Breadcrumb"
              className="type-caption1 flex items-center gap-0.5 text-ink-faint"
            >
              <Link href="/" className="rounded-fluent-small text-accent-link hover:underline">
                Home
              </Link>
              <ChevronRight12Regular aria-hidden="true" />
              <span aria-current="page">Explore data</span>
            </nav>
            <h1 className="type-subtitle1 text-ink">Explore data</h1>
          </div>
          <p className="type-body1 min-w-0 basis-full text-ink-muted sm:basis-auto sm:border-l sm:border-edge-strong sm:pl-4">
            KSA data layers and satellite imagery on one map.
          </p>
        </div>
      </section>

      {/*
        Wider than the 1440px content band every other page sits in: on a big
        screen the map is the page, so it runs edge to edge less a small
        gutter, and as tall as the screen allows below the title bar, ending
        at the fold: the wheel zooms the map on desktop, so a map running past
        the fold could not be scrolled past from over it. Large screens only:
        on a phone the map and the panel stack, and the section grows to fit
        them rather than letting the footer draw over the panel.
      */}
      <section className="flex w-full flex-1 flex-col px-4 py-4 lg:px-6 lg:py-5">
        <div className="flex min-h-0 flex-col lg:h-[clamp(480px,calc(100svh-170px),1100px)]">
          <ExploreView />
        </div>
      </section>
    </>
  );
}
