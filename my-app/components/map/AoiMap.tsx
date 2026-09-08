"use client";

/**
 * The area-of-interest map.
 *
 * Client-only, and loaded through next/dynamic with ssr:false by MapPanel.tsx,
 * because Leaflet touches `window` at module scope. Importing this file from a
 * server component would crash the route.
 *
 * It owns no selection state. Everything it learns about the world arrives as
 * props from the reducer in lib/analysis/selection.ts, and everything the user
 * does leaves as a callback. That is what keeps the interesting rules testable
 * in node: this file is a Leaflet adapter and nothing more.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  GeoJSON,
  LayersControl,
  MapContainer,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "@geoman-io/leaflet-geoman-free";
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css";

import type { Feature, Geometry } from "geojson";
import {
  type AreaOfInterest,
  type DraftArea,
  type FocusRequest,
  draftAreaFromGeometry,
} from "@/lib/analysis/selection";
import { KENYA_BOUNDS, type MapTool } from "@/components/map/tools";

export interface AoiMapProps {
  areas: readonly AreaOfInterest[];
  focus: FocusRequest | null;
  tool: MapTool;
  onAddAreas: (areas: DraftArea[]) => void;
  onFocusArea: (id: string) => void;
  /** Fired once a drawn shape is committed, so the toolbar can disarm. */
  onDrawFinished: () => void;
}

/** Accent for selected geometry. Readable on street tiles and on imagery. */
const AREA_STYLE: L.PathOptions = {
  color: "#0d9488",
  weight: 2,
  opacity: 1,
  fillColor: "#14b8a6",
  fillOpacity: 0.18,
};

const AREA_STYLE_POINT: L.PathOptions = {
  ...AREA_STYLE,
  fillOpacity: 0.9,
  weight: 3,
};

/**
 * Zoom to whatever the reducer last asked for.
 *
 * Keyed off `focus.token`, not `focus.bounds`. Re-selecting an area the user is
 * already looking at must still re-centre it, and identical bounds would make a
 * bounds-only dependency compare equal and skip the effect. See the focus token
 * note in lib/analysis/README.md.
 */
function FocusController({ focus }: { focus: FocusRequest | null }) {
  const map = useMap();
  const lastToken = useRef<number | null>(null);

  useEffect(() => {
    if (focus === null) return;
    if (lastToken.current === focus.token) return;
    lastToken.current = focus.token;

    map.flyToBounds(focus.bounds, {
      // Keep the fitted area clear of the floating controls.
      paddingTopLeft: [24, 24],
      paddingBottomRight: [24, 56],
      // A clicked point is padded to ~5.5km by padBounds, so this ceiling only
      // bites on very small drawn shapes, where it stops a 20-level slam.
      maxZoom: 13,
      duration: 0.6,
    });
  }, [focus, map]);

  return null;
}

/**
 * Announce where the map currently is.
 *
 * A sighted user reads the viewport; a screen reader user has no way to know
 * the map moved, and "the map zoomed to your selection" is the single most
 * important feedback this page gives. So the centre and zoom are published as
 * polite live text.
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
  const lat = `${Math.abs(center.lat).toFixed(2)} ${center.lat >= 0 ? "N" : "S"}`;
  const lng = `${Math.abs(center.lng).toFixed(2)} ${center.lng >= 0 ? "E" : "W"}`;

  return (
    <p
      data-testid="map-view"
      data-lat={center.lat.toFixed(5)}
      data-lng={center.lng.toFixed(5)}
      data-zoom={zoom}
      role="status"
      aria-live="polite"
      className="pointer-events-none absolute bottom-2 left-2 z-[500] rounded bg-surface/90 px-2 py-1 font-mono text-[11px] text-foreground-muted shadow-sm"
    >
      Centre {lat}, {lng} at zoom {zoom}
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
    const observer = new ResizeObserver(() => map.invalidateSize({ pan: false }));
    observer.observe(container);
    return () => observer.disconnect();
  }, [map]);

  return null;
}

/** Click-to-select, active only while the point tool is armed. */
function PointSelector({
  active,
  onAddAreas,
}: {
  active: boolean;
  onAddAreas: (areas: DraftArea[]) => void;
}) {
  useMapEvents({
    click(event) {
      if (!active) return;

      // Leaflet gives lat/lng; GeoJSON wants lng/lat. The flip lives here and
      // in lib/geo/bounds.ts, nowhere else.
      const { lat, lng } = event.latlng;
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

/**
 * Geoman drawing.
 *
 * The drawn layer is read for its GeoJSON and then removed: the selected areas
 * are rendered from props like every other area, so leaving Geoman's own layer
 * on the map would draw each shape twice and let the user drag a copy that the
 * reducer knows nothing about.
 */
function DrawController({
  tool,
  onAddAreas,
  onDrawFinished,
}: {
  tool: MapTool;
  onAddAreas: (areas: DraftArea[]) => void;
  onDrawFinished: () => void;
}) {
  const map = useMap();

  // Held in a ref so re-arming the tool does not tear down the pm:create
  // listener mid-draw, which would drop the shape the user just finished.
  // Written in an effect, not during render: a ref mutated while rendering can
  // be torn between a discarded render and the committed one.
  const handlers = useRef({ onAddAreas, onDrawFinished });
  useEffect(() => {
    handlers.current = { onAddAreas, onDrawFinished };
  }, [onAddAreas, onDrawFinished]);

  useEffect(() => {
    const handleCreate = ({ layer }: { layer: L.Layer }) => {
      const geometry = (
        layer as L.Polygon
      ).toGeoJSON() as Feature<Geometry> | Geometry;

      const raw: Geometry =
        "type" in geometry && geometry.type === "Feature"
          ? (geometry.geometry as Geometry)
          : (geometry as Geometry);

      map.removeLayer(layer);

      const draft = draftAreaFromGeometry(raw, "drawn", "Drawn area");
      if (draft !== null) handlers.current.onAddAreas([draft]);
      handlers.current.onDrawFinished();
    };

    map.on("pm:create", handleCreate);
    return () => {
      map.off("pm:create", handleCreate);
    };
  }, [map]);

  // Arm and disarm the requested shape. Geoman keeps its own toolbar hidden;
  // the app's own toolbar drives it, so the map has one visual language.
  useEffect(() => {
    map.pm.setGlobalOptions({
      allowSelfIntersection: false,
      finishOn: "dblclick",
      templineStyle: { color: "#0d9488" },
      hintlineStyle: { color: "#0d9488", dashArray: "4,4" },
      pathOptions: AREA_STYLE,
    });

    if (tool === "polygon") map.pm.enableDraw("Polygon");
    else if (tool === "rectangle") map.pm.enableDraw("Rectangle");
    else map.pm.disableDraw();

    return () => {
      // Leaving the page mid-draw must not leave a live handler on a map that
      // is about to be destroyed.
      map.pm.disableDraw();
    };
  }, [map, tool]);

  return null;
}

export default function AoiMap({
  areas,
  focus,
  tool,
  onAddAreas,
  onFocusArea,
  onDrawFinished,
}: AoiMapProps) {
  // A point AOI is rendered as a circle rather than a pin, which sidesteps
  // Leaflet's default marker icon entirely. Its icon URLs are resolved
  // relative to the CSS file and break under every bundler.
  const pointToLayer = useCallback(
    (_feature: Feature, latlng: L.LatLng) =>
      L.circleMarker(latlng, { ...AREA_STYLE_POINT, radius: 7 }),
    [],
  );

  const layers = useMemo(
    () =>
      areas.map((area) => (
        <GeoJSON
          // The reducer never reuses an id, so a removed area cannot have a new
          // one reconciled onto its layer.
          key={area.id}
          data={area.feature}
          style={AREA_STYLE}
          pointToLayer={pointToLayer}
          eventHandlers={{ click: () => onFocusArea(area.id) }}
        >
          {/* Tooltip rather than popup: hovering a compared area should not
              take a click, and a popup would cover its neighbours. */}
        </GeoJSON>
      )),
    [areas, onFocusArea, pointToLayer],
  );

  return (
    <MapContainer
      bounds={KENYA_BOUNDS}
      className="relative h-full w-full"
      // Scroll-wheel zoom is off by default: on a page that scrolls, a wheel
      // over the map would otherwise hijack the page scroll. Ctrl+wheel and the
      // zoom buttons still work, which is the convention analysts expect.
      scrollWheelZoom={false}
      worldCopyJump
    >
      <LayersControl position="topright">
        <LayersControl.BaseLayer checked name="Street">
          <TileLayer
            // basemap-street is what the dark-mode inversion in globals.css
            // targets. Imagery must not carry it.
            className="basemap-street"
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            maxZoom={19}
          />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer name="Satellite">
          <TileLayer
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            attribution="Imagery &copy; Esri, Maxar, Earthstar Geographics"
            maxZoom={19}
          />
        </LayersControl.BaseLayer>
      </LayersControl>

      {layers}

      <FocusController focus={focus} />
      <ResizeController />
      <ViewReadout />
      <PointSelector active={tool === "point"} onAddAreas={onAddAreas} />
      <DrawController
        tool={tool}
        onAddAreas={onAddAreas}
        onDrawFinished={onDrawFinished}
      />
    </MapContainer>
  );
}
