"use client";

/**
 * The SSR boundary for the explorer's basemap. Same reasoning as MapPanel.tsx:
 * Leaflet reads `window` at module scope, so ExploreMap can never be part of a
 * server render, and next/dynamic with ssr:false is only legal inside a
 * client component.
 */

import dynamic from "next/dynamic";
import type { ExploreMapProps } from "@/components/map/ExploreMap";

const ExploreMap = dynamic(() => import("@/components/map/ExploreMap"), {
  ssr: false,
  loading: () => <MapSkeleton />,
});

function MapSkeleton() {
  return (
    <div
      className="type-body1 grid h-full w-full place-items-center bg-page text-ink-faint"
      role="status"
      aria-live="polite"
    >
      Loading map...
    </div>
  );
}

export default function ExplorePanel(props: ExploreMapProps) {
  return (
    <div data-testid="explore-map" className="h-full w-full">
      <ExploreMap {...props} />
    </div>
  );
}
