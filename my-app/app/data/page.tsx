import { Suspense } from "react";
import type { Metadata } from "next";
import { ExploreView } from "@/components/explore/ExploreView";

export const metadata: Metadata = {
  title: "Explore data",
  description:
    "KSA data layers and satellite imagery on one map, by hazard: flood, drought, famine and landslide.",
};

/**
 * The data explorer. No page header band: the map is the content, so the
 * workspace starts right under the shell's top bar (which already carries
 * the breadcrumb) and the first row is the hazard tabs. See ExploreView for
 * the layout.
 *
 * Suspense because ExploreView reads the hazard tab from the URL with
 * useSearchParams, which a statically rendered page has no value for: the
 * explorer renders on the client, as its map and catalogue already did.
 */
export default function DataPage() {
  return (
    <Suspense
      fallback={
        <p role="status" className="type-body1 px-gutter py-6 text-ink-faint">
          Loading the explorer&hellip;
        </p>
      }
    >
      <ExploreView />
    </Suspense>
  );
}
