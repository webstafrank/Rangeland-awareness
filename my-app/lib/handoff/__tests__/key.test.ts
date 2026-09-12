import { describe, expect, it } from "vitest";
import { handoffKey } from "@/lib/handoff/key";
import type { PartialRunConfig } from "@/lib/run";
import { RUN_SCHEMA_VERSION } from "@/lib/run";
import type { FormulaId } from "@/lib/analysis/formulas";

const base: PartialRunConfig = {
  schemaVersion: RUN_SCHEMA_VERSION,
  topic: "drought-monitoring",
  analysisType: "single",
  model: "random-forest",
  formulas: ["vci", "vhi"] as FormulaId[],
  dateWindow: { start: "2024-01-01", end: "2024-12-31" },
};

describe("handoffKey", () => {
  it("is stable for the same configuration", () => {
    expect(handoffKey("drought-monitoring", base)).toBe(
      handoffKey("drought-monitoring", { ...base }),
    );
  });

  it("carries the topic, which travels in the path rather than the query", () => {
    // Two topics with identical settings must not share one stored selection.
    expect(handoffKey("drought-monitoring", base)).not.toBe(
      handoffKey("flood-risk", base),
    );
    expect(handoffKey("drought-monitoring", base).startsWith("drought-monitoring?")).toBe(
      true,
    );
  });

  it("changes when any parameter changes, so an edited URL cannot reuse a selection", () => {
    // This is the whole point: a hand-edited address must miss the stored
    // areas rather than pair them with settings they were never chosen for.
    const key = handoffKey("drought-monitoring", base);
    const variants: PartialRunConfig[] = [
      { ...base, analysisType: "comparison" },
      { ...base, model: "xgboost" },
      { ...base, formulas: ["vci"] as FormulaId[] },
      { ...base, dateWindow: { start: "2024-02-01", end: "2024-12-31" } },
      { ...base, dateWindow: { start: "2024-01-01", end: "2024-11-30" } },
    ];
    for (const variant of variants) {
      expect(handoffKey("drought-monitoring", variant)).not.toBe(key);
    }
  });

  it("distinguishes formula ORDER, because the query preserves it", () => {
    // The run id sorts formulas so two orders are one study, but the query
    // string does not. The key follows the query: worst case a reordered link
    // re-asks for the areas, which is the safe direction to be wrong in.
    expect(handoffKey("drought-monitoring", base)).not.toBe(
      handoffKey("drought-monitoring", {
        ...base,
        formulas: ["vhi", "vci"] as FormulaId[],
      }),
    );
  });
});
