import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { Rgb } from "@/lib/theme/contrast";
import { contrastRatio, luminance, parseColor } from "@/lib/theme/contrast";
import {
  countRootBlocks,
  countThemeBlocks,
  readRootTokens,
  readThemeTokens,
  stripComments,
} from "@/lib/theme/css-tokens";
import { MATCH_TOLERANCE } from "@/lib/theme/pixel-budget";
import {
  BUDGET_TOKENS,
  CONTRAST_PAIRS,
  CSS_TOKEN_EXPECTATIONS,
  PALETTE,
  PALETTE_HEX,
  WHITE_ON_ACCENT,
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
    // The bar is 2x the tolerance, not 1x, and the difference is the whole
    // point. Each token claims a sphere of radius MATCH_TOLERANCE; two spheres
    // stop overlapping only once their centres are 2x the radius apart. At 1x
    // this test passed while radii overlapped heavily, so the antialiased
    // pixels along every card edge were assigned to ground or structure by
    // whichever centre was marginally nearer — a silent transfer between the
    // 60 and the 30, which is exactly what the constant exists to prevent.
    //
    // Same-role neighbours are skipped deliberately: `--color-page` and
    // `--color-sunken` sit 7.07 apart and are both `ground`, so a pixel
    // landing on either counts the same and the budget is unaffected.
    const minimumSeparation = MATCH_TOLERANCE * 2;
    const tooClose: string[] = [];
    for (let i = 0; i < BUDGET_TOKENS.length; i += 1) {
      for (let j = i + 1; j < BUDGET_TOKENS.length; j += 1) {
        if (BUDGET_TOKENS[i].role === BUDGET_TOKENS[j].role) continue;
        const a = parseColor(BUDGET_TOKENS[i].value);
        const b = parseColor(BUDGET_TOKENS[j].value);
        if (a === null || b === null) continue;
        const distance = Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
        if (distance < minimumSeparation) {
          tooClose.push(
            `${BUDGET_TOKENS[i].name} (${BUDGET_TOKENS[i].role}) and ` +
              `${BUDGET_TOKENS[j].name} (${BUDGET_TOKENS[j].role}) are ` +
              `${distance.toFixed(1)} apart, inside the ${minimumSeparation} ` +
              `(2 x ${MATCH_TOLERANCE}) separation two match radii need`,
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

  it("puts white on the accent fill, and proves ink would not do", () => {
    // The measurement that shaped the accent system, pinned as a rule rather
    // than as a remembered fact. Both halves matter: white clears AA at
    // 5.47:1, AND the ink token fails at 3.24:1, so this is the only legible
    // direction rather than a preference. The dark build's accent inverted
    // both halves, which is why this assertion is written to fail loudly if
    // someone ports an accent hex across from it.
    const accent = PALETTE.find((t) => t.name === "--color-accent");
    expect(accent).toBeDefined();
    const accentValue = (accent as { value: string }).value;

    expect(
      contrastRatio(WHITE_ON_ACCENT, accentValue),
      "white must stay legible on the accent fill",
    ).toBeGreaterThanOrEqual(4.5);

    const ink = PALETTE.find((t) => t.name === "--color-ink");
    expect(ink).toBeDefined();
    expect(
      contrastRatio((ink as { value: string }).value, accentValue),
      "if ink ever clears AA on the accent, the CTA label choice needs re-deciding",
    ).toBeLessThan(4.5);
  });

  it("keeps the strong edge darker than the default edge", () => {
    // The ordering guard. Contrast ratios cannot catch these two being
    // swapped: both would still clear BORDER_FLOOR, the grade sheet would be
    // all green, and every input on the page would quietly get the fainter
    // rule while cards got the heavier one. Luminance ordering is the only
    // check that sees it.
    const edge = parseColor(
      (PALETTE.find((t) => t.name === "--color-edge") as { value: string }).value,
    );
    const strong = parseColor(
      (PALETTE.find((t) => t.name === "--color-edge-strong") as { value: string })
        .value,
    );
    expect(edge).not.toBeNull();
    expect(strong).not.toBeNull();
    expect(luminance(strong as Rgb)).toBeLessThan(luminance(edge as Rgb));
  });

  it("keeps the sunken well darker than the page it is cut into", () => {
    // Same class of guard, one tier up. "Sunken" that renders lighter than the
    // page is not a subtle regression, but it is an invisible one in a diff
    // where two near-white hexes swap.
    const page = parseColor(
      (PALETTE.find((t) => t.name === "--color-page") as { value: string }).value,
    );
    const sunken = parseColor(
      (PALETTE.find((t) => t.name === "--color-sunken") as { value: string }).value,
    );
    expect(luminance(sunken as Rgb)).toBeLessThan(luminance(page as Rgb));
  });
});

describe("app/globals.css agrees with the palette module", () => {
  const css = readFileSync(GLOBALS_CSS, "utf8");

  // The colour tokens live in Tailwind v4's `@theme` block, not in `:root`.
  // Tailwind emits them onto `:root` in the BUILT stylesheet, but this test
  // reads the source file, where only `color-scheme` is declared on `:root`.
  // Reading the wrong block here is the failure mode that matters most: it
  // would return an empty-ish Map and every mirror assertion below would pass
  // by comparing nothing.
  const declared = readThemeTokens(css);
  const rootTokens = readRootTokens(css);

  it("declares exactly one :root block, so no token has two meanings", () => {
    // A second :root, bare or inside a prefers-color-scheme block, is how a
    // single-theme app quietly becomes a two-theme app.
    expect(countRootBlocks(css)).toBe(1);
  });

  it("declares exactly one @theme block, for the same reason", () => {
    // readThemeTokens only ever reads the first, and the duplicate check
    // inside it cannot see across blocks.
    expect(countThemeBlocks(css)).toBe(1);
  });

  it("actually found the colour tokens, so the mirror below is not vacuous", () => {
    // The guard on the guard. If @theme were renamed or the reader pointed at
    // the wrong block, every `${name} matches the palette` test would compare
    // undefined against undefined for a token the palette no longer lists, and
    // the suite would go green on a stylesheet it never read.
    expect(declared.size).toBeGreaterThanOrEqual(PALETTE.length);
  });

  it("commits to the light colour scheme in CSS, not just in tokens", () => {
    // Without this the browser paints its own controls, scrollbars and
    // autofill for a dark page on top of a light one.
    //
    // Matched inside the `:root` block rather than anywhere in the file.
    // `color-scheme: light` sitting in some component's rule would satisfy a
    // bare substring search while doing nothing for the document, since the
    // property only affects the element it is set on and its descendants.
    // Comments are stripped first, because the block above this one in
    // globals.css discusses `color-scheme` in prose.
    expect(stripComments(css)).toMatch(/:root\s*\{[^}]*color-scheme:\s*light/);

    // `readRootTokens` returns custom properties only, so `color-scheme` is
    // deliberately not among them. Asserting that keeps the reader's contract
    // pinned: if it ever starts returning plain declarations, the regex above
    // is no longer the only thing guarding this and the test should say so.
    expect(rootTokens.has("color-scheme")).toBe(false);
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
