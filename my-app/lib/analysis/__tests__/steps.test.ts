import { readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  STEPS,
  STEP_IDS,
  furthestReachableStep,
  getStep,
  isStepReachable,
  nextStep,
  previousStep,
  stepForSegment,
  stepHref,
  stepIndex,
} from "@/lib/analysis/steps";
import { TOPICS } from "@/lib/analysis/topics";

/**
 * The step registry gate.
 *
 * The interesting failure this catches is not "the array is wrong", it is the
 * registry drifting away from the routes. Splitting the wizard into pages made
 * the step list and the app/ directory two descriptions of the same thing, and
 * nothing at runtime compares them: a renamed segment produces links that 404
 * only when a human clicks them. The last describe block reads the filesystem
 * and does that comparison.
 */

const TOPIC_DIR = fileURLToPath(
  new URL("../../../app/topics/[topic]", import.meta.url),
);

describe("the step registry is coherent", () => {
  it("has one entry per id, in order", () => {
    expect(STEPS.map((step) => step.id)).toEqual([...STEP_IDS]);
  });

  it("gives the first step no segment, so the topic URL is step one", () => {
    // A segment here would mean /topics/flood-risk redirects, and every link
    // from the homepage would cost an extra round trip.
    expect(STEPS[0].segment).toBe("");
    for (const step of STEPS.slice(1)) {
      expect(step.segment).not.toBe("");
    }
  });

  it("gives every step a distinct segment", () => {
    const segments = STEPS.map((step) => step.segment);
    expect(new Set(segments).size).toBe(segments.length);
  });

  it("gives every step a short label and real copy", () => {
    for (const step of STEPS) {
      // Two words at most: the rail puts four of these in a row at 360px.
      expect(step.label.split(/\s+/).length).toBeLessThanOrEqual(2);
      expect(step.title.length).toBeGreaterThan(8);
      expect(step.hint.length).toBeGreaterThan(20);
    }
  });

  it("looks a step up by id and throws on an unknown one", () => {
    expect(getStep("model").label).toBe("Model");
    // @ts-expect-error the point of the test is the runtime guard
    expect(() => getStep("nope")).toThrow(/unknown step/);
  });

  it("resolves a segment back to its step", () => {
    expect(stepForSegment("areas")?.id).toBe("areas");
    expect(stepForSegment("")?.id).toBe("scope");
    expect(stepForSegment("nope")).toBeUndefined();
  });
});

describe("moving between steps", () => {
  it("indexes the steps from zero", () => {
    expect(stepIndex("scope")).toBe(0);
    expect(stepIndex("review")).toBe(STEPS.length - 1);
  });

  it("has no step before the first and none after the last", () => {
    expect(previousStep("scope")).toBeNull();
    expect(nextStep("review")).toBeNull();
  });

  it("walks forwards and backwards over the same sequence", () => {
    // Both directions, because an off-by-one in one of them is invisible if
    // only the other is tested.
    const forwards: string[] = ["scope"];
    let cursor = nextStep("scope");
    while (cursor !== null) {
      forwards.push(cursor.id);
      cursor = nextStep(cursor.id);
    }
    expect(forwards).toEqual([...STEP_IDS]);

    const backwards: string[] = ["review"];
    let back = previousStep("review");
    while (back !== null) {
      backwards.push(back.id);
      back = previousStep(back.id);
    }
    expect(backwards.reverse()).toEqual([...STEP_IDS]);
  });
});

describe("reachability", () => {
  it("locks review until the areas requirement is met", () => {
    expect(furthestReachableStep(false)).toBe("areas");
    expect(isStepReachable("areas", false)).toBe(true);
    expect(isStepReachable("review", false)).toBe(false);
  });

  it("unlocks review once it is met, and never locks an earlier step", () => {
    expect(furthestReachableStep(true)).toBe("review");
    for (const id of STEP_IDS) {
      expect(isStepReachable(id, true)).toBe(true);
    }
    // Going back is always allowed: an analyst who wants to change the model
    // after selecting areas must not be told the model step is unavailable.
    expect(isStepReachable("scope", false)).toBe(true);
    expect(isStepReachable("model", false)).toBe(true);
  });
});

describe("stepHref", () => {
  it("puts the first step on the topic's own URL", () => {
    expect(stepHref("flood-risk", "scope")).toBe("/topics/flood-risk");
  });

  it("puts every other step on a child segment", () => {
    expect(stepHref("flood-risk", "model")).toBe("/topics/flood-risk/model");
    expect(stepHref("flood-risk", "areas")).toBe("/topics/flood-risk/areas");
    expect(stepHref("flood-risk", "review")).toBe("/topics/flood-risk/review");
  });

  it("threads the query through, so Continue never resets the configuration", () => {
    // The bug this exists for: a Continue link that dropped ?type= put the
    // analyst back on the default scope one step later, silently.
    expect(stepHref("food-security", "areas", "?type=comparison")).toBe(
      "/topics/food-security/areas?type=comparison",
    );
    expect(stepHref("food-security", "scope", "?model=xgboost")).toBe(
      "/topics/food-security?model=xgboost",
    );
  });

  it("accepts a Step object as well as an id", () => {
    expect(stepHref("drought-monitoring", STEPS[2])).toBe(
      stepHref("drought-monitoring", "areas"),
    );
  });
});

describe("the registry matches the routes on disk", () => {
  /** Child route directories under app/topics/[topic], excluding the segment's own files. */
  const routeSegments = readdirSync(TOPIC_DIR).filter((entry) =>
    statSync(join(TOPIC_DIR, entry)).isDirectory(),
  );

  it("has a directory for every step segment except the first", () => {
    const expected = STEPS.map((step) => step.segment).filter((s) => s !== "");
    expect(routeSegments.sort()).toEqual(expected.sort());
  });

  it("has no route directory that no step points at", () => {
    // The other direction. A leftover route from a renamed step is dead code
    // that still answers requests, which is worse than a 404.
    for (const segment of routeSegments) {
      expect(
        stepForSegment(segment),
        `app/topics/[topic]/${segment} has no step`,
      ).toBeDefined();
    }
  });

  it("has a page.tsx in every step route", () => {
    for (const segment of routeSegments) {
      expect(readdirSync(join(TOPIC_DIR, segment))).toContain("page.tsx");
    }
    expect(readdirSync(TOPIC_DIR)).toContain("page.tsx");
    expect(readdirSync(TOPIC_DIR)).toContain("layout.tsx");
  });

  it("produces a href for every topic and step combination", () => {
    for (const topic of TOPICS) {
      for (const step of STEPS) {
        const href = stepHref(topic.slug, step);
        expect(href.startsWith(`/topics/${topic.slug}`)).toBe(true);
        // No double slash, which is what an empty segment concatenated
        // carelessly would produce.
        expect(href).not.toMatch(/\/\//);
      }
    }
  });
});
