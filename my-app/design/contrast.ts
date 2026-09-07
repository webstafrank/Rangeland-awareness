/**
 * WCAG 2.1 relative luminance and contrast ratio.
 *
 * Deterministic space: contrast is arithmetic, so it is a function with tests,
 * never a judgement call. `design/__tests__/tokens.test.ts` runs every token
 * pair through this and fails the build if one drops below its floor. That is
 * what stops a "nicer blue" from quietly breaking legibility six months from
 * now.
 *
 * Reference: https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 */

/** WCAG floors. Large text is >= 18.66px bold or >= 24px regular. */
export const WCAG = {
  bodyText: 4.5,
  largeText: 3,
  /** Non-text UI: borders that carry meaning, focus rings, chart marks. */
  uiComponent: 3,
} as const;

export function parseHex(hex: string): readonly [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new Error(`not a 6-digit hex colour: ${hex}`);
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** sRGB channel (0..255) to linear light. */
function linearise(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex);
  return 0.2126 * linearise(r) + 0.7152 * linearise(g) + 0.0722 * linearise(b);
}

/** Contrast ratio, 1..21. Order of arguments does not matter. */
export function contrast(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Rounded to 2dp, which is how the palette doc quotes every ratio. */
export function contrastRounded(a: string, b: string): number {
  return Math.round(contrast(a, b) * 100) / 100;
}
