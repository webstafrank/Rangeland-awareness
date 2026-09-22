/**
 * The transport, against a fetch that is a function this file wrote.
 *
 * No network, no server, no mocking library and no clock. Every case here is a
 * failure mode that produces a different sentence on screen, which is the whole
 * reason the client answers with a union instead of throwing.
 */

import { describe, expect, it } from "vitest";
import {
  DEFAULT_TIMEOUT_MS,
  createBackendClient,
  failureMessage,
  parseRetryAfter,
} from "@/services/backend-api/client";
import type { CreateRunBody } from "@/services/backend-api/types";

/* ------------------------------------------------------------- fixtures --- */

const BASE = "http://backend.test:8000";

function jsonResponse(
  body: unknown,
  init: { status?: number; headers?: Record<string, string> } = {},
): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
}

/** Records what it was called with, answers with what it was given. */
function stubFetch(responder: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : String(input);
    calls.push({ url, init });
    return responder(url, init);
  }) as typeof globalThis.fetch;
  return { fn, calls };
}

function client(responder: Parameters<typeof stubFetch>[0]) {
  const { fn, calls } = stubFetch(responder);
  return { api: createBackendClient({ fetch: fn, baseUrl: BASE }), calls };
}

const HEALTH = {
  status: "ok",
  service: "rangeland-backend",
  version: "1.0.0",
  geoserver: {
    endpoint: "http://192.168.0.40:8080/geoserver",
    reachable: true,
    detail: null,
    layerCount: 23,
    elapsedMs: 221,
  },
};

const STATUS = {
  runId: "r_8f3c21a9c4e1",
  topic: "flood-risk",
  status: "running",
  stages: [
    { id: "resolve", label: "Resolving area geometry", state: "done" },
    { id: "fetch", label: "Fetching criterion layers", state: "running" },
    { id: "publish", label: "Publishing layers", state: "skipped" },
  ],
  progress: 0.28,
  startedAt: "2026-09-14T15:04:11Z",
  endedAt: null,
  error: null,
};

const RESULT = {
  runId: "r_8f3c21a9c4e1",
  config: {
    topic: "flood-risk",
    areas: [{ type: "Feature", geometry: { type: "Polygon", coordinates: [] } }],
    weights: { slope: 0.5, rainfall: 0.5 },
    targetCrs: "EPSG:32637",
    resolution: 30,
    publishLayers: false,
  },
  generatedAt: "2026-09-14T15:09:44Z",
  indicator: { id: "fhi", label: "Flood Risk Index" },
  breaks: [1.82, 2.41, 3.05, 3.76],
  classes: [
    { class: 1, label: "Very low", pixels: 412033, areaKm2: 370.8, share: 0.31 },
  ],
  contribution: { slope: 0.6, rainfall: 0.4 },
  layers: [],
};

const RUN_BODY: CreateRunBody = {
  topic: "flood-risk",
  areas: [{ type: "Polygon", coordinates: [] }],
  weights: { slope: 0.5, rainfall: 0.5 },
  targetCrs: "EPSG:32637",
  resolution: 30,
};

/* ------------------------------------------------------------------ urls --- */

describe("urls", () => {
  it("puts every path under /api/v1 on the configured base", async () => {
    const { api, calls } = client(() => jsonResponse(HEALTH));
    await api.health();
    expect(calls[0].url).toBe("http://backend.test:8000/api/v1/health");
  });

  it("encodes a topic slug, which arrives from a route parameter", async () => {
    const { api, calls } = client(() =>
      jsonResponse({
        topic: "x",
        method: "weighted-overlay",
        criteria: [],
        defaultWeights: {},
        unfilled: [],
      }),
    );
    await api.topicCriteria("flood risk/../etc");
    expect(calls[0].url).toBe(
      "http://backend.test:8000/api/v1/topics/flood%20risk%2F..%2Fetc/criteria",
    );
  });

  it("never lets a response be cached", async () => {
    const { api, calls } = client(() => jsonResponse(STATUS));
    await api.runStatus("r_1");
    expect(calls[0].init?.cache).toBe("no-store");
  });

  it("posts a run as JSON", async () => {
    const { api, calls } = client(() =>
      jsonResponse(
        { runId: "r_1", statusUrl: "/api/v1/runs/r_1", status: "queued", cached: false, stages: [] },
        { status: 202 },
      ),
    );
    await api.createRun(RUN_BODY);
    expect(calls[0].init?.method).toBe("POST");
    expect(JSON.parse(String(calls[0].init?.body))).toEqual(RUN_BODY);
  });
});

/* --------------------------------------------------------------- success --- */

describe("a good answer", () => {
  it("parses health and reports the status code", async () => {
    const { api } = client(() => jsonResponse(HEALTH));
    const result = await api.health();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.geoserver.reachable).toBe(true);
    expect(result.status).toBe(200);
  });

  it("keeps fields the contract does not declare", async () => {
    // The contract's own rule: additive fields are not breaking, and the app
    // must ignore fields it does not know. Ignoring is not rejecting.
    const { api } = client(() => jsonResponse({ ...HEALTH, queueDepth: 3 }));
    const result = await api.health();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect((result.data as Record<string, unknown>).queueDepth).toBe(3);
  });

  it("reads Retry-After off a poll", async () => {
    const { api } = client(() => jsonResponse(STATUS, { headers: { "Retry-After": "2" } }));
    const result = await api.runStatus("r_8f3c21a9c4e1");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.retryAfterMs).toBe(2000);
  });

  it("distinguishes a cached run from new work by its status code", async () => {
    const body = {
      runId: "r_1",
      statusUrl: "/api/v1/runs/r_1",
      status: "succeeded",
      cached: true,
      stages: [],
    };
    const { api } = client(() => jsonResponse(body, { status: 200 }));
    const result = await api.createRun(RUN_BODY);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.status).toBe(200);
    expect(result.data.cached).toBe(true);
  });

  it("parses a result, including its echoed config", async () => {
    const { api } = client(() => jsonResponse(RESULT));
    const result = await api.runResult("r_8f3c21a9c4e1");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.breaks).toEqual([1.82, 2.41, 3.05, 3.76]);
    expect(result.data.config.targetCrs).toBe("EPSG:32637");
    expect(result.data.classes[0].share).toBe(0.31);
  });
});

/* -------------------------------------------------------------- failures --- */

describe("failures are told apart", () => {
  it("reports a refused connection as unreachable, with the real reason", async () => {
    const { api } = client(() => {
      const outer = new Error("fetch failed");
      (outer as { cause?: unknown }).cause = new Error("ECONNREFUSED 127.0.0.1:8000");
      throw outer;
    });
    const result = await api.health();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.kind).toBe("unreachable");
    // "fetch failed" alone names nothing. The cause is the useful half.
    expect(result.failure.message).toContain("ECONNREFUSED");
  });

  it("reports an abort as a timeout, not as unreachable", async () => {
    const { api } = client(() => {
      const error = new Error("aborted");
      error.name = "TimeoutError";
      throw error;
    });
    const result = await api.runStatus("r_1");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.kind).toBe("timeout");
    if (result.failure.kind !== "timeout") return;
    expect(result.failure.timeoutMs).toBe(DEFAULT_TIMEOUT_MS);
  });

  it("keeps the status and the parsed field errors off a 400", async () => {
    const body = {
      error: "Invalid run configuration",
      fieldErrors: {
        weights: ["Weights sum to 0.9000, not 1.0."],
        targetCrs: ["EPSG:4326 is geographic."],
      },
    };
    const { api } = client(() => jsonResponse(body, { status: 400 }));
    const result = await api.createRun(RUN_BODY);
    expect(result.ok).toBe(false);
    if (result.ok || result.failure.kind !== "http") return;
    expect(result.failure.status).toBe(400);
    expect(result.failure.error?.fieldErrors?.weights).toHaveLength(1);
    // What the page shows: the service's own sentence, not a generic one.
    expect(failureMessage(result.failure)).toBe("Invalid run configuration");
  });

  it("keeps the 409 that means 'not finished yet' distinct from a 404", async () => {
    const conflict = {
      error: 'Run "r_1" has not succeeded; it is running.',
      runStatus: "running",
      statusUrl: "/api/v1/runs/r_1",
    };
    const { api } = client(() => jsonResponse(conflict, { status: 409 }));
    const result = await api.runResult("r_1");
    expect(result.ok).toBe(false);
    if (result.ok || result.failure.kind !== "http") return;
    expect(result.failure.status).toBe(409);
    expect(result.failure.error?.runStatus).toBe("running");
  });

  it("survives an HTML error page from a proxy", async () => {
    // A 502 from nginx is HTML. response.json() would throw a SyntaxError that
    // says nothing about the 502, which is the useful half of the answer.
    const { api } = client(
      () => new Response("<html><body>502 Bad Gateway</body></html>", { status: 502 }),
    );
    const result = await api.health();
    expect(result.ok).toBe(false);
    if (result.ok || result.failure.kind !== "http") return;
    expect(result.failure.status).toBe(502);
    expect(result.failure.error).toBeNull();
  });

  it("refuses a 200 that is not the declared shape, and says which field", async () => {
    // The specific bug this prevents: a progress that arrives as a string
    // renders a bar at NaN percent, which reads as a stalled run.
    const { api } = client(() => jsonResponse({ ...STATUS, progress: "0.28" }));
    const result = await api.runStatus("r_1");
    expect(result.ok).toBe(false);
    if (result.ok || result.failure.kind !== "malformed") return;
    expect(result.failure.detail).toContain("progress");
  });

  it("refuses a 200 that is not JSON at all, and keeps the body bounded", async () => {
    const { api } = client(() => new Response("x".repeat(5000), { status: 200 }));
    const result = await api.health();
    expect(result.ok).toBe(false);
    if (result.ok || result.failure.kind !== "malformed") return;
    expect(result.failure.detail.length).toBeLessThanOrEqual(200);
  });

  it("refuses an unknown run status rather than rendering it", async () => {
    const { api } = client(() => jsonResponse({ ...STATUS, status: "paused" }));
    const result = await api.runStatus("r_1");
    expect(result.ok).toBe(false);
  });
});

/* ---------------------------------------------------------- Retry-After --- */

describe("parseRetryAfter", () => {
  it("reads the delta-seconds form the service sends", () => {
    expect(parseRetryAfter("2")).toBe(2000);
    expect(parseRetryAfter(" 30 ")).toBe(30_000);
  });

  it("reads the HTTP-date form a proxy may rewrite it to", () => {
    const at = new Date(Date.now() + 5000).toUTCString();
    const parsed = parseRetryAfter(at);
    expect(parsed).not.toBeNull();
    // Whole seconds only in that format, so the comparison is loose.
    expect(parsed!).toBeGreaterThan(3000);
    expect(parsed!).toBeLessThanOrEqual(6000);
  });

  it("treats a date in the past as now, never as a negative delay", () => {
    expect(parseRetryAfter(new Date(Date.now() - 60_000).toUTCString())).toBe(0);
  });

  it("returns null for absent or unparseable values, never NaN", () => {
    expect(parseRetryAfter(null)).toBeNull();
    expect(parseRetryAfter("")).toBeNull();
    expect(parseRetryAfter("soon")).toBeNull();
  });
});
