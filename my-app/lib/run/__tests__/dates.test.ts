/**
 * Date maths, in UTC, with no library. A run computed in Nairobi and the same
 * run computed on a CI box in UTC have to agree on the month grid, or one URL
 * returns two different charts.
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
  toIsoDate,
} from "@/lib/run/dates";

describe("parseIsoDate", () => {
  it("accepts a real date", () => {
    expect(parseIsoDate("2024-02-29")).toEqual({ year: 2024, month: 2, day: 29 });
  });

  it("rejects nonsense rather than throwing", () => {
    expect(parseIsoDate("")).toBeUndefined();
    expect(parseIsoDate("2024-13-01")).toBeUndefined();
    expect(parseIsoDate("2024-00-01")).toBeUndefined();
    expect(parseIsoDate("2024-01-00")).toBeUndefined();
    expect(parseIsoDate("2024-04-31")).toBeUndefined();
    expect(parseIsoDate("2023-02-29")).toBeUndefined();
    expect(parseIsoDate("2024-1-1")).toBeUndefined();
    expect(parseIsoDate("01/01/2024")).toBeUndefined();
    expect(parseIsoDate("2024-01-01T00:00:00Z")).toBeUndefined();
  });

  it("round trips through toIsoDate", () => {
    for (const iso of ["2024-02-29", "1999-12-31", "2030-06-05"]) {
      expect(toIsoDate(parseIsoDate(iso)!)).toBe(iso);
    }
  });
});

describe("daysInMonth", () => {
  it("knows about leap years, including the century rules", () => {
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2023, 2)).toBe(28);
    expect(daysInMonth(2000, 2)).toBe(29);
    expect(daysInMonth(1900, 2)).toBe(28);
    expect(daysInMonth(2024, 12)).toBe(31);
    expect(daysInMonth(2024, 4)).toBe(30);
  });
});

describe("inclusiveDayCount", () => {
  it("counts both ends", () => {
    expect(inclusiveDayCount({ start: "2024-01-01", end: "2024-01-01" })).toBe(1);
    expect(inclusiveDayCount({ start: "2024-01-01", end: "2024-01-31" })).toBe(31);
    expect(inclusiveDayCount({ start: "2024-01-01", end: "2024-12-31" })).toBe(366);
    expect(inclusiveDayCount({ start: "2023-01-01", end: "2023-12-31" })).toBe(365);
  });

  it("crosses a northern daylight-saving boundary without drifting", () => {
    expect(inclusiveDayCount({ start: "2024-03-01", end: "2024-04-30" })).toBe(61);
  });

  it("returns 0 for a window that does not parse, rather than NaN", () => {
    expect(inclusiveDayCount({ start: "nope", end: "2024-01-31" })).toBe(0);
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

  it("gives 120 months for the longest window the config allows", () => {
    expect(monthCount({ start: "2015-01-01", end: "2024-12-31" })).toBe(120);
  });
});

describe("shiftYears", () => {
  it("keeps the month and clamps the day", () => {
    expect(shiftYears("2024-02-29", -1)).toBe("2023-02-28");
    expect(shiftYears("2024-06-15", -1)).toBe("2023-06-15");
    expect(shiftYears("2023-02-28", 1)).toBe("2024-02-28");
  });

  it("returns an unparseable input unchanged rather than inventing a date", () => {
    expect(shiftYears("not-a-date", -1)).toBe("not-a-date");
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
    expect(monthOf("garbage")).toBe(1);
  });

  it("builds a UTC timestamp from a date and a minute offset", () => {
    expect(isoTimestamp("2024-12-31", 6 * 60 + 30)).toBe("2024-12-31T06:30:00.000Z");
    expect(isoTimestamp("2024-12-31", 0)).toBe("2024-12-31T00:00:00.000Z");
  });

  it("does not read the local time zone", () => {
    // The assertion that matters on a developer machine in UTC+3: the hour in
    // the output is the hour that went in, not that hour shifted.
    expect(isoTimestamp("2024-06-01", 60)).toBe("2024-06-01T01:00:00.000Z");
  });
});
