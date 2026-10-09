/**
 * The Fluent theme, built from the app's own palette.
 *
 * Fluent components read their colours, radii and type from the theme passed
 * to FluentProvider, not from Tailwind. Left on `webLightTheme`, every Fluent
 * Button, Input, Tab and MessageBar paints Fluent's stock Communication Blue
 * (#0f6cbd) and its grey neutrals beside Tailwind-styled controls in the
 * app's own navy blue, and a control visibly changes colour depending on
 * which library drew it.
 *
 * So the theme is derived from the palette: a 16-step brand ramp whose step
 * 80 IS `--color-accent` (Fluent's colorBrandBackground), and a handful of
 * neutral overrides so Fluent text, strokes and radii match the Tailwind
 * tokens. `__tests__/fluent-theme.test.ts` asserts the pins, so changing the
 * accent in palette.ts without changing the ramp fails the gate.
 */

import { createLightTheme, type BrandVariants, type Theme } from "@fluentui/react-components";
import { token } from "./palette";

/**
 * The brand ramp, dark to light. Fluent maps its brand slots onto these:
 * 80 is the primary fill, 70 hover and link text, 40 pressed, 60 selected,
 * 160 the selected-row wash.
 */
export const BRAND_RAMP: BrandVariants = {
  10: "#030a18",
  20: "#071733",
  30: "#0a2149",
  40: "#0d2a5e",
  50: "#103473",
  60: "#133f8c",
  70: "#184fae",
  80: "#1d5bc6",
  90: "#3a70d0",
  100: "#5585d9",
  110: "#6f99e1",
  120: "#89ade8",
  130: "#a3c1ee",
  140: "#bdd4f4",
  150: "#d6e5f9",
  160: "#ebf2fd",
};

const FONT_SANS =
  'var(--font-geist-sans), "Segoe UI", -apple-system, BlinkMacSystemFont, Roboto, "Helvetica Neue", sans-serif';
const FONT_MONO =
  'var(--font-geist-mono), Consolas, "Cascadia Mono", "Courier New", monospace';

export const appTheme: Theme = {
  ...createLightTheme(BRAND_RAMP),

  fontFamilyBase: FONT_SANS,
  fontFamilyMonospace: FONT_MONO,
  fontFamilyNumeric: FONT_SANS,

  // Radii, mirrored from the --radius-fluent-* tokens in globals.css.
  borderRadiusSmall: "4px",
  borderRadiusMedium: "6px",
  borderRadiusLarge: "8px",
  borderRadiusXLarge: "10px",

  // Text, so Fluent's own labels use the app's navy-black ink ramp.
  colorNeutralForeground1: token("--color-ink"),
  colorNeutralForeground2: token("--color-ink-muted"),
  colorNeutralForeground3: token("--color-ink-faint"),

  // Grounds and strokes.
  colorNeutralBackground1: token("--color-surface"),
  colorNeutralBackground2: token("--color-surface-subtle"),
  colorNeutralBackground3: token("--color-page"),
  colorNeutralBackground4: token("--color-sunken"),
  colorNeutralStroke1: token("--color-edge-strong"),
  colorNeutralStroke2: token("--color-edge"),
  colorNeutralStrokeAccessible: token("--color-edge-input"),

  // The focus ring, the same accent the Tailwind :focus-visible rule draws.
  colorStrokeFocus2: token("--color-accent"),

  // Disabled, the same recipe as the Tailwind controls' disabled state
  // (button-classes.ts, footer-controls.ts): sunken ground, hairline edge,
  // faint ink. Fluent's own greys made a disabled "Add area" a different grey
  // from the disabled "Continue" beside it.
  colorNeutralBackgroundDisabled: token("--color-sunken"),
  colorNeutralForegroundDisabled: token("--color-ink-faint"),
  colorNeutralStrokeDisabled: token("--color-edge"),
};
