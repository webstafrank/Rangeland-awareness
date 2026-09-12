/**
 * `runId` is the identity of a result and the whole of its storage. These are
 * the most important tests in the module: an id that is not stable turns every
 * shared URL into a different study, and an id that collides serves one study's
 * numbers under another study's name.
 *
 * The geometry seeding is tested hardest, because it is the part that has no
 * counterpart in the `rangeland-pages` reference and therefore no prior art to
 * inherit correctness from.
 */
import { describe, expect, it } from "vitest";
import type { FormulaId } from "@/lib/analysis/formulas";
import { RUN_ID_LENGTH } from "@/lib/run/constants";
import {
  areaSeedKey,
  canonicalConfigString,
  fnv1a32,
  hashToId,
  runIdFor,
  seedFor,
  studySeed,
} from "@/lib/run/hash";
import type { RunConfig } from "@/lib/run/config";
import {
  BASE_CONFIG,
  MARSABIT,
  MURANGA,
  TURKANA,
  areaAt,
  config,
} from "./fixtures";

describe("fnv1a32", () => {
  it("is stable and unsigned", () => {
    expect(fnv1a32("turkana")).toBe(fnv1a32("turkana"));
    expect(fnv1a32("")).toBe(0x811c9dc5);
    expect(fnv1a32("turkana")).toBeGreaterThanOrEqual(0);
    expect(fnv1a32("turkana")).toBeLessThanOrEqual(0xffffffff);
  });

  it("separates inputs that differ by one character", () => {
    expect(fnv1a32("2024-01-01")).not.toBe(fnv1a32("2024-01-02"));
  });

  it("gives two different words for the two bases", () => {
    expect(fnv1a32("turkana", 0x811c9dc5)).not.toBe(fnv1a32("turkana", 0x1000193));
  });
});

describe("areaSeedKey", () => {
  it("is the geometry and the label, never the session id", () => {
    const drawnFirst = areaAt("aoi-1", "Turkana", 3.1, 35.6, 0.9);
    const drawnThird = areaAt("aoi-3", "Turkana", 3.1, 35.6, 0.9);
    expect(areaSeedKey(drawnThird)).toBe(areaSeedKey(drawnFirst));
  });

  it("separates two areas that differ only in label", () => {
    const a = areaAt("aoi-1", "North catchment", 1, 37, 0.2);
    const b = areaAt("aoi-1", "South catchment", 1, 37, 0.2);
    expect(areaSeedKey(a)).not.toBe(areaSeedKey(b));
  });

  it("separates two areas that differ only in geometry", () => {
    const a = areaAt("aoi-1", "Site", 1, 37, 0.2);
    const b = areaAt("aoi-1", "Site", 1.5, 37, 0.2);
    expect(areaSeedKey(a)).not.toBe(areaSeedKey(b));
  });

  it("treats a label as case and whitespace insensitive, since those are typing, not intent", () => {
    const a = areaAt("aoi-1", " Turkana ", 3.1, 35.6);
    const b = areaAt("aoi-1", "turkana", 3.1, 35.6);
    expect(areaSeedKey(a)).toBe(areaSeedKey(b));
  });

  /**
   * The reason the key rounds at all. A polygon that has been through a
   * shapefile reprojection and a JSON round trip comes back with float noise in
   * the far decimals, and an unrounded key would give the same drawn area a
   * different result after a reload.
   */
  it("absorbs float noise below its precision", () => {
    const clean = areaAt("aoi-1", "Site", 1, 37, 0.2);
    const noisy = areaAt("aoi-1", "Site", 1 + 1e-9, 37 - 2e-10, 0.2);
    expect(areaSeedKey(noisy)).toBe(areaSeedKey(clean));
  });

  it("still separates two genuinely adjacent areas", () => {
    // 0.001 degrees is about 110 metres, well above the 11-metre precision.
    const a = areaAt("aoi-1", "Site", 1, 37, 0.2);
    const b = areaAt("aoi-1", "Site", 1.001, 37, 0.2);
    expect(areaSeedKey(a)).not.toBe(areaSeedKey(b));
  });

  it("writes -0 and 0 the same, so a box on the equator hashes one way", () => {
    const northOfZero = areaSeedKey({ label: "x", bounds: [[0, 37], [1, 38]] });
    const negativeZero = areaSeedKey({ label: "x", bounds: [[-0, 37], [1, 38]] });
    expect(negativeZero).toBe(northOfZero);
  });

  it("does not produce NaN text for a broken bound", () => {
    const key = areaSeedKey({ label: "x", bounds: [[Number.NaN, 37], [1, 38]] });
    expect(key.startsWith("nan,")).toBe(true);
  });
});

describe("canonicalConfigString", () => {
  it("writes fields in alphabetical order of key", () => {
    expect(canonicalConfigString(BASE_CONFIG)).toBe(
      `v2|areas=${areaSeedKey(TURKANA)}|formulas=vci,vhi|from=2024-01-01|` +
        "model=random-forest|to=2024-12-31|topic=drought-monitoring|type=single",
    );
  });

  it("does not depend on the object's own key order", () => {
    const reordered = {
      model: BASE_CONFIG.model,
      dateWindow: { end: BASE_CONFIG.dateWindow.end, start: BASE_CONFIG.dateWindow.start },
      areas: BASE_CONFIG.areas,
      formulas: BASE_CONFIG.formulas,
      analysisType: BASE_CONFIG.analysisType,
      schemaVersion: BASE_CONFIG.schemaVersion,
      topic: BASE_CONFIG.topic,
    } as RunConfig;
    expect(canonicalConfigString(reordered)).toBe(canonicalConfigString(BASE_CONFIG));
  });

  it("sorts areas, because area order is presentation and not identity", () => {
    const ab = config({ analysisType: "comparison", areas: [TURKANA, MARSABIT] });
    const ba = config({ analysisType: "comparison", areas: [MARSABIT, TURKANA] });
    expect(canonicalConfigString(ab)).toBe(canonicalConfigString(ba));
    expect(runIdFor(ab)).toBe(runIdFor(ba));
  });

  it("sorts formulas, for the same reason", () => {
    const a = config({ formulas: ["vci", "vhi"] as FormulaId[] });
    const b = config({ formulas: ["vhi", "vci"] as FormulaId[] });
    expect(runIdFor(a)).toBe(runIdFor(b));
  });

  it("omits the model when asked, which is what makes every model share one data seed", () => {
    const withoutModel = canonicalConfigString(BASE_CONFIG, { includeModel: false });
    expect(withoutModel).not.toContain("model=");
    expect(studySeed(BASE_CONFIG)).toBe(studySeed(config({ model: "xgboost" })));
    expect(studySeed(BASE_CONFIG)).toBe(studySeed(config({ model: "combined" })));
  });

  it("changes when the study changes, even with the model held out", () => {
    expect(studySeed(BASE_CONFIG)).not.toBe(studySeed(config({ areas: [MURANGA] })));
  });
});

/** One variant per field of RunConfig. Every one must produce a different id. */
const SINGLE_FIELD_VARIANTS: Readonly<Record<string, RunConfig>> = {
  topic: config({ topic: "food-security", formulas: ["vhi", "vci"] as FormulaId[] }),
  analysisType: config({ analysisType: "comparison" }),
  areas: config({ areas: [MARSABIT] }),
  "areas.label": config({ areas: [areaAt("aoi-1", "Turkana North", 3.1, 35.6, 0.9)] }),
  "areas.geometry": config({ areas: [areaAt("aoi-1", "Turkana", 3.2, 35.6, 0.9)] }),
  formulas: config({ formulas: ["vci"] as FormulaId[] }),
  "dateWindow.start": config({ dateWindow: { start: "2024-01-02", end: "2024-12-31" } }),
  "dateWindow.end": config({ dateWindow: { start: "2024-01-01", end: "2024-12-30" } }),
  model: config({ model: "xgboost" }),
};

describe("runIdFor", () => {
  it("is the same for the same config, every time", () => {
    expect(new Set(Array.from({ length: 50 }, () => runIdFor(BASE_CONFIG))).size).toBe(1);
  });

  it("is base36 and RUN_ID_LENGTH characters long", () => {
    expect(runIdFor(BASE_CONFIG)).toMatch(new RegExp(`^[0-9a-z]{${RUN_ID_LENGTH}}$`));
    expect(runIdFor(BASE_CONFIG)).toHaveLength(RUN_ID_LENGTH);
  });

  it.each(Object.keys(SINGLE_FIELD_VARIANTS))("changes when %s changes", (field) => {
    expect(runIdFor(SINGLE_FIELD_VARIANTS[field])).not.toBe(runIdFor(BASE_CONFIG));
  });

  it("gives every single-field variant its own id", () => {
    const ids = Object.values(SINGLE_FIELD_VARIANTS).map(runIdFor);
    expect(new Set([...ids, runIdFor(BASE_CONFIG)]).size).toBe(ids.length + 1);
  });

  it("ignores the area's session id, which is what geometry seeding is for", () => {
    const renumbered = config({ areas: [{ ...TURKANA, id: "aoi-9" }] });
    expect(runIdFor(renumbered)).toBe(runIdFor(BASE_CONFIG));
  });

  it("ignores how an area was selected: a typed box and a drawn box are one place", () => {
    const typed = config({ areas: [{ ...TURKANA, source: "coordinate" }] });
    expect(runIdFor(typed)).toBe(runIdFor(BASE_CONFIG));
  });

  it("spreads a one-day change across the whole id rather than one character", () => {
    const a = runIdFor(BASE_CONFIG);
    const b = runIdFor(SINGLE_FIELD_VARIANTS["dateWindow.start"]);
    const shared = [...a].filter((character, index) => character === b[index]).length;
    // Two independent base36 strings share about one character in 36 by chance.
    expect(shared).toBeLessThan(4);
  });

  it("does not collide across a few hundred neighbouring configs", () => {
    const ids = new Set<string>();
    let expected = 0;
    for (let day = 1; day <= 28; day += 1) {
      for (const model of ["random-forest", "xgboost", "combined"] as const) {
        for (const topic of ["drought-monitoring", "food-security"] as const) {
          ids.add(
            runIdFor(
              config({
                topic,
                model,
                formulas: ["vhi", "vci"] as FormulaId[],
                dateWindow: { start: `2024-01-${String(day).padStart(2, "0")}`, end: "2024-12-31" },
              }),
            ),
          );
          expected += 1;
        }
      }
    }
    expect(ids.size).toBe(expected);
  });

  it("does not collide across a grid of nearby polygons", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 20; i += 1) {
      for (let j = 0; j < 20; j += 1) {
        ids.add(runIdFor(config({ areas: [areaAt("aoi-1", "Cell", 1 + i * 0.01, 37 + j * 0.01, 0.05)] })));
      }
    }
    expect(ids.size).toBe(400);
  });
});

describe("seedFor", () => {
  it("is stable and purpose-separated", () => {
    expect(seedFor("abc", "x", "level")).toBe(seedFor("abc", "x", "level"));
    expect(seedFor("abc", "x", "level")).not.toBe(seedFor("abc", "x", "interval"));
    expect(seedFor("abc", "x", "level")).not.toBe(seedFor("abd", "x", "level"));
  });

  /**
   * The bug the separator exists to prevent. Joining the labels on the empty
   * string makes these two calls one seed, so two areas whose keys differ only
   * by where the purpose suffix begins would report identical numbers.
   */
  it("does not collide when a label boundary moves", () => {
    expect(seedFor("run", "ab", "cd")).not.toBe(seedFor("run", "abc", "d"));
  });
});

describe("hashToId", () => {
  it("is a pure function of its string", () => {
    expect(hashToId("v2|whatever")).toBe(hashToId("v2|whatever"));
    expect(hashToId("v2|whatever")).not.toBe(hashToId("v2|whateveR"));
  });

  it("emits only base36 characters, whatever it is fed", () => {
    for (const input of ["", " ", "a".repeat(5000), "Murang'a, Kenya"]) {
      expect(hashToId(input)).toMatch(new RegExp(`^[0-9a-z]{${RUN_ID_LENGTH}}$`));
    }
  });
});
