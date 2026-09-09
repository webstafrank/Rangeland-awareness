/**
 * Source resolution: the swap-to-KSA path (rubric E4).
 *
 * The behaviour under test is "an operator sets two environment variables and
 * the map points somewhere else", plus the two ways that can be got wrong.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import { TOPIC_SLUGS } from "@/lib/analysis/topics";
import { GIBS_LAYERS } from "@/lib/wms/layers";
import {
  DEFAULT_SOURCE_ID,
  SOURCES,
  layersForTopic,
  resolveSource,
  resolveSourceFromEnv,
  wmsSource,
} from "@/lib/wms/source";

const GIBS_ENDPOINT = "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi";

describe("resolveSource", () => {
  it("uses the built-in default when nothing is configured", () => {
    const resolved = resolveSource({});

    expect(resolved.source.id).toBe(DEFAULT_SOURCE_ID);
    expect(resolved.source.endpoint).toBe(GIBS_ENDPOINT);
    expect(resolved.source.version).toBe("1.3.0");
    expect(resolved.problems).toEqual([]);
    expect(resolved.overridden).toBe(false);
  });

  it("lets the endpoint override win over the default", () => {
    const resolved = resolveSource({
      endpoint: "https://geoserver.ksa.go.ke/geoserver/wms",
    });

    expect(resolved.source.endpoint).toBe("https://geoserver.ksa.go.ke/geoserver/wms");
    expect(resolved.overridden).toBe(true);
    expect(resolved.problems).toEqual([]);
  });

  it("lets the endpoint override win over a named source's own endpoint", () => {
    const resolved = resolveSource({
      sourceId: "ksa-geoserver",
      endpoint: "https://geoserver.ksa.go.ke/geoserver/wms",
    });

    expect(resolved.source.id).toBe("ksa-geoserver");
    expect(resolved.source.endpoint).toBe("https://geoserver.ksa.go.ke/geoserver/wms");
    expect(resolved.source.version).toBe("1.3.0");
    expect(resolved.overridden).toBe(true);
  });

  it("does not mutate the registry entry when the endpoint is overridden", () => {
    resolveSource({
      sourceId: "ksa-geoserver",
      endpoint: "https://geoserver.ksa.go.ke/geoserver/wms",
    });

    // The override copies. Mutating in place would leak one page's config into
    // every later call in the same process, which under `isolate: false` means
    // into other test files too.
    const fresh = SOURCES.find((s) => s.id === "ksa-geoserver");
    expect(fresh?.endpoint).toBe("https://geoserver.internal.invalid/geoserver/wms");
  });

  it("falls back with a stated reason for an unknown source id, and does not throw", () => {
    const resolved = resolveSource({ sourceId: "sentinel-hub" });

    expect(resolved.source.id).toBe(DEFAULT_SOURCE_ID);
    expect(resolved.problems).toHaveLength(1);
    expect(resolved.problems[0]).toContain("sentinel-hub");
    expect(resolved.problems[0]).toContain("gibs");
    expect(resolved.problems[0]).toContain("Falling back");
  });

  it("rejects an endpoint that is not an absolute URL, with the reason", () => {
    const resolved = resolveSource({ endpoint: "/geoserver/wms" });

    expect(resolved.source.endpoint).toBe(GIBS_ENDPOINT);
    expect(resolved.overridden).toBe(false);
    expect(resolved.problems[0]).toContain("not a valid absolute URL");
  });

  it("rejects a non-http endpoint scheme", () => {
    const resolved = resolveSource({ endpoint: "ftp://tiles.example.org/wms" });

    expect(resolved.source.endpoint).toBe(GIBS_ENDPOINT);
    expect(resolved.problems[0]).toContain("must be http or https");
  });

  it("treats empty strings as unset, because an unset env var is often ''", () => {
    const resolved = resolveSource({ sourceId: "  ", endpoint: "" });

    expect(resolved.source.id).toBe(DEFAULT_SOURCE_ID);
    expect(resolved.problems).toEqual([]);
  });

  it("collects both problems rather than stopping at the first", () => {
    const resolved = resolveSource({ sourceId: "nope", endpoint: "not a url" });

    expect(resolved.problems).toHaveLength(2);
  });
});

describe("resolveSourceFromEnv", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reads NEXT_PUBLIC_WMS_SOURCE and NEXT_PUBLIC_WMS_ENDPOINT", () => {
    vi.stubEnv("NEXT_PUBLIC_WMS_SOURCE", "ksa-geoserver");
    vi.stubEnv("NEXT_PUBLIC_WMS_ENDPOINT", "https://geoserver.ksa.go.ke/geoserver/wms");

    const resolved = resolveSourceFromEnv();

    expect(resolved.source.id).toBe("ksa-geoserver");
    expect(resolved.source.endpoint).toBe("https://geoserver.ksa.go.ke/geoserver/wms");
    expect(wmsSource().endpoint).toBe("https://geoserver.ksa.go.ke/geoserver/wms");
  });

  it("re-reads the environment on every call rather than caching at import", () => {
    expect(wmsSource().endpoint).toBe(GIBS_ENDPOINT);

    vi.stubEnv("NEXT_PUBLIC_WMS_ENDPOINT", "https://example.org/wms");
    expect(wmsSource().endpoint).toBe("https://example.org/wms");

    vi.unstubAllEnvs();
    expect(wmsSource().endpoint).toBe(GIBS_ENDPOINT);
  });
});

describe("layersForTopic", () => {
  it("returns at least one layer for every topic", () => {
    for (const slug of TOPIC_SLUGS) {
      expect(layersForTopic(slug).length).toBeGreaterThan(0);
    }
  });

  it("returns only layers that declare the topic", () => {
    for (const slug of TOPIC_SLUGS) {
      for (const layer of layersForTopic(slug)) {
        expect(layer.topics).toContain(slug);
      }
    }
  });

  it("returns every layer that declares the topic", () => {
    for (const slug of TOPIC_SLUGS) {
      const expected = GIBS_LAYERS.filter((l) => l.topics.includes(slug)).map(
        (l) => l.id,
      );
      expect(layersForTopic(slug).map((l) => l.id)).toEqual(expected);
    }
  });

  it("preserves registry order, because the first layer is the one shown", () => {
    const registry = GIBS_LAYERS.map((l) => l.id);
    for (const slug of TOPIC_SLUGS) {
      const ids = layersForTopic(slug).map((l) => l.id);
      const positions = ids.map((id) => registry.indexOf(id));
      expect(positions).toEqual([...positions].sort((a, b) => a - b));
    }
  });

  it("returns nothing for a source with no registered layers, without throwing", () => {
    vi.stubEnv("NEXT_PUBLIC_WMS_SOURCE", "ksa-geoserver");
    try {
      for (const slug of TOPIC_SLUGS) {
        expect(layersForTopic(slug)).toEqual([]);
      }
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
