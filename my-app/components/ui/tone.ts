/**
 * `Tone` is which ground a component is sitting on, not a user preference.
 *
 * The old four-colour system alternated dark-blue and white sections, so the
 * same button could appear on either ground within one scroll, and every
 * component that could appear on both took an explicit `tone`.
 *
 * The Fluent redesign has one light theme and no dark band: the header, the
 * footer and the hero are all light neutral chrome with dark ink. `dark` is
 * kept as a value so existing call sites and the chart module still type-check,
 * but every kit component now renders the same Fluent light skin for both.
 * Nothing in the app passes `dark` any more.
 */
export type Tone = "dark" | "light";

/** The ground each tone sits on: Fluent's colorNeutralBackground1 for both. */
export const toneGround: Readonly<Record<Tone, string>> = {
  dark: "var(--color-surface)",
  light: "var(--color-surface)",
};

/** Flip a tone, for a nested panel that inverts its parent band. */
export function invert(tone: Tone): Tone {
  return tone === "dark" ? "light" : "dark";
}
