"use client";

/**
 * The data explorer's map, on MapLibre GL.
 *
 * Client-only, loaded through next/dynamic with ssr:false by ExploreView,
 * because MapLibre needs WebGL and `window` the moment it is imported.
 *
 * The explorer is the one map in the app on MapLibre; the topic screens stay
 * on Leaflet, whose drawing tools (Geoman) they depend on. MapLibre is here
 * for the stack: every overlay is a style layer with an explicit position, so
 * "move this layer up" is one `moveLayer` call, and opacity and visibility are
 * paint and layout properties rather than DOM opacity on a tile pane.
 *
 * Vector layers are drawn twice over, on purpose. The picture is still
 * GeoServer's WMS rendering, so the layer looks exactly as its SLD says; on top
 * of it sits the same layer's WFS features as GeoJSON, painted fully
 * transparent, which is what a click lands on. A click on a feature outlines it
 * and opens a popup of its attributes. Rasters and NASA imagery have no
 * features and no popup.
 *
 * The map does not own the stack. LayerStack (services/explore/stack.ts) is
 * the single source of truth, TOP FIRST, and the sync effect below makes the
 * style match it after every change: add what is missing, drop what was
 * removed, set opacity and visibility, then re-stack bottom to top.
 */

import { useEffect, useRef, useState } from "react";
import maplibregl, {
  type ExpressionSpecification,
  type Map as MapLibreMap,
  type MapGeoJSONFeature,
  type StyleSpecification,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import { BasemapSwitch, MapLegend } from "@/components/explore/MapOverlays";
import { CountBadge } from "@/components/ui/CountBadge";
import { LayerDiagonal16Regular } from "@/components/ui/icons";
import { KENYA_BOUNDS } from "@/components/map/tools";
import {
  featureName,
  popupRows,
  type ExploreLayer,
  type LayerStack,
  type StackAction,
} from "@/services/explore";

export type Basemap = "street" | "satellite";

export interface FocusRequest {
  bounds: readonly [number, number, number, number];
  /** Changes on every request, so asking for the same layer twice still flies. */
  nonce: number;
}

export interface ExploreMapLibreProps {
  layers: ReadonlyMap<string, ExploreLayer>;
  stack: LayerStack;
  dispatch: (action: StackAction) => void;
  basemap: Basemap;
  onBasemap: (basemap: Basemap) => void;
  focus: FocusRequest | null;
  /** Scrolls to the layer panel, for the phone layout where it is below. */
  onShowLayers: () => void;
}

/** KENYA_BOUNDS is Leaflet's [lat, lng] pairs; MapLibre wants [lng, lat]. */
const KENYA: [[number, number], [number, number]] = [
  [KENYA_BOUNDS[0][1], KENYA_BOUNDS[0][0]],
  [KENYA_BOUNDS[1][1], KENYA_BOUNDS[1][0]],
];

const sourceId = (id: string) => `src:${id}`;
const layerId = (id: string) => `lyr:${id}`;
const fromSourceId = (src: string) => (src.startsWith("src:") ? src.slice(4) : null);
const featureSourceId = (id: string) => `fsrc:${id}`;
const fromFeatureSourceId = (src: string) => (src.startsWith("fsrc:") ? src.slice(5) : null);

/** The click targets: transparent copies of the features, one per geometry kind. */
const HIT_KINDS = ["hit-fill", "hit-line", "hit-point"] as const;
/** The outline drawn round the clicked feature. */
const HIGHLIGHT_KINDS = ["hl-fill", "hl-line", "hl-point"] as const;
const hitLayerIds = (id: string) => HIT_KINDS.map((kind) => `${kind}:${id}`);
/** Every style layer one stack entry owns, bottom to top. */
const styleLayerIds = (id: string) => [
  layerId(id),
  ...HIGHLIGHT_KINDS.map((kind) => `${kind}:${id}`),
  ...hitLayerIds(id),
];

/** `Polygon` and `MultiPolygon` alike: the Rangelands layers are all Multi*. */
const isGeometry = (...types: string[]): ExpressionSpecification => [
  "match",
  ["geometry-type"],
  types,
  true,
  false,
];
const POLYGONS = isGeometry("Polygon", "MultiPolygon");
const LINES = isGeometry("LineString", "MultiLineString");
const POINTS = isGeometry("Point", "MultiPoint");
const SELECTED: ExpressionSpecification = ["boolean", ["feature-state", "selected"], false];
/**
 * Fluent's magenta. Chosen against the layers actually published: the rivers
 * are blue, the ward boundaries orange, the riparian extent grey, the basemap
 * greens and blues. Magenta is none of them, so the clicked feature stands out
 * whatever it sits on.
 */
const HIGHLIGHT = "#e3008c";

/*
 * MapLibre's own controls and popups, put on the app's tokens.
 *
 * maplibre-gl.css is unlayered and Tailwind's utilities live in a cascade
 * layer, and an unlayered rule beats a layered one whatever its specificity.
 * So every rule here that overrides a MapLibre declaration carries `!`
 * (an important layered declaration does win). Utility classes rather than
 * globals.css, which this unit does not own.
 */
const CONTROL_SKIN = [
  "font-sans!",
  "[&_.maplibregl-ctrl-group]:rounded-fluent-large!",
  "[&_.maplibregl-ctrl-group]:shadow-8!",
  "[&_.maplibregl-ctrl-group]:border",
  "[&_.maplibregl-ctrl-group]:border-edge",
  "[&_.maplibregl-ctrl-group]:overflow-hidden",
  "[&_.maplibregl-ctrl-group_button]:size-8!",
  "[&_.maplibregl-ctrl-scale]:type-caption1!",
  "[&_.maplibregl-ctrl-scale]:text-ink-muted!",
  "[&_.maplibregl-ctrl-scale]:border-ink-faint!",
  "[&_.maplibregl-ctrl-attrib]:type-caption1!",
].join(" ");

const POPUP_SKIN = [
  "[&_.maplibregl-popup-content]:rounded-fluent-large!",
  "[&_.maplibregl-popup-content]:shadow-16!",
  "[&_.maplibregl-popup-content]:px-3!",
  "[&_.maplibregl-popup-content]:py-2.5!",
  "[&_.maplibregl-popup-close-button]:top-1.5!",
  "[&_.maplibregl-popup-close-button]:right-1.5!",
  "[&_.maplibregl-popup-close-button]:size-7",
  "[&_.maplibregl-popup-close-button]:rounded-fluent-medium!",
  "[&_.maplibregl-popup-close-button]:type-body1!",
  "[&_.maplibregl-popup-close-button]:text-ink-muted",
  "[&_.maplibregl-popup-close-button:hover]:bg-surface-subtle!",
].join(" ");

const BASE_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    street: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      maxzoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    },
    satellite: {
      type: "raster",
      tiles: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      ],
      tileSize: 256,
      maxzoom: 19,
      attribution: "Imagery &copy; Esri, Maxar, Earthstar Geographics",
    },
  },
  layers: [
    { id: "base:street", type: "raster", source: "street" },
    { id: "base:satellite", type: "raster", source: "satellite", layout: { visibility: "none" } },
  ],
};

/** What a failed tile says, in words. MapLibre's own message is the detail. */
function tileFailure(layer: ExploreLayer | undefined, detail: string): string {
  const name = layer?.title ?? "This layer";
  return `${name} did not load from ${layer?.sourceLabel ?? "its server"}. ${detail}`.trim();
}

function addFeatureLayers(map: MapLibreMap, id: string, url: string): void {
  const source = featureSourceId(id);
  // generateId: GeoServer's ids are strings ("rivers.12"), and feature state,
  // which the highlight reads, needs a number.
  map.addSource(source, { type: "geojson", data: url, generateId: true });
  map.addLayer({
    id: `hl-fill:${id}`,
    type: "line",
    source,
    filter: POLYGONS,
    paint: { "line-color": HIGHLIGHT, "line-width": 3, "line-opacity": ["case", SELECTED, 1, 0] },
  });
  map.addLayer({
    id: `hl-line:${id}`,
    type: "line",
    source,
    filter: LINES,
    paint: { "line-color": HIGHLIGHT, "line-width": 5, "line-opacity": ["case", SELECTED, 1, 0] },
  });
  map.addLayer({
    id: `hl-point:${id}`,
    type: "circle",
    source,
    filter: POINTS,
    paint: {
      "circle-radius": 8,
      "circle-opacity": 0,
      "circle-stroke-color": HIGHLIGHT,
      "circle-stroke-width": 3,
      "circle-stroke-opacity": ["case", SELECTED, 1, 0],
    },
  });
  // Transparent, not hidden: a layer with visibility "none" cannot be queried,
  // one painted at opacity 0 can. Lines and points get a generous hit width,
  // because a 1px river is not something anyone can click.
  map.addLayer({
    id: `hit-fill:${id}`,
    type: "fill",
    source,
    filter: POLYGONS,
    paint: { "fill-color": "#000000", "fill-opacity": 0 },
  });
  map.addLayer({
    id: `hit-line:${id}`,
    type: "line",
    source,
    filter: LINES,
    paint: { "line-color": "#000000", "line-width": 12, "line-opacity": 0 },
  });
  map.addLayer({
    id: `hit-point:${id}`,
    type: "circle",
    source,
    filter: POINTS,
    paint: { "circle-radius": 9, "circle-opacity": 0 },
  });
}

/** The popup, as DOM built from text nodes: attribute values are never HTML. */
function popupContent(layer: ExploreLayer | undefined, feature: MapGeoJSONFeature): HTMLElement {
  const properties = (feature.properties ?? {}) as Record<string, unknown>;
  const root = document.createElement("div");
  root.dataset.testid = "feature-popup";
  root.className = "max-h-72 overflow-y-auto pr-5";

  const eyebrow = document.createElement("p");
  eyebrow.className = "eyebrow text-ink-faint";
  eyebrow.textContent = layer?.title ?? "Feature";
  root.append(eyebrow);

  const name = featureName(properties);
  if (name !== null) {
    const heading = document.createElement("p");
    heading.className = "type-body1 font-semibold text-ink";
    heading.textContent = name;
    root.append(heading);
  }

  const rows = popupRows(properties);
  if (rows.length === 0) {
    const empty = document.createElement("p");
    empty.className = "type-caption1 mt-1 text-ink-faint";
    empty.textContent = "This feature has no attribute values.";
    root.append(empty);
    return root;
  }
  const table = document.createElement("dl");
  table.className = "type-caption1 mt-1.5";
  // Inline rather than utility classes: this DOM is built outside React, and
  // a grid template is the one rule here that must not silently fall away.
  Object.assign(table.style, {
    display: "grid",
    gridTemplateColumns: "auto 1fr",
    columnGap: "0.75rem",
    rowGap: "0.125rem",
    margin: "0.375rem 0 0",
  });
  for (const row of rows) {
    const key = document.createElement("dt");
    key.className = "font-mono text-ink-faint";
    key.textContent = row.key;
    const value = document.createElement("dd");
    value.className = "break-words text-ink";
    value.style.margin = "0";
    value.textContent = row.value;
    table.append(key, value);
  }
  root.append(table);
  return root;
}

export default function ExploreMapLibre({
  layers,
  stack,
  dispatch,
  basemap,
  onBasemap,
  focus,
  onShowLayers,
}: ExploreMapLibreProps) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [ready, setReady] = useState(false);
  const [view, setView] = useState({ lat: 0.35, lng: 37.95, zoom: 6 });
  /** Per layer, why its features did not load, so a dead click is explained. */
  const [featureErrors, setFeatureErrors] = useState<Readonly<Record<string, string>>>({});

  // The latest props, for the map's own event handlers, which are bound once.
  const layersRef = useRef(layers);
  const dispatchRef = useRef(dispatch);
  const stackRef = useRef(stack);
  useEffect(() => {
    layersRef.current = layers;
    dispatchRef.current = dispatch;
    stackRef.current = stack;
  }, [layers, dispatch, stack]);

  // The open popup and the feature it outlines, so either can be cleared.
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const selectedRef = useRef<{ source: string; id: string | number } | null>(null);

  /* ------------------------------------------------------------ create */
  useEffect(() => {
    if (container.current === null) return;
    const map = new maplibregl.Map({
      container: container.current,
      style: BASE_STYLE,
      bounds: KENYA,
      fitBoundsOptions: { padding: 16 },
      // Off until the pointer query below says this is a mouse or trackpad.
      scrollZoom: false,
      dragRotate: false,
    });
    map.touchZoomRotate.disableRotation();
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-left");
    map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-right");
    mapRef.current = map;

    const readView = () => {
      const c = map.getCenter();
      setView({ lat: c.lat, lng: c.lng, zoom: map.getZoom() });
    };
    map.on("moveend", readView);
    map.on("load", () => {
      readView();
      setReady(true);
    });

    // Tile status, per overlay. `isSourceLoaded` turns true once every tile
    // in view has arrived; an error carries the source it came from.
    map.on("sourcedata", (event) => {
      const id = fromSourceId(event.sourceId);
      if (id === null || !event.isSourceLoaded) return;
      dispatchRef.current({ type: "status", id, status: "ready" });
    });
    map.on("error", (event) => {
      const src = (event as unknown as { sourceId?: string }).sourceId;
      if (src === undefined) return;
      const featureLayer = fromFeatureSourceId(src);
      if (featureLayer !== null) {
        // The picture still draws from WMS; only the popups are lost.
        const title = layersRef.current.get(featureLayer)?.title ?? "This layer";
        const detail = event.error?.message ?? "";
        setFeatureErrors((previous) => ({
          ...previous,
          [featureLayer]:
            `${title}: its attributes did not load, so clicking it shows nothing. ${detail}`.trim(),
        }));
        return;
      }
      const id = fromSourceId(src);
      if (id === null) return;
      dispatchRef.current({
        type: "status",
        id,
        status: "error",
        errorMessage: tileFailure(layersRef.current.get(id), event.error?.message ?? ""),
      });
    });

    /* ------------------------------------------------- feature popups */
    const clearSelection = () => {
      const selected = selectedRef.current;
      if (selected !== null && map.getSource(selected.source) !== undefined) {
        map.setFeatureState(selected, { selected: false });
      }
      selectedRef.current = null;
    };
    /** Hit layers of the visible stack entries, top of the stack first. */
    const liveHitLayers = () => {
      const { order, entries } = stackRef.current;
      return order
        .filter((id) => entries[id]?.visible === true)
        .flatMap(hitLayerIds)
        .filter((hit) => map.getLayer(hit) !== undefined);
    };
    map.on("click", (event) => {
      const hitLayers = liveHitLayers();
      // Topmost first: MapLibre orders the result by render order.
      const [hit] =
        hitLayers.length === 0 ? [] : map.queryRenderedFeatures(event.point, { layers: hitLayers });
      popupRef.current?.remove();
      clearSelection();
      if (hit === undefined || hit.id === undefined) return;

      const stackId = hit.layer.id.slice(hit.layer.id.indexOf(":") + 1);
      const selected = { source: hit.source, id: hit.id };
      selectedRef.current = selected;
      map.setFeatureState(selected, { selected: true });
      const popup = new maplibregl.Popup({
        maxWidth: "min(320px, 80vw)",
        focusAfterOpen: false,
        className: POPUP_SKIN,
      })
        .setLngLat(event.lngLat)
        .setDOMContent(popupContent(layersRef.current.get(stackId), hit))
        .addTo(map);
      popup.on("close", () => {
        if (popupRef.current !== popup) return;
        clearSelection();
        popupRef.current = null;
      });
      popupRef.current = popup;
    });
    // A pointer over anything clickable, so the popups are discoverable.
    map.on("mousemove", (event) => {
      const hitLayers = liveHitLayers();
      const over =
        hitLayers.length > 0 &&
        map.queryRenderedFeatures(event.point, { layers: hitLayers }).length > 0;
      map.getCanvas().style.cursor = over ? "pointer" : "";
    });

    // Scroll-wheel zoom on desktops and laptops, off on touch screens: on a
    // phone one finger scrolls the page and pinch already zooms the map. Read
    // from the pointer, not the width, so a narrow desktop window still zooms.
    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    const applyPointer = () => {
      if (finePointer.matches) map.scrollZoom.enable();
      else map.scrollZoom.disable();
    };
    applyPointer();
    finePointer.addEventListener("change", applyPointer);

    // MapLibre tracks the window, not its container, and the container is
    // resized by the page layout. Without this the canvas keeps its first size.
    const observer = new ResizeObserver(() => map.resize());
    observer.observe(container.current);

    return () => {
      finePointer.removeEventListener("change", applyPointer);
      observer.disconnect();
      map.remove();
      mapRef.current = null;
      popupRef.current = null;
      selectedRef.current = null;
      setReady(false);
    };
  }, []);

  /* ----------------------------------------------------------- basemap */
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || map === null) return;
    map.setLayoutProperty("base:street", "visibility", basemap === "street" ? "visible" : "none");
    map.setLayoutProperty(
      "base:satellite",
      "visibility",
      basemap === "satellite" ? "visible" : "none",
    );
  }, [basemap, ready]);

  /* -------------------------------------------------------- stack sync */
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || map === null) return;

    // Drop overlays no longer in the stack, with their feature copies, and
    // the popup if it belonged to one of them.
    for (const styleLayer of map.getStyle().layers) {
      if (!styleLayer.id.startsWith("lyr:")) continue;
      const id = styleLayer.id.slice(4);
      if (stack.entries[id] !== undefined) continue;
      for (const owned of styleLayerIds(id)) {
        if (map.getLayer(owned) !== undefined) map.removeLayer(owned);
      }
      if (selectedRef.current?.source === featureSourceId(id)) {
        popupRef.current?.remove();
        popupRef.current = null;
        selectedRef.current = null;
      }
      for (const source of [sourceId(id), featureSourceId(id)]) {
        if (map.getSource(source) !== undefined) map.removeSource(source);
      }
    }

    // Add what is missing, and bring every overlay's paint up to date.
    for (const id of stack.order) {
      const layer = layers.get(id);
      const entry = stack.entries[id];
      if (layer === undefined || entry === undefined || layer.tiles === "") continue;

      if (map.getSource(sourceId(id)) === undefined) {
        map.addSource(sourceId(id), {
          type: "raster",
          tiles: [layer.tiles],
          tileSize: 256,
          attribution: layer.attribution,
          // Only request tiles where the layer has data. GeoServer answers an
          // empty transparent tile anywhere else, which is wasted round trips.
          ...(layer.bounds !== null ? { bounds: [...layer.bounds] } : {}),
        });
        map.addLayer({ id: layerId(id), type: "raster", source: sourceId(id) });
        if (layer.features !== null) addFeatureLayers(map, id, layer.features);
      }
      map.setPaintProperty(layerId(id), "raster-opacity", entry.opacity);
      // Hidden means hidden to clicks too: a layer you cannot see must not
      // answer for the one beneath it.
      for (const owned of styleLayerIds(id)) {
        if (map.getLayer(owned) !== undefined) {
          map.setLayoutProperty(owned, "visibility", entry.visible ? "visible" : "none");
        }
      }
    }

    // Re-stack: walk bottom to top, moving each entry's layers to the top in
    // turn. That leaves the first of `order` uppermost and keeps each entry's
    // highlight and click targets directly over its own picture. The basemaps
    // are never moved, so overlays always sit above them.
    for (const id of [...stack.order].reverse()) {
      for (const owned of styleLayerIds(id)) {
        if (map.getLayer(owned) !== undefined) map.moveLayer(owned);
      }
    }
  }, [stack, layers, ready]);

  /* ------------------------------------------------------------- focus */
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || map === null || focus === null) return;
    const [w, s, e, n] = focus.bounds;
    map.fitBounds(
      [
        [w, s],
        [e, n],
      ],
      { padding: 32, maxZoom: 14, duration: 600 },
    );
  }, [focus, ready]);

  const shownErrors = Object.entries(featureErrors).filter(
    ([id]) => stack.entries[id] !== undefined,
  );
  // The app's one readout format, shared with the wizard's map:
  // "0.35° N, 37.95° E · z6" (zoom to one decimal, a trailing .0 dropped).
  const lat = `${Math.abs(view.lat).toFixed(2)}° ${view.lat >= 0 ? "N" : "S"}`;
  const lng = `${Math.abs(view.lng).toFixed(2)}° ${view.lng >= 0 ? "E" : "W"}`;
  const zoom = Number(view.zoom.toFixed(1));

  return (
    <div className="relative h-full w-full">
      <div
        ref={container}
        className={`h-full w-full ${CONTROL_SKIN}`}
        data-testid="explore-maplibre"
      />
      {/*
        Two overlay columns, pointer events only on the cards themselves so
        the gaps between them still pan the map.

        Top right: on a phone the "Layers" jump (the panel is below the map),
        the basemap switch, and any feature-load problems. Clear of MapLibre's
        zoom buttons on the left (left-14) and its scale and attribution
        along the bottom.

        Bottom left: the legend, then the view readout under it. Below the
        zoom buttons (top-24). On a phone it starts one row up (bottom-9),
        clear of the attribution that runs along the bottom edge there and
        the scale bar above it on the right.
      */}
      <div className="pointer-events-none absolute top-3 right-3 bottom-16 left-14 z-map-overlay flex flex-col items-end gap-2 sm:bottom-12">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onShowLayers}
            className="type-caption1 pointer-events-auto inline-flex h-8 items-center gap-1.5 rounded-fluent-large border border-edge bg-surface px-2.5 font-semibold text-ink shadow-8 transition-colors duration-150 hover:bg-surface-subtle lg:hidden"
          >
            <LayerDiagonal16Regular aria-hidden="true" className="text-ink-muted" />
            Layers
            <CountBadge count={stack.order.length} />
          </button>
          <BasemapSwitch basemap={basemap} onBasemap={onBasemap} />
        </div>
        {shownErrors.length > 0 ? (
          <div role="status" className="w-64 max-w-full shrink-0 space-y-1">
            {shownErrors.map(([id, message]) => (
              <p
                key={id}
                className="type-caption1 rounded-fluent-large border border-warn bg-warn-soft px-2.5 py-1.5 text-warn shadow-8"
              >
                {message}
              </p>
            ))}
          </div>
        ) : null}
      </div>
      <div className="pointer-events-none absolute top-24 bottom-9 left-2 z-map-overlay flex max-w-[calc(100%_-_1rem)] flex-col items-start justify-end gap-2 sm:bottom-2">
        <MapLegend layers={layers} stack={stack} />
        <p
          data-testid="explore-map-view"
          data-lat={view.lat.toFixed(5)}
          data-lng={view.lng.toFixed(5)}
          data-zoom={view.zoom.toFixed(2)}
          role="status"
          aria-live="polite"
          className="type-caption1 shrink-0 rounded-fluent-large border border-edge bg-surface/90 px-2 py-1 font-mono text-ink-muted shadow-8"
        >
          {lat}, {lng} · z{zoom}
        </p>
      </div>
    </div>
  );
}
