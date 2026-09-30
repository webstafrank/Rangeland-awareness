"use client";

/**
 * The basemap for the standalone data explorer.
 *
 * Client-only, loaded through next/dynamic with ssr:false by ExplorePanel.tsx,
 * because Leaflet touches `window` at module scope — same boundary AoiMap
 * needs and for the same reason.
 *
 * This is AoiMap with everything area-of-interest stripped out: no Geoman, no
 * draw tools, no GeoJSON areas, no selection reducer. The explorer has nothing
 * to select and nothing to draw; it exists so a WMS layer can be looked at on
 * its own, independent of any analysis run. What's left is the base layers,
 * the view readout, and WmsLayers itself.
 *
 * WmsLayers is imported and rendered HERE, not passed in as `children` from a
 * plain "use client" caller. A "use client" directive does not skip SSR by
 * itself in the App Router — only the next/dynamic(ssr:false) boundary this
 * file sits behind does that. Constructing `<WmsLayers/>` JSX one level up
 * would import react-leaflet's WMSTileLayer (and transitively `leaflet`, which
 * touches `window` at module scope) into a module that IS still server
 * rendered, crashing the route the same way importing AoiMap.tsx from a server
 * component would. So this file takes the plain data WmsLayers needs
 * (source, layers, dateWindow, state, dispatch — the exact shape
 * WmsLayersProps declares) and builds the element itself, entirely on the
 * client side of the boundary.
 */

import { useEffect, useState } from "react";
import { LayersControl, MapContainer, TileLayer, useMap, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";

import { KENYA_BOUNDS } from "@/components/map/tools";
import WmsLayers, { type WmsLayersProps } from "@/components/map/WmsLayers";

export interface ExploreMapProps {
  wms: WmsLayersProps;
}

/** Same readout AoiMap shows, so a screen reader user knows where the map is. */
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
      data-testid="explore-map-view"
      data-lat={center.lat.toFixed(5)}
      data-lng={center.lng.toFixed(5)}
      data-zoom={zoom}
      role="status"
      aria-live="polite"
      className="type-caption1 pointer-events-none absolute bottom-2 left-2 z-map-overlay rounded-fluent-medium bg-surface/90 px-2 py-1 font-mono text-ink-muted shadow-8"
    >
      Centre {lat}, {lng} at zoom {zoom}
    </p>
  );
}

/** Re-measure when the surrounding layout changes, or Leaflet renders grey. Same as AoiMap. */
function ResizeController() {
  const map = useMap();

  useEffect(() => {
    const container = map.getContainer();
    const observer = new ResizeObserver(() => map.invalidateSize({ pan: false }));
    observer.observe(container);
    return () => observer.disconnect();
  }, [map]);

  return null;
}

export default function ExploreMap({ wms }: ExploreMapProps) {
  return (
    <MapContainer
      bounds={KENYA_BOUNDS}
      className="relative h-full w-full"
      scrollWheelZoom={false}
      worldCopyJump
    >
      <LayersControl position="topright">
        <LayersControl.BaseLayer checked name="Street">
          <TileLayer
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

      <WmsLayers {...wms} />

      <ResizeController />
      <ViewReadout />
    </MapContainer>
  );
}
