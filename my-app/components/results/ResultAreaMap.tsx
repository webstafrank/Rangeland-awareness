"use client";

/**
 * The run's areas on the real basemap.
 *
 * The result echoes its configuration, and `config.areas` is the GeoJSON the
 * run was computed over, so the geometry drawn here is the run's own, never
 * invented. It goes through `draftAreaFromGeometry`, the same normaliser every
 * selection path uses, so the map receives exactly the shape it draws on the
 * areas step and the receipt.
 *
 * `fallback` is the server-rendered outline (an SVG with its title and
 * description). It sits under the map: it is what a cold or script-less load
 * shows until Leaflet arrives, and what a screen reader reads as the figure.
 * Leaflet touches `window` at import time, hence `ssr: false`.
 *
 * Read-only in practice: the map gets no-op handlers, as on the receipt, so a
 * click cannot change what the run covered.
 */

import { useMemo, type ReactNode } from "react";
import dynamic from "next/dynamic";
import type { Feature, Geometry } from "geojson";
import { draftAreaFromGeometry, type AreaOfInterest, type FocusRequest } from "@/services/analysis/selection";
import { padBounds, unionBounds } from "@/services/geo/bounds";

const AoiMap = dynamic(() => import("@/components/map/AoiMap"), { ssr: false });

function geometryOf(area: unknown): { geometry: Geometry; name: string | null } | null {
  if (typeof area !== "object" || area === null) return null;
  const value = area as Partial<Feature> & Partial<Geometry>;
  if (value.type === "Feature" && value.geometry) {
    const name = value.properties?.name;
    return { geometry: value.geometry as Geometry, name: typeof name === "string" ? name : null };
  }
  if (typeof value.type === "string" && ("coordinates" in value || "geometries" in value)) {
    return { geometry: value as Geometry, name: null };
  }
  return null;
}

export function ResultAreaMap({
  areas,
  fallback,
}: {
  areas: readonly unknown[];
  fallback: ReactNode;
}) {
  const shown = useMemo<AreaOfInterest[]>(() => {
    const out: AreaOfInterest[] = [];
    areas.forEach((area, index) => {
      const parsed = geometryOf(area);
      if (!parsed) return;
      const draft = draftAreaFromGeometry(
        parsed.geometry,
        "drawn",
        parsed.name ?? `Area ${index + 1}`,
      );
      if (draft) out.push({ ...draft, id: `run-area-${index + 1}` });
    });
    return out;
  }, [areas]);

  const focus = useMemo<FocusRequest | null>(() => {
    const union = unionBounds(shown.map((area) => area.bounds));
    return union === null ? null : { bounds: padBounds(union), token: 1 };
  }, [shown]);

  return (
    <div className="relative h-full min-h-[280px] w-full overflow-hidden bg-sunken">
      <div className="absolute inset-0 grid place-items-center p-4">{fallback}</div>
      {shown.length > 0 ? (
        <div className="absolute inset-0">
          <AoiMap
            areas={shown}
            focus={focus}
            tool="point"
            onAddAreas={() => {}}
            onFocusArea={() => {}}
            onDrawFinished={() => {}}
          />
        </div>
      ) : null}
    </div>
  );
}
