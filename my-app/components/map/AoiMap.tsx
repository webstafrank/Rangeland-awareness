"use client";

/**
 * The area-of-interest map.
 *
 * Client-only, and loaded through next/dynamic with ssr:false by MapPanel.tsx,
 * because Leaflet touches `window` at module scope. Importing this file from a
 * server component would crash the route.
 *
 * It owns no selection state. Everything it learns about the world arrives as
 * props from the reducer in services/analysis/selection.ts, and everything the user
 * does leaves as a callback. That is what keeps the interesting rules testable
 * in node: this file is a Leaflet adapter and nothing more.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  GeoJSON,
  MapContainer,
  Pane,
  Polygon,
  Polyline,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import type { Feature } from "geojson";
import {
  type AreaOfInterest,
  type DraftArea,
  type FocusRequest,
  draftAreaFromGeometry,
} from "@/services/analysis/selection";
import {
  KENYA_BOUNDS,
  MAP_TOOL_SPECS,
  TILE_LOADING,
  type MapTool,
} from "@/components/map/tools";
// Straight from the generated file, not the services/geo barrel, which also
// re-exports the 170KB county overview data this map does not use.
import { KENYA_OUTLINE } from "@/services/geo/data/kenya-outline.generated";
import { token } from "@/lib/theme/palette";
import { BasemapSwitch } from "@/components/explore/MapOverlays";
import type { Basemap } from "@/components/explore/ExploreMapLibre";

/*
 * Leaflet's controls on Explore's MapLibre skin (components/explore/
 * ExploreMapLibre.tsx CONTROL_SKIN): the zoom stack as one rounded-large
 * group with a hairline and shadow-8, 32px buttons, and the attribution in
 * caption type. The two maps do not share a library (this one is Leaflet,
 * for its plain GeoJSON layers and click handling), so they share a look.
 *
 * leaflet.css is unlayered and Tailwind's utilities sit in a cascade layer,
 * and an unlayered rule beats a layered one whatever its specificity, so
 * every override carries `!`.
 */
const CONTROL_SKIN = [
  "font-sans!",
  "[&_.leaflet-bar]:rounded-fluent-large!",
  "[&_.leaflet-bar]:border!",
  "[&_.leaflet-bar]:border-edge!",
  "[&_.leaflet-bar]:shadow-8!",
  "[&_.leaflet-bar]:overflow-hidden",
  "[&_.leaflet-bar_a]:size-8!",
  "[&_.leaflet-bar_a]:leading-8!",
  "[&_.leaflet-bar_a]:rounded-none!",
  "[&_.leaflet-control-attribution]:type-caption1!",
  "[&_.leaflet-control-attribution]:rounded-tl-fluent-medium",
].join(" ");

/**
 * A unit chosen in the By name boxes but not yet added: outlined dashed, so
 * it reads as "this is what Add would add", not as part of the selection.
 */
export interface MapPreview {
  /** The unit's id, so a new unit swaps the layer rather than restyling it. */
  id: string;
  feature: Feature;
  /** Where to fly, or null to outline it without moving the map. */
  focus: FocusRequest | null;
}

export interface AoiMapProps {
  areas: readonly AreaOfInterest[];
  focus: FocusRequest | null;
  tool: MapTool;
  /** The Identify place / Add point switch. Absent, the switch is not shown. */
  onTool?: (tool: MapTool) => void;
  onAddAreas: (areas: DraftArea[]) => void;
  onFocusArea: (id: string) => void;
  /** A click in identify mode, in lon/lat. */
  onIdentify?: (lon: number, lat: number) => void;
  preview?: MapPreview | null;
  /** One short line on the map: "Finding the place...", "Outside Kenya...". */
  note?: string | null;
}

/**
 * The accent, read from the theme rather than hardcoded.
 *
 * Leaflet paints SVG through JS options, not class names, so it needs a real
 * colour string and cannot take a Tailwind utility. Reading the same custom
 * property the utilities are generated from is what keeps this from becoming a
 * second palette that drifts from globals.css.
 *
 * The fallback comes from lib/theme/palette.ts rather than being typed as a
 * hex, and that is the point of it: a hardcoded fallback is a second palette
 * with a one-commit lifespan. The teal that used to sit here outlived the move
 * to navy, because nothing on screen could show it. `token()` throws on a name
 * that no longer exists, so a renamed accent breaks the build instead of
 * drawing last season's colour on the map.
 *
 * It is only reached when the property is missing, which in practice means the
 * stylesheet has not loaded.
 */
const ACCENT_FALLBACK = token("--color-accent");
const INK_FALLBACK = token("--color-ink");

function themeColor(name: "--color-accent" | "--color-ink", fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value === "" ? fallback : value;
}

const accentColor = () => themeColor("--color-accent", ACCENT_FALLBACK);

/** Style for selected geometry. Readable on street tiles and on imagery. */
function areaStyle(): L.PathOptions {
  const accent = accentColor();
  return {
    color: accent,
    weight: 2,
    opacity: 1,
    // Same hue as the stroke at low opacity, so the fill cannot drift to a
    // different navy from the outline that contains it.
    fillColor: accent,
    fillOpacity: 0.18,
  };
}

/**
 * Zoom to whatever the reducer last asked for.
 *
 * Keyed off `focus.token`, not `focus.bounds`. Re-selecting an area the user is
 * already looking at must still re-centre it, and identical bounds would make a
 * bounds-only dependency compare equal and skip the effect. See the focus token
 * note in services/analysis/README.md.
 */
function FocusController({ focus }: { focus: FocusRequest | null }) {
  const map = useMap();
  const lastToken = useRef<number | null>(null);
  const [arrived, setArrived] = useState("");
  const pending = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (focus === null) return;
    if (lastToken.current === focus.token) return;
    lastToken.current = focus.token;

    /*
     * Say where the map landed, once, when a flight to a selection ends.
     *
     * This is the feedback a screen reader user needs ("the map zoomed to
     * your selection"), and it is the ONLY map movement announced. The view
     * readout used to be a live region, which spoke on every pan and zoom the
     * user made themselves: noise that buried the one move worth hearing.
     * The text changes each time (the centre and zoom are in it), so a second
     * flight to the same place is still announced.
     */
    const announce = () => {
      const c = map.getCenter();
      setArrived(
        `Map moved to the selection: centre ${c.lat.toFixed(2)}, ` +
          `${c.lng.toFixed(2)}, zoom ${map.getZoom()}.`,
      );
    };
    // A newer flight replaces an unfinished one, and its announcement too.
    // Not an effect cleanup: the effect also re-runs when `focus` is a new
    // object with the same token, and that must not cancel a flight in the air.
    if (pending.current) map.off("moveend", pending.current);
    pending.current = announce;
    map.once("moveend", announce);

    map.flyToBounds(focus.bounds, {
      // Keep the fitted area clear of the floating controls.
      paddingTopLeft: [24, 24],
      paddingBottomRight: [24, 56],
      // A clicked point is padded to ~5.5km by padBounds, so this ceiling only
      // bites on very small shapes (a tiny urban ward, a 0km coordinate box),
      // where it stops a 20-level slam.
      maxZoom: 13,
      duration: 0.6,
    });
  }, [focus, map]);

  return (
    <p role="status" aria-live="polite" className="sr-only">
      {arrived}
    </p>
  );
}

/**
 * Show where the map currently is.
 *
 * Plain text, not a live region. It used to be role="status" aria-live, which
 * made a screen reader speak on every pan and zoom the user made themselves.
 * The move worth hearing, "the map zoomed to your selection", is announced
 * once per flight by FocusController instead. This stays readable at any time
 * in the reading order.
 *
 * It is also the only honest way to assert the zoom behaviour from a browser
 * test: Leaflet exposes its view on the map instance, not on the DOM, and
 * asserting on tile transforms would pin an implementation detail. The eval
 * reads this readout, which is real user-facing output rather than a test hook.
 */
function ViewReadout() {
  const map = useMap();
  const [view, setView] = useState(() => ({
    center: map.getCenter(),
    zoom: map.getZoom(),
  }));

  useMapEvents({
    moveend() {
      setView({ center: map.getCenter(), zoom: map.getZoom() });
    },
    zoomend() {
      setView({ center: map.getCenter(), zoom: map.getZoom() });
    },
  });

  const { center, zoom } = view;
  const lat = `${Math.abs(center.lat).toFixed(2)}° ${center.lat >= 0 ? "N" : "S"}`;
  const lng = `${Math.abs(center.lng).toFixed(2)}° ${center.lng >= 0 ? "E" : "W"}`;

  return (
    <p
      data-testid="map-view"
      data-lat={center.lat.toFixed(5)}
      data-lng={center.lng.toFixed(5)}
      data-zoom={zoom}
      // On a phone the attribution runs the full width of the bottom edge
      // (18px tall), so the readout stacks above it with 8px clear rather
      // than sitting on it. From sm the attribution keeps to the right and
      // the readout drops to the corner.
      className="type-caption1 pointer-events-none absolute bottom-[26px] left-2.5 z-map-overlay rounded-fluent-large border border-edge bg-surface/90 px-2 py-1 font-mono tabular-nums text-ink-muted shadow-8 sm:bottom-2.5"
    >
      {lat}, {lng} · z{Number(zoom.toFixed(1))}
    </p>
  );
}

/** Re-measure when the surrounding layout changes, or Leaflet renders grey. */
function ResizeController() {
  const map = useMap();

  useEffect(() => {
    const container = map.getContainer();
    // Leaflet caches the container size at init. In a flex or grid parent the
    // final size arrives after mount, and on a mobile breakpoint change it
    // changes again, so both need an explicit invalidateSize.
    const observer = new ResizeObserver(() =>
      map.invalidateSize({ pan: false }),
    );
    observer.observe(container);
    return () => observer.disconnect();
  }, [map]);

  return null;
}

/**
 * What a click does, by tool: identify names the place under it (the step
 * looks it up and fills the By name boxes); point adds the point itself.
 */
function ClickHandler({
  tool,
  onAddAreas,
  onIdentify,
}: {
  tool: MapTool;
  onAddAreas: (areas: DraftArea[]) => void;
  onIdentify?: (lon: number, lat: number) => void;
}) {
  useMapEvents({
    click(event) {
      // Leaflet gives lat/lng; GeoJSON wants lng/lat. The flip lives here and
      // in services/geo/bounds.ts, nowhere else.
      const { lat, lng } = event.latlng;
      if (tool === "identify") {
        onIdentify?.(lng, lat);
        return;
      }
      const draft = draftAreaFromGeometry(
        { type: "Point", coordinates: [lng, lat] },
        "point",
        `Point ${lat.toFixed(3)}, ${lng.toFixed(3)}`,
      );
      if (draft !== null) onAddAreas([draft]);
    },
  });

  return null;
}

/** The whole Mercator world, as the outer ring the mask cuts Kenya out of. */
const WORLD_RING: L.LatLngTuple[] = [
  [-85, -180],
  [-85, 180],
  [85, 180],
  [85, -180],
];

/**
 * Kenya's border, made hard to miss.
 *
 * Three layers in a pane under the areas (overlayPane is 400), none of them
 * taking clicks, so a click anywhere still reaches the map:
 *   - a mask over everything outside Kenya, cut out with the even-odd rule
 *     (Leaflet's default), so the 108 rings of the outline, islands and all,
 *     come through undimmed;
 *   - a wide white halo, so the line reads on dark satellite imagery;
 *   - the line itself, in the palette's ink.
 * The outline is the national ADM0 release (services/geo/data/README.md), the
 * same one Explore clips its imagery to.
 */
function KenyaBorder() {
  const rings = useMemo(
    () => KENYA_OUTLINE.map((ring) => ring.map(([lon, lat]) => [lat, lon] as L.LatLngTuple)),
    [],
  );
  const ink = useMemo(() => themeColor("--color-ink", INK_FALLBACK), []);

  return (
    // `interactive` is a prop on each layer, not a key in pathOptions:
    // react-leaflet applies pathOptions with setStyle, which ignores it, and
    // the paths then took clicks meant for the map.
    <Pane name="kenya-border" style={{ zIndex: 350 }}>
      <Polygon
        positions={[WORLD_RING, ...rings]}
        interactive={false}
        pathOptions={{ stroke: false, fillColor: ink, fillOpacity: 0.22 }}
      />
      <Polyline
        positions={rings}
        interactive={false}
        pathOptions={{ color: "#ffffff", weight: 6, opacity: 0.85 }}
      />
      <Polyline
        positions={rings}
        interactive={false}
        pathOptions={{ color: ink, weight: 2.5, opacity: 1 }}
      />
    </Pane>
  );
}

/**
 * Identify place or Add point, in the same segmented style as the basemap
 * switch on the other corner, so the map's two switches read as a pair.
 */
function ClickModeSwitch({ tool, onTool }: { tool: MapTool; onTool: (tool: MapTool) => void }) {
  return (
    <fieldset
      className="pointer-events-auto flex rounded-fluent-large border border-edge bg-surface p-0.5 shadow-8"
      data-testid="map-click-mode"
    >
      <legend className="sr-only">Clicking the map</legend>
      {MAP_TOOL_SPECS.map((spec) => (
        <label
          key={spec.id}
          title={spec.hint}
          className={`type-caption1 cursor-pointer whitespace-nowrap rounded-fluent-medium px-2.5 py-1 font-semibold transition-colors duration-150 has-focus-visible:outline-2 has-focus-visible:outline-accent ${
            tool === spec.id
              ? "bg-accent-soft text-accent"
              : "text-ink-muted hover:bg-surface-subtle hover:text-ink"
          }`}
        >
          <input
            type="radio"
            name="aoi-click-mode"
            value={spec.id}
            checked={tool === spec.id}
            onChange={() => onTool(spec.id)}
            className="sr-only"
          />
          {spec.label}
        </label>
      ))}
    </fieldset>
  );
}

export default function AoiMap({
  areas,
  focus,
  tool,
  onTool,
  onAddAreas,
  onFocusArea,
  onIdentify,
  preview = null,
  note = null,
}: AoiMapProps) {
  // A point AOI is rendered as a circle rather than a pin, which sidesteps
  // Leaflet's default marker icon entirely. Its icon URLs are resolved
  // relative to the CSS file and break under every bundler.
  // Resolved once per mount rather than per layer: reading a computed style
  // forces a style recalculation, and a comparison can hold twelve areas.
  const style = useMemo(() => areaStyle(), []);

  const pointToLayer = useCallback(
    (_feature: Feature, latlng: L.LatLng) =>
      L.circleMarker(latlng, {
        ...style,
        fillOpacity: 0.9,
        weight: 3,
        radius: 7,
      }),
    [style],
  );

  const layers = useMemo(
    () =>
      areas.map((area) => (
        <GeoJSON
          // The reducer never reuses an id, so a removed area cannot have a new
          // one reconciled onto its layer.
          key={area.id}
          data={area.feature}
          style={style}
          pointToLayer={pointToLayer}
          eventHandlers={{ click: () => onFocusArea(area.id) }}
        >
          {/* Tooltip rather than popup: hovering a compared area should not
              take a click, and a popup would cover its neighbours. */}
        </GeoJSON>
      )),
    [areas, onFocusArea, pointToLayer, style],
  );

  const [basemap, setBasemap] = useState<Basemap>("street");

  return (
    <div className="relative h-full w-full">
      <MapContainer
        bounds={KENYA_BOUNDS}
        className={`relative h-full w-full ${CONTROL_SKIN}`}
        // Scroll-wheel zoom is off by default: on a page that scrolls, a wheel
        // over the map would otherwise hijack the page scroll. Ctrl+wheel and
        // the zoom buttons still work, which is the convention analysts expect.
        scrollWheelZoom={false}
        worldCopyJump
      >
        {/*
          One basemap at a time, chosen by the switch below rather than by
          Leaflet's layers control, so this map reads like Explore's. Keyed,
          so a change swaps the layer (and its attribution) cleanly. No
          className on the street layer: the dark-mode tile filter that hook
          served is gone with the second theme.
        */}
        {basemap === "street" ? (
          <TileLayer
            key="street"
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            maxZoom={19}
            {...TILE_LOADING}
          />
        ) : (
          <TileLayer
            key="satellite"
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            attribution="Imagery &copy; Esri, Maxar, Earthstar Geographics"
            maxZoom={19}
            {...TILE_LOADING}
          />
        )}

        <KenyaBorder />

        {layers}

        {preview !== null && (
          <GeoJSON
            // Keyed by unit, so choosing another one swaps the layer.
            key={`preview-${preview.id}`}
            data={preview.feature}
            style={{ ...style, weight: 2.5, dashArray: "6 5", fillOpacity: 0.06 }}
            interactive={false}
          />
        )}

        <FocusController focus={focus} />
        {/* Its own controller, so its tokens never collide with the reducer's. */}
        <FocusController focus={preview?.focus ?? null} />
        <ResizeController />
        <ViewReadout />
        <ClickHandler tool={tool} onAddAreas={onAddAreas} onIdentify={onIdentify} />
      </MapContainer>

      {/*
        The click mode and its status line, top left under the zoom buttons.
        Outside MapContainer, like the basemap switch, so a click on them never
        reaches Leaflet as a map click.
      */}
      {onTool !== undefined && (
        <div className="pointer-events-none absolute left-2.5 top-[84px] z-map-overlay flex max-w-[calc(100%-1.25rem)] flex-col items-start gap-1.5">
          <ClickModeSwitch tool={tool} onTool={onTool} />
          <p
            role="status"
            aria-live="polite"
            data-testid="map-note"
            className={
              note === null
                ? "sr-only"
                : "type-caption1 rounded-fluent-large border border-edge bg-surface/95 px-2 py-1 text-ink-muted shadow-8"
            }
          >
            {note ?? ""}
          </p>
        </div>
      )}

      {/*
        Explore's own basemap switch, top right where Explore has it. Outside
        MapContainer on purpose: inside it, a click on the switch would bubble
        to Leaflet as a map click and drop a point under it.
      */}
      <div className="pointer-events-none absolute right-2.5 top-2.5 z-map-overlay">
        <BasemapSwitch basemap={basemap} onBasemap={setBasemap} />
      </div>
    </div>
  );
}
