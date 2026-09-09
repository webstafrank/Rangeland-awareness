/**
 * The band table and the two operations every screen agrees on.
 *
 * `classify` is total by construction, and this file is where that is proved:
 * every band of every indicator is reached by a value chosen for it, both ends
 * of the domain are exceeded, and NaN is refused. A band the generator happens
 * never to reach is still not dead code, because the legend renders it and the
 * map colours it, and it is reachable here.
 */
import { describe, expect, it } from "vitest";
import { TOPIC_SLUGS } from "@/lib/analysis/topics";
import { SEVERITY_ORDER } from "@/lib/run/constants";
import {
  allIndicators,
  assertIndicatorInvariants,
  classify,
  formatValue,
  indicatorFor,
  intoDomain,
  spanOf,
  worseBand,
} from "@/lib/run/indicators";
import type { IndicatorSpec } from "@/lib/run/result";

const INDICATORS = allIndicators();

describe("the registry", () => {
  it("has one indicator per topic, and no topic without one", () => {
    expect(INDICATORS).toHaveLength(TOPIC_SLUGS.length);
    for (const slug of TOPIC_SLUGS) {
      expect(indicatorFor(slug)).toBeDefined();
    }
  });

  it("gives every indicator a distinct id", () => {
    expect(new Set(INDICATORS.map((i) => i.id)).size).toBe(INDICATORS.length);
  });

  it("carries the headline indicator the contract names for each topic", () => {
    expect(indicatorFor("flood-risk")).toMatchObject({ domain: [0, 1], badEnd: "high" });
    expect(indicatorFor("drought-monitoring")).toMatchObject({ domain: [0, 100], badEnd: "low" });
    expect(indicatorFor("rangeland-dynamics")).toMatchObject({ domain: [0, 100], badEnd: "low" });
    expect(indicatorFor("food-security")).toMatchObject({ domain: [1, 5], badEnd: "high" });
  });

  it("cites a source for every band table, since these are published breaks", () => {
    for (const indicator of INDICATORS) {
      expect(indicator.source.length).toBeGreaterThan(20);
    }
  });

  it("throws for a topic it has no indicator for, rather than returning undefined", () => {
    // Cast because the type already forbids it: the guard is for a route param
    // that reached here without being narrowed.
    expect(() => indicatorFor("not-a-topic" as never)).toThrow(/no indicator/);
  });
});

describe("band invariants", () => {
  it.each(INDICATORS.map((i) => [i.id, i] as const))("%s tiles its domain", (_id, indicator) => {
    expect(() => assertIndicatorInvariants(indicator)).not.toThrow();
  });

  it.each(INDICATORS.map((i) => [i.id, i] as const))(
    "%s uses only known severities, ordered worst-last as it descends or ascends",
    (_id, indicator) => {
      for (const band of indicator.bands) {
        expect(SEVERITY_ORDER).toContain(band.severity);
      }
      // The severity ranking runs monotonically along the band table, in the
      // direction `badEnd` names. Anything else means a middle band is worse
      // than an end one, and the legend would be unreadable.
      const ranks = indicator.bands.map((b) => SEVERITY_ORDER.indexOf(b.severity));
      const expected = indicator.badEnd === "high" ? [...ranks].sort((a, b) => a - b) : [...ranks].sort((a, b) => b - a);
      expect(ranks).toEqual(expected);
    },
  );

  it("catches a gap", () => {
    const broken: IndicatorSpec = {
      ...indicatorFor("drought-monitoring"),
      bands: [
        { id: "a", label: "A", min: 0, max: 10, severity: "severe" },
        { id: "b", label: "B", min: 20, max: null, severity: "none" },
      ],
    };
    expect(() => assertIndicatorInvariants(broken)).toThrow(/gap between band 0/);
  });

  it("catches an overlap", () => {
    const broken: IndicatorSpec = {
      ...indicatorFor("drought-monitoring"),
      bands: [
        { id: "a", label: "A", min: 0, max: 30, severity: "severe" },
        { id: "b", label: "B", min: 20, max: null, severity: "none" },
      ],
    };
    expect(() => assertIndicatorInvariants(broken)).toThrow(/overlap between band 0/);
  });

  it("catches a closed top band, which would leave values unclassifiable", () => {
    const broken: IndicatorSpec = {
      ...indicatorFor("drought-monitoring"),
      bands: [{ id: "a", label: "A", min: 0, max: 100, severity: "none" }],
    };
    expect(() => assertIndicatorInvariants(broken)).toThrow(/top band must be open-ended/);
  });

  it("catches a first band that does not start at the domain floor", () => {
    const broken: IndicatorSpec = {
      ...indicatorFor("food-security"),
      bands: [{ id: "a", label: "A", min: 0, max: null, severity: "none" }],
    };
    expect(() => assertIndicatorInvariants(broken)).toThrow(/not at the domain floor 1/);
  });

  it("catches a duplicate band id, which would break a keyed legend", () => {
    const broken: IndicatorSpec = {
      ...indicatorFor("drought-monitoring"),
      bands: [
        { id: "a", label: "A", min: 0, max: 40, severity: "severe" },
        { id: "a", label: "B", min: 40, max: null, severity: "none" },
      ],
    };
    expect(() => assertIndicatorInvariants(broken)).toThrow(/band id "a" twice/);
  });

  it("catches an empty label and an empty domain", () => {
    const drought = indicatorFor("drought-monitoring");
    expect(() =>
      assertIndicatorInvariants({
        ...drought,
        bands: [{ id: "a", label: "  ", min: 0, max: null, severity: "none" }],
      }),
    ).toThrow(/empty label/);
    expect(() => assertIndicatorInvariants({ ...drought, domain: [5, 5] })).toThrow(/empty domain/);
  });
});

describe("classify is total", () => {
  it.each(INDICATORS.map((i) => [i.id, i] as const))(
    "%s reaches every one of its bands from inside its own range",
    (_id, indicator) => {
      const reached = new Set<string>();
      for (const band of indicator.bands) {
        // A value just above the band's floor is the value that band opens on.
        const probe = band.min + (band.max === null ? 1 : (band.max - band.min) / 2);
        reached.add(classify(indicator, probe).id);
      }
      expect(reached).toEqual(new Set(indicator.bands.map((b) => b.id)));
    },
  );

  it.each(INDICATORS.map((i) => [i.id, i] as const))(
    "%s classifies a boundary into the band that boundary opens",
    (_id, indicator) => {
      for (const band of indicator.bands) {
        expect(classify(indicator, band.min).id).toBe(band.id);
      }
    },
  );

  it.each(INDICATORS.map((i) => [i.id, i] as const))(
    "%s clamps below and above its domain rather than throwing",
    (_id, indicator) => {
      const [low, high] = indicator.domain;
      const span = spanOf(indicator);
      expect(classify(indicator, low - span).id).toBe(indicator.bands[0].id);
      expect(classify(indicator, high + span).id).toBe(
        indicator.bands[indicator.bands.length - 1].id,
      );
      expect(classify(indicator, Number.NEGATIVE_INFINITY).id).toBe(indicator.bands[0].id);
      expect(classify(indicator, Number.POSITIVE_INFINITY).id).toBe(
        indicator.bands[indicator.bands.length - 1].id,
      );
    },
  );

  it.each(INDICATORS.map((i) => [i.id, i] as const))("%s refuses NaN", (_id, indicator) => {
    expect(() => classify(indicator, Number.NaN)).toThrow(TypeError);
    expect(() => classify(indicator, Number.NaN)).toThrow(/cannot classify NaN/);
  });

  it("refuses an indicator with no bands, rather than returning undefined", () => {
    expect(() => classify({ ...indicatorFor("flood-risk"), bands: [] }, 0.5)).toThrow(/no bands/);
  });

  it("returns the same band object every time, so a page can compare by identity", () => {
    const indicator = indicatorFor("drought-monitoring");
    expect(classify(indicator, 15)).toBe(classify(indicator, 19.9));
  });

  it("puts the published VHI drought classes where NOAA and the NDMA put them", () => {
    const vhi = indicatorFor("drought-monitoring");
    expect(classify(vhi, 5).label).toBe("Extreme drought");
    expect(classify(vhi, 9.99).label).toBe("Extreme drought");
    expect(classify(vhi, 10).label).toBe("Severe drought");
    expect(classify(vhi, 29.99).label).toBe("Moderate drought");
    expect(classify(vhi, 30).label).toBe("Mild drought");
    expect(classify(vhi, 40).label).toBe("No drought");
    expect(classify(vhi, 100).label).toBe("No drought");
  });

  it("puts the IPC phases on the published integers", () => {
    const ipc = indicatorFor("food-security");
    expect(classify(ipc, 1).label).toBe("Minimal");
    expect(classify(ipc, 2.9).label).toBe("Stressed");
    expect(classify(ipc, 3).label).toBe("Crisis");
    expect(classify(ipc, 4).label).toBe("Emergency");
    expect(classify(ipc, 5).label).toBe("Famine");
  });
});

describe("intoDomain", () => {
  it("clamps to both ends and leaves an interior value alone", () => {
    const ipc = indicatorFor("food-security");
    expect(intoDomain(ipc, -3)).toBe(1);
    expect(intoDomain(ipc, 9)).toBe(5);
    expect(intoDomain(ipc, 2.5)).toBe(2.5);
  });
});

describe("formatValue", () => {
  it("uses the indicator's own precision and unit", () => {
    expect(formatValue(indicatorFor("drought-monitoring"), 27.44)).toBe("27.4");
    expect(formatValue(indicatorFor("flood-risk"), 0.783)).toBe("0.78");
    expect(formatValue(indicatorFor("food-security"), 3.25)).toBe("3.3 phase");
  });

  it("never prints a negative zero, which reads as a defect", () => {
    expect(formatValue(indicatorFor("drought-monitoring"), -0.01)).toBe("0.0");
    expect(formatValue(indicatorFor("flood-risk"), -0.001)).toBe("0.00");
  });

  it("groups thousands with a plain space, not a locale separator", () => {
    // Not reachable from the four indicators today, which is exactly why it is
    // tested: the first indicator with a wide domain must not depend on ICU.
    const wide = { ...indicatorFor("drought-monitoring"), domain: [0, 100000] as const };
    expect(formatValue(wide, 1340)).toBe("1 340.0");
    expect(formatValue(wide, 999)).toBe("999.0");
    expect(formatValue(wide, -12345.6)).toBe("-12 345.6");
  });

  it("refuses a non-finite value rather than printing NaN into a report", () => {
    const vhi = indicatorFor("drought-monitoring");
    expect(() => formatValue(vhi, Number.NaN)).toThrow(TypeError);
    expect(() => formatValue(vhi, Number.POSITIVE_INFINITY)).toThrow(/cannot format/);
  });
});

describe("worseBand", () => {
  it("picks the worse severity and keeps the first on a tie", () => {
    const vhi = indicatorFor("drought-monitoring");
    const good = classify(vhi, 90);
    const bad = classify(vhi, 5);
    expect(worseBand(good, bad)).toBe(bad);
    expect(worseBand(bad, good)).toBe(bad);
    expect(worseBand(good, good)).toBe(good);
  });
});
