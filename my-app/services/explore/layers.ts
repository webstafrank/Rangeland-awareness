/**
 * One layer model for the data explorer, whichever server it comes from.
 *
 * Two sources feed the explorer and they could hardly be more different. The
 * KSA GeoServer's layers come live from the backend's catalogue and are drawn
 * through the backend's tile proxy, so the browser never needs to reach the
 * LAN-only GeoServer itself. NASA GIBS layers come from the hand-verified
 * registry in services/wms and are fetched from GIBS directly, with a TIME
 * resolved from each layer's published extent. Both end up as an
 * `ExploreLayer`: a title, a category, a tile URL template and a legend, which
 * is everything the panel and the map need and nothing about where it came
 * from.
 *
 * Tile URLs are MapLibre raster templates. `{bbox-epsg-3857}` is left
 * literally in the string (never URL-encoded), and MapLibre replaces it per
 * tile.
 */

import type { CatalogLayer } from "@/services/backend-api/types";
import {
  describeLayerTime,
  getMapParams,
  legendFor,
  resolveLayerTime,
  type WmsDateWindow,
  type WmsSource,
} from "@/services/wms";
import {
  CATEGORY_ORDER,
  FALLBACK_CATEGORY,
  LAYER_CATEGORIES,
  SATELLITE_CATEGORY,
  categoryEntryFor,
  categoryLabel,
  type LayerCategoryEntry,
} from "@/services/explore/categories";

export type ExploreLegend =
  | { kind: "image"; url: string; width?: number; height?: number }
  | { kind: "none"; reason: string };

export interface ExploreLayer {
  /** Unique across sources: `ksa:<workspace:name>` or `gibs:<registry id>`. */
  id: string;
  title: string;
  description: string;
  category: string;
  /** Who publishes it, shown under the title. */
  sourceLabel: string;
  /** MapLibre raster tile template, with `{bbox-epsg-3857}` left in. */
  tiles: string;
  attribution: string;
  legend: ExploreLegend;
  /** `[west, south, east, north]` in degrees, when the server declares one. */
  bounds: readonly [number, number, number, number] | null;
  /** Which date is drawn, for a time-varying layer. */
  timeNote: string | null;
  /**
   * GeoJSON of the layer's features, for a vector layer: loaded as an
   * invisible copy over the WMS drawing so a click can say what is there.
   * Null for rasters and for NASA imagery, which have no features to click.
   */
  features: string | null;
  /**
   * Why the layer cannot be drawn at all, for a GIBS layer whose archive has
   * nothing inside the window. Listed so the analyst can see it exists, but
   * not addable.
   */
  unavailable: string | null;
}

/** `river_tana_riparian_extent` -> `River tana riparian extent`. */
export function humaniseLayerName(qualified: string): string {
  const bare = qualified.includes(":") ? qualified.slice(qualified.indexOf(":") + 1) : qualified;
  const words = bare.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  if (words === "") return qualified;
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * A catalogue entry, as the explorer shows it.
 *
 * `tileTemplate` and `legendUrl` are passed in rather than imported from the
 * backend client's config, which reads `window` and the environment to find
 * the backend; this file stays a pure function of its arguments.
 */
export function fromCatalogLayer(
  layer: CatalogLayer,
  urls: {
    tileTemplate: (id: string) => string;
    legendUrl: (id: string) => string;
    featuresUrl?: (id: string) => string;
  },
  categories: Readonly<Record<string, LayerCategoryEntry>> = LAYER_CATEGORIES,
): ExploreLayer {
  const entry = categoryEntryFor(layer.id, categories);
  const abstract = layer.abstract?.trim() ?? "";
  const kindNote =
    layer.kind === "vector" ? "Vector features" : layer.kind === "raster" ? "Raster" : "Layer";
  return {
    id: `ksa:${layer.id}`,
    title: entry?.title ?? humaniseLayerName(layer.name),
    description:
      entry?.description ?? (abstract !== "" ? abstract : `${kindNote} from the ${layer.workspace ?? "KSA"} workspace.`),
    category: entry === undefined ? FALLBACK_CATEGORY : categoryLabel(entry.category),
    sourceLabel: "Kenya Space Agency GeoServer",
    tiles: urls.tileTemplate(layer.id),
    attribution: "Kenya Space Agency",
    legend: { kind: "image", url: urls.legendUrl(layer.id) },
    bounds: layer.bbox ?? null,
    timeNote: null,
    features:
      layer.kind === "vector" && urls.featuresUrl !== undefined ? urls.featuresUrl(layer.id) : null,
    unavailable: null,
  };
}

/** Every GIBS registry layer, as the explorer shows it, for one date window. */
export function fromWmsSource(source: WmsSource, dateWindow: WmsDateWindow): ExploreLayer[] {
  return source.layers.map((layer) => {
    const time = resolveLayerTime(layer, dateWindow);
    const params = getMapParams(source, layer, time);
    const legend = legendFor(source, layer);

    let tiles = "";
    if (params !== null) {
      const query = new URLSearchParams({
        SERVICE: "WMS",
        REQUEST: "GetMap",
        VERSION: params.version,
        LAYERS: params.layers,
        STYLES: params.styles,
        FORMAT: params.format,
        TRANSPARENT: String(params.transparent),
        CRS: "EPSG:3857",
        WIDTH: "256",
        HEIGHT: "256",
      });
      if (params.time !== undefined) query.set("TIME", params.time);
      // Appended after encoding: URLSearchParams would turn the braces into
      // %7B...%7D and MapLibre would never find the placeholder.
      tiles = `${source.endpoint}?${query.toString()}&BBOX={bbox-epsg-3857}`;
    }

    return {
      id: `${source.id}:${layer.id}`,
      title: layer.title,
      description: layer.description,
      category: SATELLITE_CATEGORY,
      sourceLabel: source.label,
      tiles,
      attribution: layer.attribution,
      legend:
        legend.kind === "none"
          ? { kind: "none", reason: legend.reason }
          : legend.kind === "published"
            ? { kind: "image", url: legend.url, width: legend.width, height: legend.height }
            : { kind: "image", url: legend.url },
      bounds: null,
      timeNote: layer.timeDimension === true ? describeLayerTime(time) : null,
      features: null,
      unavailable: params === null ? describeLayerTime(time) : null,
    };
  });
}

/** Case-insensitive; every word must match the title, description, category or id. */
export function filterExploreLayers(
  layers: readonly ExploreLayer[],
  query: string,
): readonly ExploreLayer[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return layers;
  return layers.filter((layer) => {
    const haystack =
      `${layer.title} ${layer.description} ${layer.category} ${layer.id}`.toLowerCase();
    return words.every((word) => haystack.includes(word));
  });
}

export interface LayerGroup {
  category: string;
  layers: readonly ExploreLayer[];
}

/**
 * Layers under their headings: every heading in `order` in that order, EMPTY
 * ONES INCLUDED, so the categories are visible before their layers are
 * published; then any other heading alphabetically; then FALLBACK_CATEGORY,
 * only when it has layers. Layers keep their incoming order within a heading.
 *
 * `includeEmpty: false` drops the empty headings, which is what a filtered
 * list wants: a search that matched nothing in "Water" should not show it.
 */
export function groupByCategory(
  layers: readonly ExploreLayer[],
  order: readonly string[] = CATEGORY_ORDER,
  { includeEmpty = true }: { includeEmpty?: boolean } = {},
): LayerGroup[] {
  const byCategory = new Map<string, ExploreLayer[]>();
  if (includeEmpty) for (const category of order) byCategory.set(category, []);
  for (const layer of layers) {
    const list = byCategory.get(layer.category) ?? [];
    list.push(layer);
    byCategory.set(layer.category, list);
  }
  const rank = (category: string) => {
    if (category === FALLBACK_CATEGORY) return Number.MAX_SAFE_INTEGER;
    const index = order.indexOf(category);
    return index === -1 ? order.length : index;
  };
  return [...byCategory.entries()]
    .filter(([category, list]) => list.length > 0 || (includeEmpty && category !== FALLBACK_CATEGORY))
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
    .map(([category, list]) => ({ category, layers: list }));
}
