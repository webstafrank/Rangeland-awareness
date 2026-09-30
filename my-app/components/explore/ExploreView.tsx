"use client";

/**
 * The standalone data explorer: every WMS layer a source publishes, on a
 * basemap, with no topic and no analysis run attached.
 *
 * Composition only. The layer panel (WmsLayerControl) and the map
 * (ExplorePanel/ExploreMap) both read the same `state`/`dispatch` pair from
 * `useExploreLayers`, which is what keeps a toggle in the panel and a tile
 * layer on the map in agreement — the same wiring the results screen uses for
 * `useWmsLayers`, just without a topic to filter by.
 */

import ExplorePanel from "@/components/map/ExplorePanel";
import WmsLayerControl from "@/components/map/WmsLayerControl";
import { exploreDateWindow, useExploreLayers } from "@/components/explore/useExploreLayers";

export function ExploreView() {
  const { resolution, layers, state, dispatch } = useExploreLayers();
  const dateWindow = exploreDateWindow();

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[360px_1fr]">
      <div className="order-2 min-h-0 lg:order-1">
        <WmsLayerControl
          resolution={resolution}
          layers={layers}
          dateWindow={dateWindow}
          state={state}
          dispatch={dispatch}
        />
      </div>

      <div className="card order-1 h-[60vh] overflow-hidden lg:order-2 lg:h-full lg:min-h-[480px]">
        <ExplorePanel
          wms={{ source: resolution.source, layers, dateWindow, state, dispatch }}
        />
      </div>
    </div>
  );
}
