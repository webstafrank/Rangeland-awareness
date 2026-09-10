import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { contrastRatio, parseColor } from "@/lib/theme/contrast";
import { countRootBlocks, readRootTokens, stripComments } from "@/lib/theme/css-tokens";
import { MATCH_TOLERANCE } from "@/lib/theme/pixel-budget";
import {
  BUDGET_TOKENS,
  CONTRAST_PAIRS,
  CSS_TOKEN_EXPECTATIONS,
  PALETTE,
  PALETTE_HEX,
  checkPalette,
} from "@/lib/theme/palette";

/**
 * The palette gate.
 *
 * Three separate jobs, and it is worth being clear about which is which,
 * because each one catches a failure the others cannot see:
 *
 *  1. Every declared pair still meets its WCAG bar. Stops a colour being
 *     "improved" into unreadability.
 *  2. app/globals.css still says what lib/theme/palette.ts says. Without this
 *     the palette module is a comment: someone edits a hex in the CSS, job 1
 *     still passes, and the guarantees stop being true of what ships.
 *  3. The palette is internally coherent — no duplicate names, every value
 *     parseable, one :root block only.
 *
 * `npm run contrast` runs this file and prints the grade sheet, so the numbers
 * quoted in a design discussion come from the same place CI gets them.
 */

const GLOBALS_CSS = fileURLToPath(
  new URL("../../../app/globals.css", import.meta.url),
);

describe("every declared pair meets its bar", () => {
  const results = checkPalette();

  it("declares a non-trivial set of pairs", () => {
    // A palette test that grades nothing passes forever. This is the guard on
    // the guard: deleting the pairs to make the suite green is itself a
    // failure.
    expect(CONTRAST_PAIRS.length).toBeGreaterThanOrEqual(20);
  });

  // One test per pair, so a failure names the pair rather than "the palette".
  for (const pair of CONTRAST_PAIRS) {
    it(`${pair.what}: ${pair.foreground} on ${pair.background} >= ${pair.required}:1`, () => {
      const ratio = contrastRatio(pair.foreground, pair.background);
      expect(
        ratio,
        `${pair.what} is ${ratio.toFixed(2)}:1, needs ${pair.required}:1`,
      ).toBeGreaterThanOrEqual(pair.required);
    });
  }

  it("prints the grade sheet", () => {
    const width = Math.max(...results.map((r) => r.what.length));
    const lines = results.map((r) => {
      const verdict = r.ratio >= r.required ? "PASS" : "FAIL";
      return [
        verdict,
        r.what.padEnd(width),
        `${r.ratio.toFixed(2)}:1`.padStart(9),
        `(needs ${r.required}:1)`.padEnd(14),
        `${r.foreground} on ${r.background}`,
      ].join("  ");
    });

    const failed = results.filter((r) => r.ratio < r.required).length;
    console.log(
      `\nPalette grade sheet\n${lines.join("\n")}\n\n` +
        `${results.length - failed}/${results.length} pairs pass their bar.\n`,
    );

    expect(failed).toBe(0);
  });
});

describe("the palette module is coherent", () => {
  it("has no duplicate token names", () => {
    const names = PALETTE.map((token) => token.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("has a parseable value for every token", () => {
    const unparseable = PALETTE.filter(
      (token) => parseColor(token.value) === null,
    ).map((token) => `${token.name}: ${token.value}`);
    expect(unparseable).toEqual([]);
  });

  it("gives every budget token an opaque colour", () => {
    // The pixel budget matches against rendered pixels, which are always
    // opaque. A translucent token here would be matched against its own
    // unrendered hex and would never hit, silently deflating its role's share.
    for (const token of BUDGET_TOKENS) {
      expect(token.value, `${token.name} must be pre-composited`).toMatch(
        /^#[0-9a-fA-F]{6}$/,
      );
    }
  });

  it("gives every budget token a distinct colour", () => {
    // Two budget tokens sharing a value makes the nearest-match tie resolve on
    // declaration order, so a pixel's role becomes an accident of list
    // position. `--on-accent` duplicates `--page` and `--geo-casing`
    // duplicates `--page-deep`, which is exactly why both are excluded.
    const values = BUDGET_TOKENS.map((t) => t.value.toLowerCase());
    const duplicates = values.filter((value, i) => values.indexOf(value) !== i);
    expect(duplicates).toEqual([]);
  });

  it("keeps tokens of DIFFERENT roles far enough apart to classify", () => {
    // Nearest-match resolves ties deterministically, but two tokens closer
    // together than the tolerance means the antialiased pixels between them
    // land on whichever is marginally nearer. That only matters when the two
    // carry different roles: `--page` and `--page-deep` sit 11.9 apart and are
    // both `ground`, so a pixel landing on either counts the same and the
    // budget is unaffected. A same-distance pair spanning ground and structure
    // would silently move percentage points between the 60 and the 30.
    const tooClose: string[] = [];
    for (let i = 0; i < BUDGET_TOKENS.length; i += 1) {
      for (let j = i + 1; j < BUDGET_TOKENS.length; j += 1) {
        if (BUDGET_TOKENS[i].role === BUDGET_TOKENS[j].role) continue;
        const a = parseColor(BUDGET_TOKENS[i].value);
        const b = parseColor(BUDGET_TOKENS[j].value);
        if (a === null || b === null) continue;
        const distance = Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
        if (distance < MATCH_TOLERANCE) {
          tooClose.push(
            `${BUDGET_TOKENS[i].name} (${BUDGET_TOKENS[i].role}) and ` +
              `${BUDGET_TOKENS[j].name} (${BUDGET_TOKENS[j].role}) are ` +
              `${distance.toFixed(1)} apart, inside the ${MATCH_TOLERANCE} tolerance`,
          );
        }
      }
    }
    expect(tooClose).toEqual([]);
  });

  it("covers all three budgeted roles", () => {
    const roles = new Set(BUDGET_TOKENS.map((token) => token.role));
    expect(roles.has("ground")).toBe(true);
    expect(roles.has("structure")).toBe(true);
    expect(roles.has("accent")).toBe(true);
  });

  it("never lets white sit on the accent fill", () => {
    // The measurement that shaped the accent system, pinned as a rule rather
    // than as a remembered fact: 2.80:1 fails AA.
    const accent = PALETTE.find((token) => token.name === "--accent");
    expect(accent).toBeDefined();
    expect(contrastRatio("#ffffff", (accent as { value: string }).value)).toBeLessThan(
      4.5,
    );

    const onAccent = PALETTE.find((token) => token.name === "--on-accent");
    expect(onAccent).toBeDefined();
    expect(
      contrastRatio(
        (onAccent as { value: string }).value,
        (accent as { value: string }).value,
      ),
    ).toBeGreaterThanOrEqual(4.5);
  });
});

describe("app/globals.css agrees with the palette module", () => {
  const css = readFileSync(GLOBALS_CSS, "utf8");
  const declared = readRootTokens(css);

  it("declares exactly one :root block, so no token has two meanings", () => {
    // A second :root, bare or inside a prefers-color-scheme block, is how a
    // single-theme app quietly becomes a two-theme app.
    expect(countRootBlocks(css)).toBe(1);
  });

  it("commits to the dark colour scheme in CSS, not just in tokens", () => {
    // Without this the browser paints its own controls, scrollbars and
    // autofill for a light page on top of a dark one.
    expect(declared.get("color-scheme") ?? css).toContain("dark");
    expect(css).toMatch(/color-scheme:\s*dark/);
  });

  it("ships no prefers-color-scheme rule", () => {
    // Comments are stripped first. The file explains in prose that it contains
    // no prefers-color-scheme blocks, and a naive substring search on the raw
    // text fails on that sentence — which is the exact false positive
    // stripComments exists to prevent.
    expect(stripComments(css)).not.toContain("prefers-color-scheme");
  });

  for (const [name, expected] of Object.entries(CSS_TOKEN_EXPECTATIONS)) {
    it(`${name} matches the palette`, () => {
      expect(
        declared.get(name),
        `${name} is "${declared.get(name)}" in globals.css but "${expected}" in palette.ts`,
      ).toBe(expected);
    });
  }

  it("declares every palette token in the stylesheet", () => {
    const missing = Object.keys(CSS_TOKEN_EXPECTATIONS).filter(
      (name) => !declared.has(name),
    );
    expect(missing).toEqual([]);
  });

  it("exposes every palette hex for the browser-side eval to probe", () => {
    expect(PALETTE_HEX.length).toBeGreaterThan(0);
    for (const hex of PALETTE_HEX) expect(parseColor(hex)).not.toBeNull();
  });
});
