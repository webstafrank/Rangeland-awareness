/**
 * Registry integrity.
 *
 * These are the assertions that stop a bad registry entry reaching a map. They
 * cannot prove a layer name exists on the server — only `curl` can do that, and
 * README.md says how — but they do catch every way an entry can be malformed
 * without anyone noticing, because a malformed WMS layer renders as nothing at
 * all rather than as an error.
 */

import { describe, expect, it } from "vitest";

import { TOPIC_SLUGS, isTopicSlug } from "@/services/analysis/topics";
import { GIBS_LAYERS, KSA_LAYERS, getSourceLayer } from "@/services/wms/layers";
import { legendFor } from "@/services/wms/request";
import { DEFAULT_SOURCE_ID, SOURCES } from "@/services/wms/source";
import { extentBounds, layerExtent } from "@/services/wms/time";

describe("sources", () => {
  it("has a unique id per source", () => {
    const ids = SOURCES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("includes the default source id", () => {
    expect(SOURCES.map((s) => s.id)).toContain(DEFAULT_SOURCE_ID);
  });

  it("gives every source an absolute http or https endpoint", () => {
    // Not https-only. The KSA GeoServer is an internal host on plain http, and
    // demanding TLS here would either fail the gate or push someone into
    // inventing an https address that does not exist. What actually has to hold
    // is that the value parses as an absolute URL with a web protocol: a
    // relative or malformed one aims every tile request at this app's own
    // origin and 404s the lot.
    for (const source of SOURCES) {
      const url = new URL(source.endpoint);
      expect(["http:", "https:"], source.id).toContain(url.protocol);
    }
  });

  it("flags any plain-http source, because an https page cannot fetch from one", () => {
    // A page served over https may not load http subresources: the browser
    // blocks them as mixed content, silently, and the tiles simply never
    // arrive. That is a deployment constraint rather than a defect, so this
    // records which sources carry it instead of forbidding them. If this list
    // grows, the deployment story needs revisiting, not this assertion.
    const insecure = SOURCES.filter((s) => new URL(s.endpoint).protocol === "http:");
    expect(insecure.map((s) => s.id)).toEqual(["ksa-geoserver"]);
  });

  it("explains itself when it has no layers", () => {
    for (const source of SOURCES) {
      if (source.layers.length === 0) {
        expect(source.note).toBeTruthy();
      }
    }
  });

  it("ships the KSA slot empty rather than with guessed layer names", () => {
    // A name that does not exist on the target server renders a blank tile, so
    // a plausible guess is worse than nothing: the app would look configured.
    expect(KSA_LAYERS).toEqual([]);
  });
});

describe("GIBS_LAYERS", () => {
  it("has a unique id and a unique layerName per entry", () => {
    expect(new Set(GIBS_LAYERS.map((l) => l.id)).size).toBe(GIBS_LAYERS.length);
    expect(new Set(GIBS_LAYERS.map((l) => l.layerName)).size).toBe(
      GIBS_LAYERS.length,
    );
  });

  it("gives every entry a title, a description and an attribution", () => {
    for (const layer of GIBS_LAYERS) {
      expect(layer.title.length).toBeGreaterThan(0);
      expect(layer.description.length).toBeGreaterThan(0);
      expect(layer.attribution.length).toBeGreaterThan(0);
    }
  });

  it("declares at least one real topic per entry", () => {
    for (const layer of GIBS_LAYERS) {
      expect(layer.topics.length).toBeGreaterThan(0);
      for (const slug of layer.topics) expect(isTopicSlug(slug)).toBe(true);
    }
  });

  it("covers all four topics", () => {
    for (const slug of TOPIC_SLUGS) {
      expect(GIBS_LAYERS.some((l) => l.topics.includes(slug))).toBe(true);
    }
  });

  it("records when each entry was verified against the server", () => {
    for (const layer of GIBS_LAYERS) {
      expect(layer.verifiedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("gives every time-varying layer a parseable extent whose bounds are ordered", () => {
    for (const layer of GIBS_LAYERS) {
      if (layer.timeDimension !== true) continue;

      const bounds = extentBounds(layerExtent(layer));
      expect(bounds).not.toBeNull();
      if (bounds === null) throw new Error("unreachable");
      expect(bounds.start <= bounds.end).toBe(true);
    }
  });

  it("declares a timeDefault that its own extent covers", () => {
    // The server's default granule has to be inside the extent it published.
    // If it is not, our reading of the extent is wrong, not the server's.
    for (const layer of GIBS_LAYERS) {
      if (layer.timeDefault === undefined) continue;

      const bounds = extentBounds(layerExtent(layer));
      if (bounds === null) throw new Error("unreachable");
      expect(layer.timeDefault >= bounds.start).toBe(true);
      expect(layer.timeDefault <= bounds.end).toBe(true);
    }
  });

  it("points every legend at an https URL under the GIBS legends host", () => {
    for (const layer of GIBS_LAYERS) {
      if (layer.legendUrl === undefined) continue;

      const url = new URL(layer.legendUrl);
      expect(url.protocol).toBe("https:");
      expect(url.host).toBe("gibs.earthdata.nasa.gov");
      expect(url.pathname.endsWith(".png")).toBe(true);
    }
  });

  it("gives every legend a declared size, so the panel cannot reflow", () => {
    for (const layer of GIBS_LAYERS) {
      if (layer.legendUrl === undefined) continue;

      expect(layer.legendSize?.width).toBeGreaterThan(0);
      expect(layer.legendSize?.height).toBeGreaterThan(0);
    }
  });

  it("resolves a published legend for every entry", () => {
    const gibs = SOURCES.find((s) => s.id === DEFAULT_SOURCE_ID);
    if (gibs === undefined) throw new Error("unreachable");

    for (const layer of GIBS_LAYERS) {
      expect(legendFor(gibs, layer).kind).toBe("published");
    }
  });
});

describe("getSourceLayer", () => {
  const gibs = SOURCES.find((s) => s.id === DEFAULT_SOURCE_ID);

  it("finds a layer by id", () => {
    if (gibs === undefined) throw new Error("unreachable");
    expect(getSourceLayer(gibs, "ndvi-8day")?.layerName).toBe(
      "MODIS_Terra_NDVI_8Day",
    );
  });

  it("is undefined for an unknown id", () => {
    if (gibs === undefined) throw new Error("unreachable");
    expect(getSourceLayer(gibs, "nope")).toBeUndefined();
  });
});
