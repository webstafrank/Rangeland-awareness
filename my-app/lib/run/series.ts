/**
 * The monthly time series: one point per calendar month the window touches,
 * values keyed by area id.
 *
 * Shape per area: its own level, plus the bimodal Kenyan seasonal response,
 * plus a mild linear drift, plus AR(1) noise. Then a few months are dropped as
 * cloud-obscured gaps, chosen from the seed, because optical indices really do
 * lose months to cloud over the highlands and the coast and the chart has to be
 * built against a series with holes in it rather than discovering them later.
 *
 * A gap is `null`, never `0`. A zero is an observation of nothing; a null is no
 * observation, and a chart that draws the first as the second puts a spike to
 * the floor in the middle of the growing season.
 */

import { aridityOfBounds } from "@/lib/run/aridity";
import type { RunConfig } from "@/lib/run/config";
import {
  CLOUD_GAP_RATE,
  MIN_MONTHS_FOR_GAPS,
  SEASONAL_SIGN,
  SEASON_AMPLITUDE,
  SERIES_MAX_DRIFT,
  SERIES_NOISE,
  SERIES_NOISE_MEMORY,
} from "@/lib/run/constants";
import { monthOf, monthStarts } from "@/lib/run/dates";
import { stressFor, valueForStress, windowKey } from "@/lib/run/engine";
import { areaSeedKey, seedFor } from "@/lib/run/hash";
import { intoDomain } from "@/lib/run/indicators";
import type { IndicatorSpec, SeriesPoint } from "@/lib/run/result";
import { mulberry32, pickDistinct, roundTo, signedBell } from "@/lib/run/rng";
import { seasonalIndex } from "@/lib/run/seasonality";

/**
 * How many months to drop as cloud gaps.
 *
 * At least one once the window is long enough, so the null path is always
 * exercised by a real run rather than only by a test, and never more than a
 * quarter of the series, so the signal survives.
 */
export function gapCountFor(monthTotal: number): number {
  if (monthTotal < MIN_MONTHS_FOR_GAPS) return 0;
  return Math.max(
    1,
    Math.min(Math.round(monthTotal * CLOUD_GAP_RATE), Math.floor(monthTotal / 4)),
  );
}

export function seriesFor(
  runId: string,
  config: RunConfig,
  indicator: IndicatorSpec,
): readonly SeriesPoint[] {
  const months = monthStarts(config.dateWindow);
  const thisKey = windowKey(config.dateWindow);
  const gaps = gapCountFor(months.length);
  // Which way rain moves this topic's indicator. Not derivable from `badEnd`:
  // rain raises flood susceptibility (bad) and raises vegetation condition
  // (good) and lowers an IPC phase (good). See SEASONAL_SIGN.
  const sign = SEASONAL_SIGN[config.topic] ?? 1;

  const perArea = new Map<string, readonly (number | null)[]>();

  for (const area of config.areas) {
    const areaKey = areaSeedKey(area);
    const base = valueForStress(indicator, stressFor(runId, area, thisKey));

    // A drier area has a sharper season, not a flatter one: the ASAL rangelands
    // green up hard after the long rains and brown off completely between them,
    // while the highlands stay green all year. A flat amplitude for every area
    // would make Turkana and Kericho draw the same curve.
    const amplitude = SEASON_AMPLITUDE * (0.6 + 0.8 * aridityOfBounds(area.bounds));

    const noiseRng = mulberry32(seedFor(runId, areaKey, "series"));
    const driftRng = mulberry32(seedFor(runId, areaKey, "drift"));
    // A fraction of the span, not an absolute step: every term of `deviation`
    // below is in the same fractional units so they can be summed before the
    // one scaling that matters.
    const totalDrift = signedBell(driftRng) * SERIES_MAX_DRIFT;
    const driftPerMonth = totalDrift / Math.max(1, months.length - 1);

    let noise = 0;
    const values: (number | null)[] = months.map((monthIso, index) => {
      // AR(1): this month's noise remembers last month's. Independent draws
      // month to month give a series that looks like static rather than like
      // observations, because real conditions do not reset every 30 days.
      noise = SERIES_NOISE_MEMORY * noise + (1 - SERIES_NOISE_MEMORY) * signedBell(noiseRng);

      // Season, drift and noise together, as a signed fraction of the span.
      const deviation =
        sign * amplitude * seasonalIndex(monthOf(monthIso)) +
        driftPerMonth * index +
        SERIES_NOISE * noise;

      // Scaled by the room left between the area's level and the domain edge it
      // is moving toward, NOT by the full span.
      //
      // Scaling by the span assumes every area has the whole domain beneath it.
      // A stressed area does not: a VHI level of 15 with a +/-21 seasonal swing
      // spends every dry season below zero, and `intoDomain` flattens all of it
      // onto exactly 0. Measured before this changed: 28 of 120 points pinned at
      // the floor, the series never rising above 33 of a 0..100 domain. Two
      // things break. A quarter of the chart becomes a flat line on the axis
      // that reads as missing data rather than as drought, and the bands above
      // the floor are unreachable, so the legend shows classes nothing can enter.
      //
      // Headroom scaling also happens to be the physical truth: a county already
      // at the bottom of the scale has little further to fall, and its season
      // shows up as a rise in the good months rather than a drop in the bad ones.
      const [low, high] = indicator.domain;
      const headroom = deviation >= 0 ? high - base : base - low;

      // intoDomain stays as a safety net for a pathological seed, but with the
      // headroom factor it should no longer be what shapes the series.
      return roundTo(
        intoDomain(indicator, base + deviation * headroom),
        indicator.precision + 2,
      );
    });

    // Gaps are drawn from their own stream, so adding a month to the window
    // does not move the noise, and removing the gaps entirely would not change
    // a single remaining value.
    const gapRng = mulberry32(seedFor(runId, areaKey, "cloud-gaps"));
    for (const index of pickDistinct(gapRng, gaps, months.length)) {
      values[index] = null;
    }
    perArea.set(area.id, values);
  }

  return months.map((date, index) => {
    const values: Record<string, number | null> = {};
    for (const area of config.areas) {
      values[area.id] = perArea.get(area.id)?.[index] ?? null;
    }
    return { date, values };
  });
}
