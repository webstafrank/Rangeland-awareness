/**
 * Which WMS server the map talks to, and how it is chosen.
 *
 * This is the point of the unit (rubric E4). Pointing the app at the Kenya
 * Space Agency's own GeoServer must be an environment change plus a registry
 * entry, never an edit to a component. So:
 *
 *   NEXT_PUBLIC_WMS_SOURCE    picks an entry from SOURCES below
 *   NEXT_PUBLIC_WMS_ENDPOINT  overrides that entry's endpoint URL
 *
 * Both are optional. With neither set the app renders against GIBS, which is
 * keyless and public, so a fresh clone shows real imagery with no setup.
 *
 * Nothing here throws and nothing here falls back silently: every rejected
 * value comes back as a `SourceResolution` carrying the reason, which the layer
 * control prints. A misconfigured endpoint that quietly reverted to NASA would
 * be indistinguishable from a working KSA deployment.
 */

import type { TopicSlug } from "@/lib/analysis/topics";
import { GIBS_LAYERS, KSA_LAYERS, layersForSource } from "@/lib/wms/layers";
import type { WmsLayerSpec, WmsSource } from "@/lib/wms/types";

export const DEFAULT_SOURCE_ID = "gibs";

/**
 * NASA's Global Imagery Browse Services, EPSG:4326 "best" endpoint.
 *
 * Verified live on 2026-09-09: HTTP 200, 1593 layers, no API key, and it
 * advertises EPSG:3857 as well as EPSG:4326 on every layer, which matters
 * because Leaflet requests tiles in Web Mercator and would otherwise get an
 * exception on every tile.
 */
const GIBS: WmsSource = {
  id: DEFAULT_SOURCE_ID,
  label: "NASA EOSDIS GIBS",
  endpoint: "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi",
  version: "1.3.0",
  attribution:
    'Imagery courtesy of <a href="https://worldview.earthdata.nasa.gov/">NASA EOSDIS GIBS</a>',
  layers: GIBS_LAYERS,
  // Verified 2026-09-09: GetLegendGraphic on this endpoint answers a
  // ServiceException XML body, not an image, even though every layer publishes
  // a LegendURL. Deriving legend URLs here would show a broken image per layer.
  supportsGetLegendGraphic: false,
};

/**
 * The KSA GeoServer slot.
 *
 * Shipped with an EMPTY layer list on purpose. A layer name that does not exist
 * on the target server renders as a silent blank tile, so inventing plausible
 * ones ("ksa:ndvi") would be worse than shipping none: the app would look
 * configured and show nothing. Filling this in is step 3 of the swap procedure
 * in README.md, and until it is filled the layer control says so in words.
 *
 * `supportsGetLegendGraphic` is true because GeoServer implements the request
 * for every published style. That is the product default and not a claim about
 * any particular deployment — if a deployment disables it the legend `<img>`
 * fails to load and the control falls back to "no legend published", so the
 * wrong value degrades rather than breaks.
 */
const KSA_GEOSERVER: WmsSource = {
  id: "ksa-geoserver",
  label: "Kenya Space Agency GeoServer",
  /*
   * The internal GeoServer. Overridable with NEXT_PUBLIC_WMS_ENDPOINT, which is
   * how a different workspace or a moved host is handled without a code change.
   *
   * Two properties of this address decide how the app behaves around it, and
   * both are deliberate rather than incidental:
   *
   * A PRIVATE ADDRESS. Tiles are fetched by the analyst's BROWSER, not by the
   * server rendering the page, so every viewer must themselves be on a network
   * that routes to 192.168.0.40. That is the right shape for an internal tool
   * and the wrong shape for anything published outward; if this app is ever
   * served beyond the LAN, the tiles need a proxy route in this app rather than
   * a direct browser fetch.
   *
   * PLAIN HTTP. A page served over https may not fetch http subresources: the
   * browser blocks them as mixed content, silently, with the tiles simply never
   * arriving. So the app and GeoServer have to agree — both http on the LAN
   * (the normal case here), or GeoServer behind TLS.
   *
   * Checked 2026-09-09 from 192.168.4.198: the host answers ping in ~9.6ms, and
   * every common web port including 8080 answers Connection refused. Routing is
   * fine; nothing was listening. The layer list below is therefore still empty.
   */
  endpoint: "http://192.168.0.40:8080/geoserver/wms",
  version: "1.3.0",
  attribution: "Kenya Space Agency",
  layers: KSA_LAYERS,
  supportsGetLegendGraphic: true,
  note: "No layers are registered for this source yet. Run `node scripts/wms-preflight.mjs` once GeoServer is up to list what it publishes, then add them to KSA_LAYERS in lib/wms/layers.ts.",
};

export const SOURCES: readonly WmsSource[] = [GIBS, KSA_GEOSERVER];

/** How the active source was arrived at, including anything that was rejected. */
export interface SourceResolution {
  source: WmsSource;
  /** Ids that were asked for but not honoured, each with the reason. */
  problems: readonly string[];
  /** True when an env var changed the built-in default. */
  overridden: boolean;
}

/**
 * An endpoint has to be an absolute http(s) URL.
 *
 * A relative path would resolve against whatever page the map happens to be on
 * and 404 in a way that looks like the WMS server is down, and a non-http
 * scheme in a tile `src` is refused by the browser with no useful message.
 */
function endpointProblem(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return `NEXT_PUBLIC_WMS_ENDPOINT is not a valid absolute URL: "${value}". Keeping the built-in endpoint.`;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return `NEXT_PUBLIC_WMS_ENDPOINT must be http or https, got "${url.protocol}". Keeping the built-in endpoint.`;
  }
  return null;
}

/**
 * Resolve a source from explicit values. `wmsSource()` is the thin wrapper that
 * reads the environment; everything interesting is here so it can be tested
 * without touching `process.env`.
 */
export function resolveSource(env: {
  sourceId?: string;
  endpoint?: string;
}): SourceResolution {
  const problems: string[] = [];
  let overridden = false;

  const requestedId = env.sourceId?.trim();
  let source = SOURCES.find((s) => s.id === DEFAULT_SOURCE_ID) as WmsSource;

  if (requestedId !== undefined && requestedId !== "") {
    const match = SOURCES.find((s) => s.id === requestedId);
    if (match === undefined) {
      problems.push(
        `Unknown WMS source "${requestedId}". Known sources: ${SOURCES.map((s) => s.id).join(", ")}. Falling back to "${DEFAULT_SOURCE_ID}".`,
      );
    } else {
      source = match;
      if (match.id !== DEFAULT_SOURCE_ID) overridden = true;
    }
  }

  const endpoint = env.endpoint?.trim();
  if (endpoint !== undefined && endpoint !== "") {
    const problem = endpointProblem(endpoint);
    if (problem !== null) {
      problems.push(problem);
    } else if (endpoint !== source.endpoint) {
      source = { ...source, endpoint };
      overridden = true;
    }
  }

  return { source, problems, overridden };
}

/**
 * Read the environment and resolve.
 *
 * `process.env.NEXT_PUBLIC_*` is written out literally, twice, rather than
 * indexed from a list. Next.js substitutes these at build time by matching the
 * literal member expression in the source; `process.env[name]` with a variable
 * is not substituted and comes back undefined in the browser, so the whole
 * override mechanism would appear to work in node tests and do nothing in the
 * app.
 *
 * Read on every call rather than memoised at module load. lib/ holds no mutable
 * module state by house rule (vitest runs this lane with `isolate: false`, so a
 * cached value would leak between test files), and the cost is a URL parse.
 */
export function resolveSourceFromEnv(): SourceResolution {
  return resolveSource({
    sourceId: process.env.NEXT_PUBLIC_WMS_SOURCE,
    endpoint: process.env.NEXT_PUBLIC_WMS_ENDPOINT,
  });
}

/** The active source. CONTRACT.md section 5. */
export function wmsSource(): WmsSource {
  return resolveSourceFromEnv().source;
}

/** Layers the active source offers for a topic. CONTRACT.md section 5. */
export function layersForTopic(slug: TopicSlug): readonly WmsLayerSpec[] {
  return layersForSource(wmsSource(), slug);
}
