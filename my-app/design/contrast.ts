/**
 * WCAG 2.1 relative luminance and contrast ratio, for the design tokens.
 *
 * Deterministic space: contrast is arithmetic, so it is a function with tests,
 * never a judgement call. `design/__tests__/tokens.test.ts` runs every token
 * pair through this and fails the build if one drops below its floor. That is
 * what stops a "nicer blue" from quietly breaking legibility six months from
 * now.
 *
 * The arithmetic itself is NOT implemented here. It lives in
 * `lib/theme/contrast.ts`, and this module is a thin adapter over it.
 *
 * The two arrived from different branches, each with its own copy of the same
 * WCAG formulas, and each copy was correct: their sRGB linearisation
 * thresholds differ (0.03928 here historically, 0.04045 in the spec's other
 * formulation) but for 8-bit channels the two select the same branch for every
 * possible input, since the thresholds sit between channel 10 and channel 11.
 * So there was never a behavioural difference to preserve, only a second place
 * for the next person to fix a bug in. One implementation, two vocabularies:
 * `lib/theme` speaks Rgb objects and AA/AAA names for the UI palette, this
 * module speaks hex strings and body/large/ui names for the chart tokens.
 *
 * Reference: https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 */

import {
  WCAG as THEME_WCAG,
  contrastRatio,
  luminance,
  parseColor,
} from "@/lib/theme/contrast";

/**
 * WCAG floors. Large text is >= 18.66px bold or >= 24px regular.
 *
 * The names are this module's, the numbers are not: they are read from
 * `lib/theme/contrast` so the chart tokens and the UI palette can never end up
 * grading themselves against two different definitions of "AA".
 */
export const WCAG = {
  bodyText: THEME_WCAG.AA_TEXT,
  largeText: THEME_WCAG.AA_LARGE,
  /** Non-text UI: borders that carry meaning, focus rings, chart marks. */
  uiComponent: THEME_WCAG.NON_TEXT,
} as const;

/**
 * Parse a 6-digit hex to an [r, g, b] tuple, throwing on anything else.
 *
 * Stricter than `parseColor`, deliberately. `parseColor` accepts shorthand and
 * `rgb()` and returns null for the rest, because it reads values out of a
 * stylesheet that may legitimately contain any of them. Design tokens are
 * written by hand in one format, so anything else is a typo and should stop
 * the build at the token rather than surface later as a silently skipped
 * contrast check.
 */
export function parseHex(hex: string): readonly [number, number, number] {
  const text = hex.trim();
  if (!/^#?[0-9a-f]{6}$/i.test(text)) {
    throw new Error(`not a 6-digit hex colour: ${hex}`);
  }

  const rgb = parseColor(text.startsWith("#") ? text : `#${text}`);
  if (rgb === null) throw new Error(`not a 6-digit hex colour: ${hex}`);
  return [rgb.r, rgb.g, rgb.b];
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex);
  return luminance({ r, g, b });
}

/** Contrast ratio, 1..21. Order of arguments does not matter. */
export function contrast(a: string, b: string): number {
  // Routed through parseHex, not straight to contrastRatio, so this module
  // keeps its strict-hex contract: `contrast("red", "#fff")` must throw here
  // even though contrastRatio would happily parse neither.
  const [ar, ag, ab] = parseHex(a);
  const [br, bg, bb] = parseHex(b);
  return contrastRatio({ r: ar, g: ag, b: ab }, { r: br, g: bg, b: bb });
}

/** Rounded to 2dp, which is how the palette doc quotes every ratio. */
export function contrastRounded(a: string, b: string): number {
  return Math.round(contrast(a, b) * 100) / 100;
}
