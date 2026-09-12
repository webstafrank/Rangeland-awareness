/**
 * The seasonal term of the synthetic time series.
 *
 * Kenya has a bimodal rainfall regime: the long rains fall roughly March to May
 * and the short rains roughly October to December. Vegetation and flood
 * indicators do not peak with the rain, they peak after it, once the water has
 * reached the root zone or the river network, so the two response peaks are
 * placed a month behind the two rainfall peaks (May and December).
 *
 * A flat or single-peaked series would be wrong for Kenya and would let the
 * chart code get away with assumptions that break on real data, which is why
 * this is here rather than in the noise term.
 */
import {
  LONG_RAINS_RESPONSE_MONTH,
  LONG_RAINS_WEIGHT,
  LONG_RAINS_WIDTH_MONTHS,
  SHORT_RAINS_RESPONSE_MONTH,
  SHORT_RAINS_WEIGHT,
  SHORT_RAINS_WIDTH_MONTHS,
} from "./constants";

const MONTHS_IN_YEAR = 12;

/** Distance between two months on the calendar circle, so December neighbours January. */
function circularMonthDistance(a: number, b: number): number {
  const raw = Math.abs(a - b);
  return Math.min(raw, MONTHS_IN_YEAR - raw);
}

/** A smooth bump centred on `centre` months wide `width`, wrapped around the year. */
function bump(month: number, centre: number, width: number): number {
  const d = circularMonthDistance(month, centre);
  return Math.exp(-0.5 * (d / width) ** 2);
}

/**
 * The seasonal response, mean zero over the year and scaled to a peak of 1.
 *
 * Mean zero matters: the seasonal term is added to an area's level, and if its
 * average were positive every area would read better than its own level.
 * Index 0 is January.
 */
export const SEASONAL_INDEX: readonly number[] = (() => {
  const raw: number[] = [];
  for (let month = 1; month <= MONTHS_IN_YEAR; month += 1) {
    raw.push(
      LONG_RAINS_WEIGHT * bump(month, LONG_RAINS_RESPONSE_MONTH, LONG_RAINS_WIDTH_MONTHS) +
        SHORT_RAINS_WEIGHT * bump(month, SHORT_RAINS_RESPONSE_MONTH, SHORT_RAINS_WIDTH_MONTHS),
    );
  }
  const mean = raw.reduce((sum, v) => sum + v, 0) / raw.length;
  const centred = raw.map((v) => v - mean);
  const peak = Math.max(...centred.map(Math.abs));
  return Object.freeze(centred.map((v) => v / peak));
})();

/** Seasonal response for a calendar month, 1..12. Range [-1, 1], mean 0 over the year. */
export function seasonalIndex(month: number): number {
  const wrapped = ((Math.round(month) - 1) % MONTHS_IN_YEAR + MONTHS_IN_YEAR) % MONTHS_IN_YEAR;
  return SEASONAL_INDEX[wrapped];
}
