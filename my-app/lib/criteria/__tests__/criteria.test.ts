import { describe, expect, it } from "vitest";
import {
  FLOOD_CRITERIA,
  FLOOD_DEFAULT_WEIGHTS,
  LANDSLIDE_CRITERIA,
  classifyCategorical,
  classifyContinuous,
  continuousClassProblems,
  criteriaFor,
  criterionFor,
  isOverlayTopic,
  methodFor,
  unfilledCriteria,
} from "@/lib/criteria";
import type { ContinuousClass, Criterion } from "@/lib/criteria";

const continuous = (c: Criterion) =>
  c.scale.kind === "continuous" ? c.scale.classes : null;

const need = (topic: string, id: string): Criterion => {
  const found = criterionFor(topic, id);
  if (!found) throw new Error(`missing criterion ${topic}/${id}`);
  return found;
};

/* ------------------------------------------------------------------ method */

describe("topic methods", () => {
  it("puts flood risk and landslide on the overlay, the rest on the model track", () => {
    expect(isOverlayTopic("flood-risk")).toBe(true);
    expect(isOverlayTopic("landslide")).toBe(true);
    for (const topic of ["drought-monitoring", "rangeland-dynamics", "food-security"]) {
      expect(isOverlayTopic(topic), topic).toBe(false);
      expect(methodFor(topic).kind, topic).toBe("model");
    }
  });

  it("treats an unknown topic as a model topic rather than throwing", () => {
    expect(methodFor("not-a-topic").kind).toBe("model");
    expect(criteriaFor("not-a-topic")).toEqual([]);
  });

  it("gives flood the notebook's five criteria and landslide the seven asked for", () => {
    expect(FLOOD_CRITERIA.map((c) => c.id)).toEqual([
      "elevation",
      "slope",
      "dist_to_river",
      "rainfall",
      "landcover",
    ]);
    expect([...LANDSLIDE_CRITERIA.map((c) => c.id)].sort()).toEqual([
      "aspect",
      "dist_to_drainage",
      "elevation",
      "landcover",
      "lithology",
      "rainfall",
      "slope",
    ]);
  });
});

/* --------------------------------------------- the slope inversion, guarded */

describe("slope means the opposite thing in the two topics", () => {
  /*
   * The single most damaging bug available in this module. A shared slope
   * table would map landslide susceptibility upside down and the output would
   * look completely plausible. These assertions are what make that impossible
   * to introduce quietly.
   */
  const floodSlope = need("flood-risk", "slope");
  const slideSlope = need("landslide", "slope");

  it("scores flat ground 5 for flood and 1 for landslide", () => {
    expect(classifyContinuous(continuous(floodSlope)!, 1)).toBe(5);
    expect(classifyContinuous(continuous(slideSlope)!, 1)).toBe(1);
  });

  it("scores steep ground 1 for flood and 5 for landslide", () => {
    expect(classifyContinuous(continuous(floodSlope)!, 40)).toBe(1);
    expect(classifyContinuous(continuous(slideSlope)!, 40)).toBe(5);
  });

  it("runs in opposite directions across the whole range", () => {
    const samples = [0, 1, 3, 8, 12, 18, 22, 30, 45, 70];
    const flood = samples.map((s) => classifyContinuous(continuous(floodSlope)!, s)!);
    const slide = samples.map((s) => classifyContinuous(continuous(slideSlope)!, s)!);

    // Flood never increases with slope; landslide never decreases.
    for (let i = 1; i < samples.length; i += 1) {
      expect(flood[i], `flood at ${samples[i]}`).toBeLessThanOrEqual(flood[i - 1]);
      expect(slide[i], `landslide at ${samples[i]}`).toBeGreaterThanOrEqual(slide[i - 1]);
    }
    expect(flood).not.toEqual(slide);
  });

  it("says so in the direction text, which the UI shows", () => {
    expect(floodSlope.direction.toLowerCase()).toContain("flat");
    expect(slideSlope.direction.toLowerCase()).toContain("steep");
  });
});

describe("the other criteria the two topics share are not shared tables", () => {
  it("scales distance to water in hundreds of metres for landslide, kilometres for flood", () => {
    // Reusing the flood breaks would score every pixel within a kilometre of
    // any stream as maximum risk and flatten the criterion entirely.
    const flood = continuous(need("flood-risk", "dist_to_river"))!;
    const slide = continuous(need("landslide", "dist_to_drainage"))!;
    expect(flood[0].max).toBe(1000);
    expect(slide[0].max).toBe(50);
    expect(classifyContinuous(slide, 800)).toBe(1);
    expect(classifyContinuous(flood, 800)).toBe(5);
  });

  it("scores land cover differently, because roots matter and runoff does not", () => {
    const floodLc = need("flood-risk", "landcover").scale;
    const slideLc = need("landslide", "landcover").scale;
    if (floodLc.kind !== "categorical" || slideLc.kind !== "categorical") {
      throw new Error("expected categorical land cover");
    }
    // 80 is permanent water: worst for flood, irrelevant-and-safe on a slope.
    expect(classifyCategorical(floodLc, 80)).toBe(5);
    expect(classifyCategorical(slideLc, 80)).toBe(1);
    // 60 is bare/sparse: high for both, but for unrelated reasons.
    expect(classifyCategorical(floodLc, 60)).toBe(5);
    expect(classifyCategorical(slideLc, 60)).toBe(5);
  });

  it("gives the two topics different elevation tables", () => {
    // Flood falls monotonically with height; landslide peaks in the middle.
    const flood = continuous(need("flood-risk", "elevation"))!;
    const slide = continuous(need("landslide", "elevation"))!;
    expect(flood.map((c) => c.risk)).not.toEqual(slide.map((c) => c.risk));
    expect(classifyContinuous(flood, 10)).toBe(5);
    expect(classifyContinuous(slide, 10)).toBe(1);
  });
});

/* ------------------------------------------------ port fidelity vs notebook */

describe("the flood tables are the notebook's, unchanged", () => {
  /*
   * Restated independently from TR_Floods_Hotspots_Mapping-Final rather than
   * derived from the module, so a transcription slip fails here instead of
   * shipping a map that is subtly wrong.
   */
  it("reproduces classify_elevation_absolute", () => {
    const c = continuous(need("flood-risk", "elevation"))!;
    for (const [value, risk] of [[0, 5], [50, 5], [51, 4], [150, 4], [151, 3], [300, 3], [301, 2], [500, 2], [501, 1], [700, 1]] as const) {
      expect(classifyContinuous(c, value), `${value} m`).toBe(risk);
    }
  });

  it("reproduces classify_slope_absolute", () => {
    const c = continuous(need("flood-risk", "slope"))!;
    for (const [value, risk] of [[0, 5], [2, 5], [3, 4], [5, 4], [6, 3], [10, 3], [11, 2], [20, 2], [21, 1], [60, 1]] as const) {
      expect(classifyContinuous(c, value), `${value} deg`).toBe(risk);
    }
  });

  it("reproduces classify_distance_to_river_absolute", () => {
    const c = continuous(need("flood-risk", "dist_to_river"))!;
    for (const [value, risk] of [[0, 5], [1000, 5], [1001, 4], [3000, 4], [3001, 3], [7000, 3], [7001, 2], [15000, 2], [15001, 1]] as const) {
      expect(classifyContinuous(c, value), `${value} m`).toBe(risk);
    }
  });

  it("reproduces LANDCOVER_RISK for every ESA WorldCover code", () => {
    const scale = need("flood-risk", "landcover").scale;
    if (scale.kind !== "categorical") throw new Error("expected categorical");
    const notebook: Record<number, number> = {
      10: 1, 20: 2, 30: 3, 40: 5, 50: 4, 60: 5, 70: 1, 80: 5, 90: 5, 95: 3, 100: 3,
    };
    for (const [code, risk] of Object.entries(notebook)) {
      expect(classifyCategorical(scale, Number(code)), `code ${code}`).toBe(risk);
    }
  });

  it("keeps the Gaussian smoothing that the second copy of the notebook added", () => {
    // The first copy omits it and leaves concentric ring artifacts in the
    // distance transform. Porting the wrong copy would silently drop the fix.
    const source = need("flood-risk", "dist_to_river").source;
    expect(source.kind).toBe("distance");
    if (source.kind !== "distance") return;
    expect(source.smoothSigmaPx).toBe(3);
  });

  it("uses percentile scoring for rainfall, not fixed depths", () => {
    const scale = need("flood-risk", "rainfall").scale;
    expect(scale.kind).toBe("percentile");
    if (scale.kind !== "percentile") return;
    expect(scale.breaks).toEqual([20, 40, 60, 80]);
  });

  it("carries the notebook's AHP weights, summing to exactly 1", () => {
    expect(FLOOD_DEFAULT_WEIGHTS).toEqual({
      elevation: 0.25,
      slope: 0.15,
      dist_to_river: 0.35,
      rainfall: 0.2,
      landcover: 0.05,
    });
    const total = Object.values(FLOOD_DEFAULT_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 12);
  });

  it("has a weight for every criterion and no orphans", () => {
    expect(Object.keys(FLOOD_DEFAULT_WEIGHTS).sort()).toEqual(
      FLOOD_CRITERIA.map((c) => c.id).sort(),
    );
  });
});

/* --------------------------------------------------------- lithology is not
   allowed to be invented ---------------------------------------------------- */

describe("lithology refuses to run on a guess", () => {
  it("ships with no classes at all", () => {
    const scale = need("landslide", "lithology").scale;
    expect(scale.kind).toBe("categorical");
    if (scale.kind !== "categorical") return;
    // An invented code mapping would render a confident map keyed to codes
    // that mean nothing on the target server. Empty is the correct state.
    expect(scale.classes).toEqual([]);
    expect(scale.unlisted).toBe("nodata");
  });

  it("is marked as needing to be filled, and is reported as unfilled", () => {
    expect(need("landslide", "lithology").calibration).toBe("required");
    expect(unfilledCriteria("landslide").map((c) => c.id)).toEqual(["lithology"]);
  });

  it("classifies every code as nodata until it is filled", () => {
    const scale = need("landslide", "lithology").scale;
    if (scale.kind !== "categorical") return;
    for (const code of [0, 1, 7, 42, 999]) {
      expect(classifyCategorical(scale, code), `code ${code}`).toBeNull();
    }
  });

  it("leaves flood with nothing unfilled, so it can run today", () => {
    expect(unfilledCriteria("flood-risk")).toEqual([]);
  });
});

/* ------------------------------------------------------------- table health */

describe("every class table is well formed", () => {
  const all: [string, Criterion][] = [
    ...FLOOD_CRITERIA.map((c) => ["flood-risk", c] as [string, Criterion]),
    ...LANDSLIDE_CRITERIA.map((c) => ["landslide", c] as [string, Criterion]),
  ];

  it("has ascending, contiguous, open-ended continuous bands", () => {
    // A gap becomes silent nodata; an out-of-order table classifies against
    // whichever band it reaches first. Both are invisible in the output.
    for (const [topic, criterion] of all) {
      const classes = continuous(criterion);
      if (!classes) continue;
      expect(continuousClassProblems(classes), `${topic}/${criterion.id}`).toEqual([]);
    }
  });

  it("uses only risk scores 1 to 5", () => {
    for (const [topic, criterion] of all) {
      const { scale } = criterion;
      const risks =
        scale.kind === "continuous"
          ? scale.classes.map((c) => c.risk)
          : scale.kind === "categorical"
            ? scale.classes.map((c) => c.risk)
            : [];
      for (const risk of risks) {
        expect([1, 2, 3, 4, 5], `${topic}/${criterion.id}`).toContain(risk);
      }
    }
  });

  it("reaches both 1 and 5 on every filled table, so the scale is used", () => {
    // A criterion that never scores 5 contributes a constant and its weight
    // does nothing; that is a table bug, not a finding about the terrain.
    for (const [topic, criterion] of all) {
      const { scale } = criterion;
      if (scale.kind === "percentile") continue;
      if (scale.classes.length === 0) continue; // lithology, deliberately empty
      const risks = new Set(scale.classes.map((c) => c.risk));
      expect(risks.has(1), `${topic}/${criterion.id} never scores 1`).toBe(true);
      expect(risks.has(5), `${topic}/${criterion.id} never scores 5`).toBe(true);
    }
  });

  it("documents a direction, a reference and a calibration for every criterion", () => {
    for (const [topic, criterion] of all) {
      expect(criterion.direction.length, `${topic}/${criterion.id}`).toBeGreaterThan(20);
      expect(criterion.reference.length, `${topic}/${criterion.id}`).toBeGreaterThan(10);
      expect(["established", "regional", "required"]).toContain(criterion.calibration);
    }
  });

  it("gives each topic unique criterion ids", () => {
    for (const topic of ["flood-risk", "landslide"]) {
      const ids = criteriaFor(topic).map((c) => c.id);
      expect(new Set(ids).size, topic).toBe(ids.length);
    }
  });
});

describe("aspect wraps north without a seam", () => {
  const aspect = continuous(need("landslide", "aspect"))!;

  it("gives both halves of north the same risk", () => {
    // 337.5-360 and 0-22.5 are the same compass direction. Different scores
    // would draw a seam across every north-facing slope in the output.
    expect(classifyContinuous(aspect, 5)).toBe(classifyContinuous(aspect, 350));
  });

  it("peaks on the southeast, the rain-bearing side", () => {
    expect(classifyContinuous(aspect, 135)).toBe(5);
    expect(classifyContinuous(aspect, 315)).toBe(1);
  });

  it("covers the full circle", () => {
    for (let deg = 0; deg <= 360; deg += 7.5) {
      expect(classifyContinuous(aspect, deg), `${deg} deg`).not.toBeNull();
    }
  });
});

describe("classify helpers", () => {
  const bands: ContinuousClass[] = [
    { risk: 5, label: "low", max: 10 },
    { risk: 3, label: "mid", max: 20 },
    { risk: 1, label: "high", max: null },
  ];

  it("is inclusive of the upper bound", () => {
    expect(classifyContinuous(bands, 10)).toBe(5);
    expect(classifyContinuous(bands, 10.0001)).toBe(3);
  });

  it("rejects NaN rather than clamping it into a real class", () => {
    // A missing pixel painted with a real risk is the failure this cannot
    // afford, and it is the same rule the indicator bands follow.
    expect(classifyContinuous(bands, Number.NaN)).toBeNull();
    expect(classifyContinuous(bands, Number.POSITIVE_INFINITY)).toBeNull();
  });

  it("returns the unlisted score for an unknown categorical code", () => {
    const scale = {
      kind: "categorical" as const,
      classes: [{ risk: 4 as const, label: "a", codes: [1, 2] }],
      unlisted: 2 as const,
    };
    expect(classifyCategorical(scale, 1)).toBe(4);
    expect(classifyCategorical(scale, 99)).toBe(2);
  });
});

describe("continuousClassProblems", () => {
  it("catches a non-ascending table", () => {
    const problems = continuousClassProblems([
      { risk: 1, label: "a", max: 20 },
      { risk: 2, label: "b", max: 10 },
      { risk: 3, label: "c", max: null },
    ]);
    expect(problems.some((p) => p.includes("ascend"))).toBe(true);
  });

  it("catches a table that does not end open", () => {
    const problems = continuousClassProblems([
      { risk: 1, label: "a", max: 10 },
      { risk: 2, label: "b", max: 20 },
    ]);
    expect(problems.some((p) => p.includes("open-ended"))).toBe(true);
  });

  it("catches an open band that is not last", () => {
    const problems = continuousClassProblems([
      { risk: 1, label: "a", max: null },
      { risk: 2, label: "b", max: null },
    ]);
    expect(problems.some((p) => p.includes("not the last"))).toBe(true);
  });

  it("rejects an empty table", () => {
    expect(continuousClassProblems([]).length).toBe(1);
  });
});
