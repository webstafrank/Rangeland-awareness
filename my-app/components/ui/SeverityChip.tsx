import type { Severity } from "@/contracts/catalog";
import { severityGlyph, status } from "@/design/tokens";
import type { Tone } from "./tone";

interface SeverityChipProps {
  severity: Severity;
  /** The band label, e.g. "Severe vegetation deficit". Always rendered. */
  label: string;
  /** Accepted for compatibility. There is one light theme. */
  tone?: Tone;
  size?: "sm" | "md";
}

/**
 * A severity always ships as glyph plus colour plus text label, never colour
 * alone.
 *
 * That is not a stylistic preference. On a light ground `warning` (1.83:1) and
 * `serious` (2.64:1) sit below the 3:1 mark threshold by design, because they
 * come from a fixed reserved status scale. The documented mitigation for a
 * sub-3:1 status colour is the icon plus label pairing, so this component has
 * no way to render without its label: there is no `showLabel` prop to forget.
 *
 * Shaped as a Fluent `Badge` in the tint appearance with neutral colours:
 * the severity colour rides the glyph only, and the label wears ink. The
 * reserved scale is data, not chrome, so it never becomes the badge's fill.
 */
export function SeverityChip({ severity, label, size = "md" }: SeverityChipProps) {
  const dims = size === "sm" ? "gap-1 px-1.5 type-caption2" : "gap-1.5 px-2 py-0.5 type-caption1";

  return (
    <span
      className={`inline-flex items-center rounded-fluent-small border border-edge bg-page font-semibold text-ink ${dims}`}
    >
      <span aria-hidden="true" style={{ color: status[severity] }} className="text-[0.8em] leading-none">
        {severityGlyph[severity]}
      </span>
      {label}
    </span>
  );
}
