/**
 * The model stand-in.
 *
 * SCAFFOLD. Every number produced here is synthetic, seeded from the hash of the
 * run config. None of it is an observation, none of it is a census figure, and
 * none of it is a prediction. It exists so that the pages, the charts, the map
 * and the download endpoints can be built and tested against output with the
 * right shape, ranges, seasonality and internal consistency, before a real model
 * backend exists.
 *
 * `simulateRun` is THE function to replace when the real backend lands. It is
 * the only place in this service that invents a number. Everything around it
 * (the hash, the URL codec, the exporters, the stage script, the narrative) is
 * real code that stays.
 *
 * The rules the generator holds itself to, all of them tested:
 *   - every value sits inside `indicator.domain`
 *   - `lower <= value <= upper` for every estimate
 *   - the interval widens for a shorter window and narrows for a costlier model
 *   - `affectedAreaShare` follows the severity of the band, explicitly
 *   - the series carries the bimodal Kenyan seasonal signal, plus gaps
 *   - the map overlay is spatially smooth, not per-cell noise
 */
import type {
  AreaResult,
  Estimate,
  FeatureImportance,
  ModelMetrics,
  RunConfig,
  SeriesPoint,
} from "@/contracts/analysis";
import type { IndicatorBand, IndicatorSpec, ModelSpec, TopicSpec } from "@/contracts/catalog";
import type { Area, AreaId } from "@/contracts/geo";
import {
  AFFECTED_SHARE_BY_SEVERITY,
  AUC_BASE,
  AUC_CEILING,
  AUC_DATA_BONUS,
  AUC_JITTER,
  AUC_PER_COST_WEIGHT,
  CLOUD_GAP_RATE,
  EXPOSED_ROUNDING,
  INTERVAL_HALF_WIDTH_BASE,
  INTERVAL_JITTER,
  LEVEL_MAX_POSITION,
  LEVEL_MIN_POSITION,
  MIN_MONTHS_FOR_GAPS,
  MODEL_WIDTH_FACTOR_RANGE,
  OVERLAY_FIELD_AMPLITUDE,
  OVERLAY_JITTER,
  OVERLAY_LAT_FREQUENCY,
  OVERLAY_LON_FREQUENCY,
  POPULATION_RANGE,
  POPULATION_ROUNDING,
  POPULATION_ZONE_WEIGHT,
  RANGE_WIDTH_FACTOR_RANGE,
  REFERENCE_WINDOW_MONTHS,
  SAMPLES_PER_AREA_MONTH,
  SEASON_AMPLITUDE,
  SERIES_MAX_DRIFT,
  SERIES_NOISE,
  SERIES_NOISE_MEMORY,
  YOY_MAX_STEP,
} from "./constants";
import { isoTimestamp, monthCount, monthOf, monthStarts, previousYearWindow } from "./dates";
import { fnv1a32, seedFor, studySeed } from "./hash";
import { clamp, mulberry32, pickDistinct, roundTo, signedBell, uniform } from "./rng";
import { seasonalIndex } from "./seasonality";

/** Everything `simulateRun` needs. The catalogue and geography arrive as data, never as imports. */
export interface SimulationInput {
  readonly runId: string;
  readonly config: RunConfig;
  readonly topic: TopicSpec;
  readonly model: ModelSpec;
  /** In the order the caller asked for. Presentation order, not identity. */
  readonly areas: readonly Area[];
  /** `deps.catalog.classify`, bound to this topic's indicator. */
  readonly classify: (value: number) => IndicatorBand;
}

export interface Simulation {
  readonly areas: readonly AreaResult[];
  readonly series: readonly SeriesPoint[];
  readonly metrics: ModelMetrics;
  /** Passed straight to `geo.gridFor`. Seeded and spatially smooth. */
  readonly valueAt: (areaId: AreaId, lonLat: readonly [number, number]) => number;
  /** Derived from the window's end date and the seed, never from a clock. */
  readonly generatedAt: string;
}

/**
 * How much worse an arid county reads than a humid one, before the seeded draw.
 * Rangeland stress in Kenya is concentrated in the ASAL counties, so a generator
 * that ignored the climate zone would put Turkana and Murang'a in the same place
 * half the time and the map would look wrong to anyone who knows the country.
 */
const ZONE_STRESS_BIAS: Readonly<Record<string, number>> = {
  arid: 0.7,
  "semi-arid": 0.5,
  humid: 0.3,
};

/**
 * Spread of the seeded draw around the zone's bias. Wide enough that an arid
 * county can reach the worst band and a semi-arid one can land anywhere, which
 * matters: a generator whose spread was too tight would make whole bands
 * unreachable, and the band colours, the legend and the critical-state copy
 * would never be exercised by anything.
 */
const ZONE_SPREAD = 0.6;

function spanOf(indicator: IndicatorSpec): number {
  return indicator.domain[1] - indicator.domain[0];
}

/**
 * Maps stress (0 best, 1 worst) onto a value in indicator units, respecting
 * which end of the domain is bad. A rising VCI is an improving VCI; a rising
 * flood probability is not, and this is the single place that asymmetry lives.
 */
function valueForStress(indicator: IndicatorSpec, stress: number): number {
  const [low, high] = indicator.domain;
  const t = clamp(stress, 0, 1);
  return indicator.badEnd === "high" ? low + t * (high - low) : high - t * (high - low);
}

/** Clamps a value into the indicator domain. Called on every number that leaves this module. */
function intoDomain(indicator: IndicatorSpec, value: number): number {
  return clamp(value, indicator.domain[0], indicator.domain[1]);
}

/** Key identifying a window, used so the year-earlier draw is its own stream. */
function windowKey(start: string, end: string): string {
  return `${start}:${end}`;
}

/**
 * An area's stress level for one window, in [LEVEL_MIN_POSITION, LEVEL_MAX_POSITION].
 *
 * Held away from the domain ends so a 90% interval never has to be clamped,
 * which would flatten the width relationships the results page explains to the
 * user.
 */
function stressFor(runId: string, area: Area, key: string): number {
  const rng = mulberry32(seedFor(runId, area.id, key, "level"));
  const bias = ZONE_STRESS_BIAS[area.climateZone] ?? 0.5;
  const draw = clamp(bias + ZONE_SPREAD * signedBell(rng), 0, 1);
  return LEVEL_MIN_POSITION + (LEVEL_MAX_POSITION - LEVEL_MIN_POSITION) * draw;
}

/**
 * Half-width of the 90% interval, in indicator units.
 *
 * Two effects, both of them things a user asks about on the results page:
 *   - a shorter window means fewer observations and a wider interval
 *   - the costlier model fits the same data more tightly and reports a narrower one
 * The seeded jitter is deliberately smaller than either effect so neither can be
 * masked by it.
 */
function intervalHalfWidth(
  indicator: IndicatorSpec,
  model: ModelSpec,
  months: number,
  rng: () => number,
): number {
  const rangeFactor = clamp(
    Math.sqrt(REFERENCE_WINDOW_MONTHS / Math.max(1, months)),
    RANGE_WIDTH_FACTOR_RANGE[0],
    RANGE_WIDTH_FACTOR_RANGE[1],
  );
  const modelFactor = clamp(
    1 / Math.sqrt(Math.max(0.1, model.costWeight)),
    MODEL_WIDTH_FACTOR_RANGE[0],
    MODEL_WIDTH_FACTOR_RANGE[1],
  );
  const jitter = 1 - INTERVAL_JITTER / 2 + INTERVAL_JITTER * rng();
  return INTERVAL_HALF_WIDTH_BASE * spanOf(indicator) * rangeFactor * modelFactor * jitter;
}

/**
 * Synthetic resident population for an area.
 *
 * SCAFFOLD FIGURE, not census data. Seeded from the area id alone, never from
 * the run: a county's population does not change because someone studied a
 * different window, and a figure that moved between runs would be obviously
 * wrong to a user comparing two result pages.
 */
export function syntheticPopulation(area: Area): number {
  const rng = mulberry32(fnv1a32(`population|${area.id}|${area.shapeId}`));
  const weight = POPULATION_ZONE_WEIGHT[area.climateZone] ?? 1;
  const raw = uniform(rng, POPULATION_RANGE[0], POPULATION_RANGE[1]) * weight;
  return Math.round(raw / POPULATION_ROUNDING) * POPULATION_ROUNDING;
}

/**
 * Share of the county in the worst two bands, tied to the severity of its
 * headline estimate. The contract asks these two to agree, so the relationship
 * is a lookup table rather than an independent draw: a `critical` county cannot
 * come back reporting that 3% of it is affected.
 */
function affectedShareFor(runId: string, area: Area, band: IndicatorBand): number {
  const [lo, hi] = AFFECTED_SHARE_BY_SEVERITY[band.severity];
  const rng = mulberry32(seedFor(runId, area.id, "share"));
  return roundTo(uniform(rng, lo, hi), 3);
}

function estimateFor(
  runId: string,
  area: Area,
  indicator: IndicatorSpec,
  model: ModelSpec,
  months: number,
  stress: number,
): Estimate {
  const rng = mulberry32(seedFor(runId, area.id, "interval"));
  const value = valueForStress(indicator, stress);
  const half = intervalHalfWidth(indicator, model, months, rng);
  // A little asymmetry, because a real interval is rarely centred.
  const skew = 1 + 0.15 * signedBell(rng);
  const places = indicator.precision + 2;
  return {
    value: roundTo(intoDomain(indicator, value), places),
    lower: roundTo(intoDomain(indicator, value - half * skew), places),
    upper: roundTo(intoDomain(indicator, value + half * (2 - skew)), places),
  };
}

/** Per-area results, in the order the caller listed the areas. */
function areaResults(input: SimulationInput): readonly AreaResult[] {
  const { runId, config, topic, model, areas, classify } = input;
  const indicator = topic.indicator;
  const months = monthCount(config.dateRange);
  const thisKey = windowKey(config.dateRange.start, config.dateRange.end);
  const lastYear = previousYearWindow(config.dateRange);
  const lastKey = windowKey(lastYear.start, lastYear.end);

  return areas.map((area) => {
    const stress = stressFor(runId, area, thisKey);
    const estimate = estimateFor(runId, area, indicator, model, months, stress);
    const band = classify(estimate.value);

    // The year-earlier level is a perturbation of this one rather than an
    // independent draw: a county's condition is autocorrelated year to year, and
    // an independent draw would produce swings of half the domain and a
    // narrative nobody would believe.
    const yoyRng = mulberry32(seedFor(runId, area.id, lastKey, "yoy"));
    const previousStress = clamp(
      stress + signedBell(yoyRng) * YOY_MAX_STEP,
      LEVEL_MIN_POSITION,
      LEVEL_MAX_POSITION,
    );
    const previousValue = valueForStress(indicator, previousStress);

    const affectedAreaShare = affectedShareFor(runId, area, band);
    const population = syntheticPopulation(area);

    return {
      area,
      estimate,
      band,
      // Rounded one place finer than the indicator's display precision, so the
      // sign survives for coarse indicators such as an IPC phase.
      changeYoY: roundTo(estimate.value - previousValue, indicator.precision + 1),
      populationExposed: Math.round((population * affectedAreaShare) / EXPOSED_ROUNDING) * EXPOSED_ROUNDING,
      affectedAreaShare,
    };
  });
}

/**
 * Monthly series across the window, one point per calendar month, values keyed
 * by area id.
 *
 * Shape per area: its level, plus the bimodal seasonal response, plus a mild
 * linear drift, plus AR(1) noise. Then a few months are dropped as
 * cloud-obscured gaps, picked from the seed, because optical indicators lose
 * months to cloud and the chart has to draw a gap rather than a zero.
 */
function seriesFor(input: SimulationInput): readonly SeriesPoint[] {
  const { runId, config, topic, areas } = input;
  const indicator = topic.indicator;
  const span = spanOf(indicator);
  const months = monthStarts(config.dateRange);
  const thisKey = windowKey(config.dateRange.start, config.dateRange.end);

  const gapCount =
    months.length >= MIN_MONTHS_FOR_GAPS
      ? Math.max(1, Math.min(Math.round(months.length * CLOUD_GAP_RATE), Math.floor(months.length / 4)))
      : 0;

  const perArea = new Map<string, readonly (number | null)[]>();
  for (const area of areas) {
    const base = valueForStress(indicator, stressFor(runId, area, thisKey));
    const noiseRng = mulberry32(seedFor(runId, area.id, "series"));
    const driftRng = mulberry32(seedFor(runId, area.id, "drift"));
    const totalDrift = signedBell(driftRng) * SERIES_MAX_DRIFT * span;
    const driftPerMonth = totalDrift / Math.max(1, months.length - 1);

    let noise = 0;
    const values: (number | null)[] = months.map((monthIso, index) => {
      noise = SERIES_NOISE_MEMORY * noise + (1 - SERIES_NOISE_MEMORY) * signedBell(noiseRng);
      const raw =
        base +
        SEASON_AMPLITUDE * span * seasonalIndex(monthOf(monthIso)) +
        driftPerMonth * index +
        SERIES_NOISE * span * noise;
      return roundTo(intoDomain(indicator, raw), indicator.precision + 2);
    });

    const gapRng = mulberry32(seedFor(runId, area.id, "cloud-gaps"));
    for (const index of pickDistinct(gapRng, gapCount, months.length)) {
      values[index] = null;
    }
    perArea.set(area.id, values);
  }

  return months.map((date, index) => {
    const values: Record<string, number | null> = {};
    for (const area of areas) {
      values[area.id] = perArea.get(area.id)?.[index] ?? null;
    }
    return { date, values };
  });
}

/**
 * Held-out scores.
 *
 * Everything that belongs to the data (the noise draw, the window length) is
 * seeded from `studySeed`, which excludes the model. The only term that moves
 * between two models on the same config is the cost-weighted skill term, so the
 * costlier model always scores better on AUC, always reports a lower RMSE, and
 * the ordering is a property of the code rather than a lucky seed.
 */
function metricsFor(input: SimulationInput): ModelMetrics {
  const { runId, config, topic, model, areas } = input;
  const indicator = topic.indicator;
  const months = monthCount(config.dateRange);
  const rng = mulberry32(studySeed(config));

  const dataFactor = clamp(months / REFERENCE_WINDOW_MONTHS, 0, 1);
  const jitter = rng() * AUC_JITTER;
  const auc = clamp(
    AUC_BASE + AUC_PER_COST_WEIGHT * model.costWeight + AUC_DATA_BONUS * dataFactor + jitter,
    0.5,
    AUC_CEILING,
  );
  // R-squared tracks AUC: the same fit, read on the regression rather than on
  // the classification. Kept below AUC because explaining the level is harder
  // than ranking the cases.
  const r2 = clamp((auc - 0.5) * 1.5 + rng() * 0.04 - 0.02, 0, 0.97);
  // A better fit means a smaller error, in indicator units.
  const rmse = spanOf(indicator) * clamp(0.17 - 0.14 * (auc - 0.5), 0.03, 0.25);

  return {
    model,
    auc: roundTo(auc, 3),
    r2: roundTo(r2, 3),
    rmse: roundTo(rmse, indicator.precision + 2),
    // One sample per area, per month, per notional pixel stack.
    trainingSamples: months * areas.length * SAMPLES_PER_AREA_MONTH,
    featureImportances: featureImportancesFor(runId, topic),
  };
}

/**
 * Driver weights, drawn from the topic's own driver list, sorted heaviest first
 * and normalised to sum to 1. The residual from rounding is folded into the
 * largest weight, which keeps the sum exact without disturbing the order.
 */
export function featureImportancesFor(runId: string, topic: TopicSpec): readonly FeatureImportance[] {
  const drivers = topic.drivers;
  if (drivers.length === 0) return [];
  const rng = mulberry32(seedFor(runId, "feature-importances"));
  // The floor keeps a driver from rounding away to zero, which would read as
  // "this input was ignored" rather than "this input mattered least".
  const raw = drivers.map((feature) => ({ feature, weight: 0.15 + rng() }));
  const total = raw.reduce((sum, item) => sum + item.weight, 0);
  const sorted = raw
    .map((item) => ({ feature: item.feature, weight: item.weight / total }))
    .sort((a, b) => b.weight - a.weight || a.feature.localeCompare(b.feature))
    .map((item) => ({ feature: item.feature, weight: roundTo(item.weight, 4) }));
  const residual = 1 - sorted.reduce((sum, item) => sum + item.weight, 0);
  return [
    { feature: sorted[0].feature, weight: roundTo(sorted[0].weight + residual, 6) },
    ...sorted.slice(1),
  ];
}

/**
 * The value function handed to `geo.gridFor`.
 *
 * Built as a field, not as noise: an area's own level, plus a smooth function of
 * longitude and latitude with a wavelength of a few degrees, plus a per-cell
 * jitter small enough that neighbouring cells stay within
 * OVERLAY_NEIGHBOUR_BUDGET of each other. Independent per-cell draws would give
 * the map the texture of an untuned television, which reads as broken rather
 * than as data.
 *
 * The jitter is keyed off the quantised cell centre, so the same cell gets the
 * same jitter however many times `gridFor` calls back into it.
 */
function overlayValueAt(input: SimulationInput): (areaId: AreaId, lonLat: readonly [number, number]) => number {
  const { runId, config, topic, areas } = input;
  const indicator = topic.indicator;
  const span = spanOf(indicator);
  const thisKey = windowKey(config.dateRange.start, config.dateRange.end);

  const baseByArea = new Map<string, number>(
    areas.map((area) => [area.id, valueForStress(indicator, stressFor(runId, area, thisKey))]),
  );
  const meanBase =
    areas.length === 0
      ? (indicator.domain[0] + indicator.domain[1]) / 2
      : [...baseByArea.values()].reduce((sum, v) => sum + v, 0) / areas.length;

  const phaseRng = mulberry32(seedFor(runId, "overlay-field"));
  const phaseLon = phaseRng() * Math.PI * 2;
  const phaseLat = phaseRng() * Math.PI * 2;

  return (areaId, lonLat) => {
    const [lon, lat] = lonLat;
    const base = baseByArea.get(areaId) ?? meanBase;
    const smooth =
      0.5 * Math.sin(lon * OVERLAY_LON_FREQUENCY + phaseLon) +
      0.5 * Math.cos(lat * OVERLAY_LAT_FREQUENCY + phaseLat);
    const cellSeed = fnv1a32(`${runId}|${areaId}|${lon.toFixed(4)}|${lat.toFixed(4)}`);
    const jitter = signedBell(mulberry32(cellSeed)) * OVERLAY_JITTER * span;
    const value = base + smooth * OVERLAY_FIELD_AMPLITUDE * span + jitter;
    return roundTo(intoDomain(indicator, value), indicator.precision + 2);
  };
}

/**
 * THE FUNCTION TO REPLACE.
 *
 * Swap this for a call into a real model backend and the rest of the service,
 * the pages and the download endpoints keep working unchanged, as long as the
 * replacement honours the same invariants (values inside the domain, ordered
 * intervals, a band that agrees with the classifier, importances summing to 1).
 * The tests in `__tests__/run.test.ts` are written against those invariants
 * rather than against the specific numbers, so they carry over.
 */
export function simulateRun(input: SimulationInput): Simulation {
  const clockRng = mulberry32(seedFor(input.runId, "generated-at"));
  // A run has no clock, so the timestamp is derived: the morning after the last
  // day of the window, at a seeded minute. Deterministic, and it reads as a real
  // processing time on the results page.
  const minutes = 6 * 60 + Math.floor(clockRng() * 12 * 60);

  return {
    areas: areaResults(input),
    series: seriesFor(input),
    metrics: metricsFor(input),
    valueAt: overlayValueAt(input),
    generatedAt: isoTimestamp(input.config.dateRange.end, minutes),
  };
}
