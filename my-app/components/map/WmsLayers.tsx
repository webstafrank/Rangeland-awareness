"use client";

/**
 * The WMS overlays on the results map.
 *
 * Client-only, and it MUST stay behind an ssr:false boundary the way AoiMap
 * does: react-leaflet's WMSTileLayer imports `leaflet`, which reads `window` at
 * module scope, so a server render of anything that imports this file crashes
 * the route. It is a child of `MapContainer`, so the boundary is whichever
 * dynamic import loads the map itself. See components/README.md.
 *
 * It owns no layer state. Which layers are on, how transparent they are and
 * which ones are failing all live in the reducer in services/wms/state.ts, and every
 * decision about what to request lives in services/wms/. This file is a Leaflet
 * adapter and nothing more, which is what keeps the interesting rules provable
 * in node.
 *
 * There is no value import of `leaflet` here on purpose. Only the tile event
 * type is needed, and a type-only import is erased at compile time, so this
 * module pulls in as little of Leaflet's module graph as react-leaflet allows.
 */

import { useEffect, useMemo, useRef } from "react";
import { WMSTileLayer } from "react-leaflet";

import {
  describeTileFailure,
  getMapParams,
  layerZIndex,
  panelNotices,
  paramsKey,
  resolveLayerTime,
  visibleLayers,
  type WmsDateWindow,
  type WmsLayerSpec,
  type WmsPanelAction,
  type WmsPanelState,
  type WmsSource,
} from "@/services/wms";

export interface WmsLayersProps {
  source: WmsSource;
  /** Every layer offered for the topic, in registry order. */
  layers: readonly WmsLayerSpec[];
  /** The run's date window. Drives the TIME parameter. */
  dateWindow: WmsDateWindow;
  state: WmsPanelState;
  dispatch: (action: WmsPanelAction) => void;
}

/**
 * How long a tile request may hang before the layer is reported as failing.
 *
 * A tile that 404s or returns an XML body fires `tileerror` within a second. A
 * tile that never answers at all fires nothing, ever — which is precisely the
 * shape of a misconfigured internal endpoint that silently drops packets — so a
 * watchdog is the only way that case ever reaches the analyst. Fifteen seconds
 * is well past a slow but working request over a bad connection.
 */
const STALL_TIMEOUT_MS = 15_000;

function WmsLayer({
  source,
  layers,
  layer,
  dateWindow,
  opacity,
  dispatch,
}: {
  source: WmsSource;
  layers: readonly WmsLayerSpec[];
  layer: WmsLayerSpec;
  dateWindow: WmsDateWindow;
  opacity: number;
  dispatch: (action: WmsPanelAction) => void;
}) {
  const time = useMemo(
    () => resolveLayerTime(layer, dateWindow),
    [layer, dateWindow],
  );
  const params = useMemo(() => getMapParams(source, layer, time), [source, layer, time]);

  // Memoised on the params VALUE, not rebuilt each render. react-leaflet calls
  // `layer.setParams()` whenever the params prop is not reference-equal to the
  // previous one, and setParams redraws the whole tile grid, so a fresh object
  // literal per render would refetch every tile on every render.
  const key = paramsKey(params);
  const stableParams = useMemo(
    () => params,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the key IS the value
    [key],
  );

  const stall = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearStall = () => {
    if (stall.current !== null) {
      clearTimeout(stall.current);
      stall.current = null;
    }
  };

  // A layer unmounted mid-request must not leave a timer that fires into a
  // dispatch for a layer list that no longer exists.
  useEffect(() => clearStall, []);

  const handlers = useMemo(
    () => ({
      loading() {
        dispatch({ type: "tile-loading", id: layer.id });
        clearStall();
        stall.current = setTimeout(() => {
          dispatch({
            type: "tile-error",
            id: layer.id,
            message: describeTileFailure(source, layer),
          });
        }, STALL_TIMEOUT_MS);
      },
      load() {
        clearStall();
        dispatch({ type: "tile-ready", id: layer.id });
      },
      tileerror() {
        // Fired when the browser cannot decode the response as an image: a
        // 404, a refused connection, or the HTTP 200 ServiceException XML body
        // a WMS server answers a bad request with. The event carries no
        // reason, so the message names what was tried instead of guessing.
        clearStall();
        dispatch({
          type: "tile-error",
          id: layer.id,
          message: describeTileFailure(source, layer),
        });
      },
    }),
    [dispatch, layer, source],
  );

  // Null params means the run's date window is outside everything this layer
  // publishes. Requesting anyway would return HTTP 200 and a transparent PNG
  // that fires no event at all, so the map would look broken with nothing to
  // report. Not requesting leaves the basemap clean and the control states why.
  if (stableParams === null) return null;

  return (
    <WMSTileLayer
      url={source.endpoint}
      params={stableParams}
      opacity={opacity}
      zIndex={layerZIndex(layers, layer.id)}
      attribution={layer.attribution}
      eventHandlers={handlers}
    />
  );
}

/**
 * What went wrong, said over the basemap.
 *
 * Rendered as a child of MapContainer, which puts it inside the map's own div,
 * the same trick AoiMap's view readout uses. That placement is the requirement:
 * a layer that fails has to be explained where the analyst is looking, not only
 * in a panel that may be scrolled out of view on a narrow screen.
 *
 * `role="alert"` for a tile failure because something the analyst asked for is
 * not there; `role="status"` for a coverage gap because it is information about
 * the data, not a fault. Both are announced, neither is colour-only.
 */
function WmsNoticeOverlay({
  layers,
  state,
  dateWindow,
}: {
  layers: readonly WmsLayerSpec[];
  state: WmsPanelState;
  dateWindow: WmsDateWindow;
}) {
  const notices = panelNotices(layers, state, dateWindow);
  if (notices.length === 0) return null;

  const hasProblem = notices.some((n) => n.kind === "problem");

  return (
    <div
      data-testid="wms-notices"
      role={hasProblem ? "alert" : "status"}
      aria-live="polite"
      // z above Leaflet's tile and overlay panes (400/500) so it is never
      // painted under a tile, and pointer-events off so it cannot eat a click
      // meant for the map underneath.
      className="pointer-events-none absolute inset-x-2 top-2 z-[600] space-y-1"
    >
      {notices.map((notice) => (
        <p
          key={notice.layerId}
          className={
            notice.kind === "problem"
              ? "rounded border border-danger-border bg-danger-soft px-2 py-1.5 text-xs text-danger shadow-sm"
              : "rounded border border-warn-border bg-warn-soft px-2 py-1.5 text-xs text-warn shadow-sm"
          }
        >
          {notice.text}
        </p>
      ))}
    </div>
  );
}

export default function WmsLayers({
  source,
  layers,
  dateWindow,
  state,
  dispatch,
}: WmsLayersProps) {
  const active = visibleLayers(layers, state);

  return (
    <>
      {active.map((layer) => (
        <WmsLayer
          // Keyed by layer id alone. Keying on the resolved TIME as well would
          // tear the tile layer down and build a new one every time the date
          // window moved, which flashes the basemap through; setParams updates
          // it in place instead.
          key={layer.id}
          source={source}
          layers={layers}
          layer={layer}
          dateWindow={dateWindow}
          opacity={state[layer.id]?.opacity ?? 1}
          dispatch={dispatch}
        />
      ))}

      <WmsNoticeOverlay layers={layers} state={state} dateWindow={dateWindow} />
    </>
  );
}
