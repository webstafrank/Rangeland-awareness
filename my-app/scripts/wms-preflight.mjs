#!/usr/bin/env node
/**
 * Ask a WMS server what it actually publishes.
 *
 * Step 2 of the swap procedure in lib/wms/README.md. Registering a layer name
 * that the server does not have is the failure this exists to prevent: an
 * out-of-extent or unknown layer comes back HTTP 200 with an empty PNG, so the
 * map renders nothing and looks like a bug in this app rather than a bad name.
 *
 * Read-only. It issues one GetCapabilities and prints what it finds; it never
 * writes to the server and never writes into the repo.
 *
 *   node scripts/wms-preflight.mjs
 *   node scripts/wms-preflight.mjs http://192.168.0.40:8080/geoserver/wms
 *   node scripts/wms-preflight.mjs --json > /tmp/layers.json
 *
 * With no argument it reads NEXT_PUBLIC_WMS_ENDPOINT, falling back to the
 * internal GeoServer address compiled into lib/wms/source.ts.
 */

const DEFAULT_ENDPOINT = "http://192.168.0.40:8080/geoserver/wms";
const TIMEOUT_MS = 20_000;

const args = process.argv.slice(2);
const wantJson = args.includes("--json");
const endpoint =
  args.find((a) => !a.startsWith("--")) ??
  process.env.NEXT_PUBLIC_WMS_ENDPOINT ??
  DEFAULT_ENDPOINT;

/** Distinguish "nothing is listening" from "took too long", they need different fixes. */
async function fetchCapabilities(url) {
  const target = new URL(url);
  target.searchParams.set("SERVICE", "WMS");
  target.searchParams.set("REQUEST", "GetCapabilities");
  target.searchParams.set("VERSION", "1.3.0");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(target, { signal: controller.signal });
    const body = await response.text();
    return { ok: response.ok, status: response.status, body };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Layer name, title and time extent per published layer.
 *
 * Deliberately a regex rather than an XML parser: this is a diagnostic that has
 * to run with no dependencies installed, and it only needs three fields. A
 * malformed document degrades to "found nothing", which is the honest answer
 * for a diagnostic.
 */
function parseLayers(xml) {
  const layers = [];
  const blocks = xml.split(/<Layer[\s>]/).slice(1);
  for (const block of blocks) {
    const name = /<Name>([^<]+)<\/Name>/.exec(block);
    if (!name) continue; // a container Layer with no Name is a grouping node
    const title = /<Title>([^<]*)<\/Title>/.exec(block);
    const time = /<Dimension[^>]*name="time"[^>]*>([^<]*)/.exec(block);
    const crs = [...block.matchAll(/<CRS>([^<]+)<\/CRS>/g)].map((m) => m[1]);
    layers.push({
      name: name[1],
      title: title ? title[1] : "",
      timeExtent: time ? time[1].trim() : null,
      crs: crs.slice(0, 6),
    });
  }
  return layers;
}

const started = Date.now();
let result;
try {
  result = await fetchCapabilities(endpoint);
} catch (error) {
  const cause = error?.cause?.code ?? error?.name ?? String(error);
  console.error(`FAIL  ${endpoint}`);
  console.error(`      ${cause}`);
  if (cause === "ECONNREFUSED") {
    console.error(
      "      The host answered but nothing is listening on that port.\n" +
        "      GeoServer is probably not running, or is on a different port.",
    );
  } else if (cause === "AbortError") {
    console.error(
      "      No response within 20s. A firewall dropping packets looks like\n" +
        "      this, where a refused connection would have failed instantly.",
    );
  } else if (cause === "EHOSTUNREACH" || cause === "ENETUNREACH") {
    console.error("      No route to that host from this machine.");
  }
  process.exit(1);
}

if (!result.ok) {
  console.error(`FAIL  ${endpoint}`);
  console.error(`      HTTP ${result.status}`);
  if (/ServiceException/i.test(result.body)) {
    const message = /<ServiceException[^>]*>([\s\S]*?)<\/ServiceException>/i.exec(result.body);
    console.error(`      ServiceException: ${(message?.[1] ?? "").trim().slice(0, 300)}`);
  }
  process.exit(1);
}

const layers = parseLayers(result.body);

if (wantJson) {
  console.log(JSON.stringify({ endpoint, layers }, null, 2));
  process.exit(0);
}

console.log(`OK    ${endpoint}`);
console.log(`      HTTP ${result.status}, ${result.body.length} bytes in ${Date.now() - started}ms`);
console.log(`      ${layers.length} named layer${layers.length === 1 ? "" : "s"}\n`);

if (layers.length === 0) {
  console.log("The server answered but published no named layers.");
  process.exit(0);
}

// Web Mercator matters: Leaflet requests tiles in EPSG:3857, and a layer that
// only advertises 4326 throws an exception on every tile rather than rendering.
const mercator = layers.filter((l) => l.crs.some((c) => /3857|900913/.test(c)));
console.log(`${layers.length - mercator.length} of ${layers.length} do NOT advertise EPSG:3857 (Leaflet needs it).\n`);

for (const layer of layers) {
  const webMercator = layer.crs.some((c) => /3857|900913/.test(c)) ? "" : "  [no 3857]";
  console.log(`  ${layer.name}${webMercator}`);
  if (layer.title) console.log(`      title: ${layer.title}`);
  console.log(`      time:  ${layer.timeExtent ?? "(no time dimension)"}`);
}

console.log(
  "\nNext: add the ones you want to KSA_LAYERS in lib/wms/layers.ts, copying\n" +
    "`time` verbatim into `timeExtent` and stamping `verifiedOn` with today.",
);
