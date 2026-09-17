import { describe, expect, it } from "vitest";
import {
  RUN_PARAM,
  canonicalRequestString,
  requestId,
} from "@/services/analysis/request-id";
import type { AnalysisRequest, RequestArea } from "@/services/analysis/request";
import { SCHEMA_VERSION } from "@/services/analysis/request";
import type { BoundsTuple } from "@/services/geo/bounds";

/**
 * The id gate.
 *
 * What matters here is not that the function returns a string. It is the two
 * properties the results handoff leans on: the same selection must produce the
 * same id however it was assembled, and any change to the configuration must
 * produce a different one. The first is what makes a reload work; the second
 * is what stops an edited URL rendering yesterday's areas beside today's
 * config, which would look right and be wrong.
 */

function area(
  id: string,
  label: string,
  bounds: BoundsTuple = [
    [-1, 36],
    [0, 37],
  ],
): RequestArea {
  return {
    id,
    label,
    source: "point",
    bounds,
    areaKm2: 100,
    feature: {
      type: "Feature",
      properties: null,
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [36, -1],
            [37, -1],
            [37, 0],
            [36, 0],
            [36, -1],
          ],
        ],
      },
    },
  };
}

function request(overrides: Partial<AnalysisRequest> = {}): AnalysisRequest {
  return {
    schemaVersion: SCHEMA_VERSION,
    topic: "flood-risk",
    analysisType: "single",
    model: "random-forest",
    areas: [area("aoi-1", "Point 1")],
    ...overrides,
  };
}

describe("requestId", () => {
  it("is stable across calls", () => {
    expect(requestId(request())).toBe(requestId(request()));
  });

  it("is the documented length and alphabet", () => {
    const id = requestId(request());
    expect(id).toMatch(/^[0-9a-z]+$/);
    expect(id.length).toBeGreaterThan(6);
  });

  it("ignores the order areas were selected in", () => {
    // Two areas chosen in either order are the same study, so they must share
    // one id and therefore one shareable link.
    const a = area("aoi-1", "Alpha", [
      [-1, 36],
      [0, 37],
    ]);
    const b = area("aoi-2", "Beta", [
      [1, 38],
      [2, 39],
    ]);
    expect(requestId(request({ areas: [a, b] }))).toBe(
      requestId(request({ areas: [b, a] })),
    );
  });

  it("ignores the aoi-<n> ids, which are assigned in selection order", () => {
    // The same geometry reselected in a fresh session gets different ids. That
    // must not change the request's identity.
    const first = area("aoi-1", "Alpha");
    const renumbered = { ...area("aoi-7", "Alpha") };
    expect(requestId(request({ areas: [first] }))).toBe(
      requestId(request({ areas: [renumbered] })),
    );
  });

  it("changes when the topic changes", () => {
    expect(requestId(request({ topic: "flood-risk" }))).not.toBe(
      requestId(request({ topic: "drought-monitoring" })),
    );
  });

  it("changes when the model changes", () => {
    expect(requestId(request({ model: "random-forest" }))).not.toBe(
      requestId(request({ model: "xgboost" })),
    );
  });

  it("changes when the analysis type changes", () => {
    expect(requestId(request({ analysisType: "single" }))).not.toBe(
      requestId(request({ analysisType: "comparison" })),
    );
  });

  it("changes when an area's geometry changes", () => {
    const moved = area("aoi-1", "Point 1", [
      [10, 40],
      [11, 41],
    ]);
    expect(requestId(request())).not.toBe(requestId(request({ areas: [moved] })));
  });

  it("changes when an area is added", () => {
    const two = [area("aoi-1", "Alpha"), area("aoi-2", "Beta", [
      [5, 38],
      [6, 39],
    ])];
    expect(requestId(request())).not.toBe(requestId(request({ areas: two })));
  });
});

describe("canonicalRequestString", () => {
  it("writes keys in alphabetical order behind a version tag", () => {
    expect(canonicalRequestString(request())).toMatch(
      /^r1\|areas=.*\|model=random-forest\|topic=flood-risk\|type=single$/,
    );
  });

  it("sorts the area keys", () => {
    const a = area("aoi-1", "Zulu", [
      [9, 39],
      [10, 40],
    ]);
    const b = area("aoi-2", "Alpha", [
      [-1, 36],
      [0, 37],
    ]);
    const canonical = canonicalRequestString(request({ areas: [a, b] }));
    const joined = canonical.match(/areas=([^|]*)/)?.[1] ?? "";
    const keys = joined.split(";");
    expect([...keys].sort()).toEqual(keys);
  });
});

describe("RUN_PARAM", () => {
  it("is the name the results route reads", () => {
    // Named rather than inlined so the writer and the reader cannot drift.
    expect(RUN_PARAM).toBe("run");
  });
});
