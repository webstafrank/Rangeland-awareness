/**
 * The headline indicator each topic reports, its band table, and the two
 * operations every screen has to agree on: which band a value falls in, and how
 * a value is written down.
 *
 * Both live here rather than on the caller because a results page that rounds
 * to one decimal beside a table that rounds to two, or a legend that puts 40 in
 * a different band than the map does, is the class of inconsistency a reader
 * takes as "the numbers are wrong".
 *
 * One headline indicator per topic, deliberately. A topic that reported three
 * would need a chooser, and the analyst has already chosen: the formulas are
 * the choice, the indicator is what they add up to.
 */

import { TOPIC_SLUGS } from "@/lib/analysis/topics";
import type { TopicSlug } from "@/lib/analysis/topics";
import type { IndicatorBand, IndicatorSpec, Severity } from "@/lib/run/result";
import { SEVERITY_ORDER } from "@/lib/run/constants";

/**
 * Bands are written low to high and tile the domain half-open, `[min, max)`.
 * The last band's `max` is null, so nothing above the domain can fall out of
 * the table. `assertIndicatorInvariants` checks both properties, and the gate
 * tests run it over every topic, so an indicator added later is checked without
 * anyone remembering to check it.
 */
const INDICATORS: Readonly<Record<TopicSlug, IndicatorSpec>> = {
  "flood-risk": {
    id: "flood-susceptibility",
    label: "Flood susceptibility",
    // Dimensionless 0..1. Deliberately not called a probability: nothing here
    // is calibrated against observed flood frequency, and naming it a
    // probability would invite someone to multiply it by a population.
    unit: "",
    domain: [0, 1],
    badEnd: "high",
    precision: 2,
    source:
      "Class breaks follow the five-class susceptibility convention used in " +
      "flood-index mapping (Tehrany et al. 2014, J. Hydrol. 512).",
    bands: [
      { id: "very-low", label: "Very low", min: 0, max: 0.15, severity: "none" },
      { id: "low", label: "Low", min: 0.15, max: 0.35, severity: "low" },
      { id: "moderate", label: "Moderate", min: 0.35, max: 0.55, severity: "moderate" },
      { id: "high", label: "High", min: 0.55, max: 0.75, severity: "high" },
      { id: "very-high", label: "Very high", min: 0.75, max: null, severity: "severe" },
    ],
  },

  "drought-monitoring": {
    id: "vhi",
    label: "Vegetation Health Index",
    unit: "",
    domain: [0, 100],
    badEnd: "low",
    precision: 1,
    source:
      "Kogan (1995), Adv. Space Res. 15(11). The <10 / <20 / <30 / <40 drought " +
      "class breaks are the ones NOAA and the Kenya NDMA both report against.",
    bands: [
      { id: "extreme-drought", label: "Extreme drought", min: 0, max: 10, severity: "severe" },
      { id: "severe-drought", label: "Severe drought", min: 10, max: 20, severity: "high" },
      { id: "moderate-drought", label: "Moderate drought", min: 20, max: 30, severity: "moderate" },
      { id: "mild-drought", label: "Mild drought", min: 30, max: 40, severity: "low" },
      { id: "no-drought", label: "No drought", min: 40, max: null, severity: "none" },
    ],
  },

  "rangeland-dynamics": {
    id: "vegetation-condition",
    label: "Vegetation condition",
    unit: "",
    domain: [0, 100],
    badEnd: "low",
    precision: 1,
    source:
      "Percent-of-reference condition scaled the way the Vegetation Condition " +
      "Index is (Kogan 1990, Int. J. Remote Sens. 11), with degradation breaks " +
      "at the quintiles used in rangeland trend reporting.",
    bands: [
      { id: "severely-degraded", label: "Severely degraded", min: 0, max: 20, severity: "severe" },
      { id: "degraded", label: "Degraded", min: 20, max: 40, severity: "high" },
      { id: "stressed", label: "Stressed", min: 40, max: 60, severity: "moderate" },
      { id: "fair", label: "Fair", min: 60, max: 80, severity: "low" },
      { id: "good", label: "Good", min: 80, max: null, severity: "none" },
    ],
  },

  "food-security": {
    id: "ipc-phase",
    label: "IPC phase",
    unit: "phase",
    // Starts at 1, not 0: there is no phase zero, and a domain floor of 0 would
    // let an interval reach a value the scale does not define.
    domain: [1, 5],
    badEnd: "high",
    precision: 1,
    source:
      "IPC Acute Food Insecurity Reference Table, IPC Technical Manual v3.1 " +
      "(2021). Phase names are the published ones and are not paraphrased.",
    bands: [
      { id: "minimal", label: "Minimal", min: 1, max: 2, severity: "none" },
      { id: "stressed", label: "Stressed", min: 2, max: 3, severity: "low" },
      { id: "crisis", label: "Crisis", min: 3, max: 4, severity: "moderate" },
      { id: "emergency", label: "Emergency", min: 4, max: 5, severity: "high" },
      { id: "famine", label: "Famine", min: 5, max: null, severity: "severe" },
    ],
  },
};

/** The headline indicator for a topic. Non-optional: a topic without one is a bug. */
export function indicatorFor(topic: TopicSlug): IndicatorSpec {
  const found = INDICATORS[topic];
  if (!found) throw new Error(`run: no indicator for topic "${topic}"`);
  return found;
}

/** Every indicator, for the tests that assert the invariants over all of them. */
export function allIndicators(): readonly IndicatorSpec[] {
  return TOPIC_SLUGS.map((slug) => INDICATORS[slug]);
}

/** Width of an indicator's domain. Half the generator is expressed as a fraction of it. */
export function spanOf(indicator: IndicatorSpec): number {
  return indicator.domain[1] - indicator.domain[0];
}

/** Clamps a value into the domain. Called on every number that leaves the engine. */
export function intoDomain(indicator: IndicatorSpec, value: number): number {
  const [low, high] = indicator.domain;
  return value < low ? low : value > high ? high : value;
}

/**
 * The band a value falls in.
 *
 * Half-open bands, `[min, max)`, so a value exactly on a boundary belongs to
 * the band that boundary opens. That is what makes this function total: with
 * both ends inclusive the boundary belongs to two bands and the answer depends
 * on iteration order.
 *
 * Out-of-domain values clamp to an end band rather than throwing. A model can
 * return 103% or -2 from an extrapolation, and the honest rendering of that is
 * the end band plus the raw number, not a crashed page.
 *
 * NaN is the one input rejected. Clamping it would paint a missing value with a
 * real band, and a flood map that reads "Very low" where it actually has no
 * data is the specific failure this app cannot afford. Infinities still clamp:
 * they carry a direction, so an end band is the right answer for them.
 */
export function classify(indicator: IndicatorSpec, value: number): IndicatorBand {
  const bands = indicator.bands;
  if (bands.length === 0) {
    throw new Error(`run: indicator "${indicator.id}" has no bands, so nothing can be classified`);
  }
  if (Number.isNaN(value)) {
    throw new TypeError(
      `run: cannot classify NaN against "${indicator.id}"; handle missing values before classifying`,
    );
  }

  const first = bands[0];
  // Below the floor. The loop would also return `first` here, since every
  // band's max is above it; saying it explicitly documents the clamp rather
  // than leaving it as a side effect of the loop's shape.
  if (value < first.min) return first;

  for (const band of bands) {
    if (band.max === null || value < band.max) return band;
  }

  // Only reachable if the top band has a finite max, which
  // `assertIndicatorInvariants` forbids and the gate tests check. Clamping up
  // is the documented behaviour, so this is a fallback, not an error path.
  return bands[bands.length - 1];
}

/**
 * A value written the way it appears everywhere in the UI: fixed to the
 * indicator's precision, then the unit after a space.
 *
 * Grouping is hand-rolled rather than `toLocaleString`, because the same value
 * is formatted in three places that need not share an ICU locale (a server
 * render, a client hydration, a test assertion). `toLocaleString` would return
 * "1,340" or "1.340" depending on where it ran, so hydration would mismatch and
 * the tests would pass only on the author's machine. A plain space is
 * unambiguous everywhere this app ships.
 *
 * Non-finite input throws for the same reason `classify` rejects NaN: printing
 * "NaN phase" into a government report hides the bug that produced it.
 */
export function formatValue(indicator: IndicatorSpec, value: number): string {
  if (!Number.isFinite(value)) {
    throw new TypeError(
      `run: cannot format ${String(value)} as "${indicator.id}"; handle missing values before formatting`,
    );
  }
  const fixed = stripNegativeZero(value.toFixed(indicator.precision));
  const grouped = groupIntegerPart(fixed);
  return indicator.unit === "" ? grouped : `${grouped} ${indicator.unit}`;
}

export const GROUP_SEPARATOR = " ";
const GROUP_FROM = 1000;

/**
 * "-0" and "-0.0" are what `toFixed` gives for a small negative, and a report
 * that says "-0.0" looks like a defect even though the arithmetic is right.
 */
function stripNegativeZero(fixed: string): string {
  return /^-0(\.0+)?$/.test(fixed) ? fixed.slice(1) : fixed;
}

function groupIntegerPart(fixed: string): string {
  const negative = fixed.startsWith("-");
  const unsigned = negative ? fixed.slice(1) : fixed;
  const [whole, fraction] = unsigned.split(".");
  if (Number(whole) < GROUP_FROM) return fixed;

  let grouped = "";
  for (let i = 0; i < whole.length; i += 1) {
    // A separator before every digit that opens a group of three, counting from
    // the right, except at the very start of the number.
    if (i > 0 && (whole.length - i) % 3 === 0) grouped += GROUP_SEPARATOR;
    grouped += whole[i];
  }
  return (
    (negative ? "-" : "") + (fraction === undefined ? grouped : `${grouped}.${fraction}`)
  );
}

/**
 * The properties `classify` depends on, checked at runtime.
 *
 * These are properties of data, so the type system cannot hold them: nothing in
 * `IndicatorSpec` stops a band running from 20 to 15, or a gap between 35 and
 * 40 that would make `classify` return the wrong band at the seam. Throws on
 * the first violation naming the indicator and the band index, so a failing
 * test says which band is wrong rather than that something is.
 */
export function assertIndicatorInvariants(indicator: IndicatorSpec): void {
  const { id, bands, domain } = indicator;
  // Annotated on the binding, not only on the arrow, so TypeScript treats a
  // call as terminating and narrows `band.max` after the null check below.
  const fail: (message: string) => never = (message) => {
    throw new Error(`run: indicator "${id}" ${message}`);
  };

  if (bands.length === 0) fail("has no bands");
  if (!(domain[0] < domain[1])) fail(`has an empty domain [${domain[0]}, ${domain[1]}]`);
  if (!Number.isInteger(indicator.precision) || indicator.precision < 0) {
    fail(`has a precision that is not a non-negative integer (${indicator.precision})`);
  }
  if (indicator.source.trim() === "") fail("cites no source for its band breaks");
  if (bands[0].min !== domain[0]) {
    fail(`starts its first band at ${bands[0].min}, not at the domain floor ${domain[0]}`);
  }

  const ids = new Set<string>();
  bands.forEach((band, i) => {
    if (!SEVERITY_ORDER.includes(band.severity as Severity)) {
      fail(`band ${i} ("${band.label}") has severity "${band.severity}"`);
    }
    if (band.label.trim() === "") fail(`band ${i} has an empty label`);
    if (ids.has(band.id)) fail(`uses the band id "${band.id}" twice`);
    ids.add(band.id);

    const isLast = i === bands.length - 1;
    if (isLast) {
      if (band.max !== null) {
        fail(`closes its top band at ${band.max}; the top band must be open-ended`);
      }
      if (band.min > domain[1]) {
        fail(`opens its top band at ${band.min}, above the domain ceiling ${domain[1]}`);
      }
      return;
    }
    if (band.max === null) fail(`leaves band ${i} open-ended, but it is not the top band`);
    if (!(band.max > band.min)) {
      fail(`band ${i} runs from ${band.min} to ${band.max}, which is empty or reversed`);
    }
    // Gaps and overlaps are the same defect with opposite sign, so one
    // comparison catches both and can name which it found.
    const nextMin = bands[i + 1].min;
    if (band.max !== nextMin) {
      const kind = band.max < nextMin ? "gap" : "overlap";
      fail(`has a ${kind} between band ${i} (ends ${band.max}) and band ${i + 1} (starts ${nextMin})`);
    }
  });
}

/** The worse of two bands, by severity. Ties keep the first, which is the caller's order. */
export function worseBand(a: IndicatorBand, b: IndicatorBand): IndicatorBand {
  return SEVERITY_ORDER.indexOf(b.severity) > SEVERITY_ORDER.indexOf(a.severity) ? b : a;
}
