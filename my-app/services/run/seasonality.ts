/**
 * The seasonal term of the synthetic series.
 *
 * Kenya has a bimodal rainfall regime: long rains roughly March to May, short
 * rains roughly October to December. Vegetation and flood indicators do not
 * peak with the rain, they peak after it, once water has reached the root zone
 * or the river network, so the two response peaks sit a month behind the two
 * rainfall peaks.
 *
 * This is in its own module and not folded into the noise term because it is
 * the one part of the generator a Kenyan user will check by eye. A chart that
 * peaks in August is read as broken on sight, whatever the rest of the page
 * says, and a single sine wave would pass a "the series varies" test while
 * being exactly that wrong.
 */

import {
  LONG_RAINS_RESPONSE_MONTH,
  LONG_RAINS_WEIGHT,
  LONG_RAINS_WIDTH_MONTHS,
  SHORT_RAINS_RESPONSE_MONTH,
  SHORT_RAINS_WEIGHT,
  SHORT_RAINS_WIDTH_MONTHS,
} from "@/services/run/constants";

const MONTHS_IN_YEAR = 12;

/** Distance between two months around the calendar circle, so December neighbours January. */
function circularMonthDistance(a: number, b: number): number {
  const raw = Math.abs(a - b);
  return Math.min(raw, MONTHS_IN_YEAR - raw);
}

/** A smooth bump centred on `centre`, `width` months wide, wrapped around the year. */
function bump(month: number, centre: number, width: number): number {
  const d = circularMonthDistance(month, centre);
  return Math.exp(-0.5 * (d / width) ** 2);
}

/**
 * The seasonal response by calendar month, index 0 = January.
 *
 * Mean zero over the year, then scaled to a peak of 1. Mean zero is
 * load-bearing: the term is added to an area's level, so a positive average
 * would make every area read better (or worse) than the level the estimate
 * reports, and the chart would sit visibly off its own headline number.
 */
export const SEASONAL_INDEX: readonly number[] = (() => {
  const raw: number[] = [];
  for (let month = 1; month <= MONTHS_IN_YEAR; month += 1) {
    raw.push(
      LONG_RAINS_WEIGHT * bump(month, LONG_RAINS_RESPONSE_MONTH, LONG_RAINS_WIDTH_MONTHS) +
        SHORT_RAINS_WEIGHT *
          bump(month, SHORT_RAINS_RESPONSE_MONTH, SHORT_RAINS_WIDTH_MONTHS),
    );
  }
  const mean = raw.reduce((sum, v) => sum + v, 0) / raw.length;
  const centred = raw.map((v) => v - mean);
  const peak = Math.max(...centred.map(Math.abs));
  return Object.freeze(centred.map((v) => v / peak));
})();

/** Seasonal response for a calendar month, 1..12. Range [-1, 1], mean 0 over the year. */
export function seasonalIndex(month: number): number {
  const wrapped =
    (((Math.round(month) - 1) % MONTHS_IN_YEAR) + MONTHS_IN_YEAR) % MONTHS_IN_YEAR;
  return SEASONAL_INDEX[wrapped];
}
