"use client";

/**
 * The data explorer's layer panel: what is on the map, in stack order, and
 * every layer that could be, by category.
 *
 * Two sections because they answer two questions. "On the map" is the stack,
 * top first, with the controls that only make sense for a drawn layer: move
 * up, move down, hide, opacity, zoom to it, remove. "Layers" is the
 * catalogue, under its category headings, filterable, where a checkbox adds a
 * layer to the top of the stack or takes it off. Legends are on the map
 * itself (MapOverlays.tsx), beside what they explain.
 *
 * Moving is buttons, not drag. A drag handle is unusable from a keyboard and
 * fiddly on a trackpad, and two buttons per row make the order change an
 * announced, undoable step rather than a gesture.
 *
 * On a wide screen the panel is a docked column that scrolls inside itself,
 * with the catalogue's filter pinned to the top of that scroll once the stack
 * has gone by. On a phone it is part of the page and scrolls with it.
 */

import { useMemo, useState } from "react";
import { Input } from "@fluentui/react-components";

import { CountBadge } from "@/components/ui/CountBadge";
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
  LayerDiagonal20Regular,
  Search16Regular,
  ZoomFit16Regular,
} from "@/components/ui/icons";
import {
  filterExploreLayers,
  groupByCategory,
  type ExploreLayer,
  type LayerStack,
  type StackAction,
  type StackEntry,
} from "@/services/explore";
import type { CatalogStatus } from "@/components/explore/useExploreCatalog";

export interface LayerPanelProps {
  layers: readonly ExploreLayer[];
  layersById: ReadonlyMap<string, ExploreLayer>;
  ksaStatus: CatalogStatus;
  stack: LayerStack;
  dispatch: (action: StackAction) => void;
  onFocus: (layer: ExploreLayer) => void;
  /** Scrolls back up to the map, for the phone layout where it is above. */
  onShowMap: () => void;
}

/** 32px square: the shell's --layout-target-min, the smallest hit target. */
const iconButton =
  "inline-flex size-8 shrink-0 items-center justify-center rounded-fluent-medium text-ink-muted " +
  "transition-colors duration-150 hover:bg-surface-subtle hover:text-ink active:bg-sunken " +
  "disabled:pointer-events-none disabled:opacity-35";

const textButton =
  "type-caption1 inline-flex items-center gap-1 rounded-fluent-small font-semibold text-accent-link hover:underline";

function StatusBadge({ entry }: { entry: StackEntry }) {
  if (!entry.visible) {
    return (
      <span className="type-caption1 inline-flex items-center gap-1 text-ink-faint">
        <EyeOff16Regular aria-hidden="true" />
        Hidden
      </span>
    );
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
  const percent = Math.round(entry.opacity * 100);
  const opacityId = `stack-opacity-${layer.id}`;

  return (
    <li
      data-testid="stack-row"
      data-layer-id={layer.id}
      className={`rounded-fluent-large border bg-surface p-2.5 ${
        entry.status === "error" && entry.visible ? "border-danger" : "border-edge"
      }`}
    >
      <div className="flex items-start gap-2">
        {/* Its place in the stack, 1 on top, so the order reads at a glance. */}
        <span
          aria-hidden="true"
          className="type-caption1 mt-0.5 grid size-5 shrink-0 place-items-center rounded-fluent-small bg-sunken font-semibold text-ink-muted tabular-nums"
        >
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <p
            className={`type-body1 font-semibold break-words ${entry.visible ? "text-ink" : "text-ink-muted"}`}
          >
            {layer.title}
          </p>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2">
            <StatusBadge entry={entry} />
            <span className="type-caption1 text-ink-faint">{layer.category}</span>
          </div>
        </div>
      </div>

      {entry.errorMessage !== null ? (
        <p role="alert" className="type-caption1 mt-1.5 text-danger">
          {entry.errorMessage}
        </p>
      ) : null}
      {layer.timeNote !== null ? (
        <p className="type-caption1 mt-1.5 text-ink-faint">{layer.timeNote}</p>
      ) : null}

      <div className="mt-2 flex items-center gap-2">
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

      {/* The row's toolbar: zoom on the left, order / visibility / remove on
          the right, so the destructive one sits at the end. */}
      <div className="mt-1.5 flex items-center gap-0.5 border-t border-edge pt-1.5">
        {layer.bounds !== null ? (
          <button type="button" onClick={() => onFocus(layer)} className={`${textButton} mr-auto`}>
            <ZoomFit16Regular aria-hidden="true" />
            Zoom to layer
          </button>
        ) : (
          <span className="mr-auto" />
        )}
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
    <li className="flex items-start gap-2.5 py-2">
      <input
        id={toggleId}
        type="checkbox"
        checked={on}
        disabled={unavailable && !on}
        onChange={() => dispatch({ type: on ? "remove" : "add", id: layer.id })}
        aria-describedby={aboutId}
        className="mt-0.5 size-4 shrink-0 cursor-pointer accent-accent disabled:cursor-not-allowed"
      />
      <div className="min-w-0 flex-1">
        <label
          htmlFor={toggleId}
          className={`type-body1 cursor-pointer ${unavailable && !on ? "text-ink-muted" : "text-ink"}`}
        >
          {layer.title}
        </label>
        <p id={aboutId} className="type-caption1 mt-0.5 text-ink-faint">
          {unavailable ? layer.unavailable : layer.description}
          <span className="block">From {layer.sourceLabel}</span>
        </p>
      </div>
    </li>
  );
}

/** The KSA catalogue's state, said once, in words, above the list it affects. */
function CatalogStatusNote({ status }: { status: CatalogStatus }) {
  if (status.kind === "loading") {
    return (
      <p role="status" className="type-caption1 flex items-center gap-1.5 text-ink-faint">
        <ArrowSync16Regular aria-hidden="true" />
        Loading the KSA GeoServer layers&hellip;
      </p>
    );
  }
  if (status.kind === "error") {
    return (
      <Notice intent="warning" title="KSA layers unavailable.">
        {status.message} NASA layers are still available.
      </Notice>
    );
  }
  if (status.stale) {
    return (
      <Notice intent="warning" title="Catalogue may be out of date.">
        GeoServer did not answer, so this is the last list the backend saw. New layers may be
        missing.
      </Notice>
    );
  }
  return null;
}

export function LayerPanel({
  layers,
  layersById,
  ksaStatus,
  stack,
  dispatch,
  onFocus,
  onShowMap,
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
    <section aria-label="Map layers" className="text-ink lg:h-full lg:overflow-y-auto">
      {/* ---------------------------------------------------- on the map */}
      <section aria-labelledby="stack-heading" className="px-gutter py-4 lg:px-4">
        <div className="flex items-center justify-between gap-2">
          <h2 id="stack-heading" className="type-subtitle2 flex items-center gap-2 text-ink">
            On the map
            <CountBadge count={stack.order.length} />
          </h2>
          <div className="flex items-center gap-3">
            {stack.order.length > 0 ? (
              <button type="button" onClick={() => dispatch({ type: "clear" })} className={textButton}>
                Clear all
              </button>
            ) : null}
            {/* Phone only: the map is above this panel, out of view. */}
            <button type="button" onClick={onShowMap} className={`${textButton} lg:hidden`}>
              <ArrowUp16Regular aria-hidden="true" />
              Back to map
            </button>
          </div>
        </div>
        {stack.order.length === 0 ? (
          <div className="mt-2.5 flex items-start gap-3 rounded-fluent-large border border-dashed border-edge-strong px-3 py-3">
            <span
              aria-hidden="true"
              className="grid size-8 shrink-0 place-items-center rounded-fluent-medium bg-sunken text-ink-faint"
            >
              <LayerDiagonal20Regular />
            </span>
            <p className="type-caption1 text-ink-muted">
              Nothing on the map yet. Tick a layer below to add it; the newest goes on top.
            </p>
          </div>
        ) : (
          <>
            <p className="type-caption1 mt-0.5 text-ink-faint">Top of the list is drawn on top.</p>
            <ol className="mt-2.5 space-y-2" aria-label="Layers on the map, top first">
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
          </>
        )}
      </section>

      {/* ----------------------------------------------------- catalogue */}
      <section aria-labelledby="catalog-heading" className="border-t border-edge">
        {/* Pinned to the top of the panel's own scroll on a wide screen, so
            the filter is in reach however far down the list has gone. It
            needs a z-index because the rotated chevrons and the Notice below
            it paint on the positioned layer too; z-map-overlay is the app's
            named "over content, under the chrome" step. */}
        <div className="bg-surface px-gutter pt-4 pb-2 lg:sticky lg:top-0 lg:z-map-overlay lg:px-4">
          <h2 id="catalog-heading" className="type-subtitle2 text-ink">
            Layers
          </h2>
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
        </div>

        <div className="space-y-2.5 px-gutter pb-5 lg:px-4">
          <CatalogStatusNote status={ksaStatus} />

          {searching && shown.length === 0 ? (
            <p className="type-body1 rounded-fluent-large bg-surface-subtle px-3 py-3 text-ink-muted">
              No layers match &ldquo;{query.trim()}&rdquo;.
            </p>
          ) : null}

          {groups.length > 0 ? (
            <div className="divide-y divide-edge overflow-hidden rounded-fluent-large border border-edge">
              {groups.map((group) => (
                <details
                  key={group.category}
                  // Searching opens every group, so a match is never hidden in
                  // a collapsed heading.
                  open={searching ? true : undefined}
                  className="group"
                  data-testid="category"
                >
                  {/* An empty category is drawn quieter (lighter label, a
                      zero badge) so the ones with layers stand out, but it
                      keeps its place in the configured order: the order is
                      the catalogue's, and E1 pins it. */}
                  <summary
                    className={`type-body1 flex cursor-pointer list-none items-center gap-2 px-3 transition-colors duration-150 hover:bg-surface-subtle [&::-webkit-details-marker]:hidden ${
                      group.layers.length === 0
                        ? "py-1.5 text-ink-faint"
                        : "py-2 font-semibold text-ink"
                    }`}
                  >
                    <ChevronDown16Regular
                      aria-hidden="true"
                      className="shrink-0 -rotate-90 text-ink-faint transition-transform duration-150 group-open:rotate-0"
                    />
                    {group.category}
                    <CountBadge count={group.layers.length} className="ml-auto" />
                  </summary>
                  {group.layers.length === 0 ? (
                    <p className="type-caption1 border-t border-edge bg-surface-subtle px-3 py-2.5 text-ink-faint">
                      No layers published in this category yet.
                    </p>
                  ) : null}
                  <ul
                    className="divide-y divide-edge border-t border-edge px-3 empty:hidden"
                    data-testid="catalog-list"
                  >
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
          ) : null}
        </div>
      </section>
    </section>
  );
}
