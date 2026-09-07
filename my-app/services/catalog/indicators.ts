/**
 * Indicator arithmetic: which band a value falls in, and how a value is
 * written down.
 *
 * Both live here rather than on the caller because every screen has to agree.
 * A results page that rounds to one decimal while a table rounds to two, or a
 * legend that puts 50 in a different band than the map does, is the class of
 * inconsistency users read as "the numbers are wrong".
 */
import type { IndicatorBand, IndicatorSpec } from "@/contracts/catalog";
import { SEVERITIES } from "@/contracts/catalog";

/**
 * Group separator for the integer part, e.g. "1 340".
 *
 * A plain space, and hand-rolled rather than `toLocaleString`, because the
 * value is formatted in three places (server render, client hydration, test
 * assertion) that do not necessarily share an ICU locale. `toLocaleString`
 * would return "1,340" or "1.340" depending on where it ran, so hydration
 * would mismatch and the tests would pass only on the author's machine. A
 * space is unambiguous in every locale this app ships to.
 */
export const GROUP_SEPARATOR = " ";

/** Grouping only kicks in at four digits, so 999 stays "999". */
const GROUP_FROM = 1000;

/**
 * The band a value falls in.
 *
 * Bands are half-open, `[min, max)`, so a value exactly on a boundary belongs
 * to the band that boundary opens. That choice is what makes the function
 * total: with `[min, max]` on both ends the boundary would belong to two bands
 * and the answer would depend on iteration order.
 *
 * Out-of-domain values clamp rather than throw. A model can return 103 % or
 * -2 kg DM/ha from an extrapolation, and the honest rendering of that is the
 * end band plus the raw number, not a crashed page.
 *
 * NaN is the one input that is rejected. Clamping it would silently paint a
 * missing pixel with a real band, and a flood map that reports "Very low"
 * where it actually has no data is the specific failure this app cannot
 * afford. Infinities still clamp: they carry a direction, so the end bands
 * are the right answer for them.
 */
export function classify(
  indicator: IndicatorSpec,
  value: number,
): IndicatorBand {
  const bands = indicator.bands;
  if (bands.length === 0) {
    throw new Error(
      `catalog: indicator "${indicator.id}" has no bands, so no value can be classified`,
    );
  }
  if (Number.isNaN(value)) {
    throw new TypeError(
      `catalog: cannot classify NaN against "${indicator.id}"; handle missing values before classifying`,
    );
  }

  const first = bands[0];
  // Below the domain floor. The loop below would also return `first` for these
  // (every band's max is above them), but saying it explicitly documents the
  // clamp instead of leaving it as a side effect.
  if (value < first.min) return first;

  for (const band of bands) {
    if (band.max === null || value < band.max) return band;
  }

  // Only reachable if the top band has a finite max, which
  // `assertIndicatorInvariants` and the gate tests forbid. Clamping up is the
  // behaviour the contract asks for, so this is a fallback, not an error path.
  return bands[bands.length - 1];
}

/**
 * A value written the way it appears in the UI: fixed to the indicator's
 * precision, then the unit after a space.
 *
 * The space before the unit is SI style and applies to "%" too ("12.5 %"),
 * which keeps one rule instead of a list of exceptions. A dimensionless index
 * gets no unit at all, so VCI reads "27.4" and never "27.4 index".
 *
 * Non-finite input throws for the same reason `classify` rejects NaN: printing
 * "NaN kg DM/ha" or "Infinity %" ships a broken number into a government
 * report rather than surfacing the bug that produced it.
 */
export function formatValue(indicator: IndicatorSpec, value: number): string {
  if (!Number.isFinite(value)) {
    throw new TypeError(
      `catalog: cannot format ${String(value)} as "${indicator.id}"; handle missing values before formatting`,
    );
  }

  const fixed = normalizeNegativeZero(value.toFixed(indicator.precision));
  const grouped = groupIntegerPart(fixed);
  return indicator.unit === "" ? grouped : `${grouped} ${indicator.unit}`;
}

/**
 * "-0" and "-0.0" are what `toFixed` gives for small negatives, and a report
 * that says "-0 kg DM/ha" looks like a defect even though the arithmetic is
 * right. Zero has no sign here.
 */
function normalizeNegativeZero(fixed: string): string {
  return /^-0(\.0+)?$/.test(fixed) ? fixed.slice(1) : fixed;
}

/** Inserts the group separator every three digits, right to left. */
function groupIntegerPart(fixed: string): string {
  const negative = fixed.startsWith("-");
  const unsigned = negative ? fixed.slice(1) : fixed;
  const [whole, fraction] = unsigned.split(".");
  if (Number(whole) < GROUP_FROM) return fixed;

  let grouped = "";
  for (let i = 0; i < whole.length; i++) {
    // Separator before every digit that starts a group of three, counting from
    // the right, except at the very start of the number.
    if (i > 0 && (whole.length - i) % 3 === 0) grouped += GROUP_SEPARATOR;
    grouped += whole[i];
  }

  return (
    (negative ? "-" : "") + (fraction === undefined ? grouped : `${grouped}.${fraction}`)
  );
}

/**
 * The invariants `classify` depends on, checked at runtime.
 *
 * These are properties of data, so the type system cannot hold them: nothing
 * in `IndicatorSpec` stops someone writing a band from 20 to 15, or leaving a
 * gap between 35 and 40 that would make `classify` return the wrong band at
 * the seam. The gate tests run this over every topic, which means a topic
 * added later is checked without anyone remembering to check it.
 *
 * Throws on the first violation with the indicator id and the band index, so
 * a failing test says which band is wrong rather than that something is.
 */
export function assertIndicatorInvariants(indicator: IndicatorSpec): void {
  const { id, bands, domain } = indicator;
  // Annotated on the binding, not just on the arrow, so TypeScript treats a
  // call to it as terminating and narrows `band.max` after the null check.
  const fail: (message: string) => never = (message) => {
    throw new Error(`catalog: indicator "${id}" ${message}`);
  };

  if (bands.length === 0) fail("has no bands");
  if (!(domain[0] < domain[1])) {
    fail(`has an empty domain [${domain[0]}, ${domain[1]}]`);
  }
  if (!Number.isInteger(indicator.precision) || indicator.precision < 0) {
    fail(`has a precision that is not a non-negative integer (${indicator.precision})`);
  }

  if (bands[0].min !== domain[0]) {
    fail(`starts its first band at ${bands[0].min}, not at the domain floor ${domain[0]}`);
  }

  bands.forEach((band, i) => {
    if (!SEVERITIES.includes(band.severity)) {
      fail(`band ${i} ("${band.label}") has severity "${band.severity}", which is not one of ${SEVERITIES.join(", ")}`);
    }
    if (band.label.trim() === "") fail(`band ${i} has an empty label`);

    const isLast = i === bands.length - 1;
    if (isLast) {
      if (band.max !== null) {
        fail(`closes its top band at ${band.max}; the top band must be open-ended (max: null)`);
      }
      if (band.min > domain[1]) {
        fail(`opens its top band at ${band.min}, above the domain ceiling ${domain[1]}`);
      }
      return;
    }

    if (band.max === null) {
      fail(`leaves band ${i} open-ended, but it is not the top band`);
    }
    if (!(band.max > band.min)) {
      fail(`band ${i} runs from ${band.min} to ${band.max}, which is empty or reversed`);
    }
    // The tiling check: no gaps and no overlaps in one comparison, because a
    // gap and an overlap are the same defect with opposite sign.
    const nextMin = bands[i + 1].min;
    if (band.max !== nextMin) {
      const kind = band.max < nextMin ? "gap" : "overlap";
      fail(`has a ${kind} between band ${i} (ends ${band.max}) and band ${i + 1} (starts ${nextMin})`);
    }
  });
}
