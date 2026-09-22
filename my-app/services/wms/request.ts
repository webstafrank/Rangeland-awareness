/**
 * Building WMS requests, and recognising the answers that are not tiles.
 *
 * The GetMap parameters are built here rather than in the component so the
 * exact request the map will make is assertable in node. The React file's only
 * job is to hand the object to `<WMSTileLayer params={...}>`.
 *
 * Everything about the parameter shape below was checked against the live
 * default endpoint on 2026-09-09, in the lowercase form Leaflet actually emits
 * (`L.Util.getParamString` writes keys verbatim and `uppercase` defaults to
 * false), and answered `200 image/png`.
 */

import type { LayerTimeResolution } from "@/services/wms/time";
import type { WmsLayerSpec, WmsSource } from "@/services/wms/types";

/**
 * The GetMap parameters for one layer.
 *
 * Leaflet supplies `service`, `request`, `crs`, `bbox`, `width` and `height`
 * itself from the map's projection and the tile grid; anything it is given that
 * is not a `TileLayer` option becomes a WMS parameter. So this object carries
 * only what is ours to decide.
 */
export interface WmsGetMapParams {
  layers: string;
  /** Empty string, not omitted: the server default style is what we want, and
   *  WMS 1.3.0 requires the parameter to be present. */
  styles: string;
  format: string;
  transparent: boolean;
  version: "1.1.1" | "1.3.0";
  /** Present only when the layer has a TIME dimension we resolved a date for. */
  time?: string;
}

/** PNG, because the overlay has to let the basemap show through. */
const OVERLAY_FORMAT = "image/png";

/**
 * Build the GetMap parameters, or null when the layer must not be requested.
 *
 * Null for `unavailable` is the whole point. Asking for a date the server has
 * no granule for returns HTTP 200 and a fully transparent PNG, which no error
 * handler anywhere can see; not asking is the only way to turn that into
 * something the analyst can read.
 */
export function getMapParams(
  source: WmsSource,
  layer: WmsLayerSpec,
  time: LayerTimeResolution,
): WmsGetMapParams | null {
  if (time.kind === "unavailable") return null;

  const params: WmsGetMapParams = {
    layers: layer.layerName,
    styles: "",
    format: OVERLAY_FORMAT,
    transparent: true,
    version: source.version,
  };

  if (time.kind === "exact" || time.kind === "clamped") params.time = time.time;

  return params;
}

/**
 * A stable string for a params object, so React can compare by value.
 *
 * react-leaflet calls `layer.setParams()` whenever the `params` prop is not
 * REFERENCE-equal to the previous one, and `setParams` redraws every tile. A
 * fresh object literal each render would therefore refetch the whole grid on
 * every render. The component memoises on this key instead.
 */
export function paramsKey(params: WmsGetMapParams | null): string {
  if (params === null) return "";
  return [
    params.layers,
    params.styles,
    params.format,
    String(params.transparent),
    params.version,
    params.time ?? "",
  ].join("|");
}

/** Where a legend image comes from, and whether one exists at all. */
export type LegendSource =
  | { kind: "published"; url: string; width?: number; height?: number }
  | { kind: "derived"; url: string }
  | { kind: "none"; reason: string };

/**
 * The legend for a layer.
 *
 * Prefers the URL the server advertised in its capabilities, because that is
 * the only one guaranteed to render. Falls back to a GetLegendGraphic request
 * only on sources that answer it: verified 2026-09-09, GIBS answers
 * GetLegendGraphic with a ServiceException XML body even though every one of
 * its layers publishes a LegendURL, so deriving there would put a broken image
 * under every toggle.
 *
 * `none` is a state the UI renders as words. A missing legend is a fact about
 * the server, not a rendering failure, and saying so beats an empty box.
 */
export function legendFor(
  source: WmsSource,
  layer: WmsLayerSpec,
): LegendSource {
  if (layer.legendUrl !== undefined && layer.legendUrl !== "") {
    return {
      kind: "published",
      url: layer.legendUrl,
      width: layer.legendSize?.width,
      height: layer.legendSize?.height,
    };
  }

  if (source.supportsGetLegendGraphic) {
    const url = new URL(source.endpoint);
    url.searchParams.set("service", "WMS");
    url.searchParams.set("version", source.version);
    url.searchParams.set("request", "GetLegendGraphic");
    url.searchParams.set("format", OVERLAY_FORMAT);
    url.searchParams.set("layer", layer.layerName);
    // GeoServer needs this to honour the SLD 1.1 legend rules; MapServer
    // ignores it. Harmless on a server that does not read it.
    url.searchParams.set("sld_version", "1.1.0");
    return { kind: "derived", url: url.toString() };
  }

  return {
    kind: "none",
    reason: "No legend published for this layer.",
  };
}

/** A ServiceException the server returned in place of an image. */
export interface WmsServiceException {
  code: string | null;
  message: string;
}

/**
 * Recognise a WMS exception body.
 *
 * This matters because a WMS server does NOT signal a bad request with a bad
 * status code. Asking the default endpoint for a layer that does not exist
 * returns, verified on 2026-09-09:
 *
 *   HTTP 200, content-type text/xml,
 *   <ServiceExceptionReport ...><ServiceException code="LayerNotDefined">
 *
 * A tile `<img>` fails to decode that and Leaflet fires `tileerror`, which is
 * how the map notices. This function is what turns the body into the sentence
 * the analyst reads, and it is used by the capabilities check too, where the
 * response IS read as text.
 *
 * Both the WMS 1.x `ServiceExceptionReport` and the OWS Common
 * `ExceptionReport` spelling are matched: GeoServer emits the second one for
 * some request types, and treating that as valid XML capabilities would report
 * "zero layers" instead of "the server refused".
 */
export function parseServiceException(
  body: string,
): WmsServiceException | null {
  // `ServiceException` or `ExceptionReport`, never a bare `<Exception>`. Every
  // WMS capabilities document contains an `<Exception>` element listing the
  // exception formats the server supports, so matching that would classify a
  // perfectly good capabilities response as a server error and report the
  // endpoint as broken. Found by parsing the real 2.5MB GIBS document.
  if (
    !/<(?:[A-Za-z0-9_]+:)?(?:ServiceException|ExceptionReport)\b/.test(body)
  ) {
    return null;
  }

  const codeMatch = /(?:exceptionCode|code)="([^"]*)"/.exec(body);
  const textMatch =
    /<(?:[A-Za-z0-9_]+:)?(?:ServiceException|ExceptionText)\b[^>]*>([\s\S]*?)<\//.exec(
      body,
    );

  const message = (textMatch?.[1] ?? "").trim().replace(/\s+/g, " ");

  return {
    code: codeMatch?.[1] ?? null,
    message: message === "" ? "The WMS server returned an exception." : message,
  };
}

/** True when a response body is an exception rather than something usable. */
export function isServiceExceptionBody(body: string): boolean {
  return parseServiceException(body) !== null;
}

/**
 * The sentence shown over the basemap when a layer's tiles fail.
 *
 * One message, whatever the cause, because the browser deliberately does not
 * tell a page why an `<img>` failed: a 404, a DNS failure, a CORS refusal, a
 * connection timeout and an XML body all arrive as the same bare error event.
 * Claiming to know which one it was would be a guess printed as a fact, so the
 * message names what the map tried instead, which is the part that is true and
 * the part an operator needs to fix a misconfigured endpoint.
 */
export function describeTileFailure(
  source: WmsSource,
  layer: WmsLayerSpec,
): string {
  return `${layer.title} did not load from ${source.label}. The server at ${source.endpoint} refused the request, timed out, or returned an error instead of tiles.`;
}
