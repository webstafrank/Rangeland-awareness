"use client";

/**
 * The standalone data explorer: the KSA GeoServer's layers and NASA's, by
 * category, stacked on a MapLibre map in whatever order the analyst wants.
 *
 * Composition only. The catalogue comes from useExploreCatalog, the stack is
 * one reducer from services/explore, and the panel and the map both read that
 * same stack, which is what keeps "top of the list" and "top of the map" the
 * same layer.
 */

import { useCallback, useMemo, useReducer, useState } from "react";
import dynamic from "next/dynamic";

import { LayerPanel } from "@/components/explore/LayerPanel";
import { useExploreCatalog } from "@/components/explore/useExploreCatalog";
import type { Basemap, FocusRequest } from "@/components/explore/ExploreMapLibre";
import { EMPTY_STACK, stackReducer, type ExploreLayer } from "@/services/explore";

/** MapLibre needs WebGL and `window` at import, so it is never server rendered. */
const ExploreMapLibre = dynamic(() => import("@/components/explore/ExploreMapLibre"), {
  ssr: false,
  loading: () => (
    <div
      className="type-body1 grid h-full w-full place-items-center bg-page text-ink-faint"
      role="status"
      aria-live="polite"
    >
      Loading map...
    </div>
  ),
});

/**
 * Earlier than any registered layer's extent, and ending today: resolveLayerTime
 * picks the LATEST covered day inside the window, so every time-varying layer
 * shows its own most recent date with no date picker.
 */
const EARLIEST = "2000-01-01";

export function exploreDateWindow(): { start: string; end: string } {
  return { start: EARLIEST, end: new Date().toISOString().slice(0, 10) };
}

export function ExploreView() {
  const { layers, ksaStatus } = useExploreCatalog(exploreDateWindow());
  const layersById = useMemo(() => new Map(layers.map((l) => [l.id, l])), [layers]);
  const [stack, dispatch] = useReducer(stackReducer, EMPTY_STACK);
  const [basemap, setBasemap] = useState<Basemap>("street");
  const [focus, setFocus] = useState<FocusRequest | null>(null);

  const onFocus = useCallback((layer: ExploreLayer) => {
    if (layer.bounds === null) return;
    setFocus((previous) => ({ bounds: layer.bounds!, nonce: (previous?.nonce ?? 0) + 1 }));
  }, []);

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[360px_1fr] 2xl:grid-cols-[400px_1fr]">
      <div className="order-2 min-h-0 lg:order-1">
        <LayerPanel
          layers={layers}
          layersById={layersById}
          ksaStatus={ksaStatus}
          stack={stack}
          dispatch={dispatch}
          basemap={basemap}
          onBasemap={setBasemap}
          onFocus={onFocus}
        />
      </div>

      <div
        data-testid="explore-map"
        className="card order-1 h-[60vh] overflow-hidden lg:order-2 lg:h-full lg:min-h-[480px]"
      >
        <ExploreMapLibre
          layers={layersById}
          stack={stack}
          dispatch={dispatch}
          basemap={basemap}
          focus={focus}
        />
      </div>
    </div>
  );
}
