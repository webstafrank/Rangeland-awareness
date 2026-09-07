/**
 * Date maths, in UTC, with no library. A run computed in Nairobi and the same
 * run computed on a CI box in UTC have to agree on the month grid, or the same
 * URL returns two different charts.
 */
import { describe, expect, it } from "vitest";
import {
  daysInMonth,
  inclusiveDayCount,
  isoTimestamp,
  monthCount,
  monthOf,
  monthStarts,
  parseIsoDate,
  previousYearWindow,
  shiftYears,
} from "../dates";

describe("parseIsoDate", () => {
  it("accepts a real date", () => {
    expect(parseIsoDate("2024-02-29")).toEqual({ year: 2024, month: 2, day: 29 });
  });

  it("rejects nonsense rather than throwing", () => {
    expect(parseIsoDate("")).toBeUndefined();
    expect(parseIsoDate("2024-13-01")).toBeUndefined();
    expect(parseIsoDate("2023-02-29")).toBeUndefined();
    expect(parseIsoDate("2024-1-1")).toBeUndefined();
    expect(parseIsoDate("01/01/2024")).toBeUndefined();
  });
});

describe("daysInMonth", () => {
  it("knows about leap years", () => {
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2023, 2)).toBe(28);
    expect(daysInMonth(2000, 2)).toBe(29);
    expect(daysInMonth(1900, 2)).toBe(28);
    expect(daysInMonth(2024, 12)).toBe(31);
  });
});

describe("inclusiveDayCount", () => {
  it("counts both ends", () => {
    expect(inclusiveDayCount({ start: "2024-01-01", end: "2024-01-01" })).toBe(1);
    expect(inclusiveDayCount({ start: "2024-01-01", end: "2024-01-31" })).toBe(31);
    expect(inclusiveDayCount({ start: "2024-01-01", end: "2024-12-31" })).toBe(366);
    expect(inclusiveDayCount({ start: "2023-01-01", end: "2023-12-31" })).toBe(365);
  });

  it("crosses a daylight-saving boundary in the northern hemisphere without drifting", () => {
    expect(inclusiveDayCount({ start: "2024-03-01", end: "2024-04-30" })).toBe(61);
  });
});

describe("monthStarts", () => {
  it("names every calendar month the window touches by its first day", () => {
    expect(monthStarts({ start: "2024-01-15", end: "2024-03-02" })).toEqual([
      "2024-01-01",
      "2024-02-01",
      "2024-03-01",
    ]);
  });

  it("crosses a year boundary", () => {
    expect(monthStarts({ start: "2023-11-20", end: "2024-02-05" })).toEqual([
      "2023-11-01",
      "2023-12-01",
      "2024-01-01",
      "2024-02-01",
    ]);
  });

  it("gives a single month for a window inside one month", () => {
    expect(monthStarts({ start: "2024-05-02", end: "2024-05-28" })).toEqual(["2024-05-01"]);
    expect(monthCount({ start: "2024-05-02", end: "2024-05-28" })).toBe(1);
  });
});

describe("shiftYears", () => {
  it("keeps the month and clamps the day", () => {
    expect(shiftYears("2024-02-29", -1)).toBe("2023-02-28");
    expect(shiftYears("2024-06-15", -1)).toBe("2023-06-15");
    expect(shiftYears("2023-02-28", 1)).toBe("2024-02-28");
  });

  it("gives the year-earlier window for changeYoY", () => {
    expect(previousYearWindow({ start: "2024-01-01", end: "2024-12-31" })).toEqual({
      start: "2023-01-01",
      end: "2023-12-31",
    });
  });
});

describe("monthOf and isoTimestamp", () => {
  it("reads the month for the seasonal term", () => {
    expect(monthOf("2024-05-01")).toBe(5);
    expect(monthOf("2024-12-01")).toBe(12);
  });

  it("builds a UTC timestamp from a date and a minute offset", () => {
    expect(isoTimestamp("2024-12-31", 6 * 60 + 30)).toBe("2024-12-31T06:30:00.000Z");
    expect(isoTimestamp("2024-12-31", 0)).toBe("2024-12-31T00:00:00.000Z");
  });
});
