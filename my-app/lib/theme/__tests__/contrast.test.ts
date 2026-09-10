import { describe, expect, it } from "vitest";
import {
  WCAG,
  composite,
  contrastRatio,
  luminance,
  parseColor,
} from "@/lib/theme/contrast";

/**
 * The contrast maths.
 *
 * Graded against values published by the W3C rather than against itself, which
 * is the only way a formula test is worth anything: an implementation asserted
 * against its own output passes even when the formula is wrong.
 */

describe("parseColor", () => {
  it("reads six-digit hex", () => {
    expect(parseColor("#0f172a")).toEqual({ r: 15, g: 23, b: 42 });
  });

  it("reads three-digit hex by doubling each digit, not zero-padding", () => {
    // #abc is #aabbcc. Zero-padding would give #a00b00c0 nonsense, and the
    // classic bug is #fff parsing to {15,15,15} — near-black instead of white.
    expect(parseColor("#fff")).toEqual({ r: 255, g: 255, b: 255 });
    expect(parseColor("#abc")).toEqual({ r: 170, g: 187, b: 204 });
  });

  it("is case insensitive and tolerates surrounding space", () => {
    expect(parseColor("  #F97316 ")).toEqual({ r: 249, g: 115, b: 22 });
  });

  it("reads the legacy comma rgb() syntax the DOM returns", () => {
    // getComputedStyle gives this form, so the eval depends on it.
    expect(parseColor("rgb(15, 23, 42)")).toEqual({ r: 15, g: 23, b: 42 });
  });

  it("reads the modern space syntax and ignores alpha", () => {
    expect(parseColor("rgb(15 23 42 / 0.5)")).toEqual({ r: 15, g: 23, b: 42 });
    expect(parseColor("rgba(15, 23, 42, 0.5)")).toEqual({ r: 15, g: 23, b: 42 });
  });

  it("returns null for anything that is not a colour", () => {
    // Null rather than throwing: the CSS mirror test walks a whole stylesheet
    // and must be able to skip `--shadow-card: 0 1px 2px ...` quietly.
    expect(parseColor("0 1px 2px rgb(0 0 0 / 0.4)")).toBeNull();
    expect(parseColor("var(--page)")).toBeNull();
    expect(parseColor("")).toBeNull();
    expect(parseColor("#ff")).toBeNull();
    expect(parseColor("#gggggg")).toBeNull();
  });
});

describe("luminance", () => {
  it("puts black at 0 and white at 1", () => {
    expect(luminance({ r: 0, g: 0, b: 0 })).toBe(0);
    expect(luminance({ r: 255, g: 255, b: 255 })).toBeCloseTo(1, 10);
  });

  it("takes the linearisation branch below the 0.03928 knee", () => {
    // #030303 is 3/255 = 0.0118, under the knee, so it is c/12.92 and NOT the
    // gamma curve. Getting this branch wrong is invisible except in very dark
    // colours, which is the entire palette of this app.
    const dark = luminance({ r: 3, g: 3, b: 3 });
    expect(dark).toBeCloseTo(3 / 255 / 12.92, 12);
  });

  it("weights green far above blue", () => {
    expect(luminance({ r: 0, g: 255, b: 0 })).toBeCloseTo(0.7152, 4);
    expect(luminance({ r: 0, g: 0, b: 255 })).toBeCloseTo(0.0722, 4);
  });
});

describe("contrastRatio", () => {
  it("gives 21:1 for black on white, the maximum", () => {
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 10);
  });

  it("gives 1:1 for a colour against itself", () => {
    expect(contrastRatio("#1d4ed8", "#1d4ed8")).toBeCloseTo(1, 10);
  });

  it("matches the W3C's own AA boundary example", () => {
    // #767676 on white is the canonical "just passes AA" grey: 4.54:1.
    expect(contrastRatio("#767676", "#ffffff")).toBeCloseTo(4.54, 2);
  });

  it("is order independent", () => {
    const a = contrastRatio("#e2e8f0", "#0f172a");
    const b = contrastRatio("#0f172a", "#e2e8f0");
    expect(a).toBeCloseTo(b, 12);
  });

  it("accepts parsed objects as well as strings", () => {
    expect(contrastRatio({ r: 255, g: 255, b: 255 }, { r: 0, g: 0, b: 0 })).toBeCloseTo(
      21,
      10,
    );
  });

  it("throws on an unparseable input rather than returning a plausible number", () => {
    // Silently returning 1 or 21 here would let a broken token sail through the
    // palette gate as either a pass or a failure for the wrong reason.
    expect(() => contrastRatio("not a colour", "#000")).toThrow(/unparseable/);
  });

  it("records the fact that white on the brand orange fails AA", () => {
    // This is the single measurement that shapes the whole accent system: the
    // 10% colour cannot carry white text, so the primary CTA runs dark-on-
    // orange instead. Pinned here so a future "let's make the button white
    // text again" is a red test rather than an accessibility regression.
    expect(contrastRatio("#ffffff", "#f97316")).toBeLessThan(WCAG.AA_TEXT);
    expect(contrastRatio("#0f172a", "#f97316")).toBeGreaterThan(WCAG.AA_TEXT);
  });
});

describe("composite", () => {
  it("returns the background at alpha 0 and the foreground at alpha 1", () => {
    expect(composite("#1d4ed8", 0, "#0f172a")).toEqual({ r: 15, g: 23, b: 42 });
    expect(composite("#1d4ed8", 1, "#0f172a")).toEqual({ r: 29, g: 78, b: 216 });
  });

  it("mixes linearly in sRGB, the way a browser paints it", () => {
    expect(composite("#ffffff", 0.5, "#000000")).toEqual({
      r: 128,
      g: 128,
      b: 128,
    });
  });

  it("lets a translucent panel be graded against what is behind it", () => {
    // 12% cobalt over the midnight ground is what the eye actually sees; a
    // ratio taken against #1d4ed8 itself would be a fiction.
    const panel = composite("#1d4ed8", 0.12, "#0f172a");
    expect(panel).toEqual({ r: 17, g: 30, b: 63 });
    expect(contrastRatio("#e2e8f0", panel)).toBeGreaterThan(WCAG.AAA_TEXT);
  });
});
