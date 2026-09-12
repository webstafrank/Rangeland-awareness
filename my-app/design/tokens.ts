/**
 * Design tokens: the single source of truth for colour in this app.
 *
 * Two rules make this file safe to change:
 *
 *  1. Every value here is measured, not eyeballed. The categorical chart
 *     palette was run through the data-viz validator against BOTH of this
 *     app's surfaces (white `#ffffff` and navy `#0b2143`) and passes every
 *     gate in both modes. Every text pair was run through `contrast()`.
 *     `design/__tests__/tokens.test.ts` re-checks the floors on every commit.
 *  2. `app/globals.css` mirrors these values as CSS custom properties, and
 *     `design/__tests__/tokens.test.ts` asserts the two never drift apart.
 *
 * The brand is dark blue and white in alternating bands, with scarlet as an
 * accent only. Scarlet is never a section ground: it marks the single most
 * important action or the single most important number on a screen, and its
 * scarcity is what makes it work.
 *
 * Measured ratios are in `design/palette.md`.
 */

/* ------------------------------------------------------------------- navy */

/** Dark blue ramp. 900 is the canonical dark ground. */
export const navy = {
  950: "#071831",
  900: "#0b2143",
  800: "#0f2c58",
  700: "#123a70",
  600: "#1a5199",
} as const;

/* ------------------------------------------------------------------ light */

export const light = {
  /** Canonical light ground. */
  white: "#ffffff",
  /** The alternating light band, so two light sections in a row still read as two. */
  paper: "#f4f7fb",
  /** Hairline rules and input borders on a light ground. */
  edge: "#e8eef7",
} as const;

/* ---------------------------------------------------------------- scarlet */

/**
 * The accent. Three steps because one scarlet cannot be legible as text on
 * both a white and a navy ground, and a button needs a fill dark enough to
 * carry a white label.
 */
export const scarlet = {
  /** Button and chip fill. White label on it measures 5.24:1. */
  fill: "#d32211",
  /** Pressed / hovered fill. */
  fillDeep: "#b81c0d",
  /** Scarlet as text on a light ground: 5.74:1 on white. */
  inkOnLight: "#c81f0f",
  /** Scarlet as text on a navy ground: 5.85:1 on navy-900. */
  inkOnDark: "#ff6f5c",
  /**
   * True scarlet. Non-text marks only. Clears 3:1 on white (3.82) AND on
   * navy-900 (4.19), which is why one focus ring colour works on every ground
   * in the app.
   */
  mark: "#ff2400",
} as const;

/* -------------------------------------------------------------------- ink */

export const ink = {
  onLight: {
    primary: "#0b2143", // 16.00 on white
    secondary: "#4d5f7a", // 6.49 on white
    muted: "#5b6b85", // 5.40 on white
  },
  onDark: {
    primary: "#ffffff", // 16.00 on navy-900
    secondary: "#a8bad4", // 8.10 on navy-900
    muted: "#8fa4c4", // 6.30 on navy-900
  },
} as const;

/* ----------------------------------------------------------------- status */

/**
 * The reserved status scale, taken unchanged from the validated data-viz
 * palette. Never themed, never reused for "series 4".
 *
 * On a light ground `warning` (1.83) and `serious` (2.64) sit below 3:1 by
 * design; on navy-800 `critical` sits at 2.87. The documented mitigation is
 * the icon + label pairing, so a `<SeverityChip>` ALWAYS renders its label.
 * There is no colour-only status anywhere in this app.
 */
export const status = {
  good: "#0ca30c",
  warning: "#fab219",
  serious: "#ec835a",
  critical: "#d03b3b",
} as const;

export type SeverityToken = keyof typeof status;

/** Glyph shown beside every severity label, so colour never carries alone. */
export const severityGlyph: Readonly<Record<SeverityToken, string>> = {
  good: "●",
  warning: "▲",
  serious: "◆",
  critical: "■",
};

/* --------------------------------------------------- categorical (series) */

/**
 * Chart series identity. Assigned in fixed order, never cycled. Capped at
 * `MAX_COMPARISON_AREAS` (4) because slots 3 and 4 sit below 3:1 on white and
 * the relief channel (direct labels + the table view) is what makes them
 * legal; past four the all-pairs gate cannot be met at all.
 *
 * Validator, adjacent pairlist:
 *   light on #ffffff — worst CVD dE 9.1, worst normal-vision dE 22.9, PASS
 *   dark  on #0b2143 — worst CVD dE 8.4, worst normal-vision dE 19.3, PASS
 */
export const series = {
  light: ["#2a78d6", "#eb6834", "#1baf7a", "#eda100"],
  dark: ["#3987e5", "#d95926", "#199e70", "#c98500"],
} as const;

/** Slots below 3:1 on white. Their series MUST carry a visible direct label. */
export const seriesNeedingRelief = { light: [2, 3], dark: [] as number[] } as const;

/* ------------------------------------------------------------- sequential */

/**
 * Magnitude ramp for the map choropleth: one hue, light to dark.
 *
 * The anchor flips by mode. On white the near-zero end is the palest step and
 * is allowed to recede into the surface; on navy the palest step is the most
 * visible, so the ramp is read the other way round and stops at `#256abf`
 * (2.97 on navy-900) rather than continuing into steps that vanish.
 */
export const sequential = {
  light: ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#0d366b"],
  dark: ["#256abf", "#3987e5", "#6da7ec", "#9ec5f4", "#cde2fb", "#e6f0fd"],
} as const;

/* ---------------------------------------------------------------- chrome */

export const chrome = {
  /** Chart gridlines. Recessive by design: they orient, they do not compete. */
  gridOnLight: "#e1e7f0",
  gridOnDark: "#1b3a66",
  axisOnLight: "#b9c6d8",
  axisOnDark: "#2b527f",
  /** County boundary strokes on the map. */
  boundaryOnLight: "#4d5f7a",
  boundaryOnDark: "#a8bad4",
} as const;

/* ------------------------------------------------------------------ motion */

/**
 * Every duration in the app. R8 of the rubric caps a transition at 400ms, and
 * `prefers-reduced-motion` collapses all of them to 0 in `globals.css`.
 */
export const motion = {
  instant: 90,
  quick: 160,
  base: 240,
  slow: 380,
} as const;

/* ------------------------------------------------------------------ export */

/**
 * Flat name -> hex map, used by the token test to check `globals.css` mirrors
 * this file. Keys match the CSS custom property names minus the `--` prefix.
 */
export const cssVarMap: Readonly<Record<string, string>> = {
  "navy-950": navy[950],
  "navy-900": navy[900],
  "navy-800": navy[800],
  "navy-700": navy[700],
  "navy-600": navy[600],
  white: light.white,
  paper: light.paper,
  /*
   * `light.edge` is deliberately NOT mirrored to CSS.
   *
   * It would want `--color-edge`, and the app's chrome palette in
   * lib/theme/palette.ts already owns that name with a different value
   * (#e4e7ec), which globals.css reads in its Leaflet rules. Declaring both
   * in one @theme block is a silent last-wins, so this module keeps the
   * export for any chart that wants a hairline in TypeScript and gives up
   * the CSS name it never read back anyway.
   */
  "scarlet-fill": scarlet.fill,
  "scarlet-fill-deep": scarlet.fillDeep,
  "scarlet-ink-light": scarlet.inkOnLight,
  "scarlet-ink-dark": scarlet.inkOnDark,
  "scarlet-mark": scarlet.mark,
  "ink-light-primary": ink.onLight.primary,
  "ink-light-secondary": ink.onLight.secondary,
  "ink-light-muted": ink.onLight.muted,
  "ink-dark-primary": ink.onDark.primary,
  "ink-dark-secondary": ink.onDark.secondary,
  "ink-dark-muted": ink.onDark.muted,
  "status-good": status.good,
  "status-warning": status.warning,
  "status-serious": status.serious,
  "status-critical": status.critical,
};
