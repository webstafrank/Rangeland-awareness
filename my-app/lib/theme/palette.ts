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
 * The system is four colours: navy blue, white, red and dark blue. Navy is
 * what the app is built out of (links, selected state, the focus ring, the
 * chrome bands); red is the forward action, the brand mark and two of the four
 * topic identities, and never a second interactive colour; white is the panel
 * tier; dark blue is navy under pressure — hover, and
 * the ground of the header, footer and hero. Everything else below is a tint
 * or a shade of those four, which is why there is no fifth hue in the list.
 *
 * Five results are measured, not assumed, and should not be undone without
 * re-running the grade sheet (`checkPalette`, printed by the gate test):
 *
 *  1. White on `--color-accent` is 12.55:1, so the navy carries white text.
 *     Ink on that navy is 1.44:1, so the inversion is not a preference — it is
 *     the only legible direction. `WHITE_ON_ACCENT` pins it.
 *  2. White on `--color-action` is 5.88:1, which is what makes a red button
 *     legal as the primary CTA. The red is graded AS TEXT on every surface too
 *     (5.00:1 at worst, on the sunken well), because the step rail prints the
 *     current step's number in it.
 *  3. `--color-ink-faint` on `--color-sunken` is 4.77:1. It is the tightest
 *     pair in the palette and the first thing a "slightly lighter" edit will
 *     break, which is why every ink tier is graded against every surface
 *     rather than against white only.
 *  4. `--color-danger` (#a4161a) is deliberately NOT `--color-action`
 *     (#c8102e). The brand red means "go"; an upload failure painted in the
 *     colour of the button the user just pressed is a design bug. They sit
 *     40.5 RGB units apart, which is also what keeps the pixel budget able to
 *     tell an accent pixel from a status one.
 *  5. The borders do not clear the dark build's 1.5:1 bar and are not expected
 *     to. See BORDER_FLOOR: a 1px hairline on a near-white ground is a
 *     separation cue, not text, and WCAG sets no ratio for it. The real
 *     regression guard here is ordering, not a ratio — `--color-edge-strong`
 *     must stay darker than `--color-edge`.
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
    value: "#f3f6fb",
    role: "ground",
    note: "The dominant 60%. A blue-cast off-white, so the white panel tier reads as raised against it and the whole ground sits in the navy family rather than next to it.",
  },
  {
    name: "--color-sunken",
    value: "#e7edf7",
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
    value: "#d5dfee",
    role: "structure",
    note: "The default hairline. Bounds a card against the page and separates rows inside one. Blue-cast, so a rule never reads as a grey borrowed from another system.",
  },
  {
    name: "--color-edge-strong",
    value: "#a9bcd8",
    role: "structure",
    note: "The emphatic hairline: an input a user can type into, a control that is about to be clicked. Must stay darker than --color-edge; the ordering is asserted, not assumed.",
  },

  // ---------------------------------------------------------------- accent
  {
    name: "--color-accent",
    value: "#10316b",
    role: "accent",
    note: "Navy blue. Structure, links, selected state, the focus ring, drawn geometry. Carries white at 12.55:1 and serves as body text at 12.55:1 on a panel. This is the colour the app is built OUT OF, which is why it is not the colour the primary button is painted in.",
  },
  {
    name: "--color-accent-hover",
    value: "#071c45",
    role: "accent",
    note: "Dark blue. Hover and active on navy, and the ground of the header, footer and hero bands. Darker, never lighter: the pointer adds emphasis and the white label has to survive it (16.65:1).",
  },
  {
    name: "--color-accent-soft",
    value: "#eaf1fc",
    role: "accent",
    note: "The selected-row wash. Excluded from BUDGET_TOKENS: at 9.9 RGB units from --color-page it is inside the classifier tolerance.",
  },
  {
    name: "--color-accent-border",
    value: "#9cb9e4",
    role: "accent",
    note: "The edge of a selected row, so the wash has a boundary instead of bleeding into the page.",
  },

  // ---------------------------------------------------------------- action
  {
    name: "--color-action",
    value: "#c8102e",
    role: "accent",
    note: "Red. The forward action (Continue, Run analysis), the current step marker, the brand rule and logo mark, and two of the four topic identities — a four-colour system has no fifth hue to give a topic. What it is never used for is a SECOND interactive colour: no red secondary button, no red link, nothing red that a navy control could have been. That restraint is what keeps it reading as the way forward. Carries white at 5.88:1, and is graded as text on every surface because the step rail prints a number in it.",
  },
  {
    name: "--color-action-hover",
    value: "#9e0a23",
    role: "accent",
    note: "Hover and active on the red. Darker, never lighter (white survives at 8.33:1).",
  },
  {
    name: "--color-action-soft",
    value: "#fdecef",
    role: "accent",
    note: "The wash behind a red-marked block, e.g. the current step's card. Excluded from BUDGET_TOKENS: it is within the classifier tolerance of --color-danger-soft.",
  },
  {
    name: "--color-action-border",
    value: "#f3a9b3",
    role: "accent",
    note: "The edge of a red-marked block, so the wash has a boundary.",
  },

  // ------------------------------------------------------------------- ink
  {
    name: "--color-ink",
    value: "#07162f",
    role: "ink",
    note: "Body and heading text. Near-black navy rather than a neutral, so text belongs to the same family as the chrome. 16.98:1 at its worst surface, comfortably AAA everywhere.",
  },
  {
    name: "--color-ink-muted",
    value: "#3b5175",
    role: "ink",
    note: "Secondary text: descriptions, units, table bodies. AA everywhere (6.82:1 worst), and AAA on all but the sunken well.",
  },
  {
    name: "--color-ink-faint",
    value: "#55688c",
    role: "ink",
    note: "Eyebrows, captions, placeholder text. The tightest token in the palette at 4.77:1 on --color-sunken. Do not lighten it.",
  },
  {
    name: "--color-on-chrome-muted",
    value: "#aac2e2",
    role: "ink",
    note: "Secondary text INSIDE a chrome band: the header's tagline, the footer, the hero's supporting copy, the topic band's question. It exists because the three ink tiers above are all graded against light surfaces and every one of them is illegible on the dark blue band, and because the alternative in use was --color-ink-dark-secondary, a data-viz token this file does not own and does not grade. 9.14:1 on --color-accent-hover. Primary text on a band is plain white, which is graded as 'CTA label on the accent hover'.",
  },

  // ---------------------------------------------------------------- status
  {
    name: "--color-danger",
    value: "#a4161a",
    role: "status",
    note: "Upload failures and validation errors. A deeper, browner red than --color-action on purpose: the brand red means go, and a failure must not be painted in the colour of the button the user just pressed. Carries white at 7.75:1.",
  },
  {
    name: "--color-danger-soft",
    value: "#fdeceb",
    role: "status",
    note: "The ground an error message sits on. --color-danger reads 6.78:1 against it.",
  },
  {
    name: "--color-danger-border",
    value: "#eda19d",
    role: "status",
    note: "The edge of an error block.",
  },
  {
    name: "--color-warn",
    value: "#8a5200",
    role: "status",
    note: "Selection notices and non-blocking cautions. 5.92:1 on its own soft fill.",
  },
  {
    name: "--color-warn-soft",
    value: "#fdf6e3",
    role: "status",
    note: "The ground a warning sits on.",
  },
  {
    name: "--color-warn-border",
    value: "#e0b04a",
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
 * `--color-accent-soft` (#eaf1fc) sits 9.9 units from `--color-page` while
 * `--color-action-soft` (#fdecef) sits 5.0 from `--color-danger-soft`.
 * Budgeting either would not measure "how much accent is on screen", it would
 * reassign a slice of the page's 60% to the 10% at random. So the tinted
 * washes are excluded and the accent is budgeted by its saturated members —
 * navy, dark blue, and both reds — which is what a user actually perceives as
 * the accent anyway.
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

  { name: "--color-action", value: v("--color-action"), role: "accent" },
  {
    name: "--color-action-hover",
    value: v("--color-action-hover"),
    role: "accent",
  },

  { name: "--color-ink", value: v("--color-ink"), role: "ink" },
  { name: "--color-ink-muted", value: v("--color-ink-muted"), role: "ink" },
  { name: "--color-ink-faint", value: v("--color-ink-faint"), role: "ink" },
  {
    name: "--color-on-chrome-muted",
    value: v("--color-on-chrome-muted"),
    role: "ink",
  },

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
 * Pinned as a constant rather than remembered: 12.55:1 passes AA, while ink on
 * the same navy is 1.44:1 and fails. An edit that lightens the accent toward a
 * mid blue would flip this, and the test named after this constant is what
 * fails first. The same white is used on --color-action (5.88:1), which is
 * graded separately below.
 */
export const WHITE_ON_ACCENT = "#ffffff";

/** Every surface text can legitimately land on. */
const SURFACES: readonly [string, string][] = [
  ["the page", v("--color-page")],
  ["a panel", v("--color-surface")],
  ["the sunken well", v("--color-sunken")],
  ["the accent wash", v("--color-accent-soft")],
  ["the action wash", v("--color-action-soft")],
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
  // The action red is text as well as a fill: the current step's number in the
  // rail, and the two topic labels that carry it.
  ...SURFACES.map(([name, bg]) => ({
    what: `action text on ${name}`,
    foreground: v("--color-action"),
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

  /*
   * The chrome band, which the light surfaces above cannot speak for.
   *
   * The header, the footer, the hero and the topic band all paint
   * --color-accent-hover and put text on it, which makes this the most
   * repeated text pairing in the app. It was ungraded for exactly as long as
   * the on-band ink was borrowed from the data-viz namespace: SURFACES lists
   * the seven light grounds, so nothing here could see it.
   */
  {
    what: "muted text on the chrome band",
    foreground: v("--color-on-chrome-muted"),
    background: v("--color-accent-hover"),
    required: WCAG.AA_TEXT,
  },
  {
    what: "body text on the chrome band",
    foreground: WHITE_ON_ACCENT,
    background: v("--color-accent-hover"),
    required: WCAG.AAA_TEXT,
  },

  {
    what: "CTA label on the action",
    foreground: WHITE_ON_ACCENT,
    background: v("--color-action"),
    required: WCAG.AA_TEXT,
  },
  {
    what: "CTA label on the action hover",
    foreground: WHITE_ON_ACCENT,
    background: v("--color-action-hover"),
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
    what: "action border on its wash",
    foreground: v("--color-action-border"),
    background: v("--color-action-soft"),
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
