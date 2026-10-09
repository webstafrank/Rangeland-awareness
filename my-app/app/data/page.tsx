import type { Metadata } from "next";
import { ExploreView } from "@/components/explore/ExploreView";

export const metadata: Metadata = {
  title: "Explore data",
  description:
    "KSA data layers and satellite imagery on one map.",
};

/**
 * The data explorer. No page header band: the map is the content, so the
 * workspace starts right under the shell's top bar (which already carries
 * the breadcrumb) and the page's title is the first row of its layer panel.
 * See ExploreView for the layout.
 */
export default function DataPage() {
  return <ExploreView />;
}
