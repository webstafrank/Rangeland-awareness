import { sequential } from "@/design/tokens";
import type { Tone } from "@/components/ui/tone";

/**
 * Maps an indicator value to a step of the sequential ramp.
 *
 * The orientation is the part that matters. A single-hue ramp reads
 * "light means little, dark means a lot", so if it were applied raw, a dark
 * cell would mean a HIGH vegetation index, which is the healthy end. On a
 * drought map that is backwards: the eye should be pulled to the places in
 * trouble.
 *
 * So the ramp is oriented by the indicator's `badEnd`. Dark always means "more
 * concerning", whichever end of the domain that is, and the legend says so in
 * words rather than leaving the reader to work it out.
 */
export function rampFor(tone: Tone): readonly string[] {
  return sequential[tone];
}

export function stepIndex(
  value: number,
  domain: readonly [number, number],
  steps: number,
  badEnd: "low" | "high",
): number {
  const [min, max] = domain;
  if (!Number.isFinite(value) || max === min) return 0;

  const clamped = Math.min(max, Math.max(min, value));
  // `concern` runs 0 (fine) to 1 (worst), regardless of which end is bad.
  const fraction = (clamped - min) / (max - min);
  const concern = badEnd === "low" ? 1 - fraction : fraction;

  return Math.min(steps - 1, Math.max(0, Math.floor(concern * steps)));
}

export function colourFor(
  value: number,
  domain: readonly [number, number],
  badEnd: "low" | "high",
  tone: Tone,
): string {
  const ramp = rampFor(tone);
  return ramp[stepIndex(value, domain, ramp.length, badEnd)];
}

/**
 * Legend stops, least to most concerning, with the value range each covers.
 *
 * Returned as data rather than rendered inline so the legend and the cells
 * cannot disagree about which colour means what.
 */
export function legendStops(
  domain: readonly [number, number],
  badEnd: "low" | "high",
  tone: Tone,
): { colour: string; from: number; to: number }[] {
  const ramp = rampFor(tone);
  const [min, max] = domain;

  return ramp.map((colour, index) => {
    // Step 0 is always the least concerning colour. Which VALUES that
    // corresponds to flips with badEnd.
    const concernLow = index / ramp.length;
    const concernHigh = (index + 1) / ramp.length;

    const from = badEnd === "low" ? max - concernHigh * (max - min) : min + concernLow * (max - min);
    const to = badEnd === "low" ? max - concernLow * (max - min) : min + concernHigh * (max - min);

    return { colour, from: round(Math.min(from, to)), to: round(Math.max(from, to)) };
  });
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
