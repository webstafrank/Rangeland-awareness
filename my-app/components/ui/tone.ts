/**
 * `Tone` is which band a component is sitting on, not a user preference.
 *
 * This app alternates dark-blue and white sections, so the same button can
 * appear on either ground within one scroll. A media query cannot know which,
 * and a CSS `currentColor` trick only solves text, not borders and fills. So
 * every component that can appear on both grounds takes an explicit `tone`.
 *
 * The payoff: a component's colours are a pure function of its props, which
 * means a test can assert them and a reviewer can read them.
 */
export type Tone = "dark" | "light";

/** The ground colour each tone sits on, for components that need to know. */
export const toneGround: Readonly<Record<Tone, string>> = {
  dark: "var(--color-navy-900)",
  light: "var(--color-white)",
};

/** Flip a tone, for a nested panel that inverts its parent band. */
export function invert(tone: Tone): Tone {
  return tone === "dark" ? "light" : "dark";
}
