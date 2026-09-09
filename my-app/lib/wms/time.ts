/**
 * TIME: parsing a server's advertised extent, and deciding what to ask for.
 *
 * The whole reason this file exists, measured against the live GIBS endpoint on
 * 2026-09-09:
 *
 *   MODIS_Terra_NDVI_8Day  TIME=2024-01-01  ->  HTTP 200, transparent PNG
 *   MODIS_Terra_NDVI_8Day  TIME=2026-06-01  ->  HTTP 200, real imagery
 *
 * A date the server has no granule for is not an error. It is a successful
 * response containing nothing, so `tileerror` never fires, no promise rejects,
 * and the analyst sees an empty map that looks exactly like a bug in our app.
 * The only defence is to know the extent before asking, which is what
 * `resolveLayerTime` does.
 *
 * Dropping TIME is NOT a defence. Omitting it makes the server serve its own
 * `default=` granule — the latest one — which silently ignores the date window
 * the analyst chose. An empty tile is honest by comparison.
 *
 * All comparisons are lexicographic on `yyyy-mm-dd` strings. That is exact for
 * ISO dates and sidesteps the classic `new Date("2026-08-01")` trap, where the
 * string parses as UTC midnight and then reads back as 31 July for anyone west
 * of Greenwich. `Date` is used in exactly one place below, for day arithmetic,
 * and only via `Date.UTC`.
 */

import type {
  TemporalExtent,
  TimeInterval,
  WmsDateWindow,
  WmsLayerSpec,
} from "@/lib/wms/types";

/** `yyyy-mm-dd`, the only date shape a run window or a WMS TIME uses here. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Reduce any published dimension value to the `yyyy-mm-dd` it falls on.
 *
 * Sub-daily layers publish full instants (`1998-01-01T00:00:00Z`). A run window
 * is date-granular, so comparing at day precision is the only comparison that
 * means anything; keeping the instant would make `2026-01-01` sort before
 * `2026-01-01T00:00:00Z` and quietly exclude the first day of an extent.
 */
function toDay(value: string): string {
  return value.slice(0, 10);
}

/**
 * Normalise a date to the WMS `TIME` value to send.
 *
 * Returns null rather than throwing for anything unparseable: a hand-edited URL
 * must degrade to a stated message, and a throw here would take the whole
 * results page down with it.
 *
 * Full instants are truncated to their date. Every layer in the registry is
 * daily or coarser, so a time of day could only ever narrow the request to
 * nothing, and the servers accept the date form.
 */
export function formatWmsTime(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;

  const day = toDay(trimmed);
  if (!ISO_DATE.test(day)) return null;

  // Reject the calendar-impossible (2026-02-31, 2026-13-01). Date.UTC is used
  // rather than Date.parse because it never consults the local zone.
  const [y, m, d] = day.split("-").map(Number);
  const stamp = Date.UTC(y, m - 1, d);
  const back = new Date(stamp);
  if (
    back.getUTCFullYear() !== y ||
    back.getUTCMonth() !== m - 1 ||
    back.getUTCDate() !== d
  ) {
    return null;
  }

  return day;
}

/** Days between two `yyyy-mm-dd` dates. Positive when `b` is later. */
function dayDelta(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return (Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000;
}

/**
 * Parse a WMS `<Dimension name="time">` value into its intervals.
 *
 * The published grammar is a comma-separated list whose members are either a
 * single value or `start/end/resolution`. Real servers use both: GIBS publishes
 * `2025-02-12/2026-02-08/P1D,2026-02-10/2026-09-08/P1D` for NDVI (two
 * intervals, with 2026-02-09 missing between them), while a GeoServer layer
 * backed by a handful of granules often publishes a bare list of dates.
 *
 * Unparseable members are skipped rather than thrown on. A capabilities
 * document is someone else's output; one malformed member must not cost us the
 * other twenty-six.
 */
export function parseTimeDimension(raw: string): TemporalExtent {
  const intervals: TimeInterval[] = [];

  for (const member of raw.split(",")) {
    const text = member.trim();
    if (text === "") continue;

    const parts = text.split("/");

    if (parts.length === 1) {
      // A single instant. Represented as a zero-width interval so every
      // consumer sees one shape; PT0S says "this is a point, not a range".
      const only = parts[0].trim();
      if (only === "") continue;
      intervals.push({ start: only, end: only, resolution: "PT0S" });
      continue;
    }

    const [start, end, resolution] = parts.map((p) => p.trim());
    if (start === "" || end === "") continue;
    intervals.push({ start, end, resolution: resolution || "PT0S" });
  }

  return intervals;
}

/** A layer's extent, or an empty list when the server advertised none. */
export function layerExtent(layer: WmsLayerSpec): TemporalExtent {
  return layer.timeExtent ? parseTimeDimension(layer.timeExtent) : [];
}

/** Earliest and latest day an extent covers, or null for an empty extent. */
export function extentBounds(
  extent: TemporalExtent,
): { start: string; end: string } | null {
  if (extent.length === 0) return null;

  let start = toDay(extent[0].start);
  let end = toDay(extent[0].end);
  for (const interval of extent) {
    const s = toDay(interval.start);
    const e = toDay(interval.end);
    if (s < start) start = s;
    if (e > end) end = e;
  }
  return { start, end };
}

/** Whether a `yyyy-mm-dd` day falls inside any interval of an extent. */
export function coversDate(extent: TemporalExtent, day: string): boolean {
  return extent.some(
    (i) => toDay(i.start) <= day && day <= toDay(i.end),
  );
}

/**
 * The covered day closest to `day`, or null for an empty extent.
 *
 * Ties break toward the EARLIER date. Not arbitrary: the tie only arises when
 * `day` sits exactly in the middle of a gap, and the earlier side is the one
 * whose data was actually observed before the window the analyst asked about,
 * so it never presents future imagery as if it were the period under analysis.
 */
export function nearestCoveredDate(
  extent: TemporalExtent,
  day: string,
): string | null {
  let best: string | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const interval of extent) {
    const start = toDay(interval.start);
    const end = toDay(interval.end);
    // Clamping into the interval gives the nearest point of that interval in
    // one step, and gives `day` itself when it is already inside.
    const candidate = day < start ? start : day > end ? end : day;
    const distance = Math.abs(dayDelta(candidate, day));

    if (
      distance < bestDistance ||
      (distance === bestDistance && best !== null && candidate < best)
    ) {
      best = candidate;
      bestDistance = distance;
    }
  }

  return best;
}

/**
 * What the map should ask this layer for, given the run's date window.
 *
 * `exact`     the window's end date is covered; send it.
 * `clamped`   the window's end is not covered but an earlier day in the window
 *             is; send that and say which. The image is still inside the period
 *             under analysis, so it is a substitution, not a different subject.
 * `unavailable` no day in the whole window is covered. The layer is NOT
 *             requested at all — requesting it would paint the transparent
 *             tile that started this file — and the control states why,
 *             naming the nearest date the server does have.
 * `always`    the layer has no TIME dimension, so the window does not apply.
 */
export type LayerTimeResolution =
  | { kind: "always" }
  | { kind: "exact"; time: string }
  | { kind: "clamped"; time: string; requested: string; reason: string }
  | {
      kind: "unavailable";
      requested: string;
      nearest: string | null;
      reason: string;
    };

export function resolveLayerTime(
  layer: WmsLayerSpec,
  window: WmsDateWindow,
): LayerTimeResolution {
  if (layer.timeDimension !== true) return { kind: "always" };

  const requested = formatWmsTime(window.end);
  const from = formatWmsTime(window.start);

  if (requested === null || from === null) {
    return {
      kind: "unavailable",
      requested: window.end,
      nearest: null,
      reason: `The date window ${window.start} to ${window.end} is not a pair of yyyy-mm-dd dates, so no TIME can be requested.`,
    };
  }

  const extent = layerExtent(layer);
  if (extent.length === 0) {
    // No extent published. Sending the requested date is the honest default:
    // the server either has it or answers with its own blank, and we have no
    // grounds to override the analyst's choice.
    return { kind: "exact", time: requested };
  }

  // The latest covered day that is inside the window. Computed by clipping
  // every interval to the window and taking the greatest surviving end, which
  // handles gaps and multi-interval extents in one pass.
  let latest: string | null = null;
  for (const interval of extent) {
    const start = toDay(interval.start);
    const end = toDay(interval.end);
    const clippedStart = start > from ? start : from;
    const clippedEnd = end < requested ? end : requested;
    if (clippedStart > clippedEnd) continue;
    if (latest === null || clippedEnd > latest) latest = clippedEnd;
  }

  if (latest === null) {
    const bounds = extentBounds(extent);
    const nearest = nearestCoveredDate(extent, requested);
    const published =
      bounds === null
        ? "nothing"
        : `${bounds.start} to ${bounds.end}`;
    return {
      kind: "unavailable",
      requested,
      nearest,
      reason:
        `No data in ${from} to ${requested}. This layer publishes ${published}` +
        (nearest === null ? "." : `; the nearest date it covers is ${nearest}.`),
    };
  }

  if (latest === requested) return { kind: "exact", time: requested };

  return {
    kind: "clamped",
    time: latest,
    requested,
    reason: `No data on ${requested}; showing ${latest}, the latest date this layer covers inside the window.`,
  };
}

/** One short line describing a resolution, for the layer control. */
export function describeLayerTime(resolution: LayerTimeResolution): string {
  switch (resolution.kind) {
    case "always":
      return "Not time-varying.";
    case "exact":
      return `Showing ${resolution.time}.`;
    case "clamped":
      return resolution.reason;
    case "unavailable":
      return resolution.reason;
  }
}
