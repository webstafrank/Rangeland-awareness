/**
 * WCAG contrast maths.
 *
 * This is deterministic work, so it lives in code rather than being reasoned
 * about in prose: the same two colours must always produce the same ratio, and
 * a palette decision that claims "readable" has to be able to prove it.
 *
 * The formulas are WCAG 2.1 relative luminance (§ definitions) and contrast
 * ratio (§1.4.3). Nothing here knows about this app's palette; palette.ts owns
 * that, and lib/theme/__tests__/palette.test.ts is what grades one with the
 * other.
 */

/** An sRGB colour, 0-255 per channel. */
export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/**
 * Parse `#rgb`, `#rrggbb` or `rgb(r, g, b)` / `rgba(r, g, b, a)`.
 *
 * Returns null rather than throwing, because one caller is a CSS parser
 * walking a whole stylesheet: an unparseable value there means "not a colour
 * token", not "the build is broken".
 */
export function parseColor(value: string): Rgb | null {
  const text = value.trim().toLowerCase();

  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(text);
  if (hex) {
    const digits = hex[1];
    // #abc is shorthand for #aabbcc: each digit is doubled, not zero-padded.
    const full =
      digits.length === 3
        ? digits
            .split("")
            .map((d) => d + d)
            .join("")
        : digits;
    return {
      r: Number.parseInt(full.slice(0, 2), 16),
      g: Number.parseInt(full.slice(2, 4), 16),
      b: Number.parseInt(full.slice(4, 6), 16),
    };
  }

  const fn = /^rgba?\(([^)]+)\)$/.exec(text);
  if (fn) {
    // Accepts both the legacy comma syntax and the modern space syntax, and
    // ignores any alpha: a ratio against a translucent colour is meaningless
    // without knowing what is behind it, so callers must composite first.
    const parts = fn[1]
      .split(/[,/\s]+/)
      .filter((p) => p.length > 0)
      .slice(0, 3)
      .map((p) => Number.parseFloat(p));
    if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return null;
    return { r: parts[0], g: parts[1], b: parts[2] };
  }

  return null;
}

/** Linearise one 0-1 sRGB channel. The 0.03928 branch is straight from WCAG. */
function linearise(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function luminance(color: Rgb): number {
  return (
    0.2126 * linearise(color.r) +
    0.7152 * linearise(color.g) +
    0.0722 * linearise(color.b)
  );
}

/**
 * WCAG contrast ratio between two colours, 1 (identical) to 21 (black/white).
 *
 * Order-independent by construction: the lighter colour is always the
 * numerator, so callers never have to remember which argument is which.
 */
export function contrastRatio(a: Rgb | string, b: Rgb | string): number {
  const first = typeof a === "string" ? parseColor(a) : a;
  const second = typeof b === "string" ? parseColor(b) : b;
  if (first === null || second === null) {
    throw new Error(`contrastRatio: unparseable colour (${String(a)}, ${String(b)})`);
  }

  const la = luminance(first);
  const lb = luminance(second);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * Composite a translucent colour over an opaque one, so a ratio can be taken
 * against what the eye actually sees.
 *
 * Translucency is unavoidable at the map boundary even in a flat light theme:
 * the Leaflet attribution strip sits on white at 0.86 alpha over whatever
 * basemap tile happens to be beneath it, and the selected-area fill is the
 * accent at 0.18 over satellite imagery. A ratio computed against the fill's
 * own hex would be a statement about a colour that is never painted.
 */
export function composite(
  foreground: Rgb | string,
  alpha: number,
  background: Rgb | string,
): Rgb {
  const fg = typeof foreground === "string" ? parseColor(foreground) : foreground;
  const bg = typeof background === "string" ? parseColor(background) : background;
  if (fg === null || bg === null) {
    throw new Error("composite: unparseable colour");
  }

  const mix = (f: number, b: number) => Math.round(f * alpha + b * (1 - alpha));
  return { r: mix(fg.r, bg.r), g: mix(fg.g, bg.g), b: mix(fg.b, bg.b) };
}

/** The WCAG 2.1 thresholds, named so call sites read as intent. */
export const WCAG = {
  /** 4.5:1 — AA for body text. */
  AA_TEXT: 4.5,
  /** 3:1 — AA for large text (>=24px, or >=18.66px bold) and UI components. */
  AA_LARGE: 3,
  /** 7:1 — AAA for body text. */
  AAA_TEXT: 7,
  /** 3:1 — non-text contrast for borders, focus rings and control boundaries. */
  NON_TEXT: 3,
} as const;
