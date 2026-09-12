/**
 * The WMS contract types.
 *
 * `WmsLayerSpec` and `WmsSource` keep every field CONTRACT.md section 5 froze;
 * the extra fields below (`description`, `timeExtent`, `legendSize`,
 * `verifiedOn`, and the source's `label` / `supportsGetLegendGraphic`) are
 * additive, and nothing outside this directory constructs either interface.
 *
 * No React, no Leaflet, no `window` anywhere under lib/wms, for the same reason
 * as lib/analysis: the interesting behaviour (source resolution, topic
 * filtering, TIME clamping, exception detection) has to be provable in node.
 */

import type { TopicSlug } from "@/lib/analysis/topics";

/**
 * A closed date range, inclusive, ISO `yyyy-mm-dd` in UTC.
 *
 * Structurally identical to `DateWindow` in lib/run/config.ts and deliberately
 * not imported from it. lib/wms has to stand on its own: the layer registry is
 * useful (and testable) with no run engine present, and a type-only import
 * across two independently built units would make this directory fail to
 * typecheck whenever the other one is mid-edit. Structural typing means a
 * `DateWindow` is accepted here with no cast.
 */
export interface WmsDateWindow {
  start: string;
  end: string;
}

/**
 * One `start/end/resolution` triple out of a WMS `<Dimension name="time">`.
 *
 * Dates are kept exactly as the server published them, which for every layer
 * shipped here is `yyyy-mm-dd` but for a sub-daily layer is a full ISO instant.
 * Comparisons in time.ts use the leading `yyyy-mm-dd`, because that is the
 * granularity a run's date window is expressed in.
 */
export interface TimeInterval {
  start: string;
  end: string;
  /** ISO 8601 duration as published: `P1D`, `P16D`, `P1M`, `P1Y`, `PT30M`. */
  resolution: string;
}

/**
 * A layer's advertised temporal extent: an ORDERED LIST of intervals, not one
 * range.
 *
 * This is the shape because the real extents have holes in them. GIBS publishes
 * `MODIS_Terra_NDVI_8Day` as
 * `2025-02-12/2026-02-08/P1D,2026-02-10/2026-09-08/P1D` — note the missing
 * 2026-02-09 — and `SMAP_L4_Analyzed_Root_Zone_Soil_Moisture` as eight
 * intervals. Collapsing that to min/max would report a date the server has no
 * granule for, and the server answers a missing granule with HTTP 200 and a
 * fully transparent PNG rather than an error, so nothing downstream would ever
 * catch the lie.
 */
export type TemporalExtent = readonly TimeInterval[];

/**
 * The intrinsic size a server declares for a legend image.
 *
 * Kept beside `legendUrl` rather than folded into it because `legendUrl` is
 * frozen as a bare string by CONTRACT.md section 5. Recording the size lets the
 * `<img>` reserve its box, so the panel does not reflow when the legend
 * arrives.
 */
export interface LegendSize {
  width: number;
  height: number;
}

export interface WmsLayerSpec {
  /** Stable app-side id. Used as a React key and in the layer-state record. */
  id: string;
  /** The WMS `LAYERS` parameter. Server-specific: never guess one. */
  layerName: string;
  /** Human title. The server's own <Title> is often just the layer name again. */
  title: string;
  /** One sentence: what an analyst is looking at. Shown under the toggle. */
  description: string;
  topics: readonly TopicSlug[];
  attribution: string;
  /** Legend image published by the server. Absent means none was advertised. */
  legendUrl?: string;
  /** Declared size of `legendUrl`, when the server publishes one. */
  legendSize?: LegendSize;
  /** Layer supports a TIME dimension, so the run's date window applies. */
  timeDimension?: boolean;
  /**
   * The `<Dimension name="time">` value, copied VERBATIM from GetCapabilities.
   *
   * Stored as the raw string rather than as pre-parsed intervals so that
   * refreshing it is a copy-paste from `curl`, diffable against the server
   * with no transcription step, and so the same parser that a KSA GeoServer's
   * capabilities will go through is the one exercised here. Parsed by
   * `parseTimeDimension`.
   */
  timeExtent?: string;
  /** The server's declared `default=` TIME, for reference in the docs. */
  timeDefault?: string;
  /** ISO date the layer name and extent were last checked against the server. */
  verifiedOn?: string;
}

export interface WmsSource {
  id: string;
  /** Human label for the source, shown in the layer panel header. */
  label: string;
  endpoint: string;
  version: "1.1.1" | "1.3.0";
  attribution: string;
  layers: readonly WmsLayerSpec[];
  /**
   * Whether `REQUEST=GetLegendGraphic` returns an image on this server.
   *
   * Not a formality. GIBS advertises LegendURLs but answers GetLegendGraphic
   * with a ServiceException XML body (verified 2026-09-09), so deriving a
   * legend URL there would render a broken image on every layer. GeoServer
   * implements it properly, which is why it is a per-source flag.
   */
  supportsGetLegendGraphic: boolean;
  /** Shown in the panel when the source has no layers registered yet. */
  note?: string;
}
