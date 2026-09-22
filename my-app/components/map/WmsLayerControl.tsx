"use client";

/**
 * The WMS layer panel: one row per layer, with a toggle, an opacity slider, a
 * legend and a sentence saying which date is on screen.
 *
 * Deliberately free of Leaflet. Nothing in this file's module graph reads
 * `window`, so it can sit anywhere on the results page — beside the map, above
 * it on a narrow screen — without dragging the map's ssr:false boundary along
 * with it. `WmsLayers.tsx` is the half that must stay behind that boundary.
 *
 * It owns no rules either. `useWmsLayers` wires the reducer in services/wms/state.ts
 * to the registry in services/wms/layers.ts, and every sentence rendered here was
 * composed by a pure function in services/wms/ so its wording is asserted in node.
 */

import { useEffect, useMemo, useReducer, useRef, useState } from "react";

import type { TopicSlug } from "@/services/analysis/topics";
import {
  describeLayerTime,
  initialPanelState,
  layersForSource,
  legendFor,
  resolveLayerTime,
  resolveSourceFromEnv,
  wmsPanelReducer,
  type LegendSource,
  type SourceResolution,
  type WmsDateWindow,
  type WmsLayerSpec,
  type WmsPanelAction,
  type WmsPanelState,
} from "@/services/wms";

export interface WmsLayerControlProps {
  resolution: SourceResolution;
  layers: readonly WmsLayerSpec[];
  dateWindow: WmsDateWindow;
  state: WmsPanelState;
  dispatch: (action: WmsPanelAction) => void;
}

export interface WmsLayersBinding {
  resolution: SourceResolution;
  layers: readonly WmsLayerSpec[];
  state: WmsPanelState;
  dispatch: (action: WmsPanelAction) => void;
}

/**
 * Resolve the source, pick the topic's layers, and hold the panel state.
 *
 * Lives here rather than in services/wms because the services hold no React, and here
 * rather than in WmsLayers.tsx because importing that file pulls Leaflet into
 * whatever imports it. The results page calls this once and hands the same
 * `state` and `dispatch` to both halves, which is what keeps the map's notices
 * and the panel's rows in agreement.
 */
export function useWmsLayers(topic: TopicSlug): WmsLayersBinding {
  // Empty dependency list on purpose. `NEXT_PUBLIC_*` values are substituted
  // into the bundle at build time, so they cannot change while the page is
  // open; re-resolving each render would hand a new source object to every
  // memo downstream and rebuild the tile layers for nothing.
  const resolution = useMemo(() => resolveSourceFromEnv(), []);

  const layers = useMemo(
    () => layersForSource(resolution.source, topic),
    [resolution.source, topic],
  );

  const [state, dispatch] = useReducer(wmsPanelReducer, layers, initialPanelState);

  // Reset when the topic changes the layer list, and only then. Dispatching on
  // every run would replace the state object each render and undo the
  // analyst's toggles.
  const lastLayers = useRef(layers);
  useEffect(() => {
    if (lastLayers.current === layers) return;
    lastLayers.current = layers;
    dispatch({ type: "reset", layers });
  }, [layers]);

  return { resolution, layers, state, dispatch };
}

/**
 * The legend image, or the reason there is not one.
 *
 * The `onError` fallback is not belt and braces. A legend URL is either
 * something the server advertised, which can rot, or one derived for a
 * GeoServer whose administrator may have disabled GetLegendGraphic. Either way
 * the honest output is the sentence, never a browser's broken-image glyph.
 */
function Legend({ legend, title }: { legend: LegendSource; title: string }) {
  const [failed, setFailed] = useState(false);

  if (legend.kind === "none" || failed) {
    return (
      <p className="text-xs text-ink-faint">
        {legend.kind === "none"
          ? legend.reason
          : "The published legend image did not load."}
      </p>
    );
  }

  return (
    // A plain <img>, not next/image: the host is an external server chosen by
    // configuration, and next/image would need it listed in next.config.ts,
    // which would put every future KSA endpoint behind a build config edit.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={legend.url}
      alt={`Legend for ${title}`}
      // The declared intrinsic size reserves the box, so the row does not jump
      // when the image arrives. max-w-full keeps a 378px legend inside a
      // narrow panel.
      width={legend.kind === "published" ? legend.width : undefined}
      height={legend.kind === "published" ? legend.height : undefined}
      loading="lazy"
      onError={() => setFailed(true)}
      className="max-w-full rounded border border-edge bg-surface"
    />
  );
}

function LayerRow({
  layer,
  resolution,
  dateWindow,
  state,
  dispatch,
}: {
  layer: WmsLayerSpec;
  resolution: SourceResolution;
  dateWindow: WmsDateWindow;
  state: WmsPanelState;
  dispatch: (action: WmsPanelAction) => void;
}) {
  const entry = state[layer.id];
  const time = resolveLayerTime(layer, dateWindow);
  const legend = legendFor(resolution.source, layer);

  const toggleId = `wms-toggle-${layer.id}`;
  const opacityId = `wms-opacity-${layer.id}`;
  const describedBy = `wms-about-${layer.id}`;

  const visible = entry?.visible === true;
  const opacity = entry?.opacity ?? 1;
  const percent = Math.round(opacity * 100);

  return (
    <li className="border-t border-edge py-3 first:border-t-0 first:pt-0">
      <div className="flex items-start gap-2">
        <input
          id={toggleId}
          type="checkbox"
          checked={visible}
          onChange={() => dispatch({ type: "toggle", id: layer.id })}
          aria-describedby={describedBy}
          className="mt-0.5 size-4 shrink-0 accent-accent"
        />
        <div className="min-w-0 flex-1">
          <label htmlFor={toggleId} className="text-sm font-medium text-ink">
            {layer.title}
          </label>
          <p id={describedBy} className="mt-0.5 text-xs text-ink-muted">
            {layer.description}
          </p>
        </div>
      </div>

      {visible ? (
        <div className="mt-2 space-y-2 pl-6">
          {/* The date statement is the answer to "what am I looking at". It is
              rendered whether or not the layer resolved cleanly, because a
              clamped date is exactly as important to state as a missing one. */}
          <p
            className={
              time.kind === "unavailable"
                ? "text-xs text-warn"
                : "text-xs text-ink-faint"
            }
          >
            {describeLayerTime(time)}
          </p>

          {entry?.errorMessage !== null && entry?.errorMessage !== undefined ? (
            <p role="alert" className="text-xs text-danger">
              {entry.errorMessage}
            </p>
          ) : null}

          {time.kind === "unavailable" ? null : (
            <div className="flex items-center gap-2">
              <label htmlFor={opacityId} className="text-xs text-ink-muted">
                Opacity
              </label>
              <input
                id={opacityId}
                type="range"
                min={0}
                max={100}
                step={5}
                value={percent}
                onChange={(event) =>
                  dispatch({
                    type: "set-opacity",
                    id: layer.id,
                    opacity: Number(event.target.value) / 100,
                  })
                }
                // The value is also printed beside the slider, because a range
                // input communicates nothing to a reader who cannot see the
                // thumb position.
                aria-describedby={`${opacityId}-value`}
                className="h-1 flex-1 accent-accent"
              />
              <output
                id={`${opacityId}-value`}
                htmlFor={opacityId}
                className="w-9 text-right font-mono text-xs text-ink-muted"
              >
                {percent}%
              </output>
            </div>
          )}

          {time.kind === "unavailable" ? null : (
            <Legend legend={legend} title={layer.title} />
          )}
        </div>
      ) : null}
    </li>
  );
}

export default function WmsLayerControl({
  resolution,
  layers,
  dateWindow,
  state,
  dispatch,
}: WmsLayerControlProps) {
  const { source, problems } = resolution;

  return (
    <section
      data-testid="wms-layer-control"
      aria-labelledby="wms-layers-heading"
      className="rounded-lg border border-edge bg-surface p-4 shadow-card"
    >
      <h3 id="wms-layers-heading" className="text-sm font-semibold text-ink">
        Map layers
      </h3>
      <p className="mt-0.5 text-xs text-ink-faint">
        Satellite imagery from {source.label}, drawn over the basemap for the
        run&rsquo;s date window.
      </p>

      {/* A rejected NEXT_PUBLIC_WMS_* value is stated, never swallowed. An
          endpoint that quietly reverted to the default would be
          indistinguishable from a working deployment. */}
      {problems.length > 0 ? (
        <ul role="alert" className="mt-2 space-y-1">
          {problems.map((problem) => (
            <li
              key={problem}
              className="rounded border border-warn-border bg-warn-soft px-2 py-1.5 text-xs text-warn"
            >
              {problem}
            </li>
          ))}
        </ul>
      ) : null}

      {layers.length === 0 ? (
        // The designed empty state. Reached when a source is selected whose
        // layer registry has not been filled in yet, which is exactly where a
        // KSA deployment starts.
        <div className="mt-3 rounded border border-dashed border-edge-strong bg-sunken p-3">
          <p className="text-xs font-medium text-ink-muted">
            No layers are configured for this source.
          </p>
          <p className="mt-1 text-xs text-ink-faint">
            {source.note ??
              "Add entries to this source's layer registry in services/wms/layers.ts."}
          </p>
        </div>
      ) : (
        <fieldset className="mt-3">
          {/* A real legend on the checkbox group, so a screen reader announces
              what the eleven controls inside it belong to. */}
          <legend className="sr-only">Layers to show on the map</legend>
          <ul>
            {layers.map((layer) => (
              <LayerRow
                key={layer.id}
                layer={layer}
                resolution={resolution}
                dateWindow={dateWindow}
                state={state}
                dispatch={dispatch}
              />
            ))}
          </ul>
        </fieldset>
      )}

      <p className="mt-3 border-t border-edge pt-2 text-[11px] text-ink-faint">
        Source: {source.label} &middot;{" "}
        <span className="font-mono break-all">{source.endpoint}</span>
      </p>
    </section>
  );
}
