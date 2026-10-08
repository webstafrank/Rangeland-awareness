/**
 * What the top bar's service indicator says, from what `/api/health` answered.
 *
 * Pure, so every branch is unit-tested. The route itself (app/api/health)
 * already folds the backend and GeoServer into one verdict; this only maps
 * that verdict, or a failure to reach the route at all, onto four words.
 */

export type ServiceState = "checking" | "online" | "degraded" | "offline";

export interface ServiceReading {
  state: ServiceState;
  /** The pill's visible label. */
  label: string;
  /** The longer explanation, for the tooltip and the accessible description. */
  detail: string;
}

export const CHECKING: ServiceReading = {
  state: "checking",
  label: "Checking service",
  detail: "Asking the analysis service whether it is up.",
};

interface HealthBody {
  status?: unknown;
  backend?: { reachable?: unknown; detail?: unknown; geoserver?: unknown };
}

export function readHealth(body: unknown): ServiceReading {
  const health = (body ?? {}) as HealthBody;
  const reachable = health.backend?.reachable === true;

  if (health.status === "ok" && reachable) {
    return {
      state: "online",
      label: "Service online",
      detail: "The analysis service and its map server are answering.",
    };
  }
  if (reachable) {
    return {
      state: "degraded",
      label: "Service degraded",
      detail:
        "The analysis service is answering but reports a problem upstream, so some map layers may not draw.",
    };
  }
  const why = typeof health.backend?.detail === "string" ? ` ${health.backend.detail}` : "";
  return {
    state: "offline",
    label: "Service offline",
    detail: `The analysis service is not answering, so runs cannot start.${why}`,
  };
}

/** The route itself could not be reached: the app server, not the backend. */
export const UNREACHABLE: ServiceReading = {
  state: "offline",
  label: "Service offline",
  detail: "The health check could not be reached.",
};
