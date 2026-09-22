/**
 * Request construction, legends, and telling an exception from a tile.
 */

import { describe, expect, it } from "vitest";

import { GIBS_LAYERS } from "@/services/wms/layers";
import {
  describeTileFailure,
  getMapParams,
  isServiceExceptionBody,
  legendFor,
  paramsKey,
  parseServiceException,
} from "@/services/wms/request";
import { SOURCES, resolveSource } from "@/services/wms/source";
import { resolveLayerTime } from "@/services/wms/time";
import type { WmsLayerSpec, WmsSource } from "@/services/wms/types";

const gibs = resolveSource({}).source;
const ksa = SOURCES.find((s) => s.id === "ksa-geoserver") as WmsSource;

const layer = GIBS_LAYERS.find((l) => l.id === "ndvi-8day") as WmsLayerSpec;

describe("getMapParams", () => {
  it("builds the parameters Leaflet will send, with the resolved TIME", () => {
    const time = resolveLayerTime(layer, { start: "2026-01-01", end: "2026-06-30" });

    expect(getMapParams(gibs, layer, time)).toEqual({
      layers: "MODIS_Terra_NDVI_8Day",
      styles: "",
      format: "image/png",
      transparent: true,
      version: "1.3.0",
      time: "2026-06-30",
    });
  });

  it("sends the clamped date, not the requested one", () => {
    const time = resolveLayerTime(layer, { start: "2026-01-01", end: "2026-12-31" });
    expect(getMapParams(gibs, layer, time)?.time).toBe("2026-09-08");
  });

  it("omits TIME entirely for a layer with no time dimension", () => {
    const params = getMapParams(gibs, layer, { kind: "always" });
    expect(params).not.toBeNull();
    expect(params).not.toHaveProperty("time");
  });

  it("returns null when the window is not covered, so no request is made", () => {
    // The one that matters. Asking anyway would return HTTP 200 and a
    // transparent PNG that no error handler can see.
    const time = resolveLayerTime(layer, { start: "2024-01-01", end: "2024-12-31" });
    expect(getMapParams(gibs, layer, time)).toBeNull();
  });

  it("carries the source's version, so a 1.1.1 server is asked in 1.1.1", () => {
    const legacy: WmsSource = { ...gibs, version: "1.1.1" };
    expect(getMapParams(legacy, layer, { kind: "always" })?.version).toBe("1.1.1");
  });
});

describe("paramsKey", () => {
  it("is equal for equal parameters and different for a changed TIME", () => {
    const a = getMapParams(gibs, layer, { kind: "exact", time: "2026-06-30" });
    const b = getMapParams(gibs, layer, { kind: "exact", time: "2026-06-30" });
    const c = getMapParams(gibs, layer, { kind: "exact", time: "2026-07-01" });

    expect(paramsKey(a)).toBe(paramsKey(b));
    expect(paramsKey(a)).not.toBe(paramsKey(c));
  });

  it("is the empty string for no request", () => {
    expect(paramsKey(null)).toBe("");
  });
});

describe("legendFor", () => {
  it("prefers the URL the server published", () => {
    expect(legendFor(gibs, layer)).toEqual({
      kind: "published",
      url: "https://gibs.earthdata.nasa.gov/legends/MODIS_NDVI_H.png",
      width: 378,
      height: 86,
    });
  });

  it("states that no legend exists rather than deriving one on GIBS", () => {
    // Verified 2026-09-09: GetLegendGraphic on this endpoint answers a
    // ServiceException, so a derived URL would be a broken image.
    const noLegend: WmsLayerSpec = { ...layer, legendUrl: undefined };
    expect(legendFor(gibs, noLegend)).toEqual({
      kind: "none",
      reason: "No legend published for this layer.",
    });
  });

  it("derives a GetLegendGraphic URL on a source that supports it", () => {
    const geoserverLayer: WmsLayerSpec = { ...layer, legendUrl: undefined };
    const legend = legendFor(ksa, geoserverLayer);

    expect(legend.kind).toBe("derived");
    if (legend.kind !== "derived") throw new Error("unreachable");

    const url = new URL(legend.url);
    expect(url.searchParams.get("request")).toBe("GetLegendGraphic");
    expect(url.searchParams.get("layer")).toBe("MODIS_Terra_NDVI_8Day");
    expect(url.searchParams.get("version")).toBe("1.3.0");
    expect(url.searchParams.get("format")).toBe("image/png");
  });
});

describe("parseServiceException", () => {
  // Copied verbatim from the live default endpoint, asked for a layer that
  // does not exist, on 2026-09-09. Note the HTTP status was 200.
  const REAL_EXCEPTION = `<?xml version='1.0' encoding="UTF-8" standalone="no" ?>
<ServiceExceptionReport version="1.3.0" xmlns="http://www.opengis.net/ogc" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.opengis.net/ogc http://schemas.opengis.net/wms/1.3.0/exceptions_1_3_0.xsd">
<ServiceException code="LayerNotDefined">
msWMSLoadGetMapParams(): WMS server error. Unable to access -- invalid LAYER(s)
</ServiceException>
</ServiceExceptionReport>`;

  it("recognises a real WMS ServiceException body as an error", () => {
    const parsed = parseServiceException(REAL_EXCEPTION);

    expect(parsed).not.toBeNull();
    expect(parsed?.code).toBe("LayerNotDefined");
    expect(parsed?.message).toContain("invalid LAYER(s)");
    expect(isServiceExceptionBody(REAL_EXCEPTION)).toBe(true);
  });

  it("recognises the OWS ExceptionReport spelling GeoServer also uses", () => {
    const ows = `<?xml version="1.0"?>
<ows:ExceptionReport xmlns:ows="http://www.opengis.net/ows" version="1.1.0">
  <ows:Exception exceptionCode="InvalidParameterValue" locator="layers">
    <ows:ExceptionText>Could not find layer ksa:ndvi</ows:ExceptionText>
  </ows:Exception>
</ows:ExceptionReport>`;

    const parsed = parseServiceException(ows);
    expect(parsed?.code).toBe("InvalidParameterValue");
    expect(parsed?.message).toBe("Could not find layer ksa:ndvi");
  });

  it("does not mistake a capabilities document for an exception", () => {
    const caps = `<?xml version="1.0"?>
<WMS_Capabilities version="1.3.0"><Capability><Layer><Name>a</Name></Layer></Capability></WMS_Capabilities>`;
    expect(parseServiceException(caps)).toBeNull();
    expect(isServiceExceptionBody(caps)).toBe(false);
  });

  it("does not mistake the capabilities <Exception> format list for an exception", () => {
    // Regression. Every WMS capabilities document advertises the exception
    // formats it supports in an <Exception> element, and matching a bare
    // <Exception> classified the real 2.5MB GIBS document as a server error,
    // so parseCapabilities reported the endpoint as broken.
    const caps = `<?xml version="1.0"?>
<WMS_Capabilities version="1.3.0"><Capability>
  <Request><GetMap><Format>image/png</Format></GetMap></Request>
  <Exception><Format>XML</Format><Format>INIMAGE</Format></Exception>
  <Layer><Name>a</Name></Layer>
</Capability></WMS_Capabilities>`;

    expect(parseServiceException(caps)).toBeNull();
    expect(isServiceExceptionBody(caps)).toBe(false);
  });

  it("does not mistake binary PNG bytes for an exception", () => {
    expect(isServiceExceptionBody("\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR")).toBe(false);
  });

  it("still reports an exception with no text, rather than an empty message", () => {
    const bare = `<ServiceExceptionReport><ServiceException code="Bare"></ServiceException></ServiceExceptionReport>`;
    expect(parseServiceException(bare)?.message).toBe(
      "The WMS server returned an exception.",
    );
  });
});

describe("describeTileFailure", () => {
  it("names the layer and the endpoint that was tried", () => {
    const message = describeTileFailure(gibs, layer);

    expect(message).toContain(layer.title);
    expect(message).toContain(gibs.endpoint);
    expect(message).toContain(gibs.label);
  });
});
