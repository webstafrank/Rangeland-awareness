/**
 * The layer panel's state machine.
 *
 * Pure, so the whole of "which layers are on, how transparent, and which one is
 * failing" is provable in node and the two React files stay adapters. Same
 * split, and same reason, as lib/analysis/selection.ts.
 */

import { resolveLayerTime } from "@/lib/wms/time";
import type { WmsDateWindow, WmsLayerSpec } from "@/lib/wms/types";

export type WmsTileStatus = "idle" | "loading" | "ready" | "error";

export interface WmsLayerState {
  visible: boolean;
  /** 0..1. Applied to the Leaflet tile layer, not to a CSS filter. */
  opacity: number;
  status: WmsTileStatus;
  /** Set only while `status` is "error". Rendered as words, never as a colour. */
  errorMessage: string | null;
}

export type WmsPanelState = Readonly<Record<string, WmsLayerState>>;

/**
 * An overlay starts partly transparent.
 *
 * A fully opaque NDVI layer hides the basemap completely, and the analyst then
 * cannot tell which county they are looking at, which is the one thing the
 * basemap is there for. 0.75 keeps roads and place names legible underneath
 * while the index still reads as a solid surface.
 */
export const DEFAULT_OPACITY = 0.75;

export type WmsPanelAction =
  | { type: "toggle"; id: string }
  | { type: "set-visible"; id: string; visible: boolean }
  | { type: "set-opacity"; id: string; opacity: number }
  | { type: "tile-loading"; id: string }
  | { type: "tile-ready"; id: string }
  | { type: "tile-error"; id: string; message: string }
  | { type: "reset"; layers: readonly WmsLayerSpec[] };

/** Keep an opacity inside 0..1, and never let a NaN through to Leaflet. */
export function clampOpacity(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_OPACITY;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/**
 * The starting state for a topic's layers.
 *
 * Only the first layer is on. Turning all five on at once stacks NDVI under LST
 * under rainfall and the map reads as mud; the registry order already says
 * which layer answers the topic's question first, so that is the one that
 * shows.
 */
export function initialPanelState(
  layers: readonly WmsLayerSpec[],
): WmsPanelState {
  const state: Record<string, WmsLayerState> = {};
  layers.forEach((layer, index) => {
    state[layer.id] = {
      visible: index === 0,
      opacity: DEFAULT_OPACITY,
      status: "idle",
      errorMessage: null,
    };
  });
  return state;
}

function withLayer(
  state: WmsPanelState,
  id: string,
  change: (layer: WmsLayerState) => WmsLayerState,
): WmsPanelState {
  const current = state[id];
  // An action for an unknown id is a no-op rather than a crash. Ids arrive from
  // Leaflet event handlers that can fire once more after a topic change has
  // already swapped the layer list out from under them.
  if (current === undefined) return state;

  const next = change(current);
  // The identity check has to be here, not only inside each branch. Every
  // branch below already returns `layer` unchanged for a no-op, and spreading
  // regardless would still hand React a new object and re-render the panel and
  // every tile layer under it on a slider that did not move.
  if (next === current) return state;

  return { ...state, [id]: next };
}

export function wmsPanelReducer(
  state: WmsPanelState,
  action: WmsPanelAction,
): WmsPanelState {
  switch (action.type) {
    case "toggle":
    case "set-visible":
      return withLayer(state, action.id, (layer) => {
        const visible =
          action.type === "toggle" ? !layer.visible : action.visible;
        if (visible === layer.visible) return layer;
        // Hiding drops the tile layer from the map, so its status and any
        // error belong to a request that no longer exists. Keeping the error
        // would make a layer the analyst switched off read as broken.
        return visible
          ? { ...layer, visible, status: "idle", errorMessage: null }
          : { ...layer, visible: false, status: "idle", errorMessage: null };
      });

    case "set-opacity":
      return withLayer(state, action.id, (layer) => {
        const opacity = clampOpacity(action.opacity);
        return opacity === layer.opacity ? layer : { ...layer, opacity };
      });

    case "tile-loading":
      return withLayer(state, action.id, (layer) =>
        // Do not clear an existing error here. Leaflet emits `loading` for
        // every pan, and clearing on each one would flicker the message off
        // and on again while a broken layer keeps failing.
        layer.status === "loading" ? layer : { ...layer, status: "loading" },
      );

    case "tile-ready":
      return withLayer(state, action.id, (layer) =>
        layer.status === "ready" && layer.errorMessage === null
          ? layer
          : { ...layer, status: "ready", errorMessage: null },
      );

    case "tile-error":
      return withLayer(state, action.id, (layer) =>
        layer.status === "error" && layer.errorMessage === action.message
          ? layer
          : { ...layer, status: "error", errorMessage: action.message },
      );

    case "reset":
      return initialPanelState(action.layers);
  }
}

/** The layers to actually render, in registry order. */
export function visibleLayers(
  layers: readonly WmsLayerSpec[],
  state: WmsPanelState,
): readonly WmsLayerSpec[] {
  return layers.filter((layer) => state[layer.id]?.visible === true);
}

/**
 * Something the analyst has to be told about a layer that is switched on.
 *
 * `problem` is a layer that asked for tiles and did not get them; the map
 * shows the basemap where imagery should be. `coverage` is a layer that was
 * never asked, because the run's date window falls outside everything the
 * server publishes for it.
 *
 * Both are computed here rather than in the components so the wording an
 * analyst reads is asserted in node, and so the map overlay and the side panel
 * cannot drift into saying different things about the same layer.
 */
export interface WmsNotice {
  layerId: string;
  layerTitle: string;
  kind: "problem" | "coverage";
  text: string;
}

export function panelNotices(
  layers: readonly WmsLayerSpec[],
  state: WmsPanelState,
  window: WmsDateWindow,
): readonly WmsNotice[] {
  const notices: WmsNotice[] = [];

  for (const layer of layers) {
    const entry = state[layer.id];
    if (entry?.visible !== true) continue;

    if (entry.status === "error" && entry.errorMessage !== null) {
      notices.push({
        layerId: layer.id,
        layerTitle: layer.title,
        kind: "problem",
        text: entry.errorMessage,
      });
      // One notice per layer. A layer that is both uncovered and erroring is
      // not a thing: an uncovered layer is never requested.
      continue;
    }

    const time = resolveLayerTime(layer, window);
    if (time.kind === "unavailable") {
      notices.push({
        layerId: layer.id,
        layerTitle: layer.title,
        kind: "coverage",
        text: `${layer.title}: ${time.reason}`,
      });
    }
  }

  return notices;
}

/** Every failing visible layer's message, deduplicated, in registry order. */
export function failureMessages(
  layers: readonly WmsLayerSpec[],
  state: WmsPanelState,
): readonly string[] {
  const seen = new Set<string>();
  for (const layer of layers) {
    const entry = state[layer.id];
    if (entry?.visible !== true) continue;
    if (entry.status !== "error" || entry.errorMessage === null) continue;
    seen.add(entry.errorMessage);
  }
  return [...seen];
}

/**
 * Draw order for a layer.
 *
 * The first entry in the list is the one the topic leads with, so it is drawn
 * on TOP and the list reads the way the stack looks. Leaflet's own default
 * would be insertion order, which puts the lead layer at the bottom and makes
 * toggling a second layer look like the first one vanished.
 */
export function layerZIndex(
  layers: readonly WmsLayerSpec[],
  id: string,
): number {
  const index = layers.findIndex((layer) => layer.id === id);
  if (index === -1) return 200;
  return 200 + (layers.length - index);
}
