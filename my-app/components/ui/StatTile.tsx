import type { ReactNode } from "react";
import type { Tone } from "./tone";

interface StatTileProps {
  /** What the number is. Short, and it must include no unit. */
  label: string;
  /** The formatted number, without its unit. */
  value: string;
  /** The unit, set smaller beside the value. Never folded into `value`. */
  unit?: string;
  /** The interval or qualifier under the value, e.g. "90% CI 21.4 to 29.8". */
  detail?: ReactNode;
  /**
   * Change against the previous comparable window. `direction` is the arrow;
   * `sense` says whether that direction is good, which is NOT the same thing:
   * a rising vegetation index is an improvement, a rising flood probability is
   * not. Both are always rendered with an arrow glyph and a word, never colour
   * alone.
   */
  delta?: {
    text: string;
    direction: "up" | "down" | "flat";
    sense: "good" | "bad" | "neutral";
  };
  tone?: Tone;
  /** Marks this as the screen's single most important number. */
  emphasis?: boolean;
}

const arrows = { up: "▲", down: "▼", flat: "▬" } as const;
const senseWord = { good: "improving", bad: "worsening", neutral: "little change" } as const;

/**
 * A headline figure.
 *
 * The number uses proportional figures because it stands alone; only columns
 * that must align vertically get `tabular-nums`. The unit is a separate
 * element at a smaller size so the eye lands on the magnitude first and the
 * unit second, and so a screen reader reads them as one phrase.
 */
export function StatTile({
  label,
  value,
  unit,
  detail,
  delta,
  tone = "light",
  emphasis = false,
}: StatTileProps) {
  const labelInk = tone === "dark" ? "text-ink-dark-secondary" : "text-ink-light-secondary";
  const detailInk = tone === "dark" ? "text-ink-dark-muted" : "text-ink-light-muted";
  const valueInk = emphasis
    ? tone === "dark"
      ? "text-scarlet-ink-dark"
      : "text-scarlet-ink-light"
    : tone === "dark"
      ? "text-white"
      : "text-navy-900";
  const deltaInk = tone === "dark" ? "text-ink-dark-secondary" : "text-ink-light-secondary";

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <p className={`text-micro font-semibold tracking-[0.14em] uppercase ${labelInk}`}>{label}</p>

      <p className={`flex items-baseline gap-1.5 leading-none ${valueInk}`}>
        <span className={emphasis ? "text-5xl font-bold tracking-tight" : "text-3xl font-bold tracking-tight"}>
          {value}
        </span>
        {unit ? <span className="text-base font-semibold opacity-70">{unit}</span> : null}
      </p>

      {delta ? (
        <p className={`text-caption flex items-center gap-1.5 font-medium ${deltaInk}`}>
          <span aria-hidden="true" className="text-[0.75em]">
            {arrows[delta.direction]}
          </span>
          <span>{delta.text}</span>
          <span className={detailInk}>({senseWord[delta.sense]})</span>
        </p>
      ) : null}

      {detail ? <p className={`text-caption tabular ${detailInk}`}>{detail}</p> : null}
    </div>
  );
}
