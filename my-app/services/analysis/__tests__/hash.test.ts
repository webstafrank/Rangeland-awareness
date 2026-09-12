/**
 * `runId` is the identity of a result and the whole of its storage. These tests
 * are the most important in the service: a run id that is not stable turns every
 * shared URL into a different study, and a run id that collides serves one
 * study's numbers under another study's name.
 */
import { describe, expect, it } from "vitest";
import type { RunConfig } from "@/contracts/analysis";
import { RUN_ID_LENGTH } from "../constants";
import { canonicalConfigString, fnv1a32, runIdFor, studySeed } from "../hash";
import { BASE_CONFIG } from "./stubs";

/** One variant per field of RunConfig. Every one has to produce a different id. */
const SINGLE_FIELD_VARIANTS: Readonly<Record<string, RunConfig>> = {
  topic: { ...BASE_CONFIG, topic: "flood-risk" },
  analysisType: { ...BASE_CONFIG, analysisType: "comparison" },
  areas: { ...BASE_CONFIG, areas: ["marsabit"] },
  "dateRange.start": { ...BASE_CONFIG, dateRange: { ...BASE_CONFIG.dateRange, start: "2024-01-02" } },
  "dateRange.end": { ...BASE_CONFIG, dateRange: { ...BASE_CONFIG.dateRange, end: "2024-12-30" } },
  model: { ...BASE_CONFIG, model: "xgboost" },
};

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
});

describe("canonicalConfigString", () => {
  it("writes fields in alphabetical order of key", () => {
    expect(canonicalConfigString(BASE_CONFIG)).toBe(
      "v1|areas=turkana|from=2024-01-01|model=random-forest|to=2024-12-31|topic=drought|type=single",
    );
  });

  it("does not depend on the object's own key order", () => {
    const reordered = {
      model: BASE_CONFIG.model,
      dateRange: { end: BASE_CONFIG.dateRange.end, start: BASE_CONFIG.dateRange.start },
      areas: BASE_CONFIG.areas,
      analysisType: BASE_CONFIG.analysisType,
      topic: BASE_CONFIG.topic,
    } as RunConfig;
    expect(canonicalConfigString(reordered)).toBe(canonicalConfigString(BASE_CONFIG));
  });

  it("sorts areas, because area order is presentation and not identity", () => {
    const ab: RunConfig = { ...BASE_CONFIG, analysisType: "comparison", areas: ["turkana", "marsabit"] };
    const ba: RunConfig = { ...BASE_CONFIG, analysisType: "comparison", areas: ["marsabit", "turkana"] };
    expect(canonicalConfigString(ab)).toBe(canonicalConfigString(ba));
    expect(runIdFor(ab)).toBe(runIdFor(ba));
  });

  it("omits the model when asked, which is what makes both models share one data seed", () => {
    const withoutModel = canonicalConfigString(BASE_CONFIG, { includeModel: false });
    expect(withoutModel).not.toContain("model=");
    expect(studySeed(BASE_CONFIG)).toBe(studySeed({ ...BASE_CONFIG, model: "xgboost" }));
  });
});

describe("runIdFor", () => {
  it("is the same for the same config, every time", () => {
    const ids = new Set(Array.from({ length: 50 }, () => runIdFor(BASE_CONFIG)));
    expect(ids.size).toBe(1);
  });

  it("is base36 and RUN_ID_LENGTH characters long", () => {
    expect(runIdFor(BASE_CONFIG)).toMatch(new RegExp(`^[0-9a-z]{${RUN_ID_LENGTH}}$`));
    expect(runIdFor(BASE_CONFIG)).toHaveLength(RUN_ID_LENGTH);
  });

  it("is pinned, so a refactor cannot silently repoint every shared URL", () => {
    /*
     * This literal was captured by running `runIdFor(BASE_CONFIG)` in three
     * separate OS processes and confirming all three agreed, so it pins a real
     * cross-process identity rather than restating whatever the current code
     * happens to compute.
     *
     * If this test fails, the hash function or the canonical string changed,
     * and EVERY result URL anyone has saved now points at a different study.
     * That is a breaking change: bump the `v1|` prefix in
     * `canonicalConfigString` rather than editing this value.
     */
    expect(runIdFor(BASE_CONFIG)).toBe("ld58m36ims8");
  });

  it.each(Object.keys(SINGLE_FIELD_VARIANTS))("changes when %s changes", (field) => {
    expect(runIdFor(SINGLE_FIELD_VARIANTS[field])).not.toBe(runIdFor(BASE_CONFIG));
  });

  it("gives every single-field variant its own id", () => {
    const ids = Object.values(SINGLE_FIELD_VARIANTS).map(runIdFor);
    expect(new Set([...ids, runIdFor(BASE_CONFIG)]).size).toBe(ids.length + 1);
  });

  it("does not depend on the object's own key order", () => {
    const reordered = {
      dateRange: { end: BASE_CONFIG.dateRange.end, start: BASE_CONFIG.dateRange.start },
      model: BASE_CONFIG.model,
      topic: BASE_CONFIG.topic,
      analysisType: BASE_CONFIG.analysisType,
      areas: [...BASE_CONFIG.areas],
    } as RunConfig;
    expect(runIdFor(reordered)).toBe(runIdFor(BASE_CONFIG));
  });

  it("spreads a one-day change across the whole id rather than one character", () => {
    const a = runIdFor(BASE_CONFIG);
    const b = runIdFor(SINGLE_FIELD_VARIANTS["dateRange.start"]);
    const shared = [...a].filter((character, index) => character === b[index]).length;
    // Two independent base36 strings share about one character in 36 by chance.
    expect(shared).toBeLessThan(4);
  });

  it("does not collide across a few hundred neighbouring configs", () => {
    const ids = new Set<string>();
    for (let day = 1; day <= 28; day += 1) {
      for (const model of ["random-forest", "xgboost"] as const) {
        for (const topic of ["drought", "flood-risk", "food-security", "rangeland-dynamics"] as const) {
          ids.add(
            runIdFor({
              ...BASE_CONFIG,
              topic,
              model,
              dateRange: { start: `2024-01-${String(day).padStart(2, "0")}`, end: "2024-12-31" },
            }),
          );
        }
      }
    }
    expect(ids.size).toBe(28 * 2 * 4);
  });
});
