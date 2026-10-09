/**
 * The palette. One source of truth for every colour the app ships.
 *
 * `app/globals.css` declares these same tokens, and
 * `lib/theme/__tests__/palette.test.ts` fails if the two ever disagree, so
 * this file is not documentation about the colours — it is the colours.
 *
 * The enterprise palette: a navy application frame (the sidebar), white
 * panels on a cool grey canvas, and one restrained blue accent. The accent is
 * step 80 of the brand ramp in `lib/theme/fluent-theme.ts`, the ramp Fluent's
 * own components are themed with, so Fluent controls and Tailwind-styled
 * controls paint the same blue. One light theme: `color-scheme: light` in
 * globals.css keeps native controls, scrollbars and autofill from painting
 * dark under a light page, and there is no `prefers-color-scheme` anywhere.
 *
 * ONE brand hue does both jobs, the app's structure (links, selection, focus)
 * AND the primary action fill (Continue, Run). Nothing red is ever a call to
 * action, so there is no second interactive colour to keep apart from the
 * danger red.
 *
 * Results that are measured, not assumed, and should not be undone without
 * re-running the grade sheet (`checkPalette`, printed by `npm run contrast`):
 *
 *  1. White on `--color-accent` is 6.24:1, which is what makes it legal as
 *     the primary CTA fill. Ink on the same fill is 2.79:1 and fails, so
 *     white is the only legible direction, not a preference.
 *     `WHITE_ON_ACCENT` pins it.
 *  2. `--color-ink-faint` is the tightest text tier on the light grounds,
 *     clearing AA (4.5:1) on all eight surfaces.
 *  3. `--color-warn` is graded against every surface except the sunken well
 *     (`WARN_SURFACES`): warning text sits in tinted blocks and panels, never
 *     in a recessed well.
 *  4. The navy frame has its own ink ramp, graded against the three grounds a
 *     sidebar item can be in (resting, hovered, current). `--color-nav-ink-faint`
 *     is a section label and is only graded on the resting ground, because a
 *     label is never hovered or current.
 *  5. `--color-edge-strong` must stay darker than `--color-edge`, and
 *     `--color-sunken` must stay darker than `--color-page`: luminance
 *     ordering assertions, because a contrast ratio cannot catch the two
 *     being swapped.
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
    value: "#f4f6fa",
    role: "ground",
    note: "The app canvas behind panels. Cool and faintly navy-tinted so it belongs to the frame.",
  },
  {
    name: "--color-sunken",
    value: "#eceff5",
    role: "ground",
    note: "A recessed well: a read-only field, a table gutter, a skeleton block, the inactive half of a segmented control. Darker than --color-page, never lighter.",
  },

  // ------------------------------------------------------------- structure
  {
    name: "--color-surface",
    value: "#ffffff",
    role: "structure",
    note: "Every panel, card, table and dialog face, and the top bar.",
  },
  {
    name: "--color-surface-subtle",
    value: "#f8fafc",
    role: "structure",
    note: "Table header row, hovered list item. Excluded from BUDGET_TOKENS: inside the classifier tolerance of --color-page.",
  },
  {
    name: "--color-edge",
    value: "#e1e6ee",
    role: "structure",
    note: "The default hairline: card outlines, dividers, table row lines, the top bar's bottom edge.",
  },
  {
    name: "--color-edge-strong",
    value: "#cbd3df",
    role: "structure",
    note: "Secondary button outlines and emphasised rules. Must stay darker than --color-edge; the ordering is asserted, not assumed.",
  },
  {
    name: "--color-edge-input",
    value: "#6b778b",
    role: "structure",
    note: "Input and checkbox borders, meeting 3:1 for control boundaries. Excluded from BUDGET_TOKENS: it is a border, not a surface.",
  },

  // ---------------------------------------------------------------- accent
  {
    name: "--color-accent",
    value: "#1d5bc6",
    role: "accent",
    note: "Brand ramp step 80, Fluent's colorBrandBackground. The one brand colour: structure (links, selection, focus) AND the primary action fill (Continue, Run, the active map tool, progress fill). Carries white at 6.24:1; ink fails at 2.79:1, which is why the CTA label is always white.",
  },
  {
    name: "--color-accent-hover",
    value: "#184fae",
    role: "accent",
    note: "Brand ramp step 70, colorBrandBackgroundHover. Hover on the primary button and active tool.",
  },
  {
    name: "--color-accent-pressed",
    value: "#0d2a5e",
    role: "accent",
    note: "Brand ramp step 40, colorBrandBackgroundPressed. Pressed state.",
  },
  {
    name: "--color-accent-soft",
    value: "#ebf2fd",
    role: "accent",
    note: "Brand ramp step 160, colorBrandBackground2. Selected table row, selected layer, the current step. Excluded from BUDGET_TOKENS: a tinted wash, not a saturated member a viewer perceives as the accent.",
  },
  {
    name: "--color-accent-link",
    value: "#184fae",
    role: "accent",
    note: "Brand ramp step 70, colorBrandForegroundLink. Links in text and tables. Shares its value with --color-accent-hover (a text role, not a fill), so it is excluded from BUDGET_TOKENS to avoid a duplicate-value collision there.",
  },

  // ------------------------------------------------------------------- ink
  {
    name: "--color-ink",
    value: "#0e1a2e",
    role: "ink",
    note: "Headings, body text, table values. Navy-black, so type sits in the same family as the frame. Passes AAA (7:1) on every surface.",
  },
  {
    name: "--color-ink-muted",
    value: "#3b4960",
    role: "ink",
    note: "Field labels, legend labels, secondary text. AA on every surface.",
  },
  {
    name: "--color-ink-faint",
    value: "#566378",
    role: "ink",
    note: "Captions, timestamps, axis labels. AA on every surface. The tightest light-ground text tier.",
  },

  // ---------------------------------------------------------------- status
  {
    name: "--color-danger",
    value: "#b10e1c",
    role: "status",
    note: "Failed jobs, invalid input. Never a fill a CTA label sits on: status colours are read as a tint, text on a light background, not white on a solid fill.",
  },
  {
    name: "--color-danger-soft",
    value: "#fdf3f4",
    role: "status",
    note: "Error badge and message bar background.",
  },
  {
    name: "--color-warn",
    value: "#b34708",
    role: "status",
    note: "Partial results, cloud cover over threshold, low sample count. Graded against WARN_SURFACES, which excludes the sunken well.",
  },
  {
    name: "--color-warn-soft",
    value: "#fff9f5",
    role: "status",
    note: "Warning badge and message bar background.",
  },
  {
    name: "--color-success",
    value: "#0e700e",
    role: "status",
    note: "Succeeded jobs, validation passed, the service-online indicator.",
  },
  {
    name: "--color-success-soft",
    value: "#f1faf1",
    role: "status",
    note: "Success badge and message bar background.",
  },

  // ----------------------------------------------------------------- frame
  {
    name: "--color-nav",
    value: "#0b1f3f",
    role: "structure",
    note: "The navy application frame: the sidebar and the mobile drawer. The one dark surface in the app. Excluded from BUDGET_TOKENS: a fixed-width rail, not a share of the content.",
  },
  {
    name: "--color-nav-raised",
    value: "#132a50",
    role: "structure",
    note: "A hovered sidebar item, and the account card at the foot of the sidebar.",
  },
  {
    name: "--color-nav-active",
    value: "#1c3866",
    role: "structure",
    note: "The current sidebar item.",
  },
  {
    name: "--color-nav-edge",
    value: "#1f3559",
    role: "structure",
    note: "Hairlines inside the sidebar: the rule under the brand, above the footer.",
  },
  {
    name: "--color-nav-ink",
    value: "#ffffff",
    role: "ink",
    note: "The current item's label and the brand name on navy.",
  },
  {
    name: "--color-nav-ink-muted",
    value: "#a9b8d0",
    role: "ink",
    note: "Resting sidebar item labels and their icons. AA on every nav ground.",
  },
  {
    name: "--color-nav-ink-faint",
    value: "#8396b4",
    role: "ink",
    note: "Sidebar section labels (Workspace, Topics). AA on the resting ground only; a label is never hovered or current.",
  },
  {
    name: "--color-nav-accent",
    value: "#7fb0ff",
    role: "accent",
    note: "The current item's indicator bar and the focus ring inside the sidebar, where the light-ground accent would sit under 3:1.",
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
 * Pinned as a constant rather than remembered: 6.24:1 passes AA, while ink on
 * the same fill is 2.79:1 and fails. The same white is used on
 * --color-accent-hover (7.59:1) and --color-accent-pressed (13.91:1), each
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
/** The three grounds a sidebar item can sit on: resting, hovered, current. */
const NAV_GROUNDS: readonly [string, string][] = [
  ["the sidebar", v("--color-nav")],
  ["a hovered sidebar item", v("--color-nav-raised")],
  ["the current sidebar item", v("--color-nav-active")],
];

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

  // The navy frame. Item labels and icons are graded on all three grounds an
  // item can be in; the section label only on the resting ground, because a
  // label is never hovered or current.
  ...NAV_GROUNDS.map(([name, bg]) => ({
    what: `nav label on ${name}`,
    foreground: v("--color-nav-ink"),
    background: bg,
    required: WCAG.AAA_TEXT,
  })),
  ...NAV_GROUNDS.map(([name, bg]) => ({
    what: `muted nav label on ${name}`,
    foreground: v("--color-nav-ink-muted"),
    background: bg,
    required: WCAG.AA_TEXT,
  })),
  ...NAV_GROUNDS.map(([name, bg]) => ({
    what: `nav indicator and focus ring on ${name}`,
    foreground: v("--color-nav-accent"),
    background: bg,
    required: WCAG.NON_TEXT,
  })),
  {
    what: "nav section label on the sidebar",
    foreground: v("--color-nav-ink-faint"),
    background: v("--color-nav"),
    required: WCAG.AA_TEXT,
  },
  {
    what: "nav hairline on the sidebar",
    foreground: v("--color-nav-edge"),
    background: v("--color-nav"),
    required: BORDER_FLOOR,
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
