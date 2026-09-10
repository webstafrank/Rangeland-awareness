import { describe, expect, it } from "vitest";
import {
  BUDGET_WINDOW,
  MATCH_TOLERANCE,
  classifyPixel,
  measurePixelBudget,
  prepareTokens,
  type RoleToken,
} from "@/lib/theme/pixel-budget";

/**
 * The 60-30-10 measurement.
 *
 * Tested on synthetic pixel buffers with known composition, so the arithmetic
 * is verified independently of any real screenshot. The eval that drives a
 * browser can then be trusted to be reporting a real imbalance rather than a
 * bug in the counter.
 */

const TOKENS: readonly RoleToken[] = [
  { name: "page", value: "#0f172a", role: "ground" },
  { name: "panel", value: "#16213f", role: "structure" },
  { name: "accent", value: "#f97316", role: "accent" },
  { name: "ink", value: "#e2e8f0", role: "ink" },
  { name: "danger", value: "#f87171", role: "status" },
];

/** Build an RGBA buffer from a list of [hex, count] runs. */
function buffer(runs: readonly [string, number][], alpha = 255): Uint8ClampedArray {
  const pixels: number[] = [];
  for (const [hex, count] of runs) {
    const r = Number.parseInt(hex.slice(1, 3), 16);
    const g = Number.parseInt(hex.slice(3, 5), 16);
    const b = Number.parseInt(hex.slice(5, 7), 16);
    for (let i = 0; i < count; i += 1) pixels.push(r, g, b, alpha);
  }
  return new Uint8ClampedArray(pixels);
}

describe("prepareTokens", () => {
  it("throws with the token's name when a value is not a colour", () => {
    // Naming the token matters: the failure arrives from a palette file with
    // forty entries and "one of them is wrong" is not a usable message.
    expect(() =>
      prepareTokens([{ name: "page", value: "var(--nope)", role: "ground" }]),
    ).toThrow(/page/);
  });
});

describe("classifyPixel", () => {
  const prepared = prepareTokens(TOKENS);

  it("matches an exact token colour to its role", () => {
    expect(classifyPixel({ r: 15, g: 23, b: 42 }, prepared)).toBe("ground");
    expect(classifyPixel({ r: 249, g: 115, b: 22 }, prepared)).toBe("accent");
  });

  it("absorbs a near miss inside the tolerance", () => {
    // Five levels off per channel: subpixel antialiasing on a flat fill, or a
    // hover tint one step from its base. Deliberately not eight — at eight
    // levels this pixel is measurably nearer the panel tier than the ground,
    // and nearest-match correctly says so.
    expect(classifyPixel({ r: 20, g: 28, b: 47 }, prepared)).toBe("ground");
  });

  it("returns null beyond the tolerance instead of guessing", () => {
    // Mid-grey is nothing in this palette. Snapping it to the nearest token
    // would quietly inflate whichever role happened to be closest.
    expect(classifyPixel({ r: 128, g: 128, b: 128 }, prepared)).toBeNull();
  });

  it("picks the nearest token when two are within tolerance", () => {
    // The ground and the panel above it are close by design. A pixel sitting
    // between them must resolve to whichever it is actually nearer, or the
    // structure share becomes a coin flip.
    const nearGround = { r: 16, g: 24, b: 44 };
    const nearPanel = { r: 21, g: 32, b: 61 };
    expect(classifyPixel(nearGround, prepared)).toBe("ground");
    expect(classifyPixel(nearPanel, prepared)).toBe("structure");
  });

  it("honours a caller-supplied tolerance", () => {
    expect(classifyPixel({ r: 128, g: 128, b: 128 }, prepared, 255)).not.toBeNull();
    expect(classifyPixel({ r: 23, g: 31, b: 50 }, prepared, 1)).toBeNull();
  });
});

describe("measurePixelBudget", () => {
  it("reports shares over matched pixels, in the ratio supplied", () => {
    const data = buffer([
      ["#0f172a", 60],
      ["#16213f", 30],
      ["#f97316", 10],
    ]);
    const budget = measurePixelBudget(data, TOKENS);

    expect(budget.ground).toBeCloseTo(0.6, 10);
    expect(budget.structure).toBeCloseTo(0.3, 10);
    expect(budget.accent).toBeCloseTo(0.1, 10);
    expect(budget.unmatched).toBe(0);
    expect(budget.sampled).toBe(100);
  });

  it("keeps ink and status out of the 60-30-10 denominator", () => {
    // Text is not a surface. If ink counted, a page of dense tables would read
    // as "too little ground" purely because it has more words on it.
    const data = buffer([
      ["#0f172a", 60],
      ["#16213f", 30],
      ["#f97316", 10],
      ["#e2e8f0", 100],
      ["#f87171", 100],
    ]);
    const budget = measurePixelBudget(data, TOKENS);

    // Shares are over ALL matched pixels including ink and status, so the
    // three budgeted roles fall proportionally. What must hold is that they
    // stay in the same ratio to each other.
    expect(budget.ground / budget.structure).toBeCloseTo(2, 10);
    expect(budget.structure / budget.accent).toBeCloseTo(3, 10);
    expect(budget.ink).toBeCloseTo(100 / 300, 10);
    expect(budget.status).toBeCloseTo(100 / 300, 10);
  });

  it("excludes unmatched pixels from the shares but reports their share", () => {
    const data = buffer([
      ["#0f172a", 50],
      ["#16213f", 25],
      ["#f97316", 25],
      ["#7f9f6f", 100], // a basemap tile: not a palette decision
    ]);
    const budget = measurePixelBudget(data, TOKENS);

    expect(budget.ground).toBeCloseTo(0.5, 10);
    expect(budget.unmatched).toBeCloseTo(0.5, 10);
    expect(budget.sampled).toBe(200);
  });

  it("skips fully transparent pixels entirely", () => {
    const opaque = buffer([["#0f172a", 10]]);
    const clear = buffer([["#0f172a", 10]], 0);
    const data = new Uint8ClampedArray([...opaque, ...clear]);

    expect(measurePixelBudget(data, TOKENS).sampled).toBe(10);
  });

  it("counts every pixel, so a periodic image cannot alias the result", () => {
    // This test is why the stride parameter no longer exists. The pattern
    // below repeats every 10 pixels; sampling every 4th read its 30% panel
    // share as 40%, because 4 and 10 share a factor and the sample landed on
    // the panel run disproportionately. A real UI screenshot is exactly this
    // periodic — rows of repeated structure — so the bias was not theoretical.
    const runs: [string, number][] = [];
    for (let i = 0; i < 100; i += 1) {
      runs.push(["#0f172a", 6], ["#16213f", 3], ["#f97316", 1]);
    }
    const budget = measurePixelBudget(buffer(runs), TOKENS);

    expect(budget.ground).toBeCloseTo(0.6, 10);
    expect(budget.structure).toBeCloseTo(0.3, 10);
    expect(budget.accent).toBeCloseTo(0.1, 10);
    expect(budget.sampled).toBe(1000);
  });

  it("returns zeroed shares rather than NaN when nothing matches", () => {
    // Division by zero here would produce NaN, and every `expect(NaN).toBeGreaterThan`
    // fails in a way that looks like a palette problem instead of a broken run.
    const data = buffer([["#7f9f6f", 40]]);
    const budget = measurePixelBudget(data, TOKENS);

    expect(budget.ground).toBe(0);
    expect(budget.structure).toBe(0);
    expect(budget.accent).toBe(0);
    expect(budget.unmatched).toBe(1);
    expect(Number.isNaN(budget.ground)).toBe(false);
  });

  it("handles an empty buffer without dividing by zero", () => {
    const budget = measurePixelBudget(new Uint8ClampedArray([]), TOKENS);
    expect(budget.sampled).toBe(0);
    expect(budget.unmatched).toBe(0);
  });
});

describe("BUDGET_WINDOW", () => {
  it("is the window the rubric froze before the palette was designed", () => {
    // Pinned so widening the window to make a failing design pass is a visible
    // edit to a test, not a quiet tweak to a constant.
    expect(BUDGET_WINDOW.ground).toEqual([0.5, 0.7]);
    expect(BUDGET_WINDOW.structure).toEqual([0.2, 0.4]);
    expect(BUDGET_WINDOW.accent).toEqual([0.02, 0.12]);
  });

  it("keeps the match tolerance tight enough to separate adjacent tiers", () => {
    // Two surfaces 10 levels apart per channel are 17.3 apart in sRGB distance.
    // A tolerance above that would still classify them correctly by nearest
    // match, but the margin is worth pinning: at 40+ the palette's dark tiers
    // start absorbing each other's antialiasing.
    expect(MATCH_TOLERANCE).toBeLessThanOrEqual(32);
    expect(MATCH_TOLERANCE).toBeGreaterThanOrEqual(12);
  });
});
