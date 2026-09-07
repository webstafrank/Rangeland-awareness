/**
 * Gate tests for services/catalog.
 *
 * Two kinds of test live here, and the split is deliberate:
 *
 *   - Property tests that loop over `catalog.listTopics()`. A topic added next
 *     year is checked by them without anyone editing this file, which is the
 *     only way band tiling stays true over time.
 *   - Pinned strings and pinned boundary values. Every screen reads formatted
 *     values and band names, so the exact output is part of the contract in
 *     practice even where the interface only says "formats a value".
 *
 * The negative tests on `assertIndicatorInvariants` matter as much as the
 * positive ones: a checker that cannot fail would pass a broken catalogue and
 * the loops above would be theatre.
 */
import { describe, it, expect } from "vitest";
import {
  MODEL_IDS,
  ModelIdSchema,
  SEVERITIES,
  SeveritySchema,
  TOPIC_IDS,
  TopicIdSchema,
  type IndicatorBand,
  type IndicatorSpec,
} from "@/contracts/catalog";
import {
  catalog,
  TOPICS,
  MODELS,
  RANDOM_FOREST,
  XGBOOST,
  FLOOD_RISK,
  DROUGHT,
  FOOD_SECURITY,
  RANGELAND_DYNAMICS,
  CATALOG_CONTRACT_VERSION,
  assertIndicatorInvariants,
} from "..";

const sorted = (values: readonly string[]): string[] => [...values].sort();

/** Junk that actually reaches `findTopic`: URL segments and prototype keys. */
const JUNK_IDS = [
  "",
  " ",
  "DROUGHT",
  "flood risk",
  "flood-risk ",
  "floods",
  "linear-regression",
  "__proto__",
  "constructor",
  "prototype",
  "toString",
  "0",
];

describe("catalogue shape", () => {
  it("pins the contract version it implements", () => {
    // A bump on the contract side must be a deliberate visit to this service,
    // not a silent divergence.
    expect(CATALOG_CONTRACT_VERSION).toBe(1);
  });

  it("lists exactly the four contract topics", () => {
    const ids = catalog.listTopics().map((t) => t.id);
    expect(ids).toHaveLength(TOPIC_IDS.length);
    expect(new Set(ids).size).toBe(ids.length);
    // Compared as sets: display order is presentation and is allowed to differ
    // from the order the contract happens to declare.
    expect(sorted(ids)).toEqual(sorted(TOPIC_IDS));
  });

  it("resolves every contract topic id", () => {
    for (const id of TOPIC_IDS) {
      const topic = catalog.getTopic(id);
      expect(topic.id).toBe(id);
      expect(TopicIdSchema.parse(topic.id)).toBe(id);
    }
  });

  it("lists exactly the two contract models", () => {
    const ids = catalog.listModels().map((m) => m.id);
    expect(sorted(ids)).toEqual(sorted(MODEL_IDS));
    for (const id of ids) expect(ModelIdSchema.parse(id)).toBe(id);
  });

  it("exposes the same objects by name as through the service", () => {
    expect(catalog.listTopics()).toBe(TOPICS);
    expect(catalog.listModels()).toBe(MODELS);
    expect(catalog.getTopic("flood-risk")).toBe(FLOOD_RISK);
    expect(catalog.getTopic("drought")).toBe(DROUGHT);
    expect(catalog.getTopic("food-security")).toBe(FOOD_SECURITY);
    expect(catalog.getTopic("rangeland-dynamics")).toBe(RANGELAND_DYNAMICS);
    expect(catalog.getModel("random-forest")).toBe(RANDOM_FOREST);
    expect(catalog.getModel("xgboost")).toBe(XGBOOST);
  });

  it("is frozen, because every page shares the one instance", () => {
    expect(Object.isFrozen(catalog)).toBe(true);
  });
});

describe.each(TOPICS.map((topic) => [topic.id, topic] as const))(
  "topic %s",
  (_id, topic) => {
    const ind = topic.indicator;

    it("passes the indicator invariants", () => {
      expect(() => assertIndicatorInvariants(ind)).not.toThrow();
    });

    it("has bands that tile the domain, ascending, with an open top band", () => {
      expect(ind.bands.length).toBeGreaterThan(0);
      expect(ind.bands[0].min).toBe(ind.domain[0]);

      ind.bands.forEach((band, i) => {
        const isLast = i === ind.bands.length - 1;
        if (isLast) {
          expect(band.max).toBeNull();
          expect(band.min).toBeLessThanOrEqual(ind.domain[1]);
          return;
        }
        // Not null, wider than zero, and flush against the next band: one
        // equality catches both a gap and an overlap.
        expect(band.max).not.toBeNull();
        expect(band.max as number).toBeGreaterThan(band.min);
        expect(band.max).toBe(ind.bands[i + 1].min);
      });
    });

    it("uses only the four reserved severities", () => {
      for (const band of ind.bands) {
        expect(SEVERITIES).toContain(band.severity);
        expect(SeveritySchema.parse(band.severity)).toBe(band.severity);
      }
    });

    it("labels every band and names a source", () => {
      for (const band of ind.bands) expect(band.label.trim()).not.toBe("");
      expect(ind.source.trim().length).toBeGreaterThan(20);
      expect(ind.label.trim()).not.toBe("");
      expect(ind.longLabel.trim()).not.toBe("");
    });

    it("declares a sane domain and precision", () => {
      expect(ind.domain[0]).toBeLessThan(ind.domain[1]);
      expect(Number.isInteger(ind.precision)).toBe(true);
      expect(ind.precision).toBeGreaterThanOrEqual(0);
      expect(["low", "high"]).toContain(ind.badEnd);
    });

    it("offers at least one model, all of them known", () => {
      expect(topic.models.length).toBeGreaterThan(0);
      expect(new Set(topic.models).size).toBe(topic.models.length);
      for (const id of topic.models) {
        expect(MODEL_IDS).toContain(id);
        expect(catalog.getModel(id).id).toBe(id);
      }
    });

    it("has a dataStart that is a real past ISO date", () => {
      expect(topic.dataStart).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      const parsed = new Date(`${topic.dataStart}T00:00:00Z`);
      expect(Number.isNaN(parsed.getTime())).toBe(false);
      // Round trip catches a date that matches the shape but does not exist,
      // e.g. 2001-02-30, which some parsers silently roll into March.
      expect(parsed.toISOString().slice(0, 10)).toBe(topic.dataStart);
      expect(parsed.getTime()).toBeLessThan(Date.now());
    });

    it("describes itself in plain prose", () => {
      expect(topic.label.trim()).not.toBe("");
      expect(topic.blurb.length).toBeGreaterThan(20);
      expect(topic.description.length).toBeGreaterThan(topic.blurb.length);
      expect(topic.drivers.length).toBeGreaterThan(0);
      for (const driver of topic.drivers) expect(driver.trim()).not.toBe("");
    });

    it("classifies every band boundary into the band it opens", () => {
      ind.bands.forEach((band, i) => {
        expect(catalog.classify(ind, band.min)).toBe(band);
        if (i > 0) {
          // Half-open bands: a hair below the boundary belongs to the band
          // that closes there, never to the one it opens.
          expect(catalog.classify(ind, band.min - 0.25)).toBe(ind.bands[i - 1]);
        }
        if (band.max !== null) {
          expect(catalog.classify(ind, band.max - 0.25)).toBe(band);
          expect(catalog.classify(ind, (band.min + band.max) / 2)).toBe(band);
        }
      });
    });

    it("clamps out-of-domain values to the end bands", () => {
      const first = ind.bands[0];
      const last = ind.bands[ind.bands.length - 1];
      expect(catalog.classify(ind, ind.domain[0] - 1)).toBe(first);
      expect(catalog.classify(ind, ind.domain[0] - 1e6)).toBe(first);
      expect(catalog.classify(ind, Number.NEGATIVE_INFINITY)).toBe(first);
      expect(catalog.classify(ind, ind.domain[1] + 1)).toBe(last);
      expect(catalog.classify(ind, ind.domain[1] + 1e6)).toBe(last);
      expect(catalog.classify(ind, Number.POSITIVE_INFINITY)).toBe(last);
    });

    it("never returns undefined across a sweep of the domain", () => {
      const [lo, hi] = ind.domain;
      const step = (hi - lo) / 200;
      for (let v = lo - step; v <= hi + step; v += step) {
        const band = catalog.classify(ind, v);
        expect(band).toBeDefined();
        expect(ind.bands).toContain(band);
        if (v >= lo && v <= hi) {
          expect(v).toBeGreaterThanOrEqual(band.min);
          if (band.max !== null) expect(v).toBeLessThan(band.max);
        }
      }
    });

    it("rejects NaN rather than painting missing data as a real band", () => {
      expect(() => catalog.classify(ind, Number.NaN)).toThrow(/NaN/);
      expect(() => catalog.formatValue(ind, Number.NaN)).toThrow(/NaN/);
      expect(() => catalog.formatValue(ind, Number.POSITIVE_INFINITY)).toThrow(
        /Infinity/,
      );
    });

    it("formats to its declared precision, with the unit only when it has one", () => {
      const mid = (ind.domain[0] + ind.domain[1]) / 2;
      const text = catalog.formatValue(ind, mid);
      const decimals = text.split(" ")[0].split(".")[1] ?? "";
      expect(decimals.length).toBe(ind.precision);
      if (ind.unit === "") {
        expect(text).toBe(mid.toFixed(ind.precision));
      } else {
        expect(text.endsWith(` ${ind.unit}`)).toBe(true);
      }
    });
  },
);

describe("classify: pinned boundaries per topic", () => {
  const label = (ind: IndicatorSpec, v: number) => catalog.classify(ind, v).label;

  it("reads NDMA's VCI-3M classes", () => {
    const ind = DROUGHT.indicator;
    expect(label(ind, 0)).toBe("Extreme vegetation deficit");
    expect(label(ind, 9.9)).toBe("Extreme vegetation deficit");
    expect(label(ind, 10)).toBe("Severe vegetation deficit");
    expect(label(ind, 19.9)).toBe("Severe vegetation deficit");
    expect(label(ind, 20)).toBe("Moderate vegetation deficit");
    expect(label(ind, 34.9)).toBe("Moderate vegetation deficit");
    expect(label(ind, 35)).toBe("Normal greenness");
    expect(label(ind, 49.9)).toBe("Normal greenness");
    expect(label(ind, 50)).toBe("Above normal greenness");
    expect(label(ind, 100)).toBe("Above normal greenness");
    expect(label(ind, 140)).toBe("Above normal greenness");
    expect(label(ind, -5)).toBe("Extreme vegetation deficit");
  });

  it("reads flood hazard probability classes", () => {
    const ind = FLOOD_RISK.indicator;
    expect(label(ind, 0)).toBe("Very low");
    expect(label(ind, 9.99)).toBe("Very low");
    expect(label(ind, 10)).toBe("Low");
    expect(label(ind, 25)).toBe("Moderate");
    expect(label(ind, 49.99)).toBe("Moderate");
    expect(label(ind, 50)).toBe("High");
    expect(label(ind, 74.99)).toBe("High");
    expect(label(ind, 75)).toBe("Very high");
    expect(label(ind, 100)).toBe("Very high");
  });

  it("reads IPC phases, including the phase 5 top band", () => {
    const ind = FOOD_SECURITY.indicator;
    expect(label(ind, 1)).toBe("Phase 1 Minimal");
    expect(label(ind, 1.9)).toBe("Phase 1 Minimal");
    expect(label(ind, 2)).toBe("Phase 2 Stressed");
    expect(label(ind, 3)).toBe("Phase 3 Crisis");
    expect(label(ind, 4)).toBe("Phase 4 Emergency");
    expect(label(ind, 4.9)).toBe("Phase 4 Emergency");
    expect(label(ind, 5)).toBe("Phase 5 Famine");
    expect(label(ind, 9)).toBe("Phase 5 Famine");
    // Below the domain floor of 1: a phase 0 does not exist, so it clamps.
    expect(label(ind, 0)).toBe("Phase 1 Minimal");
  });

  it("reads herbaceous biomass classes", () => {
    const ind = RANGELAND_DYNAMICS.indicator;
    expect(label(ind, 0)).toBe("Severely degraded");
    expect(label(ind, 299)).toBe("Severely degraded");
    expect(label(ind, 300)).toBe("Degraded");
    expect(label(ind, 699)).toBe("Degraded");
    expect(label(ind, 700)).toBe("Stressed");
    expect(label(ind, 1199)).toBe("Stressed");
    expect(label(ind, 1200)).toBe("Stable");
    expect(label(ind, 1999)).toBe("Stable");
    expect(label(ind, 2000)).toBe("Productive");
    expect(label(ind, 3000)).toBe("Productive");
    expect(label(ind, 4200)).toBe("Productive");
    expect(label(ind, -50)).toBe("Severely degraded");
  });

  it("keeps severity and badEnd consistent at the bad end of each domain", () => {
    for (const topic of TOPICS) {
      const ind = topic.indicator;
      const worstValue = ind.badEnd === "low" ? ind.domain[0] : ind.domain[1];
      const bestValue = ind.badEnd === "low" ? ind.domain[1] : ind.domain[0];
      expect(catalog.classify(ind, worstValue).severity).toBe("critical");
      expect(catalog.classify(ind, bestValue).severity).toBe("good");
    }
  });
});

describe("formatValue: pinned strings", () => {
  it("formats flood hazard probability to one decimal with a spaced unit", () => {
    const ind = FLOOD_RISK.indicator;
    expect(catalog.formatValue(ind, 0)).toBe("0.0 %");
    expect(catalog.formatValue(ind, 27.44)).toBe("27.4 %");
    expect(catalog.formatValue(ind, 27.46)).toBe("27.5 %");
    // Pinned on purpose: 27.45 is stored as 27.4499999... in binary floating
    // point, so `toFixed` rounds it down. Anyone swapping in a rounding helper
    // that "fixes" this changes numbers already published in reports.
    expect(catalog.formatValue(ind, 27.45)).toBe("27.4 %");
    expect(catalog.formatValue(ind, 8)).toBe("8.0 %");
    expect(catalog.formatValue(ind, 100)).toBe("100.0 %");
    // A tiny negative from an extrapolation must not print as "-0.0 %".
    expect(catalog.formatValue(ind, -0.02)).toBe("0.0 %");
    expect(catalog.formatValue(ind, -3.5)).toBe("-3.5 %");
  });

  it("formats VCI with no unit at all, because it is dimensionless", () => {
    const ind = DROUGHT.indicator;
    expect(catalog.formatValue(ind, 27.44)).toBe("27.4");
    expect(catalog.formatValue(ind, 8)).toBe("8.0");
    expect(catalog.formatValue(ind, 0)).toBe("0.0");
    expect(catalog.formatValue(ind, 100)).toBe("100.0");
    expect(catalog.formatValue(ind, 19.96)).toBe("20.0");
  });

  it("formats IPC phase as a bare whole number", () => {
    // No unit suffix: a phase is a class, so the word "phase" lives in the
    // indicator label and the band name, never appended to the value.
    const ind = FOOD_SECURITY.indicator;
    expect(ind.unit).toBe("");
    expect(catalog.formatValue(ind, 3)).toBe("3");
    expect(catalog.formatValue(ind, 3.4)).toBe("3");
    expect(catalog.formatValue(ind, 3.6)).toBe("4");
    expect(catalog.formatValue(ind, 5)).toBe("5");
  });

  it("formats biomass as whole kilograms, grouped in thousands", () => {
    const ind = RANGELAND_DYNAMICS.indicator;
    expect(catalog.formatValue(ind, 0)).toBe("0 kg DM/ha");
    expect(catalog.formatValue(ind, 340)).toBe("340 kg DM/ha");
    expect(catalog.formatValue(ind, 999)).toBe("999 kg DM/ha");
    expect(catalog.formatValue(ind, 999.6)).toBe("1 000 kg DM/ha");
    expect(catalog.formatValue(ind, 1000)).toBe("1 000 kg DM/ha");
    expect(catalog.formatValue(ind, 1340)).toBe("1 340 kg DM/ha");
    expect(catalog.formatValue(ind, 1339.6)).toBe("1 340 kg DM/ha");
    expect(catalog.formatValue(ind, 2000)).toBe("2 000 kg DM/ha");
    expect(catalog.formatValue(ind, 3000)).toBe("3 000 kg DM/ha");
    // Grouping is general, not a special case for four digits.
    expect(catalog.formatValue(ind, 1234567)).toBe("1 234 567 kg DM/ha");
    expect(catalog.formatValue(ind, -1340)).toBe("-1 340 kg DM/ha");
    expect(catalog.formatValue(ind, -0.2)).toBe("0 kg DM/ha");
  });

  it("uses a plain space, not a locale separator", () => {
    const text = catalog.formatValue(RANGELAND_DYNAMICS.indicator, 1340);
    expect(text).toBe("1 340 kg DM/ha");
    expect(text).not.toContain(","); // en-US toLocaleString
    expect(text).not.toContain("."); // de-DE toLocaleString
    expect(text).not.toContain(" "); // non-breaking space, fr-FR
    expect(text).not.toContain(" "); // narrow no-break space
    expect(text).not.toContain(" "); // thin space
  });
});

describe("lookups", () => {
  it("throws with the known ids when a topic id is unknown", () => {
    // Cast because the whole point is a value the type system would reject and
    // a URL supplies anyway.
    expect(() => catalog.getTopic("nope" as never)).toThrow(
      /unknown topic "nope"/,
    );
    expect(() => catalog.getTopic("nope" as never)).toThrow(/flood-risk/);
    expect(() => catalog.getModel("neural-net" as never)).toThrow(
      /unknown model "neural-net"/,
    );
    expect(() => catalog.getModel("neural-net" as never)).toThrow(/xgboost/);
  });

  it("returns undefined from find* for junk input", () => {
    for (const id of JUNK_IDS) {
      expect(catalog.findTopic(id)).toBeUndefined();
      expect(catalog.findModel(id)).toBeUndefined();
    }
  });

  it("finds every real id through find*", () => {
    for (const id of TOPIC_IDS) expect(catalog.findTopic(id)?.id).toBe(id);
    for (const id of MODEL_IDS) expect(catalog.findModel(id)?.id).toBe(id);
    // Cross-namespace lookups must not hit.
    expect(catalog.findTopic("xgboost")).toBeUndefined();
    expect(catalog.findModel("drought")).toBeUndefined();
  });
});

describe("models", () => {
  it("describes each model without empty prose", () => {
    for (const model of MODELS) {
      expect(model.label.trim()).not.toBe("");
      expect(model.blurb.length).toBeGreaterThan(20);
      expect(model.strength.length).toBeGreaterThan(20);
      expect(Number.isFinite(model.costWeight)).toBe(true);
      expect(model.costWeight).toBeGreaterThan(0);
    }
  });

  it("prices boosting above the forest, which the running screen relies on", () => {
    expect(XGBOOST.costWeight).toBeGreaterThan(RANDOM_FOREST.costWeight);
    expect(RANDOM_FOREST.costWeight).toBe(1);
    expect(XGBOOST.costWeight).toBe(1.6);
  });

  it("is offered by every topic in contract version 1", () => {
    for (const topic of TOPICS) {
      expect(sorted(topic.models)).toEqual(sorted(MODEL_IDS));
    }
  });
});

describe("prose style", () => {
  /** Every user-visible string in the catalogue, flattened. */
  const strings: string[] = [];
  const walk = (value: unknown): void => {
    if (typeof value === "string") strings.push(value);
    else if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === "object") {
      Object.values(value).forEach(walk);
    }
  };
  walk(TOPICS);
  walk(MODELS);

  it("collected something to check", () => {
    expect(strings.length).toBeGreaterThan(50);
  });

  it("uses no em or en dashes", () => {
    // House style, and a dash pasted in from a source document is the usual
    // way one arrives.
    const offenders = strings.filter((s) => /[—–]/.test(s));
    expect(offenders).toEqual([]);
  });

  it("leaves no placeholder text", () => {
    const offenders = strings.filter((s) => /\b(TODO|TBD|FIXME|lorem)\b/i.test(s));
    expect(offenders).toEqual([]);
  });
});

describe("assertIndicatorInvariants: the checker itself can fail", () => {
  const withBands = (bands: readonly IndicatorBand[]): IndicatorSpec => ({
    id: "test-indicator",
    label: "Test",
    longLabel: "Test indicator",
    unit: "",
    precision: 1,
    domain: [0, 100],
    badEnd: "high",
    bands,
    source: "A fixture, not a real indicator definition, used by the tests.",
  });

  it("accepts a well formed indicator", () => {
    expect(() =>
      assertIndicatorInvariants(
        withBands([
          { min: 0, max: 50, label: "Low", severity: "good" },
          { min: 50, max: null, label: "High", severity: "critical" },
        ]),
      ),
    ).not.toThrow();
  });

  it("rejects a gap between bands", () => {
    expect(() =>
      assertIndicatorInvariants(
        withBands([
          { min: 0, max: 40, label: "Low", severity: "good" },
          { min: 50, max: null, label: "High", severity: "critical" },
        ]),
      ),
    ).toThrow(/gap/);
  });

  it("rejects an overlap between bands", () => {
    expect(() =>
      assertIndicatorInvariants(
        withBands([
          { min: 0, max: 60, label: "Low", severity: "good" },
          { min: 50, max: null, label: "High", severity: "critical" },
        ]),
      ),
    ).toThrow(/overlap/);
  });

  it("rejects a closed top band", () => {
    expect(() =>
      assertIndicatorInvariants(
        withBands([
          { min: 0, max: 50, label: "Low", severity: "good" },
          { min: 50, max: 100, label: "High", severity: "critical" },
        ]),
      ),
    ).toThrow(/open-ended/);
  });

  it("rejects a first band that does not start at the domain floor", () => {
    expect(() =>
      assertIndicatorInvariants(
        withBands([
          { min: 5, max: 50, label: "Low", severity: "good" },
          { min: 50, max: null, label: "High", severity: "critical" },
        ]),
      ),
    ).toThrow(/domain floor/);
  });

  it("rejects a reversed band", () => {
    expect(() =>
      assertIndicatorInvariants(
        withBands([
          { min: 0, max: -10, label: "Low", severity: "good" },
          { min: -10, max: null, label: "High", severity: "critical" },
        ]),
      ),
    ).toThrow(/empty or reversed/);
  });

  it("rejects a severity outside the reserved four", () => {
    expect(() =>
      assertIndicatorInvariants(
        withBands([
          { min: 0, max: 50, label: "Low", severity: "good" },
          {
            min: 50,
            max: null,
            label: "High",
            severity: "catastrophic" as never,
          },
        ]),
      ),
    ).toThrow(/severity/);
  });

  it("rejects an empty band list", () => {
    expect(() => assertIndicatorInvariants(withBands([]))).toThrow(/no bands/);
    expect(() => catalog.classify(withBands([]), 1)).toThrow(/no bands/);
  });

  it("rejects a mid-list open-ended band", () => {
    expect(() =>
      assertIndicatorInvariants(
        withBands([
          { min: 0, max: null, label: "Low", severity: "good" },
          { min: 50, max: null, label: "High", severity: "critical" },
        ]),
      ),
    ).toThrow(/not the top band/);
  });
});
