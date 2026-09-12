import { describe, expect, it } from "vitest";
import {
  DEFAULT_FORMULAS,
  FORMULAS,
  FORMULA_IDS,
  type FormulaId,
  formulasForTopic,
  getFormula,
  isFormulaId,
} from "@/lib/analysis/formulas";
import { TOPIC_SLUGS, type TopicSlug } from "@/lib/analysis/topics";

/**
 * The frozen contract, restated here on purpose.
 *
 * These are copied from CONTRACT.md section 2, not imported from the registry.
 * A test that derives its expectation from the thing under test proves nothing:
 * the engine and the UI import these ids, so the registry drifting away from
 * the contract has to fail here, not at runtime in someone's browser.
 */
const FROZEN_IDS = [
  "ndvi",
  "evi",
  "savi",
  "ndmi",
  "ndwi",
  "mndwi",
  "bsi",
  "vci",
  "tci",
  "vhi",
  "spi",
  "lst-anomaly",
  "twi",
] as const;

const FROZEN_TOPIC_MAP: Record<TopicSlug, readonly string[]> = {
  "flood-risk": ["mndwi", "ndwi", "ndmi", "twi"],
  "drought-monitoring": ["spi", "vci", "tci", "vhi", "lst-anomaly"],
  "rangeland-dynamics": ["ndvi", "evi", "savi", "bsi", "ndmi"],
  "food-security": ["vhi", "vci", "ndvi", "spi", "bsi"],
};

const sorted = (values: readonly string[]) => [...values].sort();

describe("formula registry membership", () => {
  it("holds exactly the thirteen frozen ids, in the frozen order", () => {
    expect([...FORMULA_IDS]).toEqual([...FROZEN_IDS]);
  });

  it("keeps FORMULA_IDS and FORMULAS in step", () => {
    // Declared separately so the id union stays a literal type. If they drift,
    // the engine typechecks against ids the registry cannot resolve.
    expect(FORMULAS.map((f) => f.id)).toEqual([...FORMULA_IDS]);
  });

  it("adds no formula the contract does not name", () => {
    const extra = FORMULAS.map((f) => f.id).filter(
      (id) => !(FROZEN_IDS as readonly string[]).includes(id),
    );
    expect(extra).toEqual([]);
  });

  it("drops no formula the contract names", () => {
    const missing = FROZEN_IDS.filter((id) => getFormula(id) === undefined);
    expect(missing).toEqual([]);
  });

  it("has no duplicate ids", () => {
    expect(new Set(FORMULAS.map((f) => f.id)).size).toBe(FORMULAS.length);
  });

  it("uses url-safe ids, because they travel in the query string", () => {
    for (const id of FORMULA_IDS) {
      expect(id).toMatch(/^[a-z][a-z0-9-]*$/);
      expect(encodeURIComponent(id)).toBe(id);
    }
  });
});

describe("topic mapping", () => {
  it("offers exactly the frozen set for every topic", () => {
    for (const slug of TOPIC_SLUGS) {
      expect(sorted(formulasForTopic(slug).map((f) => f.id))).toEqual(
        sorted(FROZEN_TOPIC_MAP[slug]),
      );
    }
  });

  it("has every formula list the topics that offer it", () => {
    // The reverse direction of the same table. formulasForTopic is derived from
    // Formula.topics, so this catches a formula tagged with a topic the
    // contract never gave it just as much as one missing a tag.
    for (const formula of FORMULAS) {
      const expected = TOPIC_SLUGS.filter((slug) =>
        FROZEN_TOPIC_MAP[slug].includes(formula.id),
      );
      expect(sorted(formula.topics)).toEqual(sorted(expected));
    }
  });

  it("agrees with itself in both directions", () => {
    // The point of this one: the two views above are read from the same field,
    // so they must round-trip. A formula appears in a topic's list if and only
    // if that topic appears in the formula's own list.
    for (const slug of TOPIC_SLUGS) {
      const offered = formulasForTopic(slug);
      for (const formula of FORMULAS) {
        expect(offered.includes(formula)).toBe(formula.topics.includes(slug));
      }
    }
  });

  it("tags every formula with at least one topic, so none is unreachable", () => {
    for (const formula of FORMULAS) {
      expect(formula.topics.length).toBeGreaterThan(0);
    }
  });

  it("meets P2: at least three formulas offered per topic", () => {
    for (const slug of TOPIC_SLUGS) {
      expect(formulasForTopic(slug).length).toBeGreaterThanOrEqual(3);
    }
  });

  it("returns formulas in registry order, not tag order", () => {
    // The UI renders this list as-is, so the order has to be stable across
    // topics rather than an accident of how each formula was tagged.
    for (const slug of TOPIC_SLUGS) {
      const ids = formulasForTopic(slug).map((f) => f.id);
      const positions = ids.map((id) => FORMULA_IDS.indexOf(id));
      expect(positions).toEqual([...positions].sort((a, b) => a - b));
    }
  });
});

describe("formula fields", () => {
  it("orders every range low to high", () => {
    // The results page maps a value onto this domain. A reversed pair would
    // draw every reading at the wrong end of the scale without erroring.
    for (const formula of FORMULAS) {
      const [low, high] = formula.range;
      expect(Number.isFinite(low)).toBe(true);
      expect(Number.isFinite(high)).toBe(true);
      expect(low).toBeLessThan(high);
    }
  });

  it("declares at least one input per formula", () => {
    for (const formula of FORMULAS) {
      expect(formula.inputs.length).toBeGreaterThan(0);
      for (const input of formula.inputs) {
        expect(input.trim()).not.toBe("");
      }
    }
  });

  it("mentions every declared input in its expression", () => {
    // The expression is rendered next to the input chips. An input listed but
    // absent from the arithmetic means one of the two is wrong, and there is
    // no way to tell which by looking at the page.
    for (const formula of FORMULAS) {
      for (const input of formula.inputs) {
        expect(formula.expression).toContain(input);
      }
    }
  });

  it("carries a non-empty citation with a year on every formula", () => {
    for (const formula of FORMULAS) {
      expect(formula.reference.trim().length).toBeGreaterThan(20);
      expect(formula.reference).toMatch(/\(1[89]\d{2}\)|\(20\d{2}\)/);
    }
  });

  it("gives every formula a name, a full name, a unit and an interpretation", () => {
    for (const formula of FORMULAS) {
      expect(formula.name.trim().length).toBeGreaterThan(1);
      expect(formula.fullName.length).toBeGreaterThan(formula.name.length);
      expect(formula.unit.trim()).not.toBe("");
      expect(formula.interpretation.trim()).toMatch(/\.$/);
      expect(formula.interpretation.length).toBeGreaterThan(30);
    }
  });

  it("says what a HIGH value means, so an analyst knows which end is bad", () => {
    for (const formula of FORMULAS) {
      expect(formula.interpretation.toLowerCase()).toContain("high value");
    }
  });

  it("gives every formula a distinct expression", () => {
    // Guards the failure this registry is most exposed to: two indices copied
    // from one another and left identical, so the results table prints the same
    // number under two headings.
    expect(new Set(FORMULAS.map((f) => f.expression)).size).toBe(
      FORMULAS.length,
    );
  });
});

describe("published arithmetic", () => {
  // Spot checks on the values that a transcription slip would silently break.
  // These are the coefficients, not the shape, because the shape is already
  // readable in the file and the coefficients are not.

  const expr = (id: FormulaId) => getFormula(id)!.expression;

  it("keeps NDVI as the plain NIR/Red normalised difference", () => {
    expect(expr("ndvi")).toBe("(NIR - Red) / (NIR + Red)");
  });

  it("keeps all four EVI coefficients: G 2.5, C1 6, C2 7.5, L 1", () => {
    expect(expr("evi")).toBe(
      "2.5 * (NIR - Red) / (NIR + 6 * Red - 7.5 * Blue + 1)",
    );
  });

  it("keeps SAVI's L in the denominator and its (1 + L) rescale", () => {
    expect(expr("savi")).toContain("+ L)");
    expect(expr("savi")).toContain("(1 + L)");
    expect(expr("savi")).toContain("L = 0.5");
  });

  it("does not let NDWI and NDMI collapse into the same index", () => {
    // The named hazard: NDWI means McFeeters water (Green/NIR) here and Gao's
    // moisture construction (NIR/SWIR) ships separately as NDMI. If these ever
    // match, one of the two topics is reading the wrong quantity.
    expect(expr("ndwi")).not.toBe(expr("ndmi"));
    expect(expr("ndwi")).toBe("(Green - NIR) / (Green + NIR)");
    expect(expr("ndmi")).toBe("(NIR - SWIR1) / (NIR + SWIR1)");
    expect(getFormula("ndwi")!.reference).toContain("McFeeters");
    expect(getFormula("ndmi")!.inputs).toContain("SWIR1");
    expect(getFormula("ndwi")!.inputs).not.toContain("SWIR1");
  });

  it("keeps MNDWI as Xu's single substitution of SWIR1 for NIR", () => {
    expect(expr("mndwi")).toBe("(Green - SWIR1) / (Green + SWIR1)");
    expect(getFormula("mndwi")!.inputs).not.toContain("NIR");
  });

  it("keeps BSI as a soil sum against a vegetation sum, all four bands", () => {
    expect(expr("bsi")).toBe(
      "((SWIR1 + Red) - (NIR + Blue)) / ((SWIR1 + Red) + (NIR + Blue))",
    );
    expect(sorted(getFormula("bsi")!.inputs)).toEqual([
      "Blue",
      "NIR",
      "Red",
      "SWIR1",
    ]);
  });

  it("scales VCI and TCI to 0..100 against per-pixel record extremes", () => {
    expect(expr("vci")).toBe("100 * (NDVI - NDVI_min) / (NDVI_max - NDVI_min)");
    expect(expr("tci")).toBe("100 * (BT_max - BT) / (BT_max - BT_min)");
    expect(getFormula("vci")!.range).toEqual([0, 100]);
    expect(getFormula("tci")!.range).toEqual([0, 100]);
  });

  it("inverts TCI's numerator so high still means favourable", () => {
    // BT_max - BT, never BT - BT_min. Without the inversion TCI points the
    // opposite way to VCI and averaging them into VHI is meaningless.
    expect(expr("tci")).toContain("(BT_max - BT)");
    expect(expr("tci")).not.toContain("(BT - BT_min)");
  });

  it("weights VHI at alpha 0.5 across VCI and TCI", () => {
    expect(expr("vhi")).toBe("α * VCI + (1 - α) * TCI,  α = 0.5");
    expect(sorted(getFormula("vhi")!.inputs)).toEqual(["TCI", "VCI"]);
  });

  it("fits SPI through a gamma CDF before the inverse normal", () => {
    // A plain z-score of rainfall is the classic wrong implementation, and it
    // is wrong in the dry tail, which is the tail this app cares about.
    expect(expr("spi")).toContain("gamma");
    expect(expr("spi")).toContain("Φ⁻¹");
    expect(getFormula("spi")!.unit).toBe("σ");
  });

  it("keeps the LST anomaly a departure from a baseline, not a temperature", () => {
    expect(expr("lst-anomaly")).toContain("LST - LST_baseline");
    expect(getFormula("lst-anomaly")!.unit).toBe("°C");
    const [low, high] = getFormula("lst-anomaly")!.range;
    expect(low).toBeLessThan(0);
    expect(high).toBeGreaterThan(0);
  });

  it("keeps TWI as Beven and Kirkby's ln(a / tan beta)", () => {
    expect(expr("twi")).toBe("ln( Upslope area / tan(Slope) )");
    expect(getFormula("twi")!.reference).toContain("Beven");
  });

  it("keeps the normalised differences on a -1..1 axis", () => {
    for (const id of ["ndvi", "evi", "savi", "ndmi", "ndwi", "mndwi", "bsi"] as const) {
      expect(getFormula(id)!.range).toEqual([-1, 1]);
      expect(getFormula(id)!.unit).toBe("index");
    }
  });
});

describe("defaults", () => {
  it("pre-ticks at least one formula for every topic", () => {
    // Zero defaults would open the page on an invalid config: the run button
    // needs one formula, so the analyst would land on a disabled button.
    for (const slug of TOPIC_SLUGS) {
      expect(DEFAULT_FORMULAS[slug].length).toBeGreaterThan(0);
    }
  });

  it("only defaults to formulas valid for that topic", () => {
    for (const slug of TOPIC_SLUGS) {
      const offered = formulasForTopic(slug).map((f) => f.id);
      for (const id of DEFAULT_FORMULAS[slug]) {
        expect(offered).toContain(id);
      }
    }
  });

  it("defaults to real formula ids", () => {
    for (const slug of TOPIC_SLUGS) {
      for (const id of DEFAULT_FORMULAS[slug]) {
        expect(getFormula(id)).toBeDefined();
      }
    }
  });

  it("never repeats a formula within one topic's defaults", () => {
    for (const slug of TOPIC_SLUGS) {
      const ids = DEFAULT_FORMULAS[slug];
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("covers every topic, so no topic falls back to undefined", () => {
    expect(sorted(Object.keys(DEFAULT_FORMULAS))).toEqual(sorted(TOPIC_SLUGS));
  });
});

describe("lookup and narrowing", () => {
  it("looks a formula up by id", () => {
    expect(getFormula("ndvi")?.name).toBe("NDVI");
    expect(getFormula("lst-anomaly")?.unit).toBe("°C");
  });

  it("returns undefined for an unknown id so the caller can decide", () => {
    expect(getFormula("nope")).toBeUndefined();
    expect(getFormula("")).toBeUndefined();
    expect(getFormula("NDVI")).toBeUndefined();
    expect(getFormula(" ndvi")).toBeUndefined();
    // Guard against prototype keys leaking through a Map-backed lookup.
    expect(getFormula("__proto__")).toBeUndefined();
    expect(getFormula("constructor")).toBeUndefined();
    expect(getFormula("toString")).toBeUndefined();
  });

  it("narrows a raw query-string value with isFormulaId", () => {
    expect(isFormulaId("mndwi")).toBe(true);
    expect(isFormulaId("MNDWI")).toBe(false);
    expect(isFormulaId("lst-anomaly")).toBe(true);
    expect(isFormulaId("lst_anomaly")).toBe(false);
    expect(isFormulaId("")).toBe(false);
    expect(isFormulaId("__proto__")).toBe(false);
    expect(isFormulaId("constructor")).toBe(false);
  });

  it("agrees with getFormula on every input it is given", () => {
    for (const candidate of [...FORMULA_IDS, "nope", "", "__proto__", "NDVI"]) {
      expect(isFormulaId(candidate)).toBe(getFormula(candidate) !== undefined);
    }
  });
});
