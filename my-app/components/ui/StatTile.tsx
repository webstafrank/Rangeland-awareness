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
  /**
   * The dense shape, for a row of three or four figures (the Overview's "At a
   * glance" row, About): label, figure a step smaller, one caption line.
   * No delta and no ruled footnote.
   */
  compact?: boolean;
}

const arrows = { up: "▲", down: "▼", flat: "▬" } as const;
const senseWord = { good: "improving", bad: "worsening", neutral: "little change" } as const;
const senseChip = {
  good: "bg-success-soft text-success",
  bad: "bg-danger-soft text-danger",
  neutral: "bg-sunken text-ink-muted",
} as const;

/**
 * A metric card: label, value with its unit, an optional change, and the
 * qualifier that says where the number came from.
 *
 * The label is caption1 strong in the muted ink, the value title2 (title1
 * when it is the one number the screen is for) in ink, never brand: brand
 * marks the one action a view exists for, and a number is not an action. The
 * unit is a separate element at body size so the eye lands on the magnitude
 * first, and so a screen reader reads the two as one phrase. Tabular figures,
 * because tiles sit side by side and their digits should align.
 *
 * The qualifier sits on the card's floor behind a hairline (`mt-auto`) and
 * reserves two caption lines (`min-h-11`), so across a row the hairlines sit
 * at one height whether a footnote runs to one line or two. A change is a
 * tinted chip with an arrow AND a word; the tint repeats what the word says
 * rather than carrying it.
 *
 * Renders as a `dt`/`dd` group inside a wrapping `div`, so a row of tiles can
 * sit in one `<dl>` and a screen reader hears each as a term and its value.
 * Not interactive, so it has no hover state.
 */
export function StatTile({
  label,
  value,
  unit,
  detail,
  delta,
  emphasis = false,
  compact = false,
}: StatTileProps) {
  if (compact) {
    // The Overview's "At a glance" shape: label, figure a step smaller, one
    // caption line, tighter padding, so three or four fit one row.
    return (
      <div className="card flex h-full min-w-0 flex-col p-3 sm:p-4">
        <dt className="type-caption1 min-w-0 break-words text-ink-faint">{label}</dt>
        <dd className="mt-0.5 flex min-w-0 flex-wrap items-baseline gap-x-1 text-ink tabular-nums">
          <span className="type-title3 min-w-0 break-words sm:type-title2">{value}</span>
          {unit ? <span className="type-body1 text-ink-faint">{unit}</span> : null}
        </dd>
        {detail ? (
          <dd className="type-caption1 min-w-0 break-words text-ink-muted">{detail}</dd>
        ) : null}
      </div>
    );
  }

  // The gap above the footnote: a floor of 12px, then `mt-auto` on the
  // footnote takes whatever height the row adds.
  const beforeDetail = detail ? "mb-3" : "";
  return (
    <div className="card flex h-full min-w-0 flex-col p-4">
      <dt className="type-caption1 font-semibold text-ink-muted">{label}</dt>

      <dd className={`mt-1.5 flex min-w-0 ${delta ? "" : beforeDetail} flex-wrap items-baseline gap-x-1 text-ink tabular-nums`}>
        <span className={`${emphasis ? "type-title1" : "type-title2"} min-w-0 break-words`}>{value}</span>
        {unit ? <span className="type-body1 text-ink-faint">{unit}</span> : null}
      </dd>

      {delta ? (
        <dd className={`mt-2 ${beforeDetail}`}>
          <span
            className={`type-caption1 inline-flex items-center gap-1 rounded-fluent-small px-1.5 py-0.5 font-semibold ${senseChip[delta.sense]}`}
          >
            <span aria-hidden="true" className="text-[0.75em] leading-none">
              {arrows[delta.direction]}
            </span>
            {delta.text}
            <span className="font-normal">({senseWord[delta.sense]})</span>
          </span>
        </dd>
      ) : null}

      {detail ? (
        <dd className="type-caption1 mt-auto min-h-11 border-t border-edge pt-2.5 text-ink-faint tabular-nums">
          {detail}
        </dd>
      ) : null}
    </div>
  );
}
