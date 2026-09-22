/**
 * Everything the results view has to compute before it can render, as pure
 * functions over `RunResult`.
 *
 * Split out of the component for one reason: the screen's honesty claims are
 * arithmetic claims. "The shares sum to 100%", "this class covers 1.82 to
 * 2.41", "the outline is the area you asked for" are all statements a test can
 * check in isolation, and none of them should need a DOM to check. The
 * component below this file does layout and nothing else.
 *
 * Nothing here invents a number. Every value is either copied out of the run
 * result or derived from it by an operation named in the comments.
 */

import { sequential } from "@/design/tokens";
import type { ClassRow } from "@/services/backend-api";

/* --------------------------------------------------------------- numbers */

/**
 * Thousands separators, written out rather than taken from `Intl`.
 *
 * `toLocaleString` reads the ambient locale and the build's ICU data, so the
 * same pixel count can render "412,033" on one machine and "412 033" on
 * another. This page is a government artefact whose exports are compared
 * against each other, and a test that asserts a literal string should not be
 * asserting what ICU a CI image shipped with.
 */
export function formatCount(value: number): string {
  if (!Number.isFinite(value)) return "not reported";
  const rounded = Math.round(value);
  const sign = rounded < 0 ? "-" : "";
  const digits = Math.abs(rounded).toString();
  let out = "";
  for (let i = 0; i < digits.length; i += 1) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += ",";
    out += digits[i];
  }
  return sign + out;
}

/** Square kilometres, one decimal. The backend rounds areaKm2 to four. */
export function formatKm2(value: number): string {
  if (!Number.isFinite(value)) return "not reported";
  const [whole, fraction = "0"] = value.toFixed(1).split(".");
  return `${formatCount(Number(whole))}.${fraction}`;
}

/**
 * An index value, at the precision the service actually produced.
 *
 * `overlay.py` rounds every break to six places before it leaves the service,
 * so printing six places back is lossless and printing fewer would state a
 * break the run did not compute. Trailing zeros are dropped so the common case
 * reads "1.82" rather than "1.820000".
 */
export function formatIndex(value: number): string {
  if (!Number.isFinite(value)) return "not reported";
  return Number(value.toFixed(6)).toString();
}

/* ---------------------------------------------------------------- shares */

/** How the shares column was produced, so the page can say which case it hit. */
export interface ShareSplit {
  /** One percentage per class row, one decimal place, in input order. */
  readonly percents: readonly number[];
  /** The raw shares as the service sent them, summed. */
  readonly rawSum: number;
  /** True when `rawSum` is 1.0 within the rubric's ±0.001. */
  readonly withinTolerance: boolean;
  /** True when largest-remainder was applied to make the column total 100.0. */
  readonly apportioned: boolean;
}

/**
 * Shares (0..1) to percentages that add up to exactly 100.0 on screen.
 *
 * Rounding each share independently is the obvious implementation and it is
 * wrong in a way that undermines the whole table: 0.31, 0.205, 0.205, 0.14,
 * 0.14 rounds to a column reading 99.9%, and a reader who checks the
 * arithmetic finds the page cannot add up. Largest remainder (Hamilton)
 * apportionment gives every row its floor and hands the leftover tenths to the
 * rows with the largest discarded fractions, so the column totals 100.0 and no
 * row moves by more than a tenth of a point.
 *
 * The guard matters as much as the rounding. Apportionment FORCES a total of
 * 100%, which would paper over a backend whose shares genuinely do not sum to
 * one. So the raw sum is checked against the rubric's ±0.001 first, and
 * outside that window the rows are rounded independently and the page says the
 * shares did not sum to one, rather than quietly making them.
 */
export function shareSplit(shares: readonly number[]): ShareSplit {
  const rawSum = shares.reduce((sum, share) => sum + share, 0);
  const withinTolerance = shares.length > 0 && Math.abs(rawSum - 1) <= 0.001;

  if (!withinTolerance) {
    return {
      percents: shares.map((share) => Math.round(share * 1000) / 10),
      rawSum,
      withinTolerance: false,
      apportioned: false,
    };
  }

  // Tenths of a percent, so the whole apportionment is integer arithmetic and
  // cannot drift the way a running float total would.
  const TENTHS = 1000;
  const exact = shares.map((share) => share * TENTHS);
  const floors = exact.map(Math.floor);
  const assigned = floors.reduce((sum, tenths) => sum + tenths, 0);
  let residual = TENTHS - assigned;

  const order = exact
    .map((value, index) => ({ index, remainder: value - floors[index] }))
    // Descending remainder; ties break on the earlier row, which keeps the
    // output a pure function of the input rather than of sort stability.
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);

  const tenths = [...floors];
  for (const entry of order) {
    if (residual <= 0) break;
    tenths[entry.index] += 1;
    residual -= 1;
  }

  return {
    percents: tenths.map((value) => value / 10),
    rawSum,
    withinTolerance: true,
    apportioned: true,
  };
}

/** "31.0%", from the one-decimal percentage `shareSplit` produced. */
export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

/* --------------------------------------------------------------- classes */

/**
 * The ordered class ramp: one hue, light to dark, five steps.
 *
 * `design/tokens.ts` calls `sequential` the "magnitude ramp for the map
 * choropleth", which is exactly what a five-class natural-breaks result is.
 * The reserved status scale (`status` in the same file, worn by
 * `<SeverityChip>`) is deliberately NOT used here, and the reason is
 * structural rather than stylistic: that scale has four steps and this
 * classification has five, so two classes would have to share a colour in a
 * legend whose entire job is telling five classes apart. The status scale also
 * encodes concern, and the backend never assigned concern to a class: "Very
 * high" is the top fifth of this run's own index distribution, not a judgement
 * that the situation is critical.
 *
 * The rule `<SeverityChip>` exists to enforce is kept: a swatch is decorative
 * and `aria-hidden`, and every class carries its text label everywhere it
 * appears.
 *
 * Step 4 of the six (`#3987e5`) is the one dropped. The middle of the ramp has
 * the smallest step-to-step separation, so removing a middle step costs the
 * least legibility between neighbours.
 */
export const CLASS_RAMP: readonly string[] = [
  sequential.light[0],
  sequential.light[1],
  sequential.light[2],
  sequential.light[4],
  sequential.light[5],
];

/** The colour for a 1-based class number, wrapping is impossible by clamp. */
export function classColour(classNumber: number): string {
  const index = Math.min(Math.max(classNumber - 1, 0), CLASS_RAMP.length - 1);
  return CLASS_RAMP[index];
}

/**
 * What the breaks say this class covers, in index units.
 *
 * `natural_breaks` returns INTERIOR breaks only (`classes - 1` of them), so the
 * bottom class is open below and the top class is open above. It can also
 * return fewer than `classes - 1` when the surface has fewer distinct values
 * than classes, and in that case the classes past the last break were never
 * separated at all. That is reported as such rather than rendered as an empty
 * range, because an empty range looks like a bug and "no break was needed
 * here" is a real result on a flat surface.
 */
export function intervalLabel(
  classNumber: number,
  breaks: readonly number[],
): string {
  if (breaks.length === 0) return "whole range, no break computed";

  const lowerIndex = classNumber - 2;
  const upperIndex = classNumber - 1;
  const hasLower = lowerIndex >= 0 && lowerIndex < breaks.length;
  const hasUpper = upperIndex >= 0 && upperIndex < breaks.length;

  if (classNumber === 1) {
    return hasUpper ? `below ${formatIndex(breaks[0])}` : "whole range";
  }
  if (!hasLower) return "no break computed";
  if (!hasUpper) return `${formatIndex(breaks[lowerIndex])} and above`;
  return `${formatIndex(breaks[lowerIndex])} to ${formatIndex(breaks[upperIndex])}`;
}

/** One table row, everything the markup needs and nothing it has to compute. */
export interface ClassView {
  readonly classNumber: number;
  readonly label: string;
  readonly pixels: number;
  readonly areaKm2: number;
  readonly share: number;
  readonly percent: number;
  readonly interval: string;
  readonly colour: string;
}

export interface ClassTable {
  readonly rows: readonly ClassView[];
  readonly split: ShareSplit;
  readonly totalPixels: number;
  readonly totalAreaKm2: number;
  /** The row with the most area. Null when every class is empty. */
  readonly largest: ClassView | null;
}

export function classTable(
  classes: readonly ClassRow[],
  breaks: readonly number[],
): ClassTable {
  const split = shareSplit(classes.map((row) => row.share));

  const rows: ClassView[] = classes.map((row, index) => ({
    classNumber: row.class,
    label: row.label,
    pixels: row.pixels,
    areaKm2: row.areaKm2,
    share: row.share,
    percent: split.percents[index] ?? 0,
    interval: intervalLabel(row.class, breaks),
    colour: classColour(row.class),
  }));

  const totalPixels = rows.reduce((sum, row) => sum + row.pixels, 0);
  const totalAreaKm2 = rows.reduce((sum, row) => sum + row.areaKm2, 0);

  let largest: ClassView | null = null;
  for (const row of rows) {
    if (row.pixels === 0) continue;
    if (largest === null || row.areaKm2 > largest.areaKm2) largest = row;
  }

  return { rows, split, totalPixels, totalAreaKm2, largest };
}

/* ---------------------------------------------------------- contribution */

export interface ContributionView {
  readonly id: string;
  readonly label: string;
  readonly contribution: number;
  /** The weight the run was configured with, or null when the id has none. */
  readonly weight: number | null;
  /** contribution - weight, in points. Positive means above its weight. */
  readonly offsetPoints: number | null;
}

/**
 * Contribution beside the weight that produced it.
 *
 * `contribution` is `mean(risk_i) * weight_i` normalised, so a criterion's
 * share of the score can only differ from its weight through `mean(risk_i)`:
 * above its weight means this run's pixels scored high on that criterion, below
 * means they scored low. Showing the two numbers together is what makes that
 * readable, and it is also the clearest possible statement of what the number
 * is NOT. Feature importance would answer "how much does the answer depend on
 * this input", and nothing here asks that question.
 *
 * Sorted by contribution, descending, with the id as the tiebreak so the order
 * is a function of the data and not of object key order.
 */
export function contributionViews(
  contribution: Readonly<Record<string, number>>,
  weights: Readonly<Record<string, number>>,
  labels: Readonly<Record<string, string>>,
): readonly ContributionView[] {
  const ids = Array.from(
    new Set([...Object.keys(contribution), ...Object.keys(weights)]),
  );

  return ids
    .map((id) => {
      const value = contribution[id] ?? 0;
      const weight = typeof weights[id] === "number" ? weights[id] : null;
      return {
        id,
        label: labels[id] ?? id,
        contribution: value,
        weight,
        offsetPoints: weight === null ? null : (value - weight) * 100,
      };
    })
    .sort((a, b) => b.contribution - a.contribution || a.id.localeCompare(b.id));
}

/* ------------------------------------------------------------- timestamps */

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * An ISO instant as "14 Sep 2026, 15:09 UTC".
 *
 * Fixed to UTC and formatted by hand rather than by `Intl`, for the same
 * reason `formatCount` is: the server renders this string and the browser
 * hydrates it, and a locale-dependent or timezone-dependent rendering makes
 * those two disagree. A hydration mismatch on a timestamp is a real bug that
 * only appears for readers outside the server's timezone.
 */
export function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return "not reported";
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return iso;
  const day = at.getUTCDate();
  const month = MONTHS[at.getUTCMonth()];
  const year = at.getUTCFullYear();
  const hh = String(at.getUTCHours()).padStart(2, "0");
  const mm = String(at.getUTCMinutes()).padStart(2, "0");
  return `${day} ${month} ${year}, ${hh}:${mm} UTC`;
}

/** An ISO date (no time) as "1 Jan 2024". Dates in the window are date-only. */
export function formatDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return iso;
  const [, year, month, day] = match;
  return `${Number(day)} ${MONTHS[Number(month) - 1] ?? month} ${year}`;
}

/* ------------------------------------------------------------- geometry */

/** A projected outline, ready to drop into an SVG `d` attribute. */
export interface AreaOutline {
  /** One `d` string per polygon; holes are extra subpaths, so `evenodd`. */
  readonly paths: readonly string[];
  /** The SVG viewBox the paths were projected into. */
  readonly viewBox: string;
  /** WGS84 bounds of everything drawn: [west, south, east, north]. */
  readonly bounds: readonly [number, number, number, number];
}

type Ring = readonly (readonly [number, number])[];

function isFinitePair(value: unknown): value is [number, number] {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number" &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1])
  );
}

function ringsOf(geometry: unknown): Ring[] {
  if (typeof geometry !== "object" || geometry === null) return [];
  const node = geometry as { type?: unknown; geometry?: unknown; coordinates?: unknown };

  // A Feature wraps the geometry. The contract accepts either, and the config
  // is echoed back exactly as it was posted, so both shapes reach this page.
  if (node.type === "Feature") return ringsOf(node.geometry);

  const collect = (rings: unknown): Ring[] => {
    if (!Array.isArray(rings)) return [];
    const out: Ring[] = [];
    for (const ring of rings) {
      if (!Array.isArray(ring)) continue;
      const points = ring.filter(isFinitePair) as (readonly [number, number])[];
      if (points.length >= 3) out.push(points);
    }
    return out;
  };

  if (node.type === "Polygon") return collect(node.coordinates);
  if (node.type === "MultiPolygon") {
    if (!Array.isArray(node.coordinates)) return [];
    return node.coordinates.flatMap((polygon) => collect(polygon));
  }
  return [];
}

/**
 * The run's areas as SVG paths.
 *
 * This is the only map on the page and it draws OUTLINES ONLY, on purpose.
 * `result.rasters` is a pair of file paths on the backend's disk; the
 * classified raster is not in the response and never reaches the browser, so
 * any coloured surface drawn here would be an illustration of a raster nobody
 * loaded. The outline is a thing the response actually contains: it is
 * `config.areas`, echoed back, which is the boundary the run was computed
 * inside.
 *
 * Projection is plate carrée with the x axis scaled by cos(mean latitude).
 * Not because it is a good projection but because it is an honest one at the
 * scale of a Kenyan county: it keeps the aspect ratio roughly right instead of
 * stretching east-west by a factor of 1/cos(lat), and it needs no library. The
 * figure carries no scale bar and no graticule, because it is a locator, not a
 * measurement.
 *
 * Returns null when there is nothing drawable, which is a state to render as a
 * sentence rather than as an empty box.
 */
export function areaOutline(areas: readonly unknown[], size = 1000): AreaOutline | null {
  const rings = areas.flatMap((area) => ringsOf(area));
  if (rings.length === 0) return null;

  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const ring of rings) {
    for (const [lng, lat] of ring) {
      if (lng < west) west = lng;
      if (lng > east) east = lng;
      if (lat < south) south = lat;
      if (lat > north) north = lat;
    }
  }
  if (!Number.isFinite(west) || !Number.isFinite(south)) return null;

  const midLat = ((south + north) / 2) * (Math.PI / 180);
  const kx = Math.max(Math.cos(midLat), 0.01);

  const spanX = Math.max((east - west) * kx, 1e-9);
  const spanY = Math.max(north - south, 1e-9);
  // One scale for both axes, so the shape is not stretched to fill the box.
  const scale = size / Math.max(spanX, spanY);
  const width = spanX * scale;
  const height = spanY * scale;

  const project = (lng: number, lat: number): [number, number] => [
    (lng - west) * kx * scale,
    // SVG y grows downward and latitude grows upward.
    (north - lat) * scale,
  ];

  const round = (value: number) => Math.round(value * 100) / 100;

  const paths = rings.map((ring) => {
    const points = ring.map(([lng, lat]) => project(lng, lat));
    const head = points[0];
    const body = points
      .slice(1)
      .map(([x, y]) => `L${round(x)} ${round(y)}`)
      .join(" ");
    return `M${round(head[0])} ${round(head[1])} ${body} Z`;
  });

  return {
    paths,
    viewBox: `0 0 ${round(width)} ${round(height)}`,
    bounds: [west, south, east, north],
  };
}

/** "38.4332°E to 40.7316°E, 3.0731°S to 0.0154°S", for the figure's caption. */
export function formatBounds(
  bounds: readonly [number, number, number, number],
): string {
  const [west, south, east, north] = bounds;
  const lng = (value: number) =>
    `${Math.abs(value).toFixed(4)}°${value < 0 ? "W" : "E"}`;
  const lat = (value: number) =>
    `${Math.abs(value).toFixed(4)}°${value < 0 ? "S" : "N"}`;
  return `${lng(west)} to ${lng(east)}, ${lat(south)} to ${lat(north)}`;
}
