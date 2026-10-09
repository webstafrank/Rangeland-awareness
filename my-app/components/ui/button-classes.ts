/**
 * The Fluent button skin, as Tailwind classes, for LINKS that look like buttons.
 *
 * A real `<button>` in this app is a Fluent `Button` (see Button.tsx). A link
 * cannot be: Fluent's Button renders its own `<a>` when asked, which throws
 * away Next's `<Link>` (client navigation, prefetch, typed routes). Continue,
 * Back, Start and every other forward control in the wizard is a navigation,
 * so it stays a `<Link>` and wears this recipe instead.
 *
 * Every number is read off @fluentui/react-button's own styles under the
 * app theme (lib/theme/fluent-theme.ts), so a link and a button side by side
 * cannot be told apart:
 *
 *   size    min-height  min-width  padding-x  type              weight
 *   small   24px        64px       8px        12/16 caption1    regular
 *   medium  32px        96px       12px       14/20 body1       semibold
 *   large   40px        96px       16px       16/22 body2       semibold
 *
 * Height comes from `min-h-*` with no vertical padding: Fluent reaches the
 * same 24/32/40 through padding plus line height plus a 1px border, and the
 * link is `whitespace-nowrap`, so the two land on the same pixel. Radius is
 * borderRadiusMedium (6px), the icon gap spacingHorizontalSNudge (6px), the
 * transition Fluent's durationFaster (100ms) on colour only.
 *
 * Focus copies Fluent's ring rather than the app's offset outline: a 1px
 * accent border plus a 1px inset, and on primary a 2px white inset inside it.
 * The global `:focus-visible` rule in globals.css is unlayered, so it beats
 * any Tailwind utility; the `!` on the outline and radius overrides is what
 * lets the Fluent ring win here, exactly as Griffel's selector wins on the
 * real button. The outline goes transparent rather than away, which keeps it
 * visible in forced-colours mode, as Fluent does.
 *
 * Hover and pressed grounds: primary uses the brand ramp steps Fluent uses
 * (70 hover, 40 pressed). Secondary and subtle use the nearest app tokens to
 * Fluent's neutral hover (#f5f5f5, here `page`) and pressed (#e0e0e0, here
 * `sunken`), because the theme does not override those two neutrals.
 *
 * Kept in a plain module, not beside the "use client" Button, so a server
 * component can call it. A function exported from a client module is a
 * client reference on the server and cannot be called there.
 */

export type ButtonAppearance = "primary" | "secondary" | "subtle";
export type ButtonScale = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-1.5 rounded-fluent-medium border py-0 " +
  "whitespace-nowrap no-underline select-none align-middle " +
  "transition-colors duration-100 ease-in-out " +
  "focus-visible:rounded-fluent-medium! focus-visible:outline-transparent! focus-visible:border-accent " +
  "aria-disabled:pointer-events-none aria-disabled:border-edge aria-disabled:bg-sunken aria-disabled:text-ink-faint";

const scales: Record<ButtonScale, string> = {
  sm: "min-h-6 min-w-16 px-2 type-caption1 font-normal",
  md: "min-h-8 min-w-24 px-3 type-body1 font-semibold",
  lg: "min-h-10 min-w-24 px-4 type-body2 font-semibold",
};

const appearances: Record<ButtonAppearance, string> = {
  primary:
    "border-transparent bg-accent text-white hover:bg-accent-hover active:bg-accent-pressed " +
    "focus-visible:shadow-[inset_0_0_0_2px_var(--color-surface)]",
  secondary:
    "border-edge-strong bg-surface text-ink hover:bg-page active:bg-sunken " +
    "focus-visible:shadow-[inset_0_0_0_1px_var(--color-accent)]",
  subtle:
    "border-transparent bg-transparent text-ink-muted hover:bg-page hover:text-ink active:bg-sunken " +
    "[&:hover>svg]:text-accent focus-visible:shadow-[inset_0_0_0_1px_var(--color-accent)]",
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
