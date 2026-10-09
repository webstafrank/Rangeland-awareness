"use client";

/**
 * The explorer's on-map furniture, drawn over the MapLibre canvas by
 * ExploreMapLibre: the basemap switch and the legend of every visible layer.
 *
 * Kept out of the map file because neither touches MapLibre. Both float on
 * the map's own tier (shadow-8, rounded-fluent-large, white), the same as
 * MapLibre's zoom buttons once ExploreMapLibre has skinned them.
 */

import { useState } from "react";

import { CountBadge } from "@/components/ui/CountBadge";
import { ChevronDown16Regular, LayerDiagonal16Regular } from "@/components/ui/icons";
import type { ExploreLayer, ExploreLegend, LayerStack } from "@/services/explore";
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
