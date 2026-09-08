"use client";

/**
 * The SSR boundary for the map.
 *
 * Leaflet reads `window` at module scope, so AoiMap can never be part of a
 * server render. next/dynamic with ssr:false is only legal inside a client
 * component, which is the entire reason this file exists as a separate
 * "use client" module rather than the route importing AoiMap directly.
 */

import dynamic from "next/dynamic";
import type { AoiMapProps } from "@/components/map/AoiMap";

const AoiMap = dynamic(() => import("@/components/map/AoiMap"), {
  ssr: false,
  loading: () => <MapSkeleton />,
});

/**
 * Shown while the Leaflet chunk loads. Sized by its parent, so it holds the
 * exact space the map will take and the surrounding layout does not jump.
 */
function MapSkeleton() {
  return (
    <div
      className="grid h-full w-full place-items-center bg-surface-muted"
      role="status"
      aria-live="polite"
    >
      <span className="text-sm text-foreground-faint">Loading map...</span>
    </div>
  );
}

export default function MapPanel(props: AoiMapProps) {
  return (
    // The test hook lives on this wrapper, not on MapContainer. react-leaflet
    // destructures only className, id and style off MapContainer and forwards
    // everything else to Leaflet as map options, so a data-* attribute put
    // there is silently swallowed and never reaches the DOM.
    <div data-testid="aoi-map" className="h-full w-full">
      <AoiMap {...props} />
    </div>
  );
}
