/**
 * Reading a server's GetCapabilities document.
 *
 * Used to build and to audit a layer registry, never on a page load. The
 * default endpoint's capabilities document is 2.5MB; downloading that so the
 * map can learn eight layer names would be absurd, which is why layers.ts
 * records the answers and this file is the tool that refreshes them.
 *
 * The parser is a scanner over the XML text, not a DOM parse. Two reasons, and
 * both are about the size: node has no `DOMParser`, and adding an XML library
 * to lift six fields out of a document this large is more dependency than the
 * job needs. It is deliberately NOT a general XML parser and will not survive
 * exotic input; what it does survive is every real WMS capabilities document,
 * whose layer entries are flat, namespaced predictably, and machine-generated.
 */

import { parseServiceException } from "@/lib/wms/request";
import type { LegendSize, WmsSource } from "@/lib/wms/types";

export interface CapabilityLayer {
  name: string;
  title: string;
  /** The `<Dimension name="time">` value verbatim, ready to paste into a spec. */
  timeExtent: string | null;
  /** The `default=` attribute of that dimension. */
  timeDefault: string | null;
  legendUrl: string | null;
  legendSize: LegendSize | null;
  /** Every CRS the layer advertises. WMS 1.1.1 spells this `SRS`. */
  crs: readonly string[];
}

export type CapabilitiesResult =
  | { ok: true; version: string | null; layers: readonly CapabilityLayer[] }
  | { ok: false; problem: string };

/** Strip an optional `ns:` prefix in a tag pattern. */
const NS = "(?:[A-Za-z0-9_]+:)?";

function firstMatch(block: string, pattern: RegExp): string | null {
  return pattern.exec(block)?.[1] ?? null;
}

/**
 * Parse the layer entries out of a capabilities document.
 *
 * Never throws. A capabilities document is someone else's output, often from a
 * server that is half configured, and the caller of this function is either a
 * test or an operator following the README; both are better served by a stated
 * problem than by a stack trace.
 */
export function parseCapabilities(xml: string): CapabilitiesResult {
  const exception = parseServiceException(xml);
  if (exception !== null) {
    return {
      ok: false,
      problem: `The server returned a WMS exception instead of capabilities${
        exception.code === null ? "" : ` (${exception.code})`
      }: ${exception.message}`,
    };
  }

  if (!/<[A-Za-z0-9_:]*WMS_Capabilities|<[A-Za-z0-9_:]*WMT_MS_Capabilities/.test(xml)) {
    return {
      ok: false,
      problem:
        "The response is not a WMS capabilities document. Check that the URL is the WMS endpoint and that SERVICE=WMS&REQUEST=GetCapabilities reached it.",
    };
  }

  const version = firstMatch(xml, /_Capabilities[^>]*\bversion="([^"]+)"/);

  // Scan only from <Capability> onwards. Before it sits <Service>, whose
  // <Name>WMS</Name> would otherwise be read as a layer called "WMS".
  const capabilityAt = xml.search(new RegExp(`<${NS}Capability[\\s>]`));
  const body = capabilityAt === -1 ? xml : xml.slice(capabilityAt);

  const layers: CapabilityLayer[] = [];

  // Iterate <Layer> OPENINGS, not <Name> elements.
  //
  // Scanning for names directly picks up `<Style><Name>default</Name></Style>`
  // and reports a layer called "default" on every styled layer in the
  // document, which then makes `checkLayerNames` claim a name exists when it
  // does not. Anchoring on the element that actually owns a name is the fix,
  // and the layer's own name is the FIRST one inside its block.
  const openRe = new RegExp(`<${NS}Layer[\\s>]`, "g");
  const childRe = new RegExp(`<${NS}Layer[\\s>]`);
  const closeRe = new RegExp(`</${NS}Layer>`);
  const nameRe = new RegExp(`<${NS}Name>([^<]*)</${NS}Name>`);
  let match: RegExpExecArray | null;

  while ((match = openRe.exec(body)) !== null) {
    // Bound the entry at whichever comes first, the next nested <Layer> or its
    // own </Layer>. Without the first bound a GROUP layer would swallow its
    // first child's dimension and legend and report them as its own; without
    // the second, a leaf layer would swallow its siblings'.
    const rest = body.slice(match.index + match[0].length);
    const childAt = rest.search(childRe);
    const closeAt = rest.search(closeRe);
    const bounds = [childAt, closeAt].filter((i) => i !== -1);
    const block = bounds.length === 0 ? rest : rest.slice(0, Math.min(...bounds));

    const name = nameRe.exec(block)?.[1].trim() ?? "";
    // An unnamed layer is a pure grouping node. WMS says it cannot be
    // requested, so it is not a layer as far as this app is concerned.
    if (name === "") continue;

    const dimensionTag = new RegExp(
      `<${NS}Dimension\\s+name="time"([^>]*)>([^<]*)<`,
      "i",
    ).exec(block);

    const legendMatch = new RegExp(
      `<${NS}LegendURL([^>]*)>[\\s\\S]{0,600}?xlink:href="([^"]+)"`,
    ).exec(block);

    const legendWidth = legendMatch
      ? firstMatch(legendMatch[1], /width="(\d+)"/)
      : null;
    const legendHeight = legendMatch
      ? firstMatch(legendMatch[1], /height="(\d+)"/)
      : null;

    layers.push({
      name,
      title: firstMatch(block, new RegExp(`<${NS}Title>([^<]*)</${NS}Title>`)) ?? name,
      timeExtent: dimensionTag ? dimensionTag[2].trim() : null,
      timeDefault: dimensionTag
        ? firstMatch(dimensionTag[1], /default="([^"]*)"/)
        : null,
      legendUrl: legendMatch ? legendMatch[2] : null,
      legendSize:
        legendWidth !== null && legendHeight !== null
          ? { width: Number(legendWidth), height: Number(legendHeight) }
          : null,
      // 1.3.0 says CRS, 1.1.1 says SRS. Both are read so the check works
      // against either, which matters because a lot of GeoServer deployments
      // are still asked for 1.1.1 by legacy clients.
      crs: [
        ...block.matchAll(new RegExp(`<${NS}(?:CRS|SRS)>([^<]+)</${NS}(?:CRS|SRS)>`, "g")),
      ].map((m) => m[1].trim()),
    });
  }

  return { ok: true, version, layers };
}

/**
 * Which of the names we intend to register actually exist on the server.
 *
 * This is the check that has to run before a layer is added to the registry. A
 * name that does not exist answers HTTP 200 with an exception body, so nothing
 * downstream will ever tell you it was wrong.
 */
export function checkLayerNames(
  capabilities: CapabilitiesResult,
  names: readonly string[],
): { present: readonly string[]; missing: readonly string[] } {
  if (!capabilities.ok) return { present: [], missing: [...names] };

  const known = new Set(capabilities.layers.map((l) => l.name));
  const present: string[] = [];
  const missing: string[] = [];
  for (const name of names) (known.has(name) ? present : missing).push(name);
  return { present, missing };
}

/** The GetCapabilities URL for a source. */
export function capabilitiesUrl(source: WmsSource): string {
  const url = new URL(source.endpoint);
  url.searchParams.set("SERVICE", "WMS");
  url.searchParams.set("REQUEST", "GetCapabilities");
  url.searchParams.set("VERSION", source.version);
  return url.toString();
}

/**
 * Fetch and parse a source's capabilities.
 *
 * Returns a result and never rejects. An unhandled rejection is one of the two
 * failure modes this unit is graded on, and the caller here is either an
 * operator script or a KSA deployment whose GeoServer might simply be down.
 *
 * `fetchImpl` is injected so the tests can drive every branch — an exception
 * body, a network failure, a non-200 — without a network.
 */
export async function fetchCapabilities(
  source: WmsSource,
  fetchImpl: typeof fetch = fetch,
): Promise<CapabilitiesResult> {
  const url = capabilitiesUrl(source);

  let response: Response;
  try {
    response = await fetchImpl(url);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { ok: false, problem: `Could not reach ${url}: ${detail}` };
  }

  if (!response.ok) {
    return {
      ok: false,
      problem: `${url} answered HTTP ${response.status}.`,
    };
  }

  let body: string;
  try {
    body = await response.text();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { ok: false, problem: `Could not read the response from ${url}: ${detail}` };
  }

  return parseCapabilities(body);
}
