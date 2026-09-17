import { describe, expect, it } from "vitest";
import {
  MODEL_PARAM,
  TYPE_PARAM,
  readUrlSelection,
  writeUrlSelection,
} from "@/services/analysis/url-state";
import { initialSelectionState } from "@/services/analysis/selection";

const DEFAULTS = {
  analysisType: initialSelectionState.analysisType,
  modelId: initialSelectionState.modelId,
} as const;

describe("readUrlSelection", () => {
  it("reads both params from a URLSearchParams", () => {
    expect(
      readUrlSelection(new URLSearchParams("type=comparison&model=combined")),
    ).toEqual({ analysisType: "comparison", modelId: "combined" });
  });

  it("reads from a plain params object, as a server component receives", () => {
    expect(
      readUrlSelection({ type: "comparison", model: "xgboost" }),
    ).toEqual({ analysisType: "comparison", modelId: "xgboost" });
  });

  it("returns nothing for an empty query", () => {
    expect(readUrlSelection(new URLSearchParams(""))).toEqual({});
    expect(readUrlSelection({})).toEqual({});
  });

  it("drops an unrecognised value instead of failing", () => {
    // A stale bookmark from before a rename must still open the page.
    expect(
      readUrlSelection(new URLSearchParams("type=both&model=catboost")),
    ).toEqual({});
  });

  it("keeps the valid half of a half-broken query", () => {
    expect(
      readUrlSelection(new URLSearchParams("type=comparison&model=catboost")),
    ).toEqual({ analysisType: "comparison" });
  });

  it("is case sensitive, matching the ids exactly", () => {
    expect(readUrlSelection(new URLSearchParams("model=XGBoost"))).toEqual({});
  });

  it("ignores unrelated params", () => {
    expect(
      readUrlSelection(new URLSearchParams("utm_source=email&type=single")),
    ).toEqual({ analysisType: "single" });
  });

  it("does not read areas from the URL", () => {
    // Areas are deliberately out of scope: a polygon is kilobytes.
    const selection = readUrlSelection(
      new URLSearchParams("type=comparison&areas=%5B%5D"),
    );
    expect(selection).toEqual({ analysisType: "comparison" });
    expect("areas" in selection).toBe(false);
  });
});

describe("writeUrlSelection", () => {
  it("is empty when everything is default, keeping a fresh URL clean", () => {
    expect(writeUrlSelection(DEFAULTS, DEFAULTS)).toBe("");
  });

  it("writes only the params that differ from default", () => {
    expect(
      writeUrlSelection(
        { analysisType: "comparison", modelId: DEFAULTS.modelId },
        DEFAULTS,
      ),
    ).toBe(`?${TYPE_PARAM}=comparison`);

    expect(
      writeUrlSelection(
        { analysisType: DEFAULTS.analysisType, modelId: "xgboost" },
        DEFAULTS,
      ),
    ).toBe(`?${MODEL_PARAM}=xgboost`);
  });

  it("writes both when both differ", () => {
    expect(
      writeUrlSelection(
        { analysisType: "comparison", modelId: "combined" },
        DEFAULTS,
      ),
    ).toBe(`?${TYPE_PARAM}=comparison&${MODEL_PARAM}=combined`);
  });

  it("round trips through readUrlSelection", () => {
    const selection = { analysisType: "comparison", modelId: "combined" } as const;
    const query = writeUrlSelection(selection, DEFAULTS);
    expect(readUrlSelection(new URLSearchParams(query))).toEqual(selection);
  });

  it("round trips a default selection to nothing and back to defaults", () => {
    const query = writeUrlSelection(DEFAULTS, DEFAULTS);
    // Nothing in the URL means the page falls back to its own defaults.
    expect(readUrlSelection(new URLSearchParams(query))).toEqual({});
  });
});
