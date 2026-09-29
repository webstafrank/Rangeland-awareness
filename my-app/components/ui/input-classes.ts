/**
 * Fluent's outline `Input` skin, for native inputs that have to stay native.
 *
 * The wizard's coordinate and radius fields are addressed by their labels in
 * the eval suite and driven by Enter-key handlers written against a plain
 * `<input>`, so they are not swapped for Fluent's `Input` (which wraps the
 * element in a span and changes the `onChange` signature). They wear its look
 * instead: colorNeutralStroke1 on three sides, the darker
 * colorNeutralStrokeAccessible along the bottom so the field reads at 3:1
 * against the card, and a brand bottom edge while focused, which is Fluent's
 * own focus affordance for a text field. The app-wide focus ring still draws
 * on keyboard focus, as the design system requires.
 */
export function inputClasses({
  size = "md",
  mono = false,
  className = "",
}: { size?: "md" | "lg"; mono?: boolean; className?: string } = {}): string {
  return [
    "w-full rounded-fluent-medium border border-edge-strong border-b-edge-input bg-surface text-ink",
    "placeholder:text-ink-faint focus:border-b-accent",
    "disabled:cursor-not-allowed disabled:border-edge disabled:bg-page disabled:text-ink-faint",
    size === "lg" ? "h-10 px-3 type-body2" : "h-8 px-2.5 type-body1",
    mono ? "font-mono" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
}
