/**
 * The URL codec, and the validation the pre-analysis form renders.
 *
 * Two properties carry the weight:
 *   - round trip: every valid config survives toQuery then parseQuery unchanged,
 *     which is what makes a result URL shareable
 *   - completeness: a broken form reports every broken field at once, keyed by
 *     the control that broke, so the user fixes five things in one pass
 */
import { describe, expect, it } from "vitest";
import type { RunConfig, RunConfigQuery } from "@/contracts/analysis";
import { MAX_COMPARISON_AREAS, MAX_RANGE_DAYS, MIN_RANGE_DAYS } from "@/contracts/analysis";
import { createAnalysisService } from "../service";
import { BASE_CONFIG, COMPARISON_CONFIG, FLOOD_CONFIG, stubCatalog, stubGeo } from "./stubs";

const analysis = createAnalysisService({ catalog: stubCatalog(), geo: stubGeo() });

/** Parses a query string the way a page would: string in, object out. */
function queryObject(search: string): RunConfigQuery {
  return Object.fromEntries(new URLSearchParams(search)) as RunConfigQuery;
}

const VALID_CONFIGS: readonly RunConfig[] = [
  BASE_CONFIG,
  COMPARISON_CONFIG,
  FLOOD_CONFIG,
  { ...BASE_CONFIG, model: "xgboost" },
  { ...BASE_CONFIG, areas: ["taita-taveta"], dateRange: { start: "2003-02-01", end: "2003-04-30" } },
  {
    topic: "flood-risk",
    analysisType: "comparison",
    areas: ["muranga", "turkana", "marsabit", "taita-taveta"],
    dateRange: { start: "2015-01-01", end: "2024-12-31" },
    model: "random-forest",
  },
];

/** Field errors for a query, or a failure if it unexpectedly parsed. */
function errorsFor(query: Record<string, string>, topic?: string): Record<string, readonly string[]> {
  const parsed = analysis.parseQuery(query as RunConfigQuery, topic);
  if (parsed.ok) throw new Error("expected this query to be rejected");
  return parsed.error.fieldErrors ?? {};
}

/** A complete, valid query object, to be broken one field at a time. */
function validQuery(): Record<string, string> {
  return {
    topic: "drought",
    type: "single",
    areas: "turkana",
    from: "2024-01-01",
    to: "2024-12-31",
    model: "random-forest",
  };
}

describe("toQuery", () => {
  it("emits the canonical parameter order, with the topic left in the path", () => {
    expect(analysis.toQuery(BASE_CONFIG)).toBe(
      "type=single&areas=turkana&from=2024-01-01&to=2024-12-31&model=random-forest",
    );
    expect(analysis.toQuery(BASE_CONFIG)).not.toContain("topic");
  });

  it("comma joins the areas, readably", () => {
    expect(analysis.toQuery(COMPARISON_CONFIG)).toContain("areas=turkana,marsabit,muranga");
  });

  it("is byte-identical for the same config", () => {
    expect(analysis.toQuery(COMPARISON_CONFIG)).toBe(analysis.toQuery({ ...COMPARISON_CONFIG }));
  });
});

describe("round trip", () => {
  it.each(VALID_CONFIGS.map((config, index) => [index, config] as const))(
    "config %i survives toQuery then parseQuery",
    (_index, config) => {
      const parsed = analysis.parseQuery(queryObject(analysis.toQuery(config)), config.topic);
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) return;
      expect(parsed.config).toEqual(config);
    },
  );

  it("accepts the topic on the query object as well as as an argument", () => {
    const query = { ...queryObject(analysis.toQuery(BASE_CONFIG)), topic: BASE_CONFIG.topic };
    const parsed = analysis.parseQuery(query);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.config).toEqual(BASE_CONFIG);
  });

  it("prefers the path topic over one smuggled into the query", () => {
    const query = { ...queryObject(analysis.toQuery(BASE_CONFIG)), topic: "flood-risk" };
    const parsed = analysis.parseQuery(query, "drought");
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.config.topic).toBe("drought");
  });

  it("keeps the area order the user chose, since it drives the chart order", () => {
    const reversed: RunConfig = { ...COMPARISON_CONFIG, areas: ["muranga", "marsabit", "turkana"] };
    const parsed = analysis.parseQuery(queryObject(analysis.toQuery(reversed)), reversed.topic);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.config.areas).toEqual(["muranga", "marsabit", "turkana"]);
  });

  it("tolerates whitespace and empty entries in a hand-edited URL", () => {
    const parsed = analysis.parseQuery(
      { type: "comparison", areas: " turkana , marsabit ,", from: "2024-01-01", to: "2024-12-31", model: "xgboost" },
      "drought",
    );
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.config.areas).toEqual(["turkana", "marsabit"]);
  });
});

describe("missing fields", () => {
  it("reports every empty control at once, and only once each", () => {
    const fieldErrors = errorsFor({});
    expect(Object.keys(fieldErrors).sort()).toEqual(["areas", "from", "model", "to", "topic", "type"]);
    for (const messages of Object.values(fieldErrors)) {
      expect(messages).toHaveLength(1);
    }
    expect(fieldErrors.topic).toEqual(["choose a topic"]);
    expect(fieldErrors.type).toEqual(["choose single or comparison analysis"]);
    expect(fieldErrors.areas).toEqual(["choose at least one area"]);
    expect(fieldErrors.from).toEqual(["choose a start date"]);
    expect(fieldErrors.to).toEqual(["choose an end date"]);
    expect(fieldErrors.model).toEqual(["choose a model"]);
  });

  it("carries a readable top-level message for the API response", () => {
    const parsed = analysis.parseQuery({});
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error.error).toMatch(/cannot be used/);
  });
});

describe("date window rules", () => {
  it("rejects an end date before the start, on the start control", () => {
    const fieldErrors = errorsFor({ ...validQuery(), from: "2024-06-01", to: "2024-01-01" });
    expect(fieldErrors.from?.join(" ")).toMatch(/on or before the end date/);
  });

  it(`rejects a window shorter than MIN_RANGE_DAYS (${MIN_RANGE_DAYS})`, () => {
    const fieldErrors = errorsFor({ ...validQuery(), from: "2024-06-01", to: "2024-06-20" });
    expect(fieldErrors.to).toEqual([`the window must cover at least ${MIN_RANGE_DAYS} days`]);
  });

  it("accepts a window exactly MIN_RANGE_DAYS long", () => {
    const parsed = analysis.parseQuery({ ...validQuery(), from: "2024-06-01", to: "2024-06-30" });
    expect(parsed.ok).toBe(true);
  });

  it(`rejects a window longer than MAX_RANGE_DAYS (${MAX_RANGE_DAYS})`, () => {
    const fieldErrors = errorsFor({ ...validQuery(), from: "2001-01-01", to: "2024-12-31" });
    expect(fieldErrors.to).toEqual([`the window must cover at most ${MAX_RANGE_DAYS} days`]);
  });

  it("rejects a date that is not yyyy-mm-dd, on the control that holds it", () => {
    const fieldErrors = errorsFor({ ...validQuery(), from: "01/01/2024", to: "2024-13-45" });
    expect(fieldErrors.from).toEqual(["use a date in yyyy-mm-dd form"]);
    expect(fieldErrors.to).toEqual(["use a date in yyyy-mm-dd form"]);
  });

  it("rejects a start before the topic's input coverage", () => {
    const fieldErrors = errorsFor({ ...validQuery(), topic: "food-security", from: "2005-01-01" });
    expect(fieldErrors.from?.join(" ")).toMatch(/no input coverage before 2011-01-01/);
  });
});

describe("area rules", () => {
  it("requires exactly one area for a single analysis", () => {
    const fieldErrors = errorsFor({ ...validQuery(), type: "single", areas: "turkana,marsabit" });
    expect(fieldErrors.areas).toEqual(["single-location analysis takes exactly one area"]);
  });

  it("requires at least two areas for a comparison", () => {
    const fieldErrors = errorsFor({ ...validQuery(), type: "comparison", areas: "turkana" });
    expect(fieldErrors.areas).toEqual(["comparison needs at least two areas"]);
  });

  it("rejects duplicate areas", () => {
    const fieldErrors = errorsFor({ ...validQuery(), type: "comparison", areas: "turkana,turkana" });
    expect(fieldErrors.areas).toEqual(["areas must be unique"]);
  });

  it(`rejects more than MAX_COMPARISON_AREAS (${MAX_COMPARISON_AREAS}) areas`, () => {
    const fieldErrors = errorsFor({
      ...validQuery(),
      type: "comparison",
      areas: "turkana,marsabit,muranga,taita-taveta,turkana-west",
    });
    expect(fieldErrors.areas).toContain(`compare at most ${MAX_COMPARISON_AREAS} areas`);
  });

  it("rejects an area the geography service does not know", () => {
    const fieldErrors = errorsFor({ ...validQuery(), areas: "atlantis" });
    expect(fieldErrors.areas).toEqual(['unknown area "atlantis"']);
  });

  it("rejects an id that is not a kebab-case slug", () => {
    const fieldErrors = errorsFor({ ...validQuery(), areas: "Turkana County" });
    expect(fieldErrors.areas?.join(" ")).toMatch(/kebab-case slug/);
    // The malformed id is reported once, not twice: the slug rule covers it.
    expect(fieldErrors.areas).toHaveLength(1);
  });
});

describe("topic and model rules", () => {
  it("rejects an unknown topic", () => {
    const fieldErrors = errorsFor({ ...validQuery() }, "atlantis-risk");
    expect(fieldErrors.topic).toEqual(['unknown topic "atlantis-risk"']);
  });

  it("rejects an unknown model", () => {
    const fieldErrors = errorsFor({ ...validQuery(), model: "neural-net" });
    expect(fieldErrors.model).toEqual(['unknown model "neural-net"']);
  });

  it("rejects an analysis type that is neither single nor comparison", () => {
    const fieldErrors = errorsFor({ ...validQuery(), type: "triple" });
    expect(fieldErrors.type).toEqual(["analysis type must be single or comparison"]);
  });

  it("rejects a model the topic does not offer", () => {
    const fieldErrors = errorsFor({
      ...validQuery(),
      topic: "food-security",
      from: "2015-01-01",
      model: "xgboost",
    });
    expect(fieldErrors.model).toEqual(["XGBoost is not available for Food security"]);
  });
});

describe("collecting everything at once", () => {
  it("reports every broken field in one pass", () => {
    const fieldErrors = errorsFor({
      topic: "atlantis-risk",
      type: "triple",
      areas: "atlantis",
      from: "2024-06-01",
      to: "2024-06-05",
      model: "neural-net",
    });
    expect(Object.keys(fieldErrors).sort()).toEqual(["areas", "model", "to", "topic", "type"]);
    expect(fieldErrors.to).toEqual([`the window must cover at least ${MIN_RANGE_DAYS} days`]);
  });

  it("still reports the window and the areas when the type is unusable", () => {
    // zod stops refining an object once a member fails, so these checks have to
    // run outside it. This test is the reason they do.
    const fieldErrors = errorsFor({ ...validQuery(), type: "triple", areas: "atlantis", to: "2024-01-05" });
    expect(fieldErrors.type).toBeDefined();
    expect(fieldErrors.areas).toBeDefined();
    expect(fieldErrors.to).toBeDefined();
  });
});
