/**
 * The GetCapabilities reader.
 *
 * The fixture below is trimmed from the live GIBS document read on 2026-09-09:
 * the element nesting, the namespaces, the attribute order and the two time
 * dimension strings are verbatim. It keeps a group layer with children, because
 * that is the shape that makes a naive scanner attribute a child's legend and
 * dimension to its parent.
 */

import { describe, expect, it, vi } from "vitest";

import {
  capabilitiesUrl,
  checkLayerNames,
  fetchCapabilities,
  parseCapabilities,
} from "@/services/wms/capabilities";
import { GIBS_LAYERS } from "@/services/wms/layers";
import { resolveSource } from "@/services/wms/source";
import type { WmsSource } from "@/services/wms/types";

const CAPABILITIES = `<?xml version='1.0' encoding="UTF-8" standalone="no" ?>
<WMS_Capabilities version="1.3.0" xmlns="http://www.opengis.net/wms">
<Service>
  <Name>WMS</Name>
  <Title>NASA Global Imagery Browse Services for EOSDIS WMS</Title>
</Service>
<Capability>
  <Layer>
    <Title>Root</Title>
    <Layer>
      <Name>Vegetation Indices</Name>
      <Title>Vegetation Indices</Title>
      <Layer queryable="0" opaque="0" cascaded="0">
        <Name>MODIS_Terra_NDVI_8Day</Name>
        <Title>MODIS_Terra_NDVI_8Day</Title>
        <CRS>EPSG:4326</CRS>
        <CRS>EPSG:3857</CRS>
        <Dimension name="time" units="ISO8601" default="2026-09-08" nearestValue="0">2025-02-12/2026-02-08/P1D,2026-02-10/2026-09-08/P1D</Dimension>
        <Style>
          <Name>default</Name>
          <Title>default</Title>
          <LegendURL width="378" height="86">
             <Format>image/png</Format>
             <OnlineResource xmlns:xlink="http://www.w3.org/1999/xlink" xlink:type="simple" xlink:href="https://gibs.earthdata.nasa.gov/legends/MODIS_NDVI_H.png"/>
          </LegendURL>
        </Style>
      </Layer>
      <Layer queryable="0" opaque="0" cascaded="0">
        <Name>MODIS_Terra_L3_Land_Surface_Temp_Monthly_Day</Name>
        <Title>MODIS_Terra_L3_Land_Surface_Temp_Monthly_Day</Title>
        <CRS>EPSG:4326</CRS>
        <CRS>EPSG:3857</CRS>
        <Dimension name="time" units="ISO8601" default="2026-08-01" nearestValue="0">2000-03-01/2026-08-01/P1M</Dimension>
      </Layer>
    </Layer>
    <Layer queryable="0">
      <Name>Reference_Features</Name>
      <Title>Reference Features</Title>
      <CRS>EPSG:4326</CRS>
    </Layer>
  </Layer>
</Capability>
</WMS_Capabilities>`;

describe("parseCapabilities", () => {
  const result = parseCapabilities(CAPABILITIES);

  it("reports the WMS version", () => {
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.version).toBe("1.3.0");
  });

  it("does not read the Service element's <Name>WMS</Name> as a layer", () => {
    if (!result.ok) throw new Error("unreachable");
    expect(result.layers.map((l) => l.name)).not.toContain("WMS");
  });

  it("finds every named layer, group layers included", () => {
    if (!result.ok) throw new Error("unreachable");
    expect(result.layers.map((l) => l.name)).toEqual([
      "Vegetation Indices",
      "MODIS_Terra_NDVI_8Day",
      "MODIS_Terra_L3_Land_Surface_Temp_Monthly_Day",
      "Reference_Features",
    ]);
  });

  it("does not read a <Style>'s <Name> as a layer", () => {
    // Regression. Scanning for <Name> elements instead of <Layer> openings
    // reported a layer called "default" for every styled layer in the
    // document, which made checkLayerNames vouch for a name that does not
    // exist. Caught against the real 2.5MB GIBS document, where it produced
    // hundreds of them.
    if (!result.ok) throw new Error("unreachable");
    expect(result.layers.map((l) => l.name)).not.toContain("default");
  });

  it("does not attribute a child's dimension or legend to its parent group", () => {
    if (!result.ok) throw new Error("unreachable");
    const group = result.layers.find((l) => l.name === "Vegetation Indices");
    expect(group?.timeExtent).toBeNull();
    expect(group?.legendUrl).toBeNull();
  });

  it("reads the multi-interval time extent verbatim, ready to paste", () => {
    if (!result.ok) throw new Error("unreachable");
    const ndvi = result.layers.find((l) => l.name === "MODIS_Terra_NDVI_8Day");

    expect(ndvi?.timeExtent).toBe(
      "2025-02-12/2026-02-08/P1D,2026-02-10/2026-09-08/P1D",
    );
    expect(ndvi?.timeDefault).toBe("2026-09-08");
  });

  it("reads the legend URL and its declared size", () => {
    if (!result.ok) throw new Error("unreachable");
    const ndvi = result.layers.find((l) => l.name === "MODIS_Terra_NDVI_8Day");

    expect(ndvi?.legendUrl).toBe(
      "https://gibs.earthdata.nasa.gov/legends/MODIS_NDVI_H.png",
    );
    expect(ndvi?.legendSize).toEqual({ width: 378, height: 86 });
  });

  it("reads every advertised CRS, which is what makes Leaflet's 3857 work", () => {
    if (!result.ok) throw new Error("unreachable");
    const ndvi = result.layers.find((l) => l.name === "MODIS_Terra_NDVI_8Day");
    expect(ndvi?.crs).toEqual(["EPSG:4326", "EPSG:3857"]);
  });

  it("reports a layer with no time dimension as having none", () => {
    if (!result.ok) throw new Error("unreachable");
    const ref = result.layers.find((l) => l.name === "Reference_Features");
    expect(ref?.timeExtent).toBeNull();
    expect(ref?.timeDefault).toBeNull();
  });

  it("handles a namespaced 1.1.1 document with SRS instead of CRS", () => {
    const legacy = `<?xml version="1.0"?>
<WMT_MS_Capabilities version="1.1.1">
<Service><Name>OGC:WMS</Name></Service>
<Capability><Layer><Title>Root</Title>
  <Layer><Name>ksa:ndvi</Name><Title>NDVI</Title><SRS>EPSG:4326</SRS></Layer>
</Layer></Capability></WMT_MS_Capabilities>`;

    const parsed = parseCapabilities(legacy);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error("unreachable");
    expect(parsed.version).toBe("1.1.1");
    expect(parsed.layers.map((l) => l.name)).toEqual(["ksa:ndvi"]);
    expect(parsed.layers[0].crs).toEqual(["EPSG:4326"]);
  });

  it("reports an exception body as a problem, not as zero layers", () => {
    const exception = `<ServiceExceptionReport version="1.3.0"><ServiceException code="InvalidParameterValue">bad SERVICE</ServiceException></ServiceExceptionReport>`;
    const parsed = parseCapabilities(exception);

    expect(parsed.ok).toBe(false);
    if (parsed.ok) throw new Error("unreachable");
    expect(parsed.problem).toContain("InvalidParameterValue");
    expect(parsed.problem).toContain("bad SERVICE");
  });

  it("reports an HTML error page as not being capabilities", () => {
    const parsed = parseCapabilities("<html><body>404 Not Found</body></html>");

    expect(parsed.ok).toBe(false);
    if (parsed.ok) throw new Error("unreachable");
    expect(parsed.problem).toContain("not a WMS capabilities document");
  });
});

describe("checkLayerNames", () => {
  const result = parseCapabilities(CAPABILITIES);

  it("separates the names that exist from the ones that do not", () => {
    const check = checkLayerNames(result, [
      "MODIS_Terra_NDVI_8Day",
      "MODIS_Terra_NDVI_Eight_Day",
    ]);

    expect(check.present).toEqual(["MODIS_Terra_NDVI_8Day"]);
    expect(check.missing).toEqual(["MODIS_Terra_NDVI_Eight_Day"]);
  });

  it("treats every name as missing when capabilities could not be read", () => {
    const check = checkLayerNames({ ok: false, problem: "down" }, ["a", "b"]);
    expect(check.missing).toEqual(["a", "b"]);
    expect(check.present).toEqual([]);
  });

  it("confirms the two shipped names present in the fixture", () => {
    const shipped = GIBS_LAYERS.map((l) => l.layerName).filter((n) =>
      CAPABILITIES.includes(`<Name>${n}</Name>`),
    );
    expect(checkLayerNames(result, shipped).missing).toEqual([]);
  });
});

describe("capabilitiesUrl", () => {
  it("appends the three parameters the request needs", () => {
    const url = new URL(capabilitiesUrl(resolveSource({}).source));

    expect(url.searchParams.get("SERVICE")).toBe("WMS");
    expect(url.searchParams.get("REQUEST")).toBe("GetCapabilities");
    expect(url.searchParams.get("VERSION")).toBe("1.3.0");
  });
});

describe("fetchCapabilities", () => {
  const source = resolveSource({}).source satisfies WmsSource;

  it("parses a successful response", async () => {
    const stub = vi.fn(async () => new Response(CAPABILITIES, { status: 200 }));
    const result = await fetchCapabilities(source, stub as unknown as typeof fetch);

    expect(result.ok).toBe(true);
    expect(stub).toHaveBeenCalledOnce();
  });

  it("returns a problem instead of rejecting when the network fails", async () => {
    const stub = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });

    const result = await fetchCapabilities(source, stub as unknown as typeof fetch);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.problem).toContain("Could not reach");
    expect(result.problem).toContain("fetch failed");
  });

  it("returns a problem for a non-200 response", async () => {
    const stub = vi.fn(async () => new Response("nope", { status: 503 }));
    const result = await fetchCapabilities(source, stub as unknown as typeof fetch);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.problem).toContain("503");
  });

  it("returns a problem for a 200 that is actually an exception", async () => {
    const body = `<ServiceExceptionReport><ServiceException code="AccessDenied">no</ServiceException></ServiceExceptionReport>`;
    const stub = vi.fn(async () => new Response(body, { status: 200 }));

    const result = await fetchCapabilities(source, stub as unknown as typeof fetch);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.problem).toContain("AccessDenied");
  });
});
