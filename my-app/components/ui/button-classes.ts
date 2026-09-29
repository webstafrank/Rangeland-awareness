/**
 * The Fluent button skin, as Tailwind classes, for LINKS that look like buttons.
 *
 * A real `<button>` in this app is a Fluent `Button` (see Button.tsx). A link
 * cannot be: Fluent's Button renders its own `<a>` when asked, which throws
 * away Next's `<Link>` (client navigation, prefetch, typed routes). Continue,
 * Back, Start and every other forward control in the wizard is a navigation,
 * so it stays a `<Link>` and wears this recipe instead.
 *
 * The values are Fluent's own, read off `webLightTheme` through the app's
 * tokens rather than approximated: primary is colorBrandBackground and its
 * hover/pressed steps, secondary is colorNeutralBackground1 on a
 * colorNeutralStroke1 border, subtle has no chrome until hovered. Sizes match
 * Fluent's small/medium/large: 24/32/40px minimum height, borderRadiusMedium.
 *
 * Kept in a plain module, not beside the "use client" Button, so a server
 * component can call it. A function exported from a client module is a
 * client reference on the server and cannot be called there.
 */

export type ButtonAppearance = "primary" | "secondary" | "subtle";
export type ButtonScale = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-1.5 rounded-fluent-medium border " +
  "font-semibold whitespace-nowrap no-underline select-none " +
  "transition-colors duration-100 " +
  "aria-disabled:pointer-events-none aria-disabled:border-edge aria-disabled:bg-sunken aria-disabled:text-ink-faint";

const scales: Record<ButtonScale, string> = {
  sm: "min-h-6 px-2 py-0.5 type-caption1 font-normal",
  md: "min-h-8 px-3 py-[5px] type-body1",
  lg: "min-h-10 px-4 py-2 type-body2 font-semibold",
};

const appearances: Record<ButtonAppearance, string> = {
  primary:
    "border-transparent bg-accent text-white hover:bg-accent-hover active:bg-accent-pressed",
  secondary:
    "border-edge-strong bg-surface text-ink hover:bg-page active:bg-edge",
  subtle:
    "border-transparent bg-transparent text-ink-muted hover:bg-page hover:text-ink active:bg-edge",
};

export function buttonClasses({
  appearance = "secondary",
  size = "md",
  block = false,
  className = "",
}: {
  appearance?: ButtonAppearance;
  size?: ButtonScale;
  block?: boolean;
  className?: string;
} = {}): string {
  return [base, scales[size], appearances[appearance], block ? "w-full" : "", className]
    .filter(Boolean)
    .join(" ");
}
