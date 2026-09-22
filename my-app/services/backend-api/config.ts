/**
 * Where the backend is, from whichever side of the wire is asking.
 *
 * There are two answers and they are usually different, which is the whole
 * reason this module exists rather than one constant.
 *
 *   browser   NEXT_PUBLIC_BACKEND_URL   a hostname the analyst's machine can
 *                                       resolve, because the map's tiles and
 *                                       the run polling are fetched from the
 *                                       page itself
 *   server    BACKEND_URL               whatever the Next process can reach,
 *                                       which under compose is the service name
 *                                       `http://backend:8000` and is not
 *                                       resolvable from any browser
 *
 * Getting this wrong produces a failure that is specifically horrible to debug:
 * the results page renders perfectly on the server, hydrates, and then every
 * client fetch fails against a hostname that only exists inside the container
 * network. So the two are named separately and the server never silently uses
 * the browser's value except as a last resort, where a single-host deployment
 * is the common case and both are genuinely the same URL.
 *
 * `NEXT_PUBLIC_BACKEND_URL` is read as a literal property access rather than
 * through a variable, because Next inlines these at build time by substituting
 * the exact text `process.env.NEXT_PUBLIC_BACKEND_URL`. A computed lookup such
 * as `process.env[name]` is not substituted and comes back undefined in the
 * browser, which is the second horrible failure and the reason for the shape of
 * the code below.
 */

/** Used when nothing is configured: the backend's own `runserver` default. */
export const DEFAULT_BACKEND_URL = "http://127.0.0.1:8000";

/**
 * Strips a trailing slash so callers can always join with a leading one.
 *
 * `http://host:8000/` + `/api/v1/health` is `http://host:8000//api/v1/health`,
 * which Django's CommonMiddleware answers with a 404 rather than a redirect,
 * because the double slash is a different path and not a missing one.
 */
export function normaliseBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

/**
 * The precedence rule, as a pure function of the three inputs.
 *
 * Split out from the two callers below so it can be gate-tested without
 * installing a `window` global or mutating `process.env`. Both of those are the
 * kind of test that leaks into the suite beside it in the node lane, which
 * shares one worker across files by design.
 */
export function resolveBaseUrl(input: {
  onServer: boolean;
  internal?: string;
  publicUrl?: string;
}): string {
  if (input.onServer && input.internal) return normaliseBaseUrl(input.internal);
  if (input.publicUrl) return normaliseBaseUrl(input.publicUrl);
  return DEFAULT_BACKEND_URL;
}

/**
 * The base URL for this execution context.
 *
 * Deliberately a function rather than a module-level constant. A constant is
 * evaluated once at import, which during a Next build is at build time, and a
 * container image is then baked with whatever the build host had in its
 * environment. The server half must be read per call so a deployment can change
 * `BACKEND_URL` by restarting the container rather than by rebuilding it.
 */
export function backendBaseUrl(): string {
  return resolveBaseUrl({
    // `window` rather than `typeof process`: Next defines process.env in the
    // browser bundle too, so a process check would take the server branch on
    // the client and read a variable that was never inlined.
    onServer: typeof window === "undefined",
    internal: process.env.BACKEND_URL,
    publicUrl: process.env.NEXT_PUBLIC_BACKEND_URL,
  });
}

/**
 * The browser-visible base URL, whatever side is asking.
 *
 * A server component that renders a URL into the HTML for the client to fetch
 * later, a `<img src>` for a legend, or a Leaflet tile template, needs the
 * value the BROWSER will use, not the one the server would. Using
 * `backendBaseUrl()` there is how an internal Docker hostname ends up in a page
 * that is sent to a laptop.
 */
export function publicBackendBaseUrl(): string {
  return resolveBaseUrl({
    onServer: false,
    publicUrl: process.env.NEXT_PUBLIC_BACKEND_URL,
  });
}

/**
 * The WMS tile template Leaflet draws with, pointed at the proxy.
 *
 * The browser never addresses GeoServer: `192.168.0.40` is a private address,
 * so a laptop off the KSA LAN draws an empty map, and the proxy is also what
 * keeps the GeoServer credentials on the server side. Leaflet fills `{bbox-epsg-3857}`
 * itself when the layer is declared with `L.tileLayer` rather than
 * `L.tileLayer.wms`, which is what lets this stay a plain URL template.
 */
export function tileTemplate(layerId: string): string {
  const base = publicBackendBaseUrl();
  // The layer id carries a colon ("Hazards_Dashboard:TanaRiver_Slope"). It is
  // legal unencoded in a path segment per RFC 3986, and the backend's URL
  // converter matches it directly, so encoding it here would produce a %3A the
  // route does not match.
  return (
    `${base}/api/v1/tiles/${layerId}` +
    "?BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256&CRS=EPSG:3857" +
    "&FORMAT=image/png&TRANSPARENT=true"
  );
}
