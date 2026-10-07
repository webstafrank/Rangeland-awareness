"use client";

/**
 * The data explorer's layer panel: what is on the map, in stack order, and
 * every layer that could be, by category.
 *
 * Two lists because they answer two questions. "On the map" is the stack, top
 * first, with the controls that only make sense for a drawn layer: move up,
 * move down, hide, opacity, zoom to it, legend, remove. "Layers" is the
 * catalogue, under its category headings, filterable, where a checkbox adds a
 * layer to the top of the stack or takes it off.
 *
 * Moving is buttons, not drag. A drag handle is unusable from a keyboard and
 * fiddly on a trackpad, and two buttons per row make the order change an
 * announced, undoable step rather than a gesture.
 */

import { useMemo, useState } from "react";
import { Input } from "@fluentui/react-components";

import { Panel } from "@/components/ui/Panel";
import { Notice } from "@/components/ui/Notice";
import {
  ArrowDown16Regular,
  ArrowSync16Regular,
  ArrowUp16Regular,
  CheckmarkCircle16Regular,
  ChevronDown16Regular,
  Dismiss16Regular,
  ErrorCircle16Regular,
  Eye16Regular,
  EyeOff16Regular,
  Search16Regular,
  ZoomFit16Regular,
} from "@/components/ui/icons";
import {
  filterExploreLayers,
  groupByCategory,
  type ExploreLayer,
  type ExploreLegend,
  type LayerStack,
  type StackAction,
  type StackEntry,
} from "@/services/explore";
import type { CatalogStatus } from "@/components/explore/useExploreCatalog";
import type { Basemap } from "@/components/explore/ExploreMapLibre";

export interface LayerPanelProps {
  layers: readonly ExploreLayer[];
  layersById: ReadonlyMap<string, ExploreLayer>;
  ksaStatus: CatalogStatus;
  stack: LayerStack;
  dispatch: (action: StackAction) => void;
  basemap: Basemap;
  onBasemap: (basemap: Basemap) => void;
  onFocus: (layer: ExploreLayer) => void;
}

const iconButton =
  "inline-flex size-7 shrink-0 items-center justify-center rounded-fluent-medium text-ink-muted " +
  "hover:bg-page hover:text-ink active:bg-edge disabled:pointer-events-none disabled:opacity-35";

function StatusBadge({ entry }: { entry: StackEntry }) {
  if (!entry.visible) {
    return <span className="type-caption1 text-ink-faint">Hidden</span>;
  }
  if (entry.status === "loading") {
    return (
      <span className="type-caption1 inline-flex items-center gap-1 text-ink-faint">
        <ArrowSync16Regular className="animate-spin" aria-hidden="true" />
        Loading
      </span>
    );
  }
  if (entry.status === "error") {
    return (
      <span className="type-caption1 inline-flex items-center gap-1 text-danger">
        <ErrorCircle16Regular aria-hidden="true" />
        Failed
      </span>
    );
  }
  return (
    <span className="type-caption1 inline-flex items-center gap-1 text-success">
      <CheckmarkCircle16Regular aria-hidden="true" />
      Loaded
    </span>
  );
}

/** The legend image, or the reason there is none. Never a broken-image glyph. */
function Legend({ legend, title }: { legend: ExploreLegend; title: string }) {
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
      className="max-w-full rounded-fluent-medium border border-edge bg-surface"
    />
  );
}

function StackRow({
  layer,
  entry,
  index,
  count,
  dispatch,
  onFocus,
}: {
  layer: ExploreLayer;
  entry: StackEntry;
  index: number;
  count: number;
  dispatch: (action: StackAction) => void;
  onFocus: (layer: ExploreLayer) => void;
}) {
  const [showLegend, setShowLegend] = useState(false);
  const percent = Math.round(entry.opacity * 100);
  const opacityId = `stack-opacity-${layer.id}`;

  return (
    <li
      data-testid="stack-row"
      data-layer-id={layer.id}
      className="rounded-fluent-medium border border-edge bg-surface p-2"
    >
      <div className="flex items-start gap-1">
        <div className="min-w-0 flex-1 pl-1">
          <p className="type-body1 font-semibold break-words text-ink">{layer.title}</p>
          <div className="flex flex-wrap items-center gap-x-2">
            <StatusBadge entry={entry} />
            <span className="type-caption1 text-ink-faint">{layer.category}</span>
          </div>
        </div>
        <button
          type="button"
          className={iconButton}
          onClick={() => dispatch({ type: "move-up", id: layer.id })}
          disabled={index === 0}
          aria-label={`Move ${layer.title} up`}
          title="Move up"
        >
          <ArrowUp16Regular aria-hidden="true" />
        </button>
        <button
          type="button"
          className={iconButton}
          onClick={() => dispatch({ type: "move-down", id: layer.id })}
          disabled={index === count - 1}
          aria-label={`Move ${layer.title} down`}
          title="Move down"
        >
          <ArrowDown16Regular aria-hidden="true" />
        </button>
        <button
          type="button"
          className={iconButton}
          onClick={() => dispatch({ type: "toggle", id: layer.id })}
          aria-pressed={!entry.visible}
          aria-label={entry.visible ? `Hide ${layer.title}` : `Show ${layer.title}`}
          title={entry.visible ? "Hide" : "Show"}
        >
          {entry.visible ? <Eye16Regular aria-hidden="true" /> : <EyeOff16Regular aria-hidden="true" />}
        </button>
        <button
          type="button"
          className={iconButton}
          onClick={() => dispatch({ type: "remove", id: layer.id })}
          aria-label={`Remove ${layer.title} from the map`}
          title="Remove"
        >
          <Dismiss16Regular aria-hidden="true" />
        </button>
      </div>

      {entry.errorMessage !== null ? (
        <p role="alert" className="type-caption1 mt-1 pl-1 text-danger">
          {entry.errorMessage}
        </p>
      ) : null}
      {layer.timeNote !== null ? (
        <p className="type-caption1 mt-1 pl-1 text-ink-faint">{layer.timeNote}</p>
      ) : null}

      <div className="mt-1.5 flex items-center gap-2 pl-1">
        <label htmlFor={opacityId} className="type-caption1 text-ink-muted">
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
            dispatch({ type: "set-opacity", id: layer.id, opacity: Number(event.target.value) / 100 })
          }
          aria-describedby={`${opacityId}-value`}
          className="h-1 min-w-0 flex-1 accent-accent"
        />
        <output
          id={`${opacityId}-value`}
          htmlFor={opacityId}
          className="type-caption1 w-9 text-right text-ink-muted tabular-nums"
        >
          {percent}%
        </output>
      </div>

      <div className="mt-1 flex flex-wrap gap-x-3 pl-1">
        {layer.bounds !== null ? (
          <button
            type="button"
            onClick={() => onFocus(layer)}
            className="type-caption1 inline-flex items-center gap-1 text-accent hover:underline"
          >
            <ZoomFit16Regular aria-hidden="true" />
            Zoom to layer
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => setShowLegend((v) => !v)}
          aria-expanded={showLegend}
          className="type-caption1 inline-flex items-center gap-1 text-accent hover:underline"
        >
          <ChevronDown16Regular
            aria-hidden="true"
            className={showLegend ? "rotate-180 transition-transform" : "transition-transform"}
          />
          Legend
        </button>
      </div>
      {showLegend ? (
        <div className="mt-1.5 pl-1">
          <Legend legend={layer.legend} title={layer.title} />
        </div>
      ) : null}
    </li>
  );
}

function CatalogRow({
  layer,
  on,
  dispatch,
}: {
  layer: ExploreLayer;
  on: boolean;
  dispatch: (action: StackAction) => void;
}) {
  const toggleId = `catalog-${layer.id}`;
  const aboutId = `catalog-about-${layer.id}`;
  const unavailable = layer.unavailable !== null;
  return (
    <li className="flex items-start gap-2 py-1.5">
      <input
        id={toggleId}
        type="checkbox"
        checked={on}
        disabled={unavailable && !on}
        onChange={() => dispatch({ type: on ? "remove" : "add", id: layer.id })}
        aria-describedby={aboutId}
        className="mt-0.5 size-4 shrink-0 accent-accent"
      />
      <div className="min-w-0 flex-1">
        <label htmlFor={toggleId} className="type-body1 text-ink">
          {layer.title}
        </label>
        <p id={aboutId} className="type-caption1 text-ink-faint">
          {unavailable ? layer.unavailable : layer.description}
          <span className="block">From {layer.sourceLabel}</span>
        </p>
      </div>
    </li>
  );
}

export function LayerPanel({
  layers,
  layersById,
  ksaStatus,
  stack,
  dispatch,
  basemap,
  onBasemap,
  onFocus,
}: LayerPanelProps) {
  const [query, setQuery] = useState("");
  const shown = useMemo(() => filterExploreLayers(layers, query), [layers, query]);
  const searching = query.trim() !== "";
  // Every category while browsing, so the empty ones say what is coming;
  // only the matching ones while searching.
  const groups = useMemo(
    () => groupByCategory(shown, undefined, { includeEmpty: !searching }),
    [shown, searching],
  );

  return (
    <Panel as="section" title="Map layers" pad="tight" className="h-full overflow-y-auto">
      <div className="space-y-4">
        {/* -------------------------------------------------- basemap */}
        <fieldset className="flex items-center gap-2">
          <legend className="type-caption1 float-left mr-1 text-ink-muted">Basemap</legend>
          {(["street", "satellite"] as const).map((option) => (
            <label
              key={option}
              className={`type-caption1 cursor-pointer rounded-fluent-medium border px-2 py-1 ${
                basemap === option
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-edge text-ink-muted hover:bg-page"
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

        {/* ---------------------------------------------- on the map */}
        <section aria-labelledby="stack-heading">
          <div className="flex items-baseline justify-between gap-2">
            <h3 id="stack-heading" className="type-body1 font-semibold text-ink">
              On the map
              <span className="type-caption1 ml-1.5 font-normal text-ink-faint">
                {stack.order.length === 0 ? "" : `${stack.order.length}, top first`}
              </span>
            </h3>
            {stack.order.length > 0 ? (
              <button
                type="button"
                onClick={() => dispatch({ type: "clear" })}
                className="type-caption1 text-accent hover:underline"
              >
                Clear all
              </button>
            ) : null}
          </div>
          {stack.order.length === 0 ? (
            <p className="type-caption1 mt-1 text-ink-faint">
              Nothing yet. Tick a layer below to put it on the map; the newest goes on top.
            </p>
          ) : (
            <ol className="mt-2 space-y-2" aria-label="Layers on the map, top first">
              {stack.order.map((id, index) => {
                const layer = layersById.get(id);
                const entry = stack.entries[id];
                if (layer === undefined || entry === undefined) return null;
                return (
                  <StackRow
                    key={id}
                    layer={layer}
                    entry={entry}
                    index={index}
                    count={stack.order.length}
                    dispatch={dispatch}
                    onFocus={onFocus}
                  />
                );
              })}
            </ol>
          )}
        </section>

        {/* ------------------------------------------------ catalogue */}
        <section aria-labelledby="catalog-heading">
          <h3 id="catalog-heading" className="type-body1 font-semibold text-ink">
            Layers
          </h3>

          {ksaStatus.kind === "loading" ? (
            <p role="status" className="type-caption1 mt-1 text-ink-faint">
              Loading the KSA GeoServer layers&hellip;
            </p>
          ) : null}
          {ksaStatus.kind === "error" ? (
            <div className="mt-1.5">
              <Notice intent="warning">{ksaStatus.message} NASA layers are still available.</Notice>
            </div>
          ) : null}
          {ksaStatus.kind === "ready" && ksaStatus.stale ? (
            <div className="mt-1.5">
              <Notice intent="warning">
                GeoServer did not answer, so this is the last list the backend saw. New layers
                may be missing.
              </Notice>
            </div>
          ) : null}

          <div className="mt-2">
            <label htmlFor="explore-layer-filter" className="sr-only">
              Filter layers
            </label>
            <Input
              id="explore-layer-filter"
              type="search"
              placeholder="Filter layers"
              value={query}
              onChange={(_, data) => setQuery(data.value)}
              contentBefore={<Search16Regular aria-hidden="true" />}
              aria-describedby="explore-layer-filter-count"
              style={{ width: "100%" }}
            />
            <p
              id="explore-layer-filter-count"
              role="status"
              aria-live="polite"
              className="type-caption1 mt-1 text-ink-faint"
            >
              {searching
                ? `${shown.length} of ${layers.length} layers match`
                : `${layers.length} layers`}
            </p>
          </div>

          {searching && shown.length === 0 ? (
            <p className="type-body1 mt-2 text-ink-muted">
              No layers match &ldquo;{query.trim()}&rdquo;.
            </p>
          ) : null}

          <div className="mt-1 space-y-1">
            {groups.map((group) => (
              <details
                key={group.category}
                // Searching opens every group, so a match is never hidden in
                // a collapsed heading.
                open={searching ? true : undefined}
                className="group rounded-fluent-medium border border-edge"
                data-testid="category"
              >
                <summary className="type-body1 flex cursor-pointer list-none items-center gap-1.5 px-2 py-1.5 font-semibold text-ink hover:bg-page">
                  <ChevronDown16Regular
                    aria-hidden="true"
                    className="-rotate-90 transition-transform group-open:rotate-0"
                  />
                  {group.category}
                  <span className="type-caption1 ml-auto font-normal text-ink-faint">
                    {group.layers.length}
                  </span>
                </summary>
                {group.layers.length === 0 ? (
                  <p className="type-caption1 border-t border-edge px-2 py-2 text-ink-faint">
                    No layers published in this category yet.
                  </p>
                ) : null}
                <ul className="border-t border-edge px-2 empty:hidden" data-testid="catalog-list">
                  {group.layers.map((layer) => (
                    <CatalogRow
                      key={layer.id}
                      layer={layer}
                      on={stack.entries[layer.id] !== undefined}
                      dispatch={dispatch}
                    />
                  ))}
                </ul>
              </details>
            ))}
          </div>
        </section>
      </div>
    </Panel>
  );
}
