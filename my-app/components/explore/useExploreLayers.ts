"use client";

/**
 * Layer state for the standalone data explorer, independent of any topic or run.
 *
 * `useWmsLayers` (components/map/WmsLayerControl.tsx) filters a source's
 * registry down to the layers one topic offers, because the results screen it
 * was built for is always inside a run for a specific topic. The explorer has
 * no topic and no run: it shows every layer a source publishes, so it reads
 * `resolution.source.layers` directly rather than going through
 * `layersForSource`.
 *
 * The date window is fixed, wide, and always ends today. `resolveLayerTime`
 * (services/wms/time.ts) picks the LATEST covered day inside a window, so
 * `{ start: EPOCH, end: today }` is what makes every layer resolve to its own
 * most recent available date with no date picker needed. A narrower window
 * (e.g. today/today) would show "unavailable" on first load for nearly every
 * layer here, since none of the registered archives cover the literal current
 * date.
 */

import { useMemo, useReducer } from "react";
import {
  initialPanelState,
  resolveSourceFromEnv,
  wmsPanelReducer,
  type WmsDateWindow,
} from "@/services/wms";
import type { WmsLayersBinding } from "@/components/map/WmsLayerControl";

/**
 * Earlier than any registered layer's extent, so the window's start never
 * clips a real interval. Not year zero: `resolveLayerTime` does a lexical
 * comparison of `yyyy-mm-dd` strings, and a normal-looking date keeps that
 * comparison doing what it looks like it does.
 */
const EARLIEST = "2000-01-01";

/** Today, UTC, as `yyyy-mm-dd`. Recomputed per render is fine: it is a string compare, not a clock. */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function exploreDateWindow(): WmsDateWindow {
  return { start: EARLIEST, end: todayIso() };
}

export function useExploreLayers(): WmsLayersBinding {
  // Empty dependency list: NEXT_PUBLIC_* values are baked into the bundle at
  // build time and cannot change while the page is open. See useWmsLayers for
  // the same reasoning.
  const resolution = useMemo(() => resolveSourceFromEnv(), []);
  const layers = resolution.source.layers;
  const [state, dispatch] = useReducer(wmsPanelReducer, layers, initialPanelState);

  return { resolution, layers, state, dispatch };
}
