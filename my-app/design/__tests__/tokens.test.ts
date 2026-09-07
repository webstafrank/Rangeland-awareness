import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { WCAG, contrast, contrastRounded, parseHex, relativeLuminance } from "../contrast";
import {
  chrome,
  cssVarMap,
  ink,
  light,
  navy,
  scarlet,
  sequential,
  series,
  severityGlyph,
  status,
} from "../tokens";
import { SEVERITIES } from "@/contracts/catalog";

/**
 * These are the gate tests that stop the palette regressing. Rubric R9 says
 * contrast is verified by a script, not by eye; this is that script, wired to
 * fail the commit.
 */

describe("contrast()", () => {
  // Anchors from the WCAG spec itself, so a refactor of the maths is caught.
  it("is 21:1 for black on white", () => {
    expect(contrastRounded("#000000", "#ffffff")).toBe(21);
  });

  it("is 1:1 for a colour against itself", () => {
    expect(contrastRounded("#3987e5", "#3987e5")).toBe(1);
  });

  it("is symmetric in its arguments", () => {
    expect(contrast("#0b2143", "#ffffff")).toBeCloseTo(contrast("#ffffff", "#0b2143"), 12);
  });

  it("puts white at luminance 1 and black at 0", () => {
    expect(relativeLuminance("#ffffff")).toBeCloseTo(1, 12);
    expect(relativeLuminance("#000000")).toBeCloseTo(0, 12);
  });

  it("accepts hex with or without the hash", () => {
    expect(parseHex("0b2143")).toEqual([11, 33, 67]);
    expect(parseHex("#0b2143")).toEqual([11, 33, 67]);
  });

  it("rejects anything that is not a 6-digit hex", () => {
    expect(() => parseHex("#fff")).toThrow(/6-digit hex/);
    expect(() => parseHex("rebeccapurple")).toThrow(/6-digit hex/);
    expect(() => parseHex("")).toThrow(/6-digit hex/);
  });
});

/** Every ground a body-text token is actually rendered on. */
const LIGHT_GROUNDS = [light.white, light.paper] as const;
const DARK_GROUNDS = [navy[950], navy[900], navy[800]] as const;

describe("body text clears 4.5:1 on every ground it is used on", () => {
  for (const ground of LIGHT_GROUNDS) {
    for (const [name, hex] of Object.entries(ink.onLight)) {
      it(`ink.onLight.${name} on ${ground}`, () => {
        expect(contrast(hex, ground)).toBeGreaterThanOrEqual(WCAG.bodyText);
      });
    }
  }

  for (const ground of DARK_GROUNDS) {
    for (const [name, hex] of Object.entries(ink.onDark)) {
      it(`ink.onDark.${name} on ${ground}`, () => {
        expect(contrast(hex, ground)).toBeGreaterThanOrEqual(WCAG.bodyText);
      });
    }
  }
});

describe("scarlet accent", () => {
  it("is legible as text on white", () => {
    expect(contrast(scarlet.inkOnLight, light.white)).toBeGreaterThanOrEqual(WCAG.bodyText);
  });

  it("is legible as text on paper", () => {
    expect(contrast(scarlet.inkOnLight, light.paper)).toBeGreaterThanOrEqual(WCAG.bodyText);
  });

  it("is legible as text on navy-900 and navy-950", () => {
    expect(contrast(scarlet.inkOnDark, navy[900])).toBeGreaterThanOrEqual(WCAG.bodyText);
    expect(contrast(scarlet.inkOnDark, navy[950])).toBeGreaterThanOrEqual(WCAG.bodyText);
  });

  it("carries a white label on its button fill", () => {
    expect(contrast(light.white, scarlet.fill)).toBeGreaterThanOrEqual(WCAG.bodyText);
    expect(contrast(light.white, scarlet.fillDeep)).toBeGreaterThanOrEqual(WCAG.bodyText);
  });

  /**
   * This is the property that lets one focus ring serve the whole app. If a
   * future ground fails it, the app needs a second ring colour, not a darker
   * scarlet, and this test is where that decision surfaces.
   */
  it("works as a single focus ring on every ground in the app", () => {
    for (const ground of [...LIGHT_GROUNDS, ...DARK_GROUNDS]) {
      expect(contrast(scarlet.mark, ground)).toBeGreaterThanOrEqual(WCAG.uiComponent);
    }
  });
});

describe("status scale", () => {
  it("covers exactly the contract's severities", () => {
    expect(Object.keys(status).sort()).toEqual([...SEVERITIES].sort());
  });

  it("gives every severity a glyph, so colour never carries alone", () => {
    for (const severity of SEVERITIES) {
      expect(severityGlyph[severity]).toBeTruthy();
    }
  });

  /**
   * Documented and deliberate: warning and serious are sub-3:1 on a light
   * ground, critical is sub-3:1 on navy-800. The mitigation is the icon+label
   * pairing in SeverityChip. This test pins WHICH pairs are exempt, so a new
   * sub-3 pair cannot slip in unnoticed alongside them.
   */
  it("has exactly the known sub-3:1 pairs and no others", () => {
    const belowThree: string[] = [];
    for (const ground of [...LIGHT_GROUNDS, ...DARK_GROUNDS]) {
      for (const [name, hex] of Object.entries(status)) {
        if (contrast(hex, ground) < WCAG.uiComponent) belowThree.push(`${name}@${ground}`);
      }
    }
    expect(belowThree.sort()).toEqual(
      [
        "critical@#0f2c58",
        "serious@#f4f7fb",
        "serious@#ffffff",
        "warning@#f4f7fb",
        "warning@#ffffff",
      ].sort(),
    );
  });
});

describe("categorical series palette", () => {
  it("caps at four slots in both tones", () => {
    // Slots 5..8 cannot clear the all-pairs gate, and comparison mode is
    // capped to match. See contracts/analysis.ts MAX_COMPARISON_AREAS.
    expect(series.light).toHaveLength(4);
    expect(series.dark).toHaveLength(4);
  });

  it("uses distinct hues within a tone", () => {
    expect(new Set(series.light).size).toBe(series.light.length);
    expect(new Set(series.dark).size).toBe(series.dark.length);
  });

  it("clears 3:1 on the navy ground for every dark slot", () => {
    for (const hex of series.dark) {
      expect(contrast(hex, navy[900])).toBeGreaterThanOrEqual(WCAG.uiComponent);
    }
  });
});

describe("sequential ramp", () => {
  it("is monotone in luminance in both tones", () => {
    for (const tone of ["light", "dark"] as const) {
      const lums = sequential[tone].map(relativeLuminance);
      const descending = lums.every((l, i) => i === 0 || l < lums[i - 1]);
      const ascending = lums.every((l, i) => i === 0 || l > lums[i - 1]);
      expect(descending || ascending).toBe(true);
    }
  });

  it("flips its anchor between tones", () => {
    // On white the ramp darkens with magnitude; on navy it lightens. If both
    // ran the same direction, one end would vanish into its ground.
    const lightFirst = relativeLuminance(sequential.light[0]);
    const lightLast = relativeLuminance(sequential.light[sequential.light.length - 1]);
    const darkFirst = relativeLuminance(sequential.dark[0]);
    const darkLast = relativeLuminance(sequential.dark[sequential.dark.length - 1]);
    expect(lightFirst > lightLast).toBe(true);
    expect(darkFirst < darkLast).toBe(true);
  });

  it("keeps the high-magnitude end visible against its own ground", () => {
    const lightHigh = sequential.light[sequential.light.length - 1];
    const darkHigh = sequential.dark[sequential.dark.length - 1];
    expect(contrast(lightHigh, light.white)).toBeGreaterThanOrEqual(WCAG.uiComponent);
    expect(contrast(darkHigh, navy[900])).toBeGreaterThanOrEqual(WCAG.uiComponent);
  });
});

describe("map and chart chrome", () => {
  it("keeps county boundaries visible on both grounds", () => {
    expect(contrast(chrome.boundaryOnLight, light.white)).toBeGreaterThanOrEqual(WCAG.uiComponent);
    expect(contrast(chrome.boundaryOnDark, navy[900])).toBeGreaterThanOrEqual(WCAG.uiComponent);
  });

  it("keeps gridlines recessive rather than competing with the data", () => {
    // A gridline that clears 3:1 is too loud: it should orient, not compete.
    expect(contrast(chrome.gridOnLight, light.white)).toBeLessThan(WCAG.uiComponent);
    expect(contrast(chrome.gridOnDark, navy[900])).toBeLessThan(WCAG.uiComponent);
  });
});

describe("globals.css mirrors design/tokens.ts", () => {
  const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");

  for (const [name, hex] of Object.entries(cssVarMap)) {
    it(`--color-${name} is ${hex}`, () => {
      const declared = new RegExp(`--color-${name}:\\s*(#[0-9a-f]{6})\\s*;`, "i").exec(css);
      expect(declared, `--color-${name} is missing from app/globals.css`).not.toBeNull();
      expect(declared![1].toLowerCase()).toBe(hex.toLowerCase());
    });
  }

  it("declares a scarlet focus ring", () => {
    expect(css).toMatch(/:focus-visible\s*\{[^}]*var\(--color-scarlet-mark\)/);
  });

  it("honours prefers-reduced-motion", () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
  });
});
