/**
 * The gap between what the wizard collects and what the service accepts.
 *
 * Most of these are refusals. That is the point of the module: every one of
 * them is a sentence an analyst can act on, produced before a round trip, and
 * every transformation that IS applied leaves a note that gets rendered.
 */

import { describe, expect, it } from "vitest";
import {
  MAX_RUN_AREAS,
  POINT_BUFFER_KM,
  planRun,
} from "@/services/run-flow/plan";
import { DEFAULT_RESOLUTION, DEFAULT_TARGET_CRS } from "@/services/backend-api";
import type { TopicCriteria } from "@/services/backend-api";
import type { AnalysisRequest, RequestArea } from "@/services/analysis/request";
import type { Feature, Geometry } from "geojson";

/* ------------------------------------------------------------- fixtures --- */

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

const POLYGON: Geometry = {
  type: "Polygon",
  coordinates: [
    [
      [39.0, -1.0],
      [39.5, -1.0],
      [39.5, -0.5],
      [39.0, -0.5],
      [39.0, -1.0],
    ],
  ],
};

function area(over: Partial<RequestArea> = {}): RequestArea {
  return {
    id: "aoi-1",
    label: "Tana River",
    source: "drawn",
    feature: { type: "Feature", geometry: POLYGON, properties: null },
    bounds: [
      [-1.0, 39.0],
      [-0.5, 39.5],
    ],
    areaKm2: 1500,
    ...over,
  };
}

function request(areas: RequestArea[] = [area()]): AnalysisRequest {
  return {
    schemaVersion: "1.0.0",
    topic: "flood-risk",
    analysisType: "single",
    model: "random-forest",
    areas,
  };
}

/* ------------------------------------------------------------- the body --- */

describe("a plan that can run", () => {
  it("builds the POST body the contract declares", () => {
    const plan = planRun(request(), criteria());
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;

    expect(plan.body.topic).toBe("flood-risk");
    expect(plan.body.areas).toHaveLength(1);
    expect(plan.body.targetCrs).toBe(DEFAULT_TARGET_CRS);
    expect(plan.body.resolution).toBe(DEFAULT_RESOLUTION);
    expect(plan.body.publishLayers).toBe(false);
    expect(Object.values(plan.body.weights).reduce((a, b) => a + b, 0)).toBe(1);
  });

  it("sends no dateWindow at all, rather than inventing one", () => {
    // A window nobody chose changes the config hash, so the same selection
    // submitted next month would miss the cache for no reason the analyst
    // caused.
    const plan = planRun(request(), criteria());
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect("dateWindow" in plan.body).toBe(false);
  });

  it("passes a date window through when one is given", () => {
    const plan = planRun(request(), criteria(), {
      dateWindow: { start: "2024-01-01", end: "2024-12-31" },
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.body.dateWindow).toEqual({ start: "2024-01-01", end: "2024-12-31" });
  });

  it("drops a criterion this deployment cannot run and still sums to 1", () => {
    // No DEM is published, so elevation cannot run. Sending the other four
    // unchanged sums to 0.75 and the service refuses the whole run.
    const plan = planRun(request(), criteria({ unfilled: ["elevation"] }));
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.body.weights.elevation).toBeUndefined();
    expect(Object.values(plan.body.weights).reduce((a, b) => a + b, 0)).toBe(1);
  });

  it("carries the app's own labelling into the feature properties", () => {
    // The service echoes the config back in the result, so this is all the
    // results page has to name an area with in a browser that never saw the
    // selection.
    const plan = planRun(request(), criteria());
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.body.areas[0]).toMatchObject({
      type: "Feature",
      properties: { area_id: "aoi-1", label: "Tana River", source: "drawn" },
    });
  });

  it("leaves a polygon's coordinates untouched", () => {
    const plan = planRun(request(), criteria());
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect((plan.body.areas[0] as Feature).geometry).toEqual(POLYGON);
  });

  it("accepts a MultiPolygon, which is what an uploaded county often is", () => {
    const multi: Geometry = {
      type: "MultiPolygon",
      coordinates: [(POLYGON as { coordinates: number[][][] }).coordinates],
    };
    const plan = planRun(
      request([area({ feature: { type: "Feature", geometry: multi, properties: null } })]),
      criteria(),
    );
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect((plan.body.areas[0] as Feature).geometry.type).toBe("MultiPolygon");
  });
});

/* ---------------------------------------------------------------- notes --- */

describe("a point is expanded, and says so", () => {
  const point: Geometry = { type: "Point", coordinates: [39.2, -0.8] };
  const clicked = area({
    id: "aoi-2",
    label: "Point -0.800, 39.200",
    source: "point",
    feature: { type: "Feature", geometry: point, properties: null },
    areaKm2: null,
  });

  it("becomes a square polygon", () => {
    const plan = planRun(request([clicked]), criteria());
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect((plan.body.areas[0] as Feature).geometry.type).toBe("Polygon");
  });

  it("produces a note naming the area and the size, never a silent widening", () => {
    const plan = planRun(request([clicked]), criteria());
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.notes).toHaveLength(1);
    expect(plan.notes[0].areaId).toBe("aoi-2");
    expect(plan.notes[0].message).toContain("Point -0.800, 39.200");
    expect(plan.notes[0].message).toContain(`${POINT_BUFFER_KM * 2}km`);
  });

  it("leaves a polygon with no note, so the list only ever shows real changes", () => {
    const plan = planRun(request([area(), clicked]), criteria());
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.notes.map((n) => n.areaId)).toEqual(["aoi-2"]);
  });

  it("centres the square on the point", () => {
    const plan = planRun(request([clicked]), criteria());
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    const ring = ((plan.body.areas[0] as Feature).geometry as { coordinates: number[][][] })
      .coordinates[0];
    const lngs = ring.map((c) => c[0]);
    const lats = ring.map((c) => c[1]);
    expect((Math.min(...lngs) + Math.max(...lngs)) / 2).toBeCloseTo(39.2, 6);
    expect((Math.min(...lats) + Math.max(...lats)) / 2).toBeCloseTo(-0.8, 6);
  });
});

/* ------------------------------------------------------------- refusals --- */

describe("refusals, each with a sentence", () => {
  it("names a model topic as a different screen, not an error", () => {
    const plan = planRun(
      request(),
      criteria({ method: "model", detail: "This topic runs a model, not a weighted overlay." }),
    );
    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.reason).toBe("model-topic");
    // The service's own sentence, because it is the side that knows why.
    expect(plan.message).toBe("This topic runs a model, not a weighted overlay.");
  });

  it("refuses when every criterion is unfilled, naming them", () => {
    const plan = planRun(
      request(),
      criteria({ unfilled: ["elevation", "slope", "dist_to_river", "rainfall", "landcover"] }),
    );
    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.reason).toBe("no-runnable-criteria");
    expect(plan.message).toContain("elevation");
  });

  it("refuses an empty selection", () => {
    const plan = planRun(request([]), criteria());
    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.reason).toBe("no-areas");
  });

  it("refuses more areas than the service takes, and says the number", () => {
    const many = Array.from({ length: MAX_RUN_AREAS + 1 }, (_, i) =>
      area({ id: `aoi-${i}` }),
    );
    const plan = planRun(request(many), criteria());
    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.reason).toBe("too-many-areas");
    expect(plan.message).toContain(String(MAX_RUN_AREAS));
    expect(plan.message).toContain(String(MAX_RUN_AREAS + 1));
  });

  it("refuses a line, which has no interior to compute over", () => {
    const line: Geometry = {
      type: "LineString",
      coordinates: [
        [39, -1],
        [39.5, -0.5],
      ],
    };
    const plan = planRun(
      request([area({ id: "aoi-9", feature: { type: "Feature", geometry: line, properties: null } })]),
      criteria(),
    );
    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.reason).toBe("unusable-geometry");
    expect(plan.areaIds).toEqual(["aoi-9"]);
  });

  it("reports every unusable area at once, not the first", () => {
    const line: Geometry = { type: "LineString", coordinates: [[39, -1], [39.5, -0.5]] };
    const plan = planRun(
      request([
        area({ id: "aoi-1", feature: { type: "Feature", geometry: line, properties: null } }),
        area({ id: "aoi-2" }),
        area({ id: "aoi-3", feature: { type: "Feature", geometry: line, properties: null } }),
      ]),
      criteria(),
    );
    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.areaIds).toEqual(["aoi-1", "aoi-3"]);
  });

  it("checks the topic before the areas, so a model topic never reports a geometry problem", () => {
    const plan = planRun(request([]), criteria({ method: "model" }));
    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.reason).toBe("model-topic");
  });
});
