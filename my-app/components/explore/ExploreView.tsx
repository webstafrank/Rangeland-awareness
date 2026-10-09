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

const PANEL_ID = "explore-layers";
const MAP_ID = "explore-map-area";

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

  // On a phone the map and the panel are stacked, so each has a control that
  // jumps to the other (the map's "Layers" button, the panel's "Back to map").
  const jumpTo = useCallback((id: string) => {
    const target = document.getElementById(id);
    if (target === null) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "start" });
    target.focus({ preventScroll: true });
  }, []);
  const showLayers = useCallback(() => jumpTo(PANEL_ID), [jumpTo]);
  const showMap = useCallback(() => jumpTo(MAP_ID), [jumpTo]);

  /*
   * The workspace, in the shape of EO Browser and ArcGIS Map Viewer.
   *
   *   lg and up  [ panel | map ]   one screen tall under the top bar, so the
   *                                map ends at the fold: the wheel zooms it,
   *                                and a map running past the fold could not
   *                                be scrolled past from over it. The panel
   *                                scrolls inside itself.
   *   below lg   map, then panel   map first, edge to edge; the page scrolls
   *                                and the panel grows to fit. Each has a
   *                                button that jumps to the other.
   *
   * The page's h1 is for assistive tech only: the top bar already shows
   * "Explore data", so the panel opens on its working content.
   *
   * The DOM order is panel, map, so the keyboard meets the controls before
   * the map's own; on a phone `order` lifts the map above the panel. Panel
   * width is the shell's --layout-panel-min (320px); scroll margins
   * clear the sticky top bar (--layout-header-height).
   */
  return (
    <div className="flex flex-col bg-surface lg:grid lg:h-[calc(100svh_-_var(--layout-header-height)_-_1px)] lg:grid-cols-[var(--layout-panel-min)_minmax(0,1fr)]">
      <h1 className="sr-only">Explore data</h1>

      <div
        id={PANEL_ID}
        tabIndex={-1}
        className="order-2 min-w-0 scroll-mt-[var(--layout-header-height)] border-edge outline-none lg:order-none lg:min-h-0 lg:border-r"
      >
        <LayerPanel
          layers={layers}
          layersById={layersById}
          ksaStatus={ksaStatus}
          stack={stack}
          dispatch={dispatch}
          onFocus={onFocus}
          onShowMap={showMap}
        />
      </div>

      <div
        id={MAP_ID}
        tabIndex={-1}
        data-testid="explore-map"
        className="relative order-1 h-[60svh] min-h-80 scroll-mt-[var(--layout-header-height)] overflow-hidden border-b border-edge bg-page outline-none lg:order-none lg:h-auto lg:min-h-0 lg:border-b-0"
      >
        <ExploreMapLibre
          layers={layersById}
          stack={stack}
          dispatch={dispatch}
          basemap={basemap}
          onBasemap={setBasemap}
          focus={focus}
          onShowLayers={showLayers}
        />
      </div>
    </div>
  );
}
