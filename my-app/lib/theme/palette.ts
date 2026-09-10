/**
 * The palette. One source of truth for every colour the app ships.
 *
 * `app/globals.css` declares these same tokens, and
 * `lib/theme/__tests__/palette.test.ts` fails if the two ever disagree, so
 * this file is not documentation about the colours — it is the colours.
 *
 * The design is one dark theme, committed to deliberately, exactly as the
 * previous build committed to one light theme. `color-scheme: dark` is
 * load-bearing: without it a visitor whose OS is set to light gets light
 * native controls, light scrollbars and a white autofill highlight painted
 * through a dark page, which no amount of CSS on our own elements can fix.
 * There are no `prefers-color-scheme` blocks anywhere, so every colour has
 * exactly one definition and cannot be legible in one theme and invisible in
 * the other.
 *
 * The structure follows the 60-30-10 rule literally enough to be measured:
 * a midnight ground, a cobalt structural tier that panels and chrome are cut
 * from, and one orange accent. `evals/theme.spec.ts` measures the rendered
 * balance against BUDGET_WINDOW and fails when it drifts.
 *
 * Three results are baked into these values and should not be undone without
 * re-running the scripts that produced them:
 *
 *  1. White on the accent is 2.80:1 and fails AA. Every orange surface carries
 *     `--on-accent` midnight text at 6.37:1.
 *  2. No single flat colour clears 3:1 against light OSM tiles, dark CARTO
 *     tiles and Esri imagery at once — brute-forced over the whole sRGB cube,
 *     the best any colour manages is 1.47:1 worst-case. So selected geometry
 *     is drawn twice: `--geo-casing` beneath `--geo-stroke`.
 *  3. The geometry FILL cannot be graded by contrast ratio at all. Its ratio
 *     against bright satellite sand stays at ~1.0 for every alpha from 0.10 to
 *     0.65, because the two sit at nearly the same relative luminance and the
 *     WCAG ratio is a function of luminance only. The fill is a chromatic and
 *     tonal cue; the stroke pair is the guarantee. Do not raise the alpha
 *     chasing a number that cannot move.
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
 * Roles are what the 60-30-10 measurement sums by. `ground` is the page
 * itself, `structure` is the cobalt tier every panel and every piece of chrome
 * is built from, `accent` is the one action colour. `ink` and `status` sit
 * outside the budget: text is not a surface, and a warning appearing at all is
 * a function of what the user did rather than of the palette's balance.
 */
export const PALETTE: readonly PaletteToken[] = [
  // ---------------------------------------------------------------- ground
  {
    name: "--page",
    value: "#0f172a",
    role: "ground",
    note: "The dominant 60%. Midnight slate; the ground everything else sits on.",
  },
  {
    name: "--page-deep",
    value: "#0b1220",
    role: "ground",
    note: "Recessed wells that read as cut INTO the page: the JSON payload, the map gutter. Darker than the panel above it, which is the opposite of the light build's sunken tier and is what makes a well read as a well on dark.",
  },

  // ------------------------------------------------------------- structure
  {
    name: "--surface",
    value: "#14203f",
    role: "structure",
    note: "Standard panel and card body. Blue-saturated navy, not grey: this is the tier that makes the cobalt structural rather than decorative.",
  },
  {
    name: "--surface-raised",
    value: "#182a55",
    role: "structure",
    note: "Raised inside a panel: inputs, chips, radio cards, table stripes.",
  },
  {
    name: "--surface-header",
    value: "#1e3566",
    role: "structure",
    note: "The top structural tint: panel header strips, selected rows, and the app frame itself (sticky header, sticky action bar, footer). Anything filled with this takes --border-strong, because --border is only 1.41:1 against it and disappears.",
  },
  {
    name: "--border",
    value: "#2e4a8c",
    role: "structure",
    note: "The default hairline. Clears the 1.5:1 floor against every surface except --surface-header.",
  },
  {
    name: "--border-strong",
    value: "#3b5fae",
    role: "structure",
    note: "Panel headers, focused controls, the map frame, and anything on --surface-header.",
  },
  {
    name: "--cobalt",
    value: "#1d4ed8",
    role: "structure",
    note: "Saturated structural FILL only: the logo tile, index chips, filled badges. Never text — it is 2.66:1 on the ground.",
  },
  {
    name: "--cobalt-deep",
    value: "#1e40af",
    role: "structure",
    note: "Pressed state of --cobalt.",
  },

  // -------------------------------------------------------------- accent
  {
    name: "--accent",
    value: "#f97316",
    role: "accent",
    note: "The single action colour, the 10%. Allowed on exactly three things: the primary CTA, the active/selected control state, and a live-data indicator. Never on the map, never on a topic tile.",
  },
  {
    name: "--accent-hover",
    value: "#fb8b33",
    role: "accent",
    note: "Hover state of the primary CTA.",
  },
  {
    name: "--accent-soft",
    value: "#3a2010",
    role: "accent",
    note: "Flat soft fill behind accent text. Opaque, not translucent: a blend over a blue panel goes muddy.",
  },
  {
    name: "--accent-border",
    value: "#7a3d12",
    role: "accent",
    note: "Edge of an accent-soft region.",
  },

  // ------------------------------------------------------------------ ink
  {
    name: "--text",
    value: "#e8eef9",
    role: "ink",
    note: "Body and headings. AAA on every surface in the system.",
  },
  {
    name: "--text-muted",
    value: "#afc2dc",
    role: "ink",
    note: "Secondary copy and labels.",
  },
  {
    name: "--text-faint",
    value: "#8fa5c4",
    role: "ink",
    note: "Metadata, units, table keys. There is no dimmer tier: #64748b is 3.75:1 on the ground and is banned by name.",
  },
  {
    name: "--on-cobalt",
    value: "#ffffff",
    role: "ink",
    note: "The label on a --cobalt fill, at 6.70:1.",
  },
  {
    name: "--on-accent",
    value: "#0f172a",
    role: "ink",
    note: "The ONLY colour allowed on an --accent fill. White there is 2.80:1 and fails AA.",
  },
  {
    name: "--accent-text",
    value: "#fdba74",
    role: "ink",
    note: "Orange as text on a dark surface, where the accent fill would be too loud.",
  },
  {
    name: "--cobalt-text",
    value: "#60a5fa",
    role: "ink",
    note: "Links, focus, numeric data blue. The blue that is allowed to be text.",
  },
  {
    name: "--cobalt-text-hi",
    value: "#93c5fd",
    role: "ink",
    note: "Emphasised figures on dark panels.",
  },

  // --------------------------------------------------------------- status
  {
    name: "--danger",
    value: "#fca5a5",
    role: "status",
    note: "Error text. The token is the TEXT colour, matching how components already use text-danger.",
  },
  {
    name: "--danger-soft",
    value: "#2a1220",
    role: "status",
    note: "Fill behind error text.",
  },
  {
    name: "--danger-border",
    value: "#7f2a3a",
    role: "status",
    note: "Edge of an error region.",
  },
  {
    name: "--warn",
    value: "#fde68a",
    role: "status",
    note: "Warning text. A pale straw, not an amber: an amber warning sitting near the orange CTA reads as a second call to action, which is exactly what the blind critic caught.",
  },
  {
    name: "--warn-soft",
    value: "#241f16",
    role: "status",
    note: "Fill behind warning text. Deliberately faint so the strip does not compete with the CTA.",
  },
  {
    name: "--warn-border",
    value: "#6e5a2e",
    role: "status",
    note: "Edge of a warning region.",
  },

  // ---------------------------------------------------------------- focus
  {
    name: "--focus",
    value: "#60a5fa",
    role: "ink",
    note: "The focus ring. Blue, not orange, so focus is never confused with 'this is the primary action', and so it stays visible ON the orange CTA.",
  },

  // ----------------------------------------------------------------- topics
  // Wayfinding, so an analyst can tell the four topics apart at a glance.
  // Each triple is text / tile fill / tile edge. Hues sit at 197 / 55 / 160 /
  // 351 degrees, a comfortable spread, and the drought tone is a canary rather
  // than an amber so it does not read as a second orange next to the accent.
  {
    name: "--topic-flood-text",
    value: "#38bdf8",
    role: "ink",
    note: "Flood risk.",
  },
  { name: "--topic-flood-tile", value: "#0d2f4d", role: "ink", note: "Flood risk tile." },
  { name: "--topic-flood-edge", value: "#1d5c86", role: "ink", note: "Flood risk edge." },
  {
    name: "--topic-drought-text",
    value: "#f0e68c",
    role: "ink",
    note: "Drought monitoring. Canary, deliberately not amber.",
  },
  { name: "--topic-drought-tile", value: "#33301a", role: "ink", note: "Drought tile." },
  { name: "--topic-drought-edge", value: "#6e6635", role: "ink", note: "Drought edge." },
  {
    name: "--topic-range-text",
    value: "#34d399",
    role: "ink",
    note: "Rangeland dynamics.",
  },
  { name: "--topic-range-tile", value: "#0d3328", role: "ink", note: "Rangeland tile." },
  { name: "--topic-range-edge", value: "#17624b", role: "ink", note: "Rangeland edge." },
  {
    name: "--topic-food-text",
    value: "#fda4af",
    role: "ink",
    note: "Food security.",
  },
  { name: "--topic-food-tile", value: "#3a1526", role: "ink", note: "Food security tile." },
  { name: "--topic-food-edge", value: "#7a2b45", role: "ink", note: "Food security edge." },

  // ------------------------------------------------------------------- map
  {
    name: "--geo-stroke",
    value: "#ffffff",
    role: "ink",
    note: "Core stroke of a selected area. White, measured as the best of the candidates: 5.25:1 worst-case tile coverage and 18.72:1 against its own casing. Deliberately NOT the accent, so a selection never competes with the CTA.",
  },
  {
    name: "--geo-casing",
    value: "#0b1220",
    role: "ink",
    note: "Drawn 5px wide beneath the 2px core stroke. On every sampled basemap pixel at least one of the pair clears 3:1.",
  },
] as const;

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
 * Deliberately NOT every token. Two rules:
 *
 *  - Only opaque hexes, because rendered pixels are opaque and a translucent
 *    token would be matched against its own uncomposited value and never hit.
 *  - No two entries may share a value. `--on-accent` and `--geo-casing` are
 *    excluded for exactly this reason: they duplicate `--page` and
 *    `--page-deep`, and a duplicate would make the nearest-match tie resolve
 *    on declaration order, quietly assigning a role at random.
 */
export const BUDGET_TOKENS: readonly RoleToken[] = [
  { name: "--page", value: v("--page"), role: "ground" },
  { name: "--page-deep", value: v("--page-deep"), role: "ground" },

  { name: "--surface", value: v("--surface"), role: "structure" },
  { name: "--surface-raised", value: v("--surface-raised"), role: "structure" },
  { name: "--surface-header", value: v("--surface-header"), role: "structure" },
  { name: "--border", value: v("--border"), role: "structure" },
  { name: "--border-strong", value: v("--border-strong"), role: "structure" },
  { name: "--cobalt", value: v("--cobalt"), role: "structure" },
  { name: "--cobalt-deep", value: v("--cobalt-deep"), role: "structure" },

  { name: "--accent", value: v("--accent"), role: "accent" },
  { name: "--accent-hover", value: v("--accent-hover"), role: "accent" },
  { name: "--accent-soft", value: v("--accent-soft"), role: "accent" },
  { name: "--accent-border", value: v("--accent-border"), role: "accent" },

  { name: "--text", value: v("--text"), role: "ink" },
  { name: "--text-muted", value: v("--text-muted"), role: "ink" },
  { name: "--text-faint", value: v("--text-faint"), role: "ink" },
  { name: "--on-cobalt", value: v("--on-cobalt"), role: "ink" },
  { name: "--accent-text", value: v("--accent-text"), role: "ink" },
  { name: "--cobalt-text", value: v("--cobalt-text"), role: "ink" },

  { name: "--danger", value: v("--danger"), role: "status" },
  { name: "--danger-soft", value: v("--danger-soft"), role: "status" },
  { name: "--warn", value: v("--warn"), role: "status" },
  { name: "--warn-soft", value: v("--warn-soft"), role: "status" },
];

export interface ContrastPair {
  /** Human-readable description, used as the test name and grade-sheet row. */
  what: string;
  foreground: string;
  background: string;
  required: number;
}

/** Every surface text can legitimately land on. */
const SURFACES: readonly [string, string][] = [
  ["page", v("--page")],
  ["deep", v("--page-deep")],
  ["surface", v("--surface")],
  ["raised", v("--surface-raised")],
  ["header", v("--surface-header")],
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
    foreground: v("--text"),
    background: bg,
    required: WCAG.AAA_TEXT,
  })),
  ...SURFACES.map(([name, bg]) => ({
    what: `muted text on ${name}`,
    foreground: v("--text-muted"),
    background: bg,
    required: WCAG.AA_TEXT,
  })),
  ...SURFACES.map(([name, bg]) => ({
    what: `faint text on ${name}`,
    foreground: v("--text-faint"),
    background: bg,
    required: WCAG.AA_TEXT,
  })),
  ...SURFACES.map(([name, bg]) => ({
    what: `focus ring on ${name}`,
    foreground: v("--focus"),
    background: bg,
    required: WCAG.NON_TEXT,
  })),

  {
    what: "CTA label on the accent",
    foreground: v("--on-accent"),
    background: v("--accent"),
    required: WCAG.AA_TEXT,
  },
  {
    what: "CTA label on the accent hover",
    foreground: v("--on-accent"),
    background: v("--accent-hover"),
    required: WCAG.AA_TEXT,
  },
  {
    what: "accent text on the page",
    foreground: v("--accent-text"),
    background: v("--page"),
    required: WCAG.AA_TEXT,
  },
  {
    what: "accent text on its soft fill",
    foreground: v("--accent-text"),
    background: v("--accent-soft"),
    required: WCAG.AA_TEXT,
  },

  {
    what: "label on a cobalt fill",
    foreground: v("--on-cobalt"),
    background: v("--cobalt"),
    required: WCAG.AA_TEXT,
  },
  {
    what: "label on a deep cobalt fill",
    foreground: v("--on-cobalt"),
    background: v("--cobalt-deep"),
    required: WCAG.AA_TEXT,
  },
  {
    what: "link blue on the page",
    foreground: v("--cobalt-text"),
    background: v("--page"),
    required: WCAG.AA_TEXT,
  },
  {
    what: "link blue on a panel",
    foreground: v("--cobalt-text"),
    background: v("--surface"),
    required: WCAG.AA_TEXT,
  },
  {
    what: "link blue on a panel header",
    foreground: v("--cobalt-text"),
    background: v("--surface-header"),
    required: WCAG.AA_TEXT,
  },

  {
    what: "error text on its soft fill",
    foreground: v("--danger"),
    background: v("--danger-soft"),
    required: WCAG.AA_TEXT,
  },
  {
    what: "error text on a panel",
    foreground: v("--danger"),
    background: v("--surface"),
    required: WCAG.AA_TEXT,
  },
  {
    what: "warning text on its soft fill",
    foreground: v("--warn"),
    background: v("--warn-soft"),
    required: WCAG.AA_TEXT,
  },
  {
    what: "warning text on a panel",
    foreground: v("--warn"),
    background: v("--surface"),
    required: WCAG.AA_TEXT,
  },

  // Topic wayfinding, each on its own tile and on the panel behind it.
  ...(
    [
      ["flood risk", "--topic-flood-text", "--topic-flood-tile"],
      ["drought", "--topic-drought-text", "--topic-drought-tile"],
      ["rangeland", "--topic-range-text", "--topic-range-tile"],
      ["food security", "--topic-food-text", "--topic-food-tile"],
    ] as const
  ).flatMap(([label, text, tile]) => [
    {
      what: `${label} accent on its tile`,
      foreground: v(text),
      background: v(tile),
      required: WCAG.AA_TEXT,
    },
    {
      what: `${label} accent on a panel`,
      foreground: v(text),
      background: v("--surface"),
      required: WCAG.AA_TEXT,
    },
  ]),

  // The map pair. Only the separation between the two strokes is a fixed
  // guarantee; their ratios against tiles depend on the tile and are checked
  // by the script in the scratchpad, not here, because a basemap is not ours.
  {
    what: "map geometry stroke against its casing",
    foreground: v("--geo-stroke"),
    background: v("--geo-casing"),
    required: WCAG.NON_TEXT,
  },

  // Border legibility. --border is deliberately absent against
  // --surface-header: it is 1.41:1 there, which is why that surface takes
  // --border-strong instead, and this pair pins that rule.
  {
    what: "strong border on a panel header",
    foreground: v("--border-strong"),
    background: v("--surface-header"),
    required: 1.5,
  },
  {
    what: "border on a panel",
    foreground: v("--border"),
    background: v("--surface"),
    required: 1.5,
  },
  {
    what: "border on the page",
    foreground: v("--border"),
    background: v("--page"),
    required: 1.5,
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
