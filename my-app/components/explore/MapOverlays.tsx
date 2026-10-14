"use client";

/**
 * The explorer's on-map furniture, drawn over the MapLibre canvas by
 * ExploreMapLibre: the basemap switch, the NASA satellite layers the
 * Satellite view offers, and the legend of every visible layer.
 *
 * Kept out of the map file because neither touches MapLibre. Both float on
 * the map's own tier (shadow-8, rounded-fluent-large, white), the same as
 * MapLibre's zoom buttons once ExploreMapLibre has skinned them.
 */

import { useMemo, useState } from "react";

import { CountBadge } from "@/components/ui/CountBadge";
import { ChevronDown16Regular, LayerDiagonal16Regular } from "@/components/ui/icons";
import {
  filterByHazard,
  hazardFor,
  isSatelliteLayer,
  type ExploreLayer,
  type ExploreLegend,
  type HazardView,
  type LayerStack,
  type StackAction,
} from "@/services/explore";
import type { Basemap } from "@/components/explore/ExploreMapLibre";

const FLOAT = "pointer-events-auto rounded-fluent-large border border-edge bg-surface shadow-8";

/** Street or satellite, as one segmented radio group. */
export function BasemapSwitch({
  basemap,
  onBasemap,
}: {
  basemap: Basemap;
  onBasemap: (basemap: Basemap) => void;
}) {
  return (
    <fieldset className={`${FLOAT} flex p-0.5`}>
      <legend className="sr-only">Basemap</legend>
      {(["street", "satellite"] as const).map((option) => (
        <label
          key={option}
          className={`type-caption1 cursor-pointer rounded-fluent-medium px-2.5 py-1 font-semibold transition-colors duration-150 has-focus-visible:outline-2 has-focus-visible:outline-accent ${
            basemap === option
              ? "bg-accent-soft text-accent"
              : "text-ink-muted hover:bg-surface-subtle hover:text-ink"
          }`}
        >
          <input
            type="radio"
            name="explore-basemap"
            value={option}
            checked={basemap === option}
            onChange={() => onBasemap(option)}
            className="sr-only"
          />
          {option === "street" ? "Street" : "Satellite"}
        </label>
      ))}
    </fieldset>
  );
}

/** The list's toggle, which the panel's "Show satellite layers" focuses. */
export const SATELLITE_LAYERS_ID = "explore-satellite-toggle";

/**
 * NASA's satellite layers, offered on the Satellite view and narrowed to the
 * hazard tab. A tick adds the layer to the top of the stack, exactly as the
 * panel's catalogue does for a KSA layer; from there it is in "On the map"
 * with the same controls, and stays drawn if the basemap goes back to Street.
 *
 * Collapsible, but open to start at every width, unlike the legend: it only
 * appears when Satellite is picked, which is asking for exactly this list.
 * Capped at under half the map's height, scrolling inside, so on a phone the
 * map stays visible and the legend's corner stays clear.
 */
export function SatelliteLayers({
  layers,
  stack,
  dispatch,
  hazard,
}: {
  layers: ReadonlyMap<string, ExploreLayer>;
  stack: LayerStack;
  dispatch: (action: StackAction) => void;
  hazard: HazardView;
}) {
  const [open, setOpen] = useState(true);
  const shown = useMemo(
    () => filterByHazard([...layers.values()].filter(isSatelliteLayer), hazard),
    [layers, hazard],
  );
  const onMap = shown.filter((layer) => stack.entries[layer.id] !== undefined).length;
  const forHazard = hazardFor(hazard);

  return (
    <section
      aria-label="Satellite layers"
      data-testid="satellite-layers"
      className={`${FLOAT} flex max-h-[45%] min-h-0 w-64 max-w-full flex-col overflow-hidden`}
    >
      <button
        id={SATELLITE_LAYERS_ID}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="explore-satellite-layers"
        className="type-caption1 flex w-full shrink-0 items-center gap-1.5 px-2.5 py-1.5 font-semibold text-ink hover:bg-surface-subtle"
      >
        <LayerDiagonal16Regular aria-hidden="true" className="text-ink-muted" />
        Satellite layers
        <CountBadge count={onMap} />
        <ChevronDown16Regular
          aria-hidden="true"
          className={`ml-auto text-ink-muted transition-transform duration-150 ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open ? (
        <div id="explore-satellite-layers" className="flex min-h-0 flex-col border-t border-edge">
          <p className="type-caption1 shrink-0 px-2.5 pt-1.5 text-ink-faint">
            NASA GIBS, clipped to Kenya
            {forHazard === undefined ? "" : `, for ${forHazard.label.toLowerCase()}`}.
          </p>
          <ul className="min-h-0 divide-y divide-edge overflow-y-auto px-2.5">
            {shown.map((layer) => {
              const on = stack.entries[layer.id] !== undefined;
              const unavailable = layer.unavailable !== null;
              const toggleId = `satellite-${layer.id}`;
              const aboutId = `satellite-about-${layer.id}`;
              return (
                <li key={layer.id} className="flex items-start gap-2 py-1.5">
                  <input
                    id={toggleId}
                    type="checkbox"
                    checked={on}
                    disabled={unavailable && !on}
                    onChange={() => dispatch({ type: on ? "remove" : "add", id: layer.id })}
                    aria-describedby={unavailable ? aboutId : undefined}
                    className="mt-0.5 size-4 shrink-0 cursor-pointer accent-accent disabled:cursor-not-allowed"
                  />
                  <div className="min-w-0 flex-1">
                    <label
                      htmlFor={toggleId}
                      className={`type-caption1 cursor-pointer font-semibold break-words ${unavailable && !on ? "text-ink-muted" : "text-ink"}`}
                    >
                      {layer.title}
                    </label>
                    {/* Titles only, so the card stays small over a phone's
                        map; the drawn date is in "On the map" once added. */}
                    {unavailable ? (
                      <p id={aboutId} className="type-caption1 text-ink-faint">
                        {layer.unavailable}
                      </p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

/** The legend image, or the reason there is none. Never a broken-image glyph. */
function LegendGraphic({ legend, title }: { legend: ExploreLegend; title: string }) {
  const [failed, setFailed] = useState(false);
  if (legend.kind === "none" || failed) {
    return (
      <p className="type-caption1 text-ink-faint">
        {legend.kind === "none" ? legend.reason : "No legend is published for this layer."}
      </p>
    );
  }
  return (
    // A plain <img>: the host is the backend or GIBS, chosen by configuration.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={legend.url}
      alt={`Legend for ${title}`}
      width={legend.width}
      height={legend.height}
      loading="lazy"
      onError={() => setFailed(true)}
      className="h-auto max-w-full"
    />
  );
}

/**
 * The key to what is drawn, for every visible layer in stack order, top
 * first, so the legend reads in the same order as the map and the panel.
 * Hidden layers are left out: a key to something not on screen misleads.
 *
 * Collapsible, and collapsed to start on a narrow map, where an open legend
 * would cover most of it. ExploreMapLibre is client-only (ssr:false), so
 * reading the width in the initial state cannot mismatch a server render.
 */
export function MapLegend({
  layers,
  stack,
}: {
  layers: ReadonlyMap<string, ExploreLayer>;
  stack: LayerStack;
}) {
  const [open, setOpen] = useState(
    () => typeof window === "undefined" || window.matchMedia("(min-width: 64rem)").matches,
  );
  const shown = stack.order
    .filter((id) => stack.entries[id]?.visible === true)
    .map((id) => layers.get(id))
    .filter((layer): layer is ExploreLayer => layer !== undefined);
  if (shown.length === 0) return null;

  return (
    <section
      aria-label="Map legend"
      className={`${FLOAT} flex max-h-full w-64 max-w-full min-h-0 flex-col overflow-hidden`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="explore-map-legend"
        className="type-caption1 flex w-full shrink-0 items-center gap-1.5 px-2.5 py-1.5 font-semibold text-ink hover:bg-surface-subtle"
      >
        <LayerDiagonal16Regular aria-hidden="true" className="text-ink-muted" />
        Legend
        <CountBadge count={shown.length} />
        <ChevronDown16Regular
          aria-hidden="true"
          className={`ml-auto text-ink-muted transition-transform duration-150 ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open ? (
        <ol
          id="explore-map-legend"
          className="min-h-0 divide-y divide-edge overflow-y-auto border-t border-edge"
        >
          {shown.map((layer) => (
            <li key={layer.id} className="px-2.5 py-2">
              <p className="type-caption1 mb-1 font-semibold break-words text-ink">{layer.title}</p>
              <LegendGraphic legend={layer.legend} title={layer.title} />
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
