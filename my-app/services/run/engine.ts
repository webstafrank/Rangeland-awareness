/**
 * The model stand-in.
 *
 * SCAFFOLD, and the app says so to the user on the processing screen. Every
 * number produced here is synthetic, seeded from a hash of the run config. None
 * of it is an observation, none of it is a prediction, and nothing here reads a
 * pixel or trains anything. It exists so the pages, the charts, the map and the
 * exports can be built and tested against output with the right shape, ranges,
 * seasonality and internal consistency before a model backend exists.
 *
 * THIS FILE, plus `series.ts` and `metrics.ts`, is what gets deleted when the
 * real backend lands. Everything around it (the hash, the URL codec, the
 * indicator table, the exporters, the stage script, the narrative) is real code
 * a real backend still needs.
 *
 * The rules it holds itself to, all of them tested in `__tests__/engine.test.ts`:
 *   - every value sits inside `indicator.domain`
 *   - `lower <= value <= upper`, and the interval never touches a domain end
 *   - the interval widens for a shorter window and narrows for a costlier model
 *   - `band` is whatever `classify` says, never a second opinion
 *   - `affectedAreaShare` follows the severity of that band
 *   - every entry in `formulaValues` sits inside that formula's declared range
 */

import { getFormula } from "@/services/analysis/formulas";
import type { FormulaId } from "@/services/analysis/formulas";
import type { RequestArea } from "@/services/analysis/request";
import { aridityOfBounds } from "@/services/run/aridity";
import type { RunConfig } from "@/services/run/config";
import {
  AFFECTED_SHARE_BY_SEVERITY,
  ARIDITY_STRESS_BASE,
  ARIDITY_STRESS_GAIN,
  FORMULA_JITTER,
  FORMULA_MAX_POSITION,
  FORMULA_MIN_POSITION,
  INTERVAL_HALF_WIDTH_BASE,
  INTERVAL_JITTER,
  LEVEL_MAX_POSITION,
  LEVEL_MIN_POSITION,
  MODEL_COST_WEIGHT,
  MODEL_WIDTH_FACTOR_RANGE,
  RANGE_WIDTH_FACTOR_RANGE,
  REFERENCE_WINDOW_MONTHS,
  YOY_MAX_STEP,
  ZONE_SPREAD,
} from "@/services/run/constants";
import { monthCount, previousYearWindow } from "@/services/run/dates";
import { areaSeedKey, seedFor } from "@/services/run/hash";
import { classify, intoDomain, spanOf } from "@/services/run/indicators";
import type { AreaResult, Estimate, IndicatorSpec } from "@/services/run/result";
import { clamp, mulberry32, roundTo, signedBell, uniform } from "@/services/run/rng";
import type { DateWindow } from "@/services/run/config";

/**
 * Does a HIGH value of this index mean MORE stress?
 *
 * This table is model knowledge, not registry knowledge, which is why it lives
 * here and not in services/analysis/formulas.ts. That file says what an index is and
 * how it is computed; this one says which way it pushes an outcome, and that is
 * a claim about the model, not about the arithmetic.
 *
 * Exhaustive over the frozen `FormulaId` union, so adding an index is a compile
 * error here rather than a silent 0 that would make the new index look like it
 * contributed nothing.
 */
const DRIVER_RAISES_STRESS: Readonly<Record<FormulaId, boolean>> = {
  ndvi: false, // more green cover, less stress
  evi: false,
  savi: false,
  ndmi: false, // wetter canopy, less drought stress
  ndwi: false,
  mndwi: false,
  bsi: true, // more bare soil, more stress
  vci: false,
  tci: false, // a high temperature CONDITION index means favourable temperatures
  vhi: false,
  spi: false, // positive standardised precipitation is a wet anomaly
  "lst-anomaly": true, // hotter than normal
  twi: true, // water accumulates here
};

/**
 * The flood exception.
 *
 * Under flood risk every offered index is a water index, and more water means
 * more flood, so all four raise stress. Two of them (`ndmi`, `ndwi`) point the
 * other way under every other topic. Reading the base table for flood risk
 * would report an area as less flood-prone the wetter its soil is, which is
 * backwards in the one topic where it matters most.
 */
const FLOOD_DRIVERS_ALL_RAISE_STRESS = true;

function driverRaisesStress(topic: string, formula: FormulaId): boolean {
  if (topic === "flood-risk") return FLOOD_DRIVERS_ALL_RAISE_STRESS;
  return DRIVER_RAISES_STRESS[formula];
}

/** Identifies a window, so the year-earlier draw gets its own stream. */
export function windowKey(window: DateWindow): string {
  return `${window.start}:${window.end}`;
}

/**
 * Maps stress (0 best, 1 worst) onto a value in indicator units, respecting
 * which end of the domain is bad.
 *
 * A rising Vegetation Health Index is a recovering one; a rising flood
 * susceptibility is not. This function is the single place that asymmetry
 * lives, so nothing downstream has to remember it.
 */
export function valueForStress(indicator: IndicatorSpec, stress: number): number {
  const [low, high] = indicator.domain;
  const t = clamp(stress, 0, 1);
  return indicator.badEnd === "high" ? low + t * (high - low) : high - t * (high - low);
}

/**
 * An area's stress for one window, in [LEVEL_MIN_POSITION, LEVEL_MAX_POSITION].
 *
 * Seeded from the area's GEOMETRY, not from its id. That is the whole departure
 * from the reference implementation: `aoi-2` is a session ordinal, so seeding
 * off it would give the same drawn polygon different numbers depending on the
 * order it happened to be added in, and reloading a page that renumbered its
 * areas would change every figure on it.
 *
 * The aridity proxy supplies the bias, so the ASAL belt reads worse than the
 * highlands on average without any area being forced into a band.
 */
export function stressFor(
  runId: string,
  area: Pick<RequestArea, "label" | "bounds">,
  key: string,
): number {
  const rng = mulberry32(seedFor(runId, areaSeedKey(area), key, "level"));
  const bias = ARIDITY_STRESS_BASE + ARIDITY_STRESS_GAIN * aridityOfBounds(area.bounds);
  const draw = clamp(bias + ZONE_SPREAD * signedBell(rng), 0, 1);
  return LEVEL_MIN_POSITION + (LEVEL_MAX_POSITION - LEVEL_MIN_POSITION) * draw;
}

/**
 * Half-width of the 90% interval, in indicator units.
 *
 * Two effects, both of them things an analyst asks about on the results page:
 * a shorter window means fewer observations and a wider interval, and a
 * costlier model fits the same data more tightly and reports a narrower one.
 * The seeded jitter is deliberately smaller than either, so neither can be
 * masked by an unlucky seed and the page's explanation stays true run to run.
 */
function intervalHalfWidth(
  indicator: IndicatorSpec,
  costWeight: number,
  months: number,
  rng: () => number,
): number {
  const rangeFactor = clamp(
    Math.sqrt(REFERENCE_WINDOW_MONTHS / Math.max(1, months)),
    RANGE_WIDTH_FACTOR_RANGE[0],
    RANGE_WIDTH_FACTOR_RANGE[1],
  );
  const modelFactor = clamp(
    1 / Math.sqrt(Math.max(0.1, costWeight)),
    MODEL_WIDTH_FACTOR_RANGE[0],
    MODEL_WIDTH_FACTOR_RANGE[1],
  );
  const jitter = 1 - INTERVAL_JITTER / 2 + INTERVAL_JITTER * rng();
  return INTERVAL_HALF_WIDTH_BASE * spanOf(indicator) * rangeFactor * modelFactor * jitter;
}

function estimateFor(
  runId: string,
  areaKey: string,
  indicator: IndicatorSpec,
  costWeight: number,
  months: number,
  stress: number,
): Estimate {
  const rng = mulberry32(seedFor(runId, areaKey, "interval"));
  const value = valueForStress(indicator, stress);
  const half = intervalHalfWidth(indicator, costWeight, months, rng);
  // A little asymmetry, because a real interval is rarely centred. The two
  // sides use `skew` and `2 - skew`, so the total width is unchanged and the
  // width relationships above survive.
  const skew = 1 + 0.15 * signedBell(rng);
  const places = indicator.precision + 2;
  return {
    value: roundTo(intoDomain(indicator, value), places),
    lower: roundTo(intoDomain(indicator, value - half * skew), places),
    upper: roundTo(intoDomain(indicator, value + half * (2 - skew)), places),
  };
}

/**
 * One value per selected formula, each inside that formula's own declared
 * range.
 *
 * Driven by the same stress the headline estimate uses, flipped where the index
 * points the other way, so the numbers on a results page tell one story: an
 * area in the worst band cannot show a healthy NDVI beside it. The jitter is
 * what stops five formulas for one area being five copies of the same curve.
 *
 * A formula id the registry does not know is skipped rather than defaulted. An
 * invented value under a name nobody can resolve is the one output worse than a
 * missing one.
 */
export function formulaValuesFor(
  runId: string,
  areaKey: string,
  topic: string,
  formulas: readonly FormulaId[],
  stress: number,
): Readonly<Record<string, number>> {
  const values: Record<string, number> = {};

  for (const id of formulas) {
    const formula = getFormula(id);
    if (!formula) continue;
    const [lo, hi] = formula.range;
    if (!(hi > lo)) continue;

    const rng = mulberry32(seedFor(runId, areaKey, "formula", id));
    const oriented = driverRaisesStress(topic, id) ? stress : 1 - stress;
    const position = clamp(
      FORMULA_MIN_POSITION +
        (FORMULA_MAX_POSITION - FORMULA_MIN_POSITION) * oriented +
        FORMULA_JITTER * signedBell(rng),
      0,
      1,
    );
    // Clamped after rounding as well as before: rounding a value that sits a
    // hair inside a range endpoint can step it outside, and "inside its own
    // declared range" is an invariant the results page relies on to draw a
    // gauge without checking.
    values[id] = clamp(roundTo(lo + position * (hi - lo), 4), lo, hi);
  }

  return values;
}

/**
 * Share of an area in the worst two bands, tied to the severity of its headline
 * estimate. A lookup rather than an independent draw, so the two numbers cannot
 * contradict each other on the page.
 */
function affectedShareFor(runId: string, areaKey: string, severity: AreaResult["band"]["severity"]) {
  const [lo, hi] = AFFECTED_SHARE_BY_SEVERITY[severity];
  const rng = mulberry32(seedFor(runId, areaKey, "share"));
  return roundTo(uniform(rng, lo, hi), 3);
}

export interface SimulationInput {
  readonly runId: string;
  readonly config: RunConfig;
  readonly indicator: IndicatorSpec;
}

/** Per-area results, in the order the analyst selected the areas. */
export function areaResults(input: SimulationInput): readonly AreaResult[] {
  const { runId, config, indicator } = input;
  const months = monthCount(config.dateWindow);
  const costWeight = MODEL_COST_WEIGHT[config.model] ?? 1;
  const thisKey = windowKey(config.dateWindow);
  const lastKey = windowKey(previousYearWindow(config.dateWindow));

  return config.areas.map((area) => {
    const areaKey = areaSeedKey(area);
    const stress = stressFor(runId, area, thisKey);
    const estimate = estimateFor(runId, areaKey, indicator, costWeight, months, stress);
    const band = classify(indicator, estimate.value);

    // The year-earlier level is a perturbation of this one rather than an
    // independent draw. An area's condition is autocorrelated year to year, and
    // two independent draws produce swings of half the domain and a narrative
    // nobody would believe.
    const yoyRng = mulberry32(seedFor(runId, areaKey, lastKey, "yoy"));
    const previousStress = clamp(
      stress + signedBell(yoyRng) * YOY_MAX_STEP,
      LEVEL_MIN_POSITION,
      LEVEL_MAX_POSITION,
    );
    const previousValue = valueForStress(indicator, previousStress);

    return {
      areaId: area.id,
      label: area.label,
      estimate,
      band,
      // Rounded one place finer than the display precision, so the sign
      // survives for a coarse indicator such as an IPC phase.
      changeYoY: roundTo(estimate.value - previousValue, indicator.precision + 1),
      affectedAreaShare: affectedShareFor(runId, areaKey, band.severity),
      formulaValues: formulaValuesFor(runId, areaKey, config.topic, config.formulas, stress),
    };
  });
}

/**
 * The run's timestamp.
 *
 * Derived from the window's end date plus a seeded minute, never from a clock,
 * because `run()` promises the same config yields a byte-identical result. A
 * `Date.now()` here would make that false the second time anyone looked.
 */
export function generatedMinutes(runId: string): number {
  const rng = mulberry32(seedFor(runId, "generated-at"));
  // Between 06:00 and 18:00, so it reads as a working-hours processing time
  // rather than as an obviously synthetic midnight.
  return 6 * 60 + Math.floor(rng() * 12 * 60);
}
