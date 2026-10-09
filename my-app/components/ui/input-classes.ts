/**
 * Fluent's outline `Input` skin, for native inputs that have to stay native.
 *
 * The wizard's coordinate and radius fields are addressed by their labels in
 * the eval suite and driven by Enter-key handlers written against a plain
 * `<input>`, so they are not swapped for Fluent's `Input` (which wraps the
 * element in a span and changes the `onChange` signature). They wear its look
 * instead, with the numbers read off @fluentui/react-input under the app
 * theme:
 *
 *   size    height  padding-x  type
 *   medium  32px    12px       14/20 body1
 *   large   40px    18px       16/22 body2
 *
 * colorNeutralStroke1 (`edge-strong`) on three sides, the darker
 * colorNeutralStrokeAccessible (`edge-input`) along the bottom so the field
 * reads at 3:1 against the card, borderRadiusMedium (6px). On focus Fluent
 * grows a 2px brand underline; here that is the accent bottom border plus a
 * 1px inset shadow under it. An invalid field takes the danger stroke on all
 * four sides, driven by the same `aria-invalid` a screen reader hears.
 *
 * The app-wide keyboard focus ring still draws, as the design system
 * requires: the underline is the Fluent cue, the ring is the accessible one.
 */
export function inputClasses({
  size = "md",
  mono = false,
  className = "",
}: { size?: "md" | "lg"; mono?: boolean; className?: string } = {}): string {
  return [
    "w-full rounded-fluent-medium border border-edge-strong border-b-edge-input bg-surface text-ink",
    "transition-colors duration-100 ease-in-out",
    "placeholder:text-ink-faint hover:border-b-ink-faint",
    "focus:border-b-accent focus:shadow-[inset_0_-1px_0_var(--color-accent)]",
    "aria-invalid:border-danger aria-invalid:focus:shadow-[inset_0_-1px_0_var(--color-danger)]",
    "disabled:cursor-not-allowed disabled:border-edge disabled:bg-page disabled:text-ink-faint",
    size === "lg" ? "h-10 px-4.5 type-body2" : "h-8 px-3 type-body1",
    mono ? "font-mono" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
}
