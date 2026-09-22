/**
 * A stand-in for the Django service, for the eval lane.
 *
 * The run flow cannot be evalled with `page.route`. Two of the three screens
 * fetch on the SERVER: the running route reads the run status while it renders,
 * and the results route reads the result. Those requests leave the Next
 * process, never the browser, so a route handler installed in the page
 * intercepts nothing and the screens render their "service is not answering"
 * state while the test waits for a progress bar.
 *
 * So the stub is a real HTTP server on a real port, and both sides talk to it
 * exactly as they would to Django. It speaks `contracts/backend-api.md` version
 * 1 and nothing else.
 *
 * Why not run the actual Django service. It would be a better test of the
 * contract and a much worse test of the app: a real run is minutes of GDAL over
 * layers fetched from a GeoServer on one specific LAN, so the suite would be
 * slow, non-deterministic, and red on every machine that cannot reach
 * 192.168.0.40. The real service is verified by its own 181 tests and by a real
 * run against real data; what this lane has to prove is that the app renders
 * what comes back, including the states a real run passes through too quickly
 * to catch.
 *
 * The stage script is the point. `advanceTo` drives the run through its states
 * on demand, so a test can hold the run at 28% and assert what the screen says,
 * which no real backend would let it do.
 */

import { createServer, type Server } from "node:http";

/* ------------------------------------------------------------------ shapes */

export interface StubStage {
  id: string;
  label: string;
  state: "pending" | "running" | "done" | "skipped" | "failed";
  startedAt?: string | null;
  endedAt?: string | null;
  detail?: string | null;
}

/** The plan the real service produces for a flood-risk run over one area. */
export const STUB_STAGES: StubStage[] = [
  { id: "resolve", label: "Resolving area geometry", state: "pending" },
  { id: "fetch", label: "Fetching criterion layers", state: "pending" },
  { id: "derive", label: "Deriving criteria", state: "pending" },
  { id: "reclassify", label: "Reclassifying to risk", state: "pending" },
  { id: "overlay", label: "Weighting and summing", state: "pending" },
  { id: "classify", label: "Classifying into bands", state: "pending" },
  { id: "statistics", label: "Computing statistics", state: "pending" },
  /*
   * Skipped from the plan onward, not at the end, because that is what the real
   * service does: this deployment has no GeoServer write credentials, so
   * `plan_stages` marks publish skipped when the run is created. Verified
   * against a real POST, whose response carried "publish:skipped" before any
   * work had started.
   *
   * It matters for the eval: R3 has to assert the skipped row on a run that is
   * still going, and if publish only became skipped on success the test would
   * have to use a finished run, which the screen immediately navigates away
   * from.
   */
  { id: "publish", label: "Publishing layers to GeoServer", state: "skipped" },
];

export const STUB_RUN_ID = "r_e5a1c2d3b4f6";

/**
 * A result shaped like the one the pipeline returned for the real Tana River
 * run: five classes, four Jenks breaks, four criteria contributing, and no
 * elevation because this deployment publishes no DEM.
 */
export const STUB_RESULT = {
  runId: STUB_RUN_ID,
  config: {
    topic: "flood-risk",
    areas: [
      {
        type: "Feature",
        properties: { area_id: "aoi-1", label: "Tana River box", source: "drawn" },
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [39.0, -1.4],
              [39.6, -1.4],
              [39.6, -0.8],
              [39.0, -0.8],
              [39.0, -1.4],
            ],
          ],
        },
      },
    ],
    weights: {
      slope: 0.2,
      dist_to_river: 0.466667,
      rainfall: 0.266667,
      landcover: 0.066666,
    },
    targetCrs: "EPSG:32637",
    resolution: 30,
    publishLayers: false,
  },
  generatedAt: "2026-09-22T08:14:03+00:00",
  indicator: { id: "fhi", label: "Flood Risk Index" },
  grid: { crs: "EPSG:32637", resolution: 30, width: 928, height: 922 },
  breaks: [1.824, 2.413, 3.051, 3.762],
  classes: [
    { class: 1, label: "Very low", pixels: 265_331, areaKm2: 238.798, share: 0.31 },
    { class: 2, label: "Low", pixels: 205_120, areaKm2: 184.608, share: 0.2397 },
    { class: 3, label: "Moderate", pixels: 154_003, areaKm2: 138.603, share: 0.18 },
    { class: 4, label: "High", pixels: 128_336, areaKm2: 115.502, share: 0.15 },
    { class: 5, label: "Very high", pixels: 102_669, areaKm2: 92.402, share: 0.1203 },
  ],
  contribution: {
    dist_to_river: 0.4123,
    landcover: 0.0611,
    rainfall: 0.2456,
    slope: 0.281,
  },
  validPixels: 855_459,
  rasters: { index: "/tmp/rangeland-workspace/r_e5a1c2d3b4f6/index.tif" },
  layers: [],
};

/** The criteria answer for flood risk on a deployment with no DEM published. */
export const STUB_CRITERIA = {
  topic: "flood-risk",
  method: "weighted-overlay",
  criteria: [
    { id: "elevation", label: "Elevation", unit: "m", filled: true },
    { id: "slope", label: "Slope", unit: "deg", filled: true },
    { id: "dist_to_river", label: "Distance to river", unit: "m", filled: true },
    { id: "rainfall", label: "Rainfall", unit: "mm", filled: true },
    { id: "landcover", label: "Land cover", unit: "", filled: false },
  ],
  defaultWeights: {
    elevation: 0.25,
    slope: 0.15,
    dist_to_river: 0.35,
    rainfall: 0.2,
    landcover: 0.05,
  },
  unfilled: [],
};

/* ------------------------------------------------------------------ server */

export interface StubBackend {
  readonly port: number;
  readonly url: string;
  /** Every path the app asked for, in order. The transcript a test asserts on. */
  readonly calls: string[];
  /** Move the run to the given stage index, everything before it done. */
  advanceTo(index: number): void;
  /** Finish the run: every stage done, the result readable. */
  succeed(): void;
  /** Fail the run at a stage, the way the service reports it. */
  fail(stageId: string, message: string): void;
  /** Answer nothing at all, to exercise the unreachable path. */
  setOffline(offline: boolean): void;
  close(): Promise<void>;
}

export async function startStubBackend(port: number): Promise<StubBackend> {
  let stages: StubStage[] = STUB_STAGES.map((s) => ({ ...s }));
  let status: "queued" | "running" | "succeeded" | "failed" = "queued";
  let error: { stage: string; message: string } | null = null;
  let offline = false;
  const calls: string[] = [];

  /**
   * Weighted exactly as the service weights it: finished stages over total
   * stages would be a different number, and the point of the stub is to behave
   * like the thing it stands in for.
   */
  const progress = () => {
    const finished = stages.filter(
      (s) => s.state === "done" || s.state === "skipped" || s.state === "failed",
    ).length;
    return Math.round((finished / stages.length) * 10_000) / 10_000;
  };

  const statusBody = () => ({
    runId: STUB_RUN_ID,
    topic: "flood-risk",
    status,
    stages,
    progress: progress(),
    startedAt: "2026-09-22T08:10:00+00:00",
    endedAt: status === "succeeded" || status === "failed" ? "2026-09-22T08:14:03+00:00" : null,
    error,
  });

  const server: Server = createServer((req, res) => {
    const path = (req.url ?? "").split("?")[0];
    calls.push(`${req.method} ${path}`);

    if (offline) {
      // Destroyed rather than answered with a 503: "unreachable" in the client
      // means no answer at all, and a 503 would exercise the `http` path.
      req.socket.destroy();
      return;
    }

    const send = (code: number, body: unknown, headers: Record<string, string> = {}) => {
      const text = JSON.stringify(body);
      res.writeHead(code, {
        "Content-Type": "application/json",
        // The app is served from a different origin than this stub, exactly as
        // in a real deployment, so the CORS headers are not optional here.
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        ...headers,
      });
      res.end(text);
    };

    if (req.method === "OPTIONS") return send(204, {});

    if (path === "/api/v1/health") {
      return send(200, {
        status: "ok",
        service: "stub-backend",
        version: "1.0.0",
        geoserver: { endpoint: "stub", reachable: true, detail: null, layerCount: 1 },
      });
    }

    if (path.startsWith("/api/v1/topics/") && path.endsWith("/criteria")) {
      const topic = path.split("/")[4];
      if (topic !== "flood-risk") {
        // What the service answers for a model-track topic: a 200 naming the
        // method, not an error.
        return send(200, {
          topic,
          method: "model",
          criteria: [],
          defaultWeights: {},
          unfilled: [],
          detail: "This topic runs a model, not a weighted overlay.",
        });
      }
      return send(200, STUB_CRITERIA);
    }

    if (path === "/api/v1/runs" && req.method === "POST") {
      return send(
        202,
        {
          runId: STUB_RUN_ID,
          statusUrl: `/api/v1/runs/${STUB_RUN_ID}`,
          status,
          cached: false,
          stages,
        },
      );
    }

    if (path === `/api/v1/runs/${STUB_RUN_ID}`) {
      return send(200, statusBody(), {
        // The header the client is required to honour.
        ...(status === "queued" || status === "running" ? { "Retry-After": "1" } : {}),
      });
    }

    if (path === `/api/v1/runs/${STUB_RUN_ID}/result`) {
      if (status !== "succeeded") {
        return send(409, {
          error: `Run "${STUB_RUN_ID}" has not succeeded; it is ${status}.`,
          runStatus: status,
          statusUrl: `/api/v1/runs/${STUB_RUN_ID}`,
        });
      }
      return send(200, STUB_RESULT);
    }

    return send(404, { error: `No route for ${path}.` });
  });

  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));

  return {
    port,
    url: `http://127.0.0.1:${port}`,
    calls,

    advanceTo(index: number) {
      status = "running";
      stages = STUB_STAGES.map((stage, i) => ({
        ...stage,
        state:
          stage.state === "skipped"
            ? "skipped"
            : i < index
              ? "done"
              : i === index
                ? "running"
                : "pending",
        startedAt: i <= index ? "2026-09-22T08:10:00+00:00" : null,
        endedAt: i < index ? "2026-09-22T08:11:00+00:00" : null,
        detail: i === index ? "928x922 at 30m" : null,
      }));
    },

    succeed() {
      status = "succeeded";
      stages = STUB_STAGES.map((stage) => ({
        ...stage,
        // Publish is the one the real service skips: no write credentials on
        // this deployment. A skipped stage has to stay in the list.
        state: stage.id === "publish" ? "skipped" : "done",
        startedAt: "2026-09-22T08:10:00+00:00",
        endedAt: "2026-09-22T08:14:03+00:00",
      }));
    },

    fail(stageId: string, message: string) {
      status = "failed";
      error = { stage: stageId, message };
      let past = false;
      stages = STUB_STAGES.map((stage) => {
        if (stage.id === stageId) {
          past = true;
          return { ...stage, state: "failed", detail: message };
        }
        return { ...stage, state: past ? "pending" : "done" };
      });
    },

    setOffline(value: boolean) {
      offline = value;
    },

    close() {
      return new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
