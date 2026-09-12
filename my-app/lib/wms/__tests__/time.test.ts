/**
 * TIME handling.
 *
 * Every extent string in this file is copied verbatim from the live GIBS
 * GetCapabilities document read on 2026-09-09, gaps included. They are the
 * fixtures because the failure being defended against — HTTP 200 plus a
 * transparent PNG for an uncovered date — is only reachable through the shapes
 * a real server publishes.
 */

import { describe, expect, it } from "vitest";

import { GIBS_LAYERS } from "@/lib/wms/layers";
import {
  coversDate,
  describeLayerTime,
  extentBounds,
  formatWmsTime,
  layerExtent,
  nearestCoveredDate,
  parseTimeDimension,
  resolveLayerTime,
} from "@/lib/wms/time";
import type { WmsLayerSpec } from "@/lib/wms/types";

/** Two intervals with 2026-02-09 missing between them. Verified on GIBS. */
const NDVI_EXTENT = "2025-02-12/2026-02-08/P1D,2026-02-10/2026-09-08/P1D";

const NDVI: WmsLayerSpec = {
  id: "ndvi",
  layerName: "MODIS_Terra_NDVI_8Day",
  title: "NDVI",
  description: "",
  topics: ["rangeland-dynamics"],
  attribution: "",
  timeDimension: true,
  timeExtent: NDVI_EXTENT,
};

const STATIC_LAYER: WmsLayerSpec = {
  id: "static",
  layerName: "Some_Static_Layer",
  title: "Static",
  description: "",
  topics: ["rangeland-dynamics"],
  attribution: "",
};

describe("formatWmsTime", () => {
  it("passes an ISO date through", () => {
    expect(formatWmsTime("2026-08-01")).toBe("2026-08-01");
  });

  it("trims surrounding whitespace", () => {
    expect(formatWmsTime("  2026-08-01 ")).toBe("2026-08-01");
  });

  it("truncates a full instant to its date", () => {
    expect(formatWmsTime("2026-08-01T13:45:00Z")).toBe("2026-08-01");
  });

  it("keeps the calendar date, not the local one", () => {
    // The whole reason comparisons are string-based. Date.parse of this value
    // is UTC midnight, which reads back as 31 July anywhere west of Greenwich.
    expect(formatWmsTime("2026-08-01")).toBe("2026-08-01");
  });

  it("rejects a date that is not a real day", () => {
    expect(formatWmsTime("2026-02-31")).toBeNull();
    expect(formatWmsTime("2026-13-01")).toBeNull();
    expect(formatWmsTime("2026-00-10")).toBeNull();
  });

  it("accepts a real leap day and rejects a fake one", () => {
    expect(formatWmsTime("2024-02-29")).toBe("2024-02-29");
    expect(formatWmsTime("2025-02-29")).toBeNull();
  });

  it("rejects junk rather than throwing", () => {
    expect(formatWmsTime("")).toBeNull();
    expect(formatWmsTime("yesterday")).toBeNull();
    expect(formatWmsTime("01/08/2026")).toBeNull();
    expect(formatWmsTime("2026-8-1")).toBeNull();
  });
});

describe("parseTimeDimension", () => {
  it("parses the real multi-interval NDVI extent, gap and all", () => {
    expect(parseTimeDimension(NDVI_EXTENT)).toEqual([
      { start: "2025-02-12", end: "2026-02-08", resolution: "P1D" },
      { start: "2026-02-10", end: "2026-09-08", resolution: "P1D" },
    ]);
  });

  it("parses a single interval", () => {
    expect(parseTimeDimension("2000-03-01/2026-08-01/P1M")).toEqual([
      { start: "2000-03-01", end: "2026-08-01", resolution: "P1M" },
    ]);
  });

  it("parses a bare list of discrete dates as zero-width intervals", () => {
    expect(parseTimeDimension("2024-01-01,2024-06-01")).toEqual([
      { start: "2024-01-01", end: "2024-01-01", resolution: "PT0S" },
      { start: "2024-06-01", end: "2024-06-01", resolution: "PT0S" },
    ]);
  });

  it("keeps sub-daily instants verbatim", () => {
    const parsed = parseTimeDimension(
      "1998-01-01T00:00:00Z/2026-09-09T02:30:00Z/PT30M",
    );
    expect(parsed[0].start).toBe("1998-01-01T00:00:00Z");
    expect(parsed[0].resolution).toBe("PT30M");
  });

  it("skips malformed members instead of losing the whole extent", () => {
    expect(parseTimeDimension("2024-01-01/2024-12-31/P1D,,/,2025-01-01")).toEqual([
      { start: "2024-01-01", end: "2024-12-31", resolution: "P1D" },
      { start: "2025-01-01", end: "2025-01-01", resolution: "PT0S" },
    ]);
  });

  it("returns nothing for an empty string", () => {
    expect(parseTimeDimension("")).toEqual([]);
  });
});

describe("extentBounds", () => {
  it("spans every interval", () => {
    expect(extentBounds(parseTimeDimension(NDVI_EXTENT))).toEqual({
      start: "2025-02-12",
      end: "2026-09-08",
    });
  });

  it("is null for an empty extent", () => {
    expect(extentBounds([])).toBeNull();
  });
});

describe("coversDate", () => {
  const extent = parseTimeDimension(NDVI_EXTENT);

  it("covers the interval endpoints inclusively", () => {
    expect(coversDate(extent, "2025-02-12")).toBe(true);
    expect(coversDate(extent, "2026-09-08")).toBe(true);
  });

  it("does not cover the one-day hole between the two intervals", () => {
    expect(coversDate(extent, "2026-02-08")).toBe(true);
    expect(coversDate(extent, "2026-02-09")).toBe(false);
    expect(coversDate(extent, "2026-02-10")).toBe(true);
  });

  it("does not cover anything before the rolling archive starts", () => {
    // The measured case: TIME=2024-01-01 on this layer is HTTP 200 and empty.
    expect(coversDate(extent, "2024-01-01")).toBe(false);
    expect(coversDate(extent, "2025-02-11")).toBe(false);
  });
});

describe("nearestCoveredDate", () => {
  const extent = parseTimeDimension(NDVI_EXTENT);

  it("returns the date itself when it is covered", () => {
    expect(nearestCoveredDate(extent, "2025-06-01")).toBe("2025-06-01");
  });

  it("returns the archive start for a date before it", () => {
    expect(nearestCoveredDate(extent, "2024-01-01")).toBe("2025-02-12");
  });

  it("returns the archive end for a date after it", () => {
    expect(nearestCoveredDate(extent, "2027-01-01")).toBe("2026-09-08");
  });

  it("breaks a tie inside a gap toward the earlier date", () => {
    // 2026-02-09 is one day from each side.
    expect(nearestCoveredDate(extent, "2026-02-09")).toBe("2026-02-08");
  });

  it("is null for an empty extent", () => {
    expect(nearestCoveredDate([], "2026-01-01")).toBeNull();
  });
});

describe("resolveLayerTime", () => {
  it("says a layer without a TIME dimension always applies", () => {
    expect(
      resolveLayerTime(STATIC_LAYER, { start: "2020-01-01", end: "2020-12-31" }),
    ).toEqual({ kind: "always" });
  });

  it("sends the window's end date when it is covered", () => {
    expect(
      resolveLayerTime(NDVI, { start: "2026-01-01", end: "2026-06-30" }),
    ).toEqual({ kind: "exact", time: "2026-06-30" });
  });

  it("clamps to the latest covered day inside the window and says so", () => {
    const resolved = resolveLayerTime(NDVI, {
      start: "2026-01-01",
      end: "2026-12-31",
    });

    expect(resolved.kind).toBe("clamped");
    if (resolved.kind !== "clamped") throw new Error("unreachable");
    expect(resolved.time).toBe("2026-09-08");
    expect(resolved.requested).toBe("2026-12-31");
    expect(resolved.reason).toContain("2026-12-31");
    expect(resolved.reason).toContain("2026-09-08");
  });

  it("clamps across the gap rather than asking for the missing day", () => {
    const resolved = resolveLayerTime(NDVI, {
      start: "2026-01-01",
      end: "2026-02-09",
    });

    expect(resolved).toMatchObject({ kind: "clamped", time: "2026-02-08" });
  });

  it("reports unavailable when no day in the window is covered", () => {
    const resolved = resolveLayerTime(NDVI, {
      start: "2024-01-01",
      end: "2024-12-31",
    });

    expect(resolved.kind).toBe("unavailable");
    if (resolved.kind !== "unavailable") throw new Error("unreachable");
    expect(resolved.nearest).toBe("2025-02-12");
    expect(resolved.reason).toContain("2025-02-12");
    expect(resolved.reason).toContain("No data");
  });

  it("reports unavailable for a window that ends before the archive starts", () => {
    expect(
      resolveLayerTime(NDVI, { start: "2019-01-01", end: "2019-06-30" }).kind,
    ).toBe("unavailable");
  });

  it("sends the requested date when the server published no extent", () => {
    const noExtent: WmsLayerSpec = { ...NDVI, timeExtent: undefined };
    expect(
      resolveLayerTime(noExtent, { start: "2024-01-01", end: "2024-12-31" }),
    ).toEqual({ kind: "exact", time: "2024-12-31" });
  });

  it("degrades to a stated message for a malformed window instead of throwing", () => {
    const resolved = resolveLayerTime(NDVI, { start: "2024-01-01", end: "later" });

    expect(resolved.kind).toBe("unavailable");
    if (resolved.kind !== "unavailable") throw new Error("unreachable");
    expect(resolved.reason).toContain("yyyy-mm-dd");
  });

  it("clamps the annual land cover layer back to its last published year", () => {
    // The registry entry, not a synthetic one: coverage stops at 2024-01-01
    // while a run window will routinely end this year.
    const landCover = GIBS_LAYERS.find((l) => l.id === "land-cover");
    if (landCover === undefined) throw new Error("land-cover missing from registry");

    const resolved = resolveLayerTime(landCover, {
      start: "2023-01-01",
      end: "2026-06-30",
    });

    expect(resolved).toMatchObject({ kind: "clamped", time: "2024-01-01" });
  });

  it("lands mid-month on a monthly layer, because the server snaps within an interval", () => {
    // Verified against GIBS on 2026-09-09: TIME=2024-06-15 and TIME=2024-06-01
    // return byte-identical imagery for this layer. Inside a published
    // interval the server resolves to the containing granule itself, so there
    // is nothing for us to snap.
    const lst = GIBS_LAYERS.find((l) => l.id === "lst-terra-monthly");
    if (lst === undefined) throw new Error("lst-terra-monthly missing from registry");

    expect(
      resolveLayerTime(lst, { start: "2024-01-01", end: "2024-06-15" }),
    ).toEqual({ kind: "exact", time: "2024-06-15" });
  });
});

describe("describeLayerTime", () => {
  it("gives a sentence for every kind", () => {
    expect(describeLayerTime({ kind: "always" })).toBe("Not time-varying.");
    expect(describeLayerTime({ kind: "exact", time: "2026-06-30" })).toBe(
      "Showing 2026-06-30.",
    );
    expect(
      describeLayerTime(
        resolveLayerTime(NDVI, { start: "2024-01-01", end: "2024-12-31" }),
      ),
    ).toContain("nearest date");
  });
});

describe("layerExtent", () => {
  it("parses every extent in the shipped registry", () => {
    for (const layer of GIBS_LAYERS) {
      const extent = layerExtent(layer);
      expect(extent.length).toBeGreaterThan(0);
      for (const interval of extent) {
        expect(interval.start <= interval.end).toBe(true);
      }
    }
  });
});
