import type { ReactNode } from "react";
import type { Tone } from "./tone";

interface StatTileProps {
  /** What the number is. Short, and it must include no unit. */
  label: string;
  /** The formatted number, without its unit. */
  value: string;
  /** The unit, set smaller beside the value. Never folded into `value`. */
  unit?: string;
  /** The interval or qualifier under the value, e.g. "30% hold-out, n = 276". */
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
  /** Accepted for compatibility. There is one light theme. */
  tone?: Tone;
  /** Marks this as the screen's single most important number. */
  emphasis?: boolean;
}

const arrows = { up: "▲", down: "▼", flat: "▬" } as const;
const senseWord = { good: "improving", bad: "worsening", neutral: "little change" } as const;

/**
 * A headline figure, the design system's ModelMetrics KPI card.
 *
 * Label in caption1 above, value in title1 (largeTitle when it is the one
 * number the screen is for), qualifier in caption1 below, all in the neutral
 * foregrounds. The value is ink, not brand: brand marks the one action a view
 * exists for, and a number is not an action.
 *
 * The unit is a separate element at body size so the eye lands on the
 * magnitude first, and so a screen reader reads the two as one phrase. Tabular
 * figures, because tiles sit side by side and their digits should align.
 *
 * Renders as a `dt`/`dd` pair inside a wrapping `div`, so a row of tiles can
 * sit in one `<dl>` and a screen reader hears each as a term and its value.
 */
export function StatTile({ label, value, unit, detail, delta, emphasis = false }: StatTileProps) {
  return (
    <div className="card flex min-w-0 flex-col gap-1 p-4">
      <dt className="type-caption1 text-ink-faint">{label}</dt>

      <dd className="flex items-baseline gap-1 text-ink tabular-nums">
        <span className={emphasis ? "type-large-title" : "type-title1"}>{value}</span>
        {unit ? <span className="type-body1 text-ink-muted">{unit}</span> : null}
      </dd>

      {delta ? (
        <dd className="type-caption1 flex items-center gap-1.5 text-ink-muted">
          <span aria-hidden="true" className="text-[0.75em]">
            {arrows[delta.direction]}
          </span>
          <span>{delta.text}</span>
          <span className="text-ink-faint">({senseWord[delta.sense]})</span>
        </dd>
      ) : null}

      {detail ? <dd className="type-caption1 text-ink-faint tabular-nums">{detail}</dd> : null}
    </div>
  );
}
