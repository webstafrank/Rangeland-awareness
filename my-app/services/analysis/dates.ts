/**
 * UTC date arithmetic for run windows.
 *
 * All of it hand-rolled on `Date.UTC`, and none of it touching the local time
 * zone, `new Date()` or `Date.now()`. A run is a pure function of its config, so
 * a user in Nairobi (UTC+3) and a CI box in UTC have to agree on how many months
 * a window holds, and on which month a series point belongs to.
 */
import type { DateRange } from "@/contracts/analysis";

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export interface YearMonthDay {
  readonly year: number;
  readonly month: number; // 1..12
  readonly day: number; // 1..31
}

/** Parses ISO yyyy-mm-dd. Returns undefined rather than throwing: callers validate untrusted input. */
export function parseIsoDate(iso: string): YearMonthDay | undefined {
  const match = ISO_DATE.exec(iso);
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12) return undefined;
  if (day < 1 || day > daysInMonth(year, month)) return undefined;
  return { year, month, day };
}

export function daysInMonth(year: number, month: number): number {
  // Day 0 of the next month is the last day of this one.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function toIsoDate({ year, month, day }: YearMonthDay): string {
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

const MS_PER_DAY = 86_400_000;

/**
 * Days covered by an inclusive window, so a single day is 1 and MIN_RANGE_DAYS
 * of 30 means "a month of observations", not "29 nights".
 */
export function inclusiveDayCount(range: DateRange): number {
  const start = parseIsoDate(range.start);
  const end = parseIsoDate(range.end);
  if (!start || !end) return 0;
  const a = Date.UTC(start.year, start.month - 1, start.day);
  const b = Date.UTC(end.year, end.month - 1, end.day);
  return Math.round((b - a) / MS_PER_DAY) + 1;
}

/**
 * First day of every calendar month the window touches, ascending.
 *
 * The observation period of a series point is the calendar month, and the first
 * and last month of a window may be partial. Naming the point by the month's
 * first day (rather than by the window's start date) keeps the x axis on a
 * regular monthly grid, which is what the chart needs.
 */
export function monthStarts(range: DateRange): readonly string[] {
  const start = parseIsoDate(range.start);
  const end = parseIsoDate(range.end);
  if (!start || !end) return [];
  const out: string[] = [];
  let year = start.year;
  let month = start.month;
  while (year < end.year || (year === end.year && month <= end.month)) {
    out.push(toIsoDate({ year, month, day: 1 }));
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return out;
}

/** Number of calendar months the window touches. Always at least 1 for a valid window. */
export function monthCount(range: DateRange): number {
  return monthStarts(range).length;
}

/**
 * Shifts a date by whole years, clamping the day into the target month.
 * 29 February minus one year is 28 February, not 1 March: rolling over would
 * move the year-earlier window into the wrong month.
 */
export function shiftYears(iso: string, years: number): string {
  const parsed = parseIsoDate(iso);
  if (!parsed) return iso;
  const year = parsed.year + years;
  const day = Math.min(parsed.day, daysInMonth(year, parsed.month));
  return toIsoDate({ year, month: parsed.month, day });
}

/** The same window one year earlier, used for `changeYoY`. */
export function previousYearWindow(range: DateRange): DateRange {
  return { start: shiftYears(range.start, -1), end: shiftYears(range.end, -1) };
}

/** Month number (1..12) of an ISO date, for the seasonal term. */
export function monthOf(iso: string): number {
  return parseIsoDate(iso)?.month ?? 1;
}

/**
 * An ISO timestamp derived from a date plus a whole number of minutes.
 * `generatedAt` has to be deterministic, so it is built from the window's end
 * date and a seeded offset rather than read off a clock.
 */
export function isoTimestamp(dateIso: string, minutesAfterMidnight: number): string {
  const parsed = parseIsoDate(dateIso) ?? { year: 1970, month: 1, day: 1 };
  const ms =
    Date.UTC(parsed.year, parsed.month - 1, parsed.day) + Math.round(minutesAfterMidnight) * 60_000;
  return new Date(ms).toISOString();
}
