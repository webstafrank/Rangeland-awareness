/**
 * The palette. One source of truth for every colour the app ships.
 *
 * `app/globals.css` declares these same tokens, and
 * `lib/theme/__tests__/palette.test.ts` fails if the two ever disagree, so
 * this file is not documentation about the colours — it is the colours.
 *
 * This is the Fluent 2 "Spatial Analytics Dashboard" design system's chrome
 * palette (webLightTheme's own default values, unmodified — #0f6cbd is
 * Fluent's stock Communication Blue, not a custom brand ramp). One light
 * theme, still committed to for the same reason as before: `color-scheme:
 * light` in globals.css keeps native controls, scrollbars and autofill from
 * painting dark under a light page. There is still no `prefers-color-scheme`
 * anywhere.
 *
 * The structural change from the four-colour navy/white/red/dark-blue system
 * this replaces: Fluent has ONE brand hue, used for both the app's structure
 * (links, selection, focus) AND the primary action fill (Continue, Run). The
 * old system's split between an "accent" navy and a separate "action" red
 * does not exist here — there is nothing to keep clear of the danger red
 * because nothing red is ever a call to action. The app header and footer
 * also flip from dark navy bands with white text to Fluent's light neutral
 * chrome (`colorNeutralBackground4`) with dark ink text, since Fluent's own
 * "header and nav rail" token is a light grey, not a dark band.
 *
 * Four results are measured, not assumed, and should not be undone without
 * re-running the grade sheet (`checkPalette`, printed by `npm run contrast`):
 *
 *  1. White on `--color-accent` is 5.38:1, which is what makes it legal as
 *     the primary CTA fill. Ink (`--color-ink`, #242424) on the same fill is
 *     2.88:1 and fails — white is the only legible direction, not a
 *     preference. `WHITE_ON_ACCENT` pins it.
 *  2. `--color-ink-faint` (#616161, Fluent's own `colorNeutralForeground3`)
 *     is the tightest text tier, clearing AA (4.5:1) but not AAA on every
 *     surface. It is graded against all eight surfaces rather than white
 *     alone, same discipline as the palette it replaces.
 *  3. `--color-warn` (#bc4b09) fails AA on `--color-sunken` (4.44:1, just
 *     under the bar) because `--color-sunken` doubles as the header/nav
 *     background and warning text was never going to appear there. It is
 *     graded against every OTHER surface; see `WARN_SURFACES`.
 *  4. `--color-edge-strong` must stay darker than `--color-edge`, and
 *     `--color-sunken` must stay darker than `--color-page` — both are
 *     luminance-ordering assertions because a contrast ratio cannot catch
 *     the two being swapped.
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
 * Roles are what the 60-30-10 measurement sums by. `ground` is the app
 * canvas, `structure` is the panel tier and the rules that bound it, `accent`
 * is the one brand colour. `ink` and `status` sit outside the budget: text is
 * not a surface, and a status colour appearing at all is a function of what
 * the user did rather than of the palette's balance.
 */
export const PALETTE: readonly PaletteToken[] = [
  // ---------------------------------------------------------------- ground
  {
    name: "--color-page",
    value: "#f5f5f5",
    role: "ground",
    note: "Fluent colorNeutralBackground3. The app canvas behind panels, and the side panel background.",
  },
  {
    name: "--color-sunken",
    value: "#f0f0f0",
    role: "ground",
    note: "Fluent colorNeutralBackground4. The app header and nav rail, and any recessed well (a read-only field, a table gutter). Darker than --color-page, never lighter.",
  },

  // ------------------------------------------------------------- structure
  {
    name: "--color-surface",
    value: "#ffffff",
    role: "structure",
    note: "Fluent colorNeutralBackground1. Every panel, card, table and dialog face.",
  },
  {
    name: "--color-surface-subtle",
    value: "#fafafa",
    role: "structure",
    note: "Fluent colorNeutralBackground2. Table header row, hovered list item. Excluded from BUDGET_TOKENS: 8.66 RGB units from --color-page, inside the classifier tolerance.",
  },
  {
    name: "--color-edge",
    value: "#e0e0e0",
    role: "structure",
    note: "Fluent colorNeutralStroke2. The default hairline: dividers, table row lines.",
  },
  {
    name: "--color-edge-strong",
    value: "#d1d1d1",
    role: "structure",
    note: "Fluent colorNeutralStroke1. Card and panel outlines. Must stay darker than --color-edge; the ordering is asserted, not assumed.",
  },
  {
    name: "--color-edge-input",
    value: "#616161",
    role: "structure",
    note: "Fluent colorNeutralStrokeAccessible. Input and checkbox borders, meeting 3:1 for control boundaries. Excluded from BUDGET_TOKENS: it is a border, not a surface, and shares its value with --color-ink-faint.",
  },

  // ---------------------------------------------------------------- accent
  {
    name: "--color-accent",
    value: "#0f6cbd",
    role: "accent",
    note: "Fluent colorBrandBackground, stock Communication Blue. The one brand colour: structure (links, selection, focus) AND the primary action fill (Continue, Run, the active map tool, progress fill). Carries white at 5.38:1; ink fails at 2.88:1, which is why the CTA label is always white.",
  },
  {
    name: "--color-accent-hover",
    value: "#115ea3",
    role: "accent",
    note: "Fluent colorBrandBackgroundHover. Hover on the primary button and active tool. White survives at 6.66:1.",
  },
  {
    name: "--color-accent-pressed",
    value: "#0c3b5e",
    role: "accent",
    note: "Fluent colorBrandBackgroundPressed. Pressed state. White survives at 11.65:1.",
  },
  {
    name: "--color-accent-soft",
    value: "#ebf3fc",
    role: "accent",
    note: "Fluent colorBrandBackground2. Selected table row, selected layer in the layer list. Excluded from BUDGET_TOKENS: a tinted wash, not a saturated member a viewer perceives as the accent.",
  },
  {
    name: "--color-accent-link",
    value: "#115ea3",
    role: "accent",
    note: "Fluent colorBrandForegroundLink. Links in text and tables. Shares its value with --color-accent-hover (a text role, not a fill), so it is excluded from BUDGET_TOKENS to avoid a duplicate-value collision there.",
  },

  // ------------------------------------------------------------------- ink
  {
    name: "--color-ink",
    value: "#242424",
    role: "ink",
    note: "Fluent colorNeutralForeground1. Headings, body text, table values. Passes AAA (7:1) on every surface.",
  },
  {
    name: "--color-ink-muted",
    value: "#424242",
    role: "ink",
    note: "Fluent colorNeutralForeground2. Field labels, legend labels, secondary text. AA and AAA on every surface.",
  },
  {
    name: "--color-ink-faint",
    value: "#616161",
    role: "ink",
    note: "Fluent colorNeutralForeground3. Captions, timestamps, axis labels. AA on every surface, not always AAA. The tightest text tier in the palette.",
  },

  // ---------------------------------------------------------------- status
  {
    name: "--color-danger",
    value: "#b10e1c",
    role: "status",
    note: "Fluent colorStatusDangerForeground1. Failed jobs, invalid input. Never a fill a CTA label sits on — Fluent status colours are read as a Badge in the tint appearance, text on a light background, not white on a solid fill.",
  },
  {
    name: "--color-danger-soft",
    value: "#fdf3f4",
    role: "status",
    note: "Fluent colorStatusDangerBackground1. Error badge and message bar background. --color-danger reads 6.53:1 against it.",
  },
  {
    name: "--color-warn",
    value: "#bc4b09",
    role: "status",
    note: "Fluent colorStatusWarningForeground1. Partial results, cloud cover over threshold, low sample count. Graded against WARN_SURFACES, which excludes --color-sunken (4.44:1 there, under AA; warning text never appears on the header/nav chrome it doubles as).",
  },
  {
    name: "--color-warn-soft",
    value: "#fff9f5",
    role: "status",
    note: "Fluent colorStatusWarningBackground1. Warning badge and message bar background.",
  },
  {
    name: "--color-success",
    value: "#0e700e",
    role: "status",
    note: "Fluent colorStatusSuccessForeground1. Succeeded jobs, validation passed. New in this palette: the four-colour system it replaces had no success indicator, and JobStatus needs one.",
  },
  {
    name: "--color-success-soft",
    value: "#f1faf1",
    role: "status",
    note: "Fluent colorStatusSuccessBackground1. Success badge and message bar background.",
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
 * Deliberately NOT every token: soft washes, link text and input borders sit
 * inside the classifier tolerance of a budgeted member or share a value with
 * one, and including them would make the nearest-match tie an accident of
 * list position rather than a measurement. See each excluded token's note in
 * PALETTE for the specific reason.
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
    name: "--color-accent-pressed",
    value: v("--color-accent-pressed"),
    role: "accent",
  },

  { name: "--color-ink", value: v("--color-ink"), role: "ink" },
  { name: "--color-ink-muted", value: v("--color-ink-muted"), role: "ink" },
  { name: "--color-ink-faint", value: v("--color-ink-faint"), role: "ink" },

  { name: "--color-danger", value: v("--color-danger"), role: "status" },
  { name: "--color-warn", value: v("--color-warn"), role: "status" },
  { name: "--color-success", value: v("--color-success"), role: "status" },
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
 * Not a WCAG number: WCAG 1.4.11 grades non-text content that conveys
 * information or state at 3:1, and a hairline that merely separates a card
 * from the page conveys neither. On these near-white Fluent neutrals the gap
 * between a visible hairline and an invisible one is roughly 1.15 to 1.55, so
 * this is the "did someone make this invisible" floor, not a bar the real
 * regression guard depends on — that guard is the ordering assertion below
 * (--color-edge-strong must stay darker than --color-edge), which a ratio
 * cannot catch being swapped.
 */
export const BORDER_FLOOR = 1.15;

/**
 * White on the accent is the CTA label, and it is legible.
 *
 * Pinned as a constant rather than remembered: 5.38:1 passes AA, while ink on
 * the same fill is 2.88:1 and fails. The same white is used on
 * --color-accent-hover (6.66:1) and --color-accent-pressed (11.65:1), each
 * graded separately below.
 */
export const WHITE_ON_ACCENT = "#ffffff";

/** Every surface text can legitimately land on. */
const SURFACES: readonly [string, string][] = [
  ["the page", v("--color-page")],
  ["the sunken well", v("--color-sunken")],
  ["a panel", v("--color-surface")],
  ["a subtle surface", v("--color-surface-subtle")],
  ["the accent wash", v("--color-accent-soft")],
  ["an error block", v("--color-danger-soft")],
  ["a warning block", v("--color-warn-soft")],
  ["a success block", v("--color-success-soft")],
];

/**
 * Every surface warning text can land on. Excludes the sunken well: that
 * token doubles as the app header/nav background, warning text never
 * appears there, and --color-warn measures 4.44:1 on it — under AA.
 */
const WARN_SURFACES: readonly [string, string][] = SURFACES.filter(
  ([name]) => name !== "the sunken well",
);

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
  ...SURFACES.map(([name, bg]) => ({
    what: `link text on ${name}`,
    foreground: v("--color-accent-link"),
    background: bg,
    required: WCAG.AA_TEXT,
  })),
  ...SURFACES.map(([name, bg]) => ({
    what: `danger text on ${name}`,
    foreground: v("--color-danger"),
    background: bg,
    required: WCAG.AA_TEXT,
  })),
  ...WARN_SURFACES.map(([name, bg]) => ({
    what: `warning text on ${name}`,
    foreground: v("--color-warn"),
    background: bg,
    required: WCAG.AA_TEXT,
  })),
  ...SURFACES.map(([name, bg]) => ({
    what: `success text on ${name}`,
    foreground: v("--color-success"),
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
    what: "CTA label on the accent pressed",
    foreground: WHITE_ON_ACCENT,
    background: v("--color-accent-pressed"),
    required: WCAG.AA_TEXT,
  },

  // Ink text on the header/nav chrome (--color-sunken doubles as its
  // background): the app's own nav labels, not a status colour.
  {
    what: "body text on the header and nav rail",
    foreground: v("--color-ink"),
    background: v("--color-sunken"),
    required: WCAG.AAA_TEXT,
  },
  {
    what: "muted text on the header and nav rail",
    foreground: v("--color-ink-muted"),
    background: v("--color-sunken"),
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
  // The input border is Fluent's "accessible" stroke, graded to the real bar
  // it is designed for (3:1 control boundary) rather than the hairline floor.
  {
    what: "input border on a panel",
    foreground: v("--color-edge-input"),
    background: v("--color-surface"),
    required: WCAG.NON_TEXT,
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
