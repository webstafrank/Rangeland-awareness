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
  /** How long the app's probe of the service took, as /api/health measured it. */
  responseMs?: number;
  /** When this reading arrived (epoch ms), set by the poll; absent while checking. */
  checkedAt?: number;
}

export const CHECKING: ServiceReading = {
  state: "checking",
  label: "Checking service",
  detail: "Asking the analysis service whether it is up.",
};

interface HealthBody {
  status?: unknown;
  elapsedMs?: unknown;
  backend?: { reachable?: unknown; detail?: unknown; geoserver?: unknown };
}

export function readHealth(body: unknown): ServiceReading {
  const verdict = verdictOf(body);
  const elapsed = ((body ?? {}) as HealthBody).elapsedMs;
  return typeof elapsed === "number" && Number.isFinite(elapsed) && elapsed >= 0
    ? { ...verdict, responseMs: Math.round(elapsed) }
    : verdict;
}

function verdictOf(body: unknown): ServiceReading {
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

/** The clock time of a check, as the reader's locale writes it ("14:42"). */
const clockTime = (at: number) =>
  new Date(at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

/**
 * The tooltip's second line: how fast the service answered and when it was
 * last asked. A clock time rather than "10 s ago", since a tooltip does not
 * re-render while it is open and a relative time would go stale under it.
 * Empty while checking, and either half alone when only one is known.
 */
export function timingNote(reading: ServiceReading, formatTime = clockTime): string {
  const parts: string[] = [];
  if (reading.responseMs !== undefined) parts.push(`Responded in ${reading.responseMs} ms`);
  if (reading.checkedAt !== undefined) parts.push(`checked at ${formatTime(reading.checkedAt)}`);
  const note = parts.join(", ");
  return note && note[0].toUpperCase() + note.slice(1) + ".";
}

/** The tooltip in full: the verdict's detail, then its timing when there is one. */
export function tooltipFor(reading: ServiceReading, formatTime = clockTime): string {
  const note = timingNote(reading, formatTime);
  return note ? `${reading.detail} ${note}` : reading.detail;
}

/** The route itself could not be reached: the app server, not the backend. */
export const UNREACHABLE: ServiceReading = {
  state: "offline",
  label: "Service offline",
  detail: "The health check could not be reached.",
};
