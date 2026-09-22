/**
 * The web tier's own health endpoint.
 *
 * Two different questions get one answer, and keeping them apart is the whole
 * point of this route:
 *
 *   1. Is this container alive? If this handler runs at all, yes. That is what
 *      the image's HEALTHCHECK and the orchestrator care about.
 *   2. Can this container reach the Django backend over the internal network?
 *      That is what an operator cares about at 2am, because it is the failure
 *      that makes every page render an empty state with no clue why.
 *
 * So the status code is always 200 and the body carries the verdict. A web tier
 * that is serving pages is not broken because the analysis service is down: the
 * static pages, the sign-in and the request-receipt path all still work. If
 * this returned 503 when the backend was down, compose (and any load balancer
 * in front of it) would take the app out of rotation and turn a degraded system
 * into an outage. Reported, not fatal.
 *
 * `BACKEND_URL` is the server-side, internal address ("http://backend:8000"
 * under compose) and is what gets probed here, because this handler runs in the
 * Next process. It is deliberately NOT the browser's `NEXT_PUBLIC_BACKEND_URL`:
 * checking the browser's value from the server would prove nothing about the
 * path the server components actually use, and the two being different is the
 * normal case, not a misconfiguration.
 */

import { createBackendClient, failureMessage } from "@/services/backend-api";

/**
 * Never prerendered. A health route baked at build time is a lie that reports
 * whatever the build host could reach, forever, from a static file. Next would
 * happily do that here: the handler takes no request argument and reads no
 * dynamic API, so without this it is a candidate for static generation.
 */
export const dynamic = "force-dynamic";

/**
 * Short on purpose, and much shorter than the client's 15s default.
 *
 * The backend's own `/api/v1/health` probes GeoServer before answering, and
 * that probe waits on `GEOSERVER_TIMEOUT` (30s by default) when GeoServer is
 * unreachable. Inheriting the default would mean this route hangs for 15s on
 * every check whenever the LAN is down, and a health endpoint that takes 15s is
 * itself a fault. 4s is far longer than a healthy backend on the same docker
 * network needs (it answers in single-digit milliseconds when its catalogue is
 * cached) and short enough that the answer is always prompt.
 *
 * The consequence is honest and documented: a backend that is up but whose
 * GeoServer probe is slow reads as unreachable from here. The backend's own
 * healthcheck is the authority on the backend; this one reports the hop.
 */
const PROBE_TIMEOUT_MS = 4_000;

export async function GET() {
  const startedAt = Date.now();
  const client = createBackendClient({ timeoutMs: PROBE_TIMEOUT_MS });
  const result = await client.health();
  const elapsedMs = Date.now() - startedAt;

  // The internal URL is echoed back for the same reason the backend echoes its
  // GeoServer endpoint: "which thing is this actually pointed at" has to be
  // answerable from the running system, not by reading a compose file on a
  // host. It is a service name on a private network, not a credential, and no
  // secret is ever read in this file.
  const backendUrl = process.env.BACKEND_URL ?? null;

  const body = result.ok
    ? {
        // The app is only "ok" when the whole chain it depends on is. A backend
        // reporting itself degraded (GeoServer down) is degraded from here too,
        // because from an analyst's seat the map will not draw either way.
        status: result.data.status === "ok" ? "ok" : "degraded",
        service: "rangeland-app",
        version: process.env.APP_VERSION ?? "unknown",
        elapsedMs,
        backend: {
          url: backendUrl,
          reachable: true,
          detail: null as string | null,
          status: result.data.status,
          geoserver: result.data.geoserver,
        },
      }
    : {
        status: "degraded",
        service: "rangeland-app",
        version: process.env.APP_VERSION ?? "unknown",
        elapsedMs,
        backend: {
          url: backendUrl,
          reachable: false,
          // `failureMessage` already distinguishes "did not answer" from
          // "answered and refused", which is the distinction that decides
          // whether an operator restarts a container or reads a log.
          detail: failureMessage(result.failure),
          kind: result.failure.kind,
          status: null as string | null,
          geoserver: null,
        },
      };

  return Response.json(body, {
    status: 200,
    headers: {
      // A cached health check reports the past. `force-dynamic` stops Next from
      // caching it; this stops every proxy and CDN between here and the caller
      // from doing the same thing one layer up.
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}
