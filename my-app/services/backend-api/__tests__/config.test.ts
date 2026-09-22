/**
 * Which URL each side of the wire uses, and the weight arithmetic the app does
 * before it can POST a run.
 *
 * `resolveBaseUrl` is tested rather than `backendBaseUrl` on purpose. Testing
 * the latter means installing a `window` global or mutating `process.env`, and
 * this lane shares one worker across files by design: a global installed here
 * would surface as a failure in an unrelated suite, depending on file order.
 */

import { describe, expect, it } from "vitest";
import {
  DEFAULT_BACKEND_URL,
  normaliseBaseUrl,
  resolveBaseUrl,
  tileTemplate,
} from "@/services/backend-api/config";
import { runnableWeights, isWeightedOverlay } from "@/services/backend-api/types";
import type { TopicCriteria } from "@/services/backend-api/types";

describe("which URL", () => {
  it("prefers the internal URL on the server", () => {
    expect(
      resolveBaseUrl({
        onServer: true,
        internal: "http://backend:8000",
        publicUrl: "https://ra.ksa.go.ke/api",
      }),
    ).toBe("http://backend:8000");
  });

  it("never uses the internal URL in the browser, which cannot resolve it", () => {
    expect(
      resolveBaseUrl({
        onServer: false,
        internal: "http://backend:8000",
        publicUrl: "https://ra.ksa.go.ke/api",
      }),
    ).toBe("https://ra.ksa.go.ke/api");
  });

  it("falls back to the public URL on a single-host deployment", () => {
    expect(resolveBaseUrl({ onServer: true, publicUrl: "http://10.0.0.5:8000" })).toBe(
      "http://10.0.0.5:8000",
    );
  });

  it("falls back to the service's own default when nothing is configured", () => {
    expect(resolveBaseUrl({ onServer: true })).toBe(DEFAULT_BACKEND_URL);
    expect(resolveBaseUrl({ onServer: false })).toBe(DEFAULT_BACKEND_URL);
  });

  it("drops a trailing slash, which Django answers with a 404 rather than a redirect", () => {
    expect(normaliseBaseUrl("http://backend:8000/")).toBe("http://backend:8000");
    expect(normaliseBaseUrl("  http://backend:8000///  ")).toBe("http://backend:8000");
  });
});

describe("the tile template", () => {
  it("leaves the colon in a layer id unencoded, as the backend's route expects", () => {
    const template = tileTemplate("Hazards_Dashboard:TanaRiver_Slope");
    expect(template).toContain("/api/v1/tiles/Hazards_Dashboard:TanaRiver_Slope");
    expect(template).not.toContain("%3A");
  });

  it("leaves Leaflet's bbox placeholder intact", () => {
    expect(tileTemplate("ws:layer")).toContain("{bbox-epsg-3857}");
  });
});

/* ------------------------------------------------------------- weights ---- */

function criteria(over: Partial<TopicCriteria> = {}): TopicCriteria {
  return {
    topic: "flood-risk",
    method: "weighted-overlay",
    criteria: [],
    defaultWeights: {
      elevation: 0.25,
      slope: 0.15,
      dist_to_river: 0.35,
      rainfall: 0.2,
      landcover: 0.05,
    },
    unfilled: [],
    ...over,
  };
}

function sum(weights: Record<string, number>): number {
  return Object.values(weights).reduce((a, b) => a + b, 0);
}

describe("runnableWeights", () => {
  it("passes the defaults through when everything is available", () => {
    const weights = runnableWeights(criteria())!;
    expect(Object.keys(weights)).toHaveLength(5);
    expect(sum(weights)).toBeCloseTo(1, 9);
  });

  it("drops an unfilled criterion and renormalises the rest", () => {
    // This deployment publishes no DEM, so elevation cannot run. Sending the
    // remaining four unchanged sums to 0.75 and the service refuses the run.
    const weights = runnableWeights(criteria({ unfilled: ["elevation"] }))!;
    expect(weights.elevation).toBeUndefined();
    expect(Object.keys(weights)).toHaveLength(4);
    expect(sum(weights)).toBeCloseTo(1, 9);
  });

  it("sums to exactly 1 after rounding, not nearly 1", () => {
    // The service's tolerance is 1e-6 and it rounds to six places before
    // hashing, so "close enough" is a refused run and a different run id.
    const weights = runnableWeights(criteria({ unfilled: ["elevation", "landcover"] }))!;
    // Three weights of 0.15, 0.35, 0.2 over 0.7: thirds that do not terminate.
    expect(sum(weights)).toBe(1);
    for (const value of Object.values(weights)) {
      expect(Number.isInteger(value * 1e6)).toBe(true);
    }
  });

  it("drops a zero weight, which the service refuses outright", () => {
    const weights = runnableWeights(
      criteria({ defaultWeights: { slope: 0.5, rainfall: 0.5, landcover: 0 } }),
    )!;
    expect(weights.landcover).toBeUndefined();
    expect(sum(weights)).toBe(1);
  });

  it("returns null when nothing survives, rather than an empty POST body", () => {
    expect(runnableWeights(criteria({ unfilled: Object.keys(criteria().defaultWeights) }))).toBeNull();
    expect(runnableWeights(criteria({ defaultWeights: {} }))).toBeNull();
  });

  it("preserves the ratio between the criteria it keeps", () => {
    const weights = runnableWeights(criteria({ unfilled: ["elevation"] }))!;
    // dist_to_river was 0.35 and slope 0.15 before; the ratio must survive.
    expect(weights.dist_to_river / weights.slope).toBeCloseTo(0.35 / 0.15, 5);
  });
});

describe("isWeightedOverlay", () => {
  it("is true for a topic the service can run", () => {
    expect(isWeightedOverlay(criteria())).toBe(true);
  });

  it("is false for a model-track topic, which is not an error", () => {
    expect(isWeightedOverlay(criteria({ method: "model" }))).toBe(false);
  });
});
