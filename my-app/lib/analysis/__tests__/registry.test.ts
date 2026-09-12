import { describe, expect, it } from "vitest";
import { TOPICS, TOPIC_SLUGS, getTopic, isTopicSlug } from "@/lib/analysis/topics";
import {
  ANALYSIS_TYPES,
  ANALYSIS_TYPE_IDS,
  MODELS,
  MODEL_IDS,
  getAnalysisType,
  getModel,
  isAnalysisTypeId,
  isModelId,
} from "@/lib/analysis/models";

describe("topic registry", () => {
  it("holds exactly the four topics the app advertises", () => {
    expect(TOPICS.map((t) => t.slug)).toEqual([
      "flood-risk",
      "drought-monitoring",
      "rangeland-dynamics",
      "food-security",
    ]);
  });

  it("keeps TOPIC_SLUGS and TOPICS in step", () => {
    // These are declared separately so the slug union stays a literal type.
    // If they drift, routes typecheck against slugs the homepage never links.
    expect([...TOPIC_SLUGS].sort()).toEqual(TOPICS.map((t) => t.slug).sort());
  });

  it("gives every topic a question and an output, not just a name", () => {
    for (const topic of TOPICS) {
      expect(topic.name.length).toBeGreaterThan(3);
      expect(topic.question).toMatch(/\?$/);
      expect(topic.output.length).toBeGreaterThan(20);
      expect(topic.inputs.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("gives every topic a distinct glyph", () => {
    // Derived glyphs collided: "Flood risk" and "Food security assessment"
    // both start with F, so a first-letter slice put the same tile on two
    // cards and the tile stopped identifying anything.
    const glyphs = TOPICS.map((t) => t.glyph);
    expect(new Set(glyphs).size).toBe(TOPICS.length);
    for (const glyph of glyphs) {
      expect(glyph).toMatch(/^[A-Z]{2}$/);
    }
  });

  it("gives every topic a distinct accent, so cards are told apart at a glance", () => {
    const tiles = TOPICS.map((t) => t.accent.tile);
    expect(new Set(tiles).size).toBe(TOPICS.length);
  });

  it("uses single-theme accent classes with no variant prefix", () => {
    // The app commits to one light theme, so an accent carrying a `dark:` or
    // any other variant would be a leftover from the two-theme build and would
    // never apply. Tailwind also only sees literal class names, so a variant
    // assembled at runtime compiles to nothing.
    for (const topic of TOPICS) {
      for (const value of Object.values(topic.accent)) {
        expect(value).not.toMatch(/dark:/);
        expect(value).not.toMatch(/:/);
        expect(value.split(/\s+/)).toHaveLength(1);
      }
    }
  });

  it("gives every topic a text, tile and border accent", () => {
    for (const topic of TOPICS) {
      expect(topic.accent.text).toMatch(/^text-/);
      expect(topic.accent.tile).toMatch(/^bg-/);
      expect(topic.accent.border).toMatch(/^border-/);
    }
  });

  it("looks a topic up by slug", () => {
    expect(getTopic("drought-monitoring")?.name).toBe("Drought monitoring");
  });

  it("returns undefined for an unknown slug so the route can 404", () => {
    expect(getTopic("nope")).toBeUndefined();
    expect(getTopic("")).toBeUndefined();
    // Guard against prototype keys leaking through a Map-backed lookup.
    expect(getTopic("__proto__")).toBeUndefined();
    expect(getTopic("constructor")).toBeUndefined();
  });

  it("narrows a raw route param with isTopicSlug", () => {
    expect(isTopicSlug("flood-risk")).toBe(true);
    expect(isTopicSlug("Flood-Risk")).toBe(false);
    expect(isTopicSlug("nope")).toBe(false);
  });

  it("uses url-safe slugs", () => {
    for (const slug of TOPIC_SLUGS) {
      expect(slug).toMatch(/^[a-z][a-z0-9-]*$/);
      expect(encodeURIComponent(slug)).toBe(slug);
    }
  });
});

describe("model registry", () => {
  it("offers exactly random forest, xgboost and combined", () => {
    expect(MODELS.map((m) => m.id)).toEqual([
      "random-forest",
      "xgboost",
      "combined",
    ]);
    expect([...MODEL_IDS]).toEqual(MODELS.map((m) => m.id));
  });

  it("states a trade-off for each, so the choice is informed", () => {
    for (const model of MODELS) {
      expect(model.label.length).toBeGreaterThan(3);
      expect(model.tradeoff.length).toBeGreaterThan(20);
    }
  });

  it("looks up and narrows", () => {
    expect(getModel("xgboost")?.label).toBe("XGBoost");
    expect(getModel("catboost")).toBeUndefined();
    expect(isModelId("combined")).toBe(true);
    expect(isModelId("Combined")).toBe(false);
  });
});

describe("analysis type registry", () => {
  it("offers single and comparison", () => {
    expect(ANALYSIS_TYPES.map((a) => a.id)).toEqual(["single", "comparison"]);
    expect([...ANALYSIS_TYPE_IDS]).toEqual(ANALYSIS_TYPES.map((a) => a.id));
  });

  it("caps single location at one area", () => {
    const single = getAnalysisType("single");
    expect(single.minAreas).toBe(1);
    expect(single.maxAreas).toBe(1);
  });

  it("requires at least two areas to call something a comparison", () => {
    const comparison = getAnalysisType("comparison");
    expect(comparison.minAreas).toBe(2);
    expect(comparison.maxAreas).toBeGreaterThanOrEqual(comparison.minAreas);
  });

  it("keeps min no greater than max for every type", () => {
    for (const type of ANALYSIS_TYPES) {
      expect(type.minAreas).toBeLessThanOrEqual(type.maxAreas);
      expect(type.minAreas).toBeGreaterThan(0);
    }
  });

  it("throws on an unknown id rather than returning undefined", () => {
    // An undefined analysis type would mean an uncapped selection, so this
    // lookup is deliberately the strict one.
    expect(() =>
      getAnalysisType("nope" as Parameters<typeof getAnalysisType>[0]),
    ).toThrow(/unknown analysis type/);
  });

  it("narrows a raw value with isAnalysisTypeId", () => {
    expect(isAnalysisTypeId("comparison")).toBe(true);
    expect(isAnalysisTypeId("multi")).toBe(false);
  });
});
