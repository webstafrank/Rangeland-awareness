import type { Severity } from "@/contracts/catalog";
import { severityGlyph, status } from "@/design/tokens";
import type { Tone } from "./tone";

interface SeverityChipProps {
  severity: Severity;
  /** The band label, e.g. "Severe vegetation deficit". Always rendered. */
  label: string;
  tone?: Tone;
  size?: "sm" | "md";
}

/**
 * A severity always ships as glyph plus colour plus text label, never colour
 * alone.
 *
 * That is not a stylistic preference. On a light ground `warning` (1.83:1) and
 * `serious` (2.64:1) sit below the 3:1 mark threshold by design, because they
 * come from a fixed reserved status scale that is tuned for a dark surface. The
 * documented mitigation for a sub-3:1 status colour is the icon plus label
 * pairing, so this component has no way to render without its label: there is
 * no `showLabel` prop to forget to pass.
 *
 * The colour is applied to the glyph and the border, never to the label text.
 * Text wears text tokens; a coloured mark beside it carries the identity.
 */
export function SeverityChip({ severity, label, tone = "light", size = "md" }: SeverityChipProps) {
  const ink = tone === "dark" ? "text-ink-dark-primary" : "text-ink-light-primary";
  const chrome = tone === "dark" ? "bg-white/8 border-white/20" : "bg-navy-900/4 border-navy-900/15";
  const dims = size === "sm" ? "gap-1.5 px-2 py-0.5 text-micro" : "gap-2 px-2.5 py-1 text-caption";

  return (
    <span
      className={`inline-flex items-center rounded border font-semibold ${dims} ${chrome} ${ink}`}
    >
      <span aria-hidden="true" style={{ color: status[severity] }} className="text-[0.7em] leading-none">
        {severityGlyph[severity]}
      </span>
      {label}
    </span>
  );
}
