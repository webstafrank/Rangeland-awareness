/**
 * The palette. One source of truth for every colour the app ships.
 *
 * `app/globals.css` declares these same tokens, and
 * `lib/theme/__tests__/palette.test.ts` fails if the two ever disagree, so
 * this file is not documentation about the colours — it is the colours.
 *
 * The design is one light theme, committed to deliberately. `color-scheme:
 * light` is load-bearing: without it a visitor whose OS is set to dark gets
 * dark native controls, dark scrollbars and a dark autofill highlight painted
 * through a light page, which no amount of CSS on our own elements can fix.
 * There are no `prefers-color-scheme` blocks anywhere, so every colour has
 * exactly one definition and cannot be legible in one theme and invisible in
 * the other.
 *
 * Token names carry the `--color-` prefix because they are declared in
 * Tailwind v4's `@theme` block, where the prefix is what makes a token both a
 * custom property and a generated utility. `--color-surface` is therefore
 * `var(--color-surface)` in the raw Leaflet rules and `bg-surface` in markup,
 * from one declaration.
 *
 * Four results are measured, not assumed, and should not be undone without
 * re-running the grade sheet (`checkPalette`, printed by the gate test):
 *
 *  1. White on `--color-accent` is 5.47:1 and PASSES AA, so the primary action
 *     carries white text. This is the opposite of the dark build, where white
 *     on the orange accent was 2.80:1 and every accent surface needed a dark
 *     on-accent token. Ink on this teal is 3.24:1 and fails, so the inversion
 *     is not a preference — it is the only legible direction. `WHITE_ON_ACCENT`
 *     pins it.
 *  2. `--color-ink-faint` on `--color-sunken` is 4.51:1. That clears AA by
 *     0.01. It is the tightest pair in the palette and the first thing a
 *     "slightly lighter grey" edit will break, which is why every ink tier is
 *     graded against every surface rather than against white only.
 *  3. The borders do not clear the dark build's 1.5:1 bar and are not expected
 *     to. See BORDER_FLOOR: a 1px hairline on a near-white ground is a
 *     separation cue, not text, and WCAG sets no ratio for it. The bar that
 *     actually guards against a regression here is ordering, not a ratio —
 *     `--color-edge-strong` must stay darker than `--color-edge`.
 *  4. The 60-30-10 pixel budget cannot classify this palette the way it
 *     classified the dark one. See BUDGET_TOKENS.
 */

import { contrastRatio, WCAG } from "./contrast";
import type { RoleToken, TokenRole } from "./pixel-budget";

export interface PaletteToken {
  /** The CSS custom property name, exactly as declared in globals.css. */
  name: string;
  /** Any form parseColor accepts. */
  value: string;
  role: TokenRole;
  /** Why this exists, where it is allowed. */
  note: string;
}

/**
 * Every colour token, in the order globals.css declares them.
 *
 * Roles are what the 60-30-10 measurement sums by. `ground` is the page itself
 * and the wells cut into it, `structure` is the white panel tier and the rules
 * that bound it, `accent` is the one action colour. `ink` and `status` sit
 * outside the budget: text is not a surface, and a warning appearing at all is
 * a function of what the user did rather than of the palette's balance.
 */
export const PALETTE: readonly PaletteToken[] = [
  // ---------------------------------------------------------------- ground
  {
    name: "--color-page",
    value: "#f7f8fa",
    role: "ground",
    note: "The dominant 60%. A grey off-white, so the white panel tier reads as raised against it rather than merging into it.",
  },
  {
    name: "--color-sunken",
    value: "#f2f4f7",
    role: "ground",
    note: "The recessed well: a table head, a read-only field, the map's own ground. One step darker than the page, never lighter.",
  },

  // ------------------------------------------------------------- structure
  {
    name: "--color-surface",
    value: "#ffffff",
    role: "structure",
    note: "The 30%. Every card, panel, popup and control face. Pure white is the raised tier here, which only works because the page is not white.",
  },
  {
    name: "--color-edge",
    value: "#e4e7ec",
    role: "structure",
    note: "The default hairline. Bounds a card against the page and separates rows inside one.",
  },
  {
    name: "--color-edge-strong",
    value: "#d0d5dd",
    role: "structure",
    note: "The emphatic hairline: an input a user can type into, a control that is about to be clicked. Must stay darker than --color-edge; the ordering is asserted, not assumed.",
  },

  // ---------------------------------------------------------------- accent
  {
    name: "--color-accent",
    value: "#0f766e",
    role: "accent",
    note: "The 10%: primary action, selected state, drawn geometry. Deep enough teal to carry white text at 5.47:1 and to serve as body-sized text itself at 5.47:1 on a panel.",
  },
  {
    name: "--color-accent-hover",
    value: "#115e59",
    role: "accent",
    note: "Hover and active. Darker, never lighter: the pointer is adding emphasis, and the white label has to survive it (7.58:1).",
  },
  {
    name: "--color-accent-soft",
    value: "#f0fdfa",
    role: "accent",
    note: "The selected-row wash. Excluded from BUDGET_TOKENS: at 8.6 RGB units from --color-page it is inside the classifier tolerance.",
  },
  {
    name: "--color-accent-border",
    value: "#5eead4",
    role: "accent",
    note: "The edge of a selected row, so the wash has a boundary instead of bleeding into the page.",
  },

  // ------------------------------------------------------------------- ink
  {
    name: "--color-ink",
    value: "#101828",
    role: "ink",
    note: "Body and heading text. 16.11:1 at its worst surface, comfortably AAA everywhere.",
  },
  {
    name: "--color-ink-muted",
    value: "#475467",
    role: "ink",
    note: "Secondary text: descriptions, units, table bodies. AA everywhere (6.98:1 worst), and AAA on all but the sunken well.",
  },
  {
    name: "--color-ink-faint",
    value: "#667085",
    role: "ink",
    note: "Eyebrows, captions, placeholder text. The tightest token in the palette at 4.51:1 on --color-sunken. Do not lighten it.",
  },

  // ---------------------------------------------------------------- status
  {
    name: "--color-danger",
    value: "#b42318",
    role: "status",
    note: "Upload failures and validation errors. Carries white at 6.57:1 when it is a fill.",
  },
  {
    name: "--color-danger-soft",
    value: "#fef3f2",
    role: "status",
    note: "The ground an error message sits on. --color-danger reads 6.05:1 against it.",
  },
  {
    name: "--color-danger-border",
    value: "#fda29b",
    role: "status",
    note: "The edge of an error block.",
  },
  {
    name: "--color-warn",
    value: "#b54708",
    role: "status",
    note: "Selection notices and non-blocking cautions. 5.20:1 on its own soft fill.",
  },
  {
    name: "--color-warn-soft",
    value: "#fffaeb",
    role: "status",
    note: "The ground a warning sits on.",
  },
  {
    name: "--color-warn-border",
    value: "#fec84b",
    role: "status",
    note: "The edge of a warning block.",
  },
];

/** Fast lookup, and the accessor the rest of the app should use. */
const BY_NAME = new Map(PALETTE.map((token) => [token.name, token]));

/** Look up a token's value, throwing on a name that does not exist. */
export function token(name: string): string {
  const found = BY_NAME.get(name);
  if (found === undefined) throw new Error(`palette: unknown token ${name}`);
  return found.value;
}

const v = token;

/**
 * The tokens the pixel budget matches rendered pixels against.
 *
 * Deliberately NOT every token, and on this palette the exclusions do real
 * work. Three rules:
 *
 *  - Only opaque hexes, because rendered pixels are opaque and a translucent
 *    token would be matched against its own uncomposited value and never hit.
 *  - No two entries may share a value, or the nearest-match tie resolves on
 *    declaration order and a pixel's role becomes an accident of list position.
 *  - No two entries of DIFFERENT roles may sit within MATCH_TOLERANCE (10 RGB
 *    units), or antialiased pixels between them land on whichever is
 *    marginally nearer and percentage points move silently between the 60 and
 *    the 30.
 *
 * That third rule is what makes this list shorter than the dark build's. A
 * dark theme separates its tiers by construction: midnight ground against a
 * cobalt panel is a large RGB distance, so nearly every token could be
 * budgeted. A light theme does the opposite — the page, the panels and every
 * tinted wash are all crowded into the top few percent of the sRGB cube, and
 * `--color-accent-soft` (#f0fdfa) sits 8.6 units from `--color-page` and 9.7
 * from `--color-sunken`. Budgeting it would not measure "how much accent is on
 * screen", it would reassign a slice of the page's 60% to the 10% at random.
 * So the tinted washes are excluded and the accent is budgeted by its saturated
 * members, which is what a user actually perceives as the accent anyway.
 */
export const BUDGET_TOKENS: readonly RoleToken[] = [
  { name: "--color-page", value: v("--color-page"), role: "ground" },
  { name: "--color-sunken", value: v("--color-sunken"), role: "ground" },

  { name: "--color-surface", value: v("--color-surface"), role: "structure" },
  { name: "--color-edge", value: v("--color-edge"), role: "structure" },
  {
    name: "--color-edge-strong",
    value: v("--color-edge-strong"),
    role: "structure",
  },

  { name: "--color-accent", value: v("--color-accent"), role: "accent" },
  {
    name: "--color-accent-hover",
    value: v("--color-accent-hover"),
    role: "accent",
  },
  {
    name: "--color-accent-border",
    value: v("--color-accent-border"),
    role: "accent",
  },

  { name: "--color-ink", value: v("--color-ink"), role: "ink" },
  { name: "--color-ink-muted", value: v("--color-ink-muted"), role: "ink" },
  { name: "--color-ink-faint", value: v("--color-ink-faint"), role: "ink" },

  { name: "--color-danger", value: v("--color-danger"), role: "status" },
  { name: "--color-warn", value: v("--color-warn"), role: "status" },
];

export interface ContrastPair {
  /** Human-readable description, used as the test name and grade-sheet row. */
  what: string;
  foreground: string;
  background: string;
  required: number;
}

/**
 * The floor a 1px border must clear against the surface it bounds.
 *
 * Not a WCAG number, and deliberately lower than the dark build's 1.5. WCAG
 * 1.4.11 grades non-text content that conveys information or state at 3:1; a
 * hairline that merely separates a card from the page conveys neither, and the
 * criterion explicitly exempts purely decorative boundaries. On a near-white
 * ground the whole band between a visible hairline and an ugly one is roughly
 * 1.15 to 1.5, so the dark theme's bar would fail every border here
 * (--color-edge on --color-surface is 1.24:1) while a bar set just under the
 * measured values would be a tautology that catches nothing.
 *
 * 1.15 is therefore the "did someone make this invisible" floor, and the real
 * regression guard for this part of the palette is the ordering assertion in
 * the test: --color-edge-strong must stay darker than --color-edge. A ratio
 * cannot catch the two being swapped; that check can.
 */
export const BORDER_FLOOR = 1.15;

/**
 * White on the accent is the CTA label, and it is legible.
 *
 * Pinned as a constant rather than remembered: 5.47:1 passes AA, while ink on
 * the same fill is 3.24:1 and fails. An edit that darkens the page palette's
 * accent toward the dark build's orange would flip this, and the test named
 * after this constant is what fails first.
 */
export const WHITE_ON_ACCENT = "#ffffff";

/** Every surface text can legitimately land on. */
const SURFACES: readonly [string, string][] = [
  ["the page", v("--color-page")],
  ["a panel", v("--color-surface")],
  ["the sunken well", v("--color-sunken")],
  ["the accent wash", v("--color-accent-soft")],
  ["an error block", v("--color-danger-soft")],
  ["a warning block", v("--color-warn-soft")],
];

/**
 * The pairs the gate test grades, and the bar each must clear.
 *
 * Generated across every text tier and every surface rather than hand-listed,
 * because the failure this catches is a surface being added later and only
 * being checked against the two backgrounds someone remembered.
 */
export const CONTRAST_PAIRS: readonly ContrastPair[] = [
  ...SURFACES.map(([name, bg]) => ({
    what: `body text on ${name}`,
    foreground: v("--color-ink"),
    background: bg,
    required: WCAG.AAA_TEXT,
  })),
  ...SURFACES.map(([name, bg]) => ({
    what: `muted text on ${name}`,
    foreground: v("--color-ink-muted"),
    background: bg,
    required: WCAG.AA_TEXT,
  })),
  ...SURFACES.map(([name, bg]) => ({
    what: `faint text on ${name}`,
    foreground: v("--color-ink-faint"),
    background: bg,
    required: WCAG.AA_TEXT,
  })),
  // The focus ring is the accent, so it is graded as non-text on every ground
  // a focusable control can sit on.
  ...SURFACES.map(([name, bg]) => ({
    what: `focus ring on ${name}`,
    foreground: v("--color-accent"),
    background: bg,
    required: WCAG.NON_TEXT,
  })),
  // The accent is also used as text: links, the active nav item, the selected
  // topic label.
  ...SURFACES.map(([name, bg]) => ({
    what: `accent text on ${name}`,
    foreground: v("--color-accent"),
    background: bg,
    required: WCAG.AA_TEXT,
  })),

  {
    what: "CTA label on the accent",
    foreground: WHITE_ON_ACCENT,
    background: v("--color-accent"),
    required: WCAG.AA_TEXT,
  },
  {
    what: "CTA label on the accent hover",
    foreground: WHITE_ON_ACCENT,
    background: v("--color-accent-hover"),
    required: WCAG.AA_TEXT,
  },

  {
    what: "error text on its soft fill",
    foreground: v("--color-danger"),
    background: v("--color-danger-soft"),
    required: WCAG.AA_TEXT,
  },
  {
    what: "error text on a panel",
    foreground: v("--color-danger"),
    background: v("--color-surface"),
    required: WCAG.AA_TEXT,
  },
  {
    what: "label on an error fill",
    foreground: WHITE_ON_ACCENT,
    background: v("--color-danger"),
    required: WCAG.AA_TEXT,
  },
  {
    what: "warning text on its soft fill",
    foreground: v("--color-warn"),
    background: v("--color-warn-soft"),
    required: WCAG.AA_TEXT,
  },
  {
    what: "warning text on a panel",
    foreground: v("--color-warn"),
    background: v("--color-surface"),
    required: WCAG.AA_TEXT,
  },

  // Borders. BORDER_FLOOR, not WCAG.NON_TEXT: see the constant for why a
  // hairline on a near-white ground is not graded as informational non-text.
  {
    what: "edge on a panel",
    foreground: v("--color-edge"),
    background: v("--color-surface"),
    required: BORDER_FLOOR,
  },
  {
    what: "edge on the page",
    foreground: v("--color-edge"),
    background: v("--color-page"),
    required: BORDER_FLOOR,
  },
  {
    what: "strong edge on a panel",
    foreground: v("--color-edge-strong"),
    background: v("--color-surface"),
    required: BORDER_FLOOR,
  },
  {
    what: "strong edge on the page",
    foreground: v("--color-edge-strong"),
    background: v("--color-page"),
    required: BORDER_FLOOR,
  },
  {
    what: "accent border on its wash",
    foreground: v("--color-accent-border"),
    background: v("--color-accent-soft"),
    required: BORDER_FLOOR,
  },
  {
    what: "error border on its fill",
    foreground: v("--color-danger-border"),
    background: v("--color-danger-soft"),
    required: BORDER_FLOOR,
  },
  {
    what: "warning border on its fill",
    foreground: v("--color-warn-border"),
    background: v("--color-warn-soft"),
    required: BORDER_FLOOR,
  },
];

/** Grade every declared pair. Used by the gate test and by `npm run contrast`. */
export function checkPalette(): (ContrastPair & { ratio: number })[] {
  return CONTRAST_PAIRS.map((pair) => ({
    ...pair,
    ratio: contrastRatio(pair.foreground, pair.background),
  }));
}

/**
 * What `app/globals.css` must declare, token for token.
 *
 * Derived from PALETTE rather than typed twice, so the mirror test compares
 * the stylesheet against the palette instead of against a third list that
 * could drift from both.
 */
export const CSS_TOKEN_EXPECTATIONS: Record<string, string> = Object.fromEntries(
  PALETTE.map((entry) => [entry.name, entry.value]),
);

/** Every distinct colour value, for the browser-side parse probe. */
export const PALETTE_HEX: readonly string[] = [
  ...new Set(PALETTE.map((entry) => entry.value)),
];
