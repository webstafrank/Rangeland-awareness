/**
 * Chart scale maths.
 *
 * Deterministic space: axis ticks and point positions are arithmetic, so they
 * live in a tested module rather than inline in a component. Getting
 * `niceTicks` wrong is the difference between an axis reading 0 / 1000 / 2000
 * and one reading 0 / 1037 / 2074, and that is not something to eyeball in a
 * browser.
 */

/**
 * Rounds a raw domain out to clean tick values.
 *
 * The step is snapped to 1, 2, 2.5, 5 or 10 times a power of ten, which is the
 * set humans read without effort. `count` is a target, not a guarantee: the
 * returned array is whatever that step produces across the padded domain.
 */
export function niceTicks(min: number, max: number, count = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];

  // A flat series has no range to divide. Give it one tick at its own value so
  // the axis is not blank, rather than dividing by zero below.
  if (min === max) return [min];
  if (min > max) [min, max] = [max, min];

  const rawStep = (max - min) / Math.max(1, count);
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalised = rawStep / magnitude;

  const step =
    (normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 2.5 ? 2.5 : normalised <= 5 ? 5 : 10) *
    magnitude;

  const start = Math.floor(min / step) * step;
  const end = Math.ceil(max / step) * step;

  const ticks: number[] = [];
  // Accumulating with multiplication rather than `+= step` keeps floating
  // point drift from turning 0.30000000000000004 into a tick label.
  for (let i = 0; start + i * step <= end + step / 1e6; i += 1) {
    ticks.push(round(start + i * step));
  }
  return ticks;
}

/** Trims binary-float noise without changing any value a reader would notice. */
function round(value: number): number {
  return Math.round(value * 1e9) / 1e9;
}

/**
 * The domain to plot, given the data and an optional hard clamp.
 *
 * Padded by 8% of the range so a line never runs along the frame edge, then
 * clamped to `bounds` when the indicator has a real floor and ceiling: a
 * vegetation index cannot be negative, and padding it below zero would invent
 * territory the indicator does not have.
 */
export function plotDomain(
  values: readonly (number | null)[],
  bounds?: readonly [number, number],
): [number, number] {
  const present = values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (present.length === 0) return bounds ? [bounds[0], bounds[1]] : [0, 1];

  let min = Math.min(...present);
  let max = Math.max(...present);

  if (min === max) {
    // A flat series still needs height, or it renders as a line on the floor.
    const pad = Math.abs(min) > 0 ? Math.abs(min) * 0.1 : 1;
    min -= pad;
    max += pad;
  } else {
    const pad = (max - min) * 0.08;
    min -= pad;
    max += pad;
  }

  if (bounds) {
    min = Math.max(min, bounds[0]);
    max = Math.min(max, bounds[1]);
  }

  return [round(min), round(max)];
}

/** Maps a value in `domain` to a pixel position in `[0, size]`, y-flipped. */
export function scaleY(value: number, domain: readonly [number, number], size: number): number {
  const [min, max] = domain;
  if (max === min) return size / 2;
  return size - ((value - min) / (max - min)) * size;
}

/** Maps an index in `0..count-1` to a pixel position in `[0, size]`. */
export function scaleX(index: number, count: number, size: number): number {
  if (count <= 1) return size / 2;
  return (index / (count - 1)) * size;
}

/**
 * Splits a series into runs of consecutive non-null points.
 *
 * Nulls are gaps, not zeroes: a cloud-obscured month has no value, and drawing
 * a line straight through it would invent data. Each run becomes its own path,
 * so the line visibly breaks.
 */
export function contiguousRuns(
  values: readonly (number | null)[],
): { index: number; value: number }[][] {
  const runs: { index: number; value: number }[][] = [];
  let current: { index: number; value: number }[] = [];

  values.forEach((value, index) => {
    if (value === null || !Number.isFinite(value)) {
      if (current.length > 0) runs.push(current);
      current = [];
      return;
    }
    current.push({ index, value });
  });

  if (current.length > 0) runs.push(current);
  return runs;
}

/** Index of the tick nearest a pixel x, for the crosshair's snap. */
export function nearestIndex(px: number, count: number, size: number): number {
  if (count <= 1) return 0;
  const raw = Math.round((px / size) * (count - 1));
  return Math.min(count - 1, Math.max(0, raw));
}

/**
 * Which x-axis labels to draw, so they never collide.
 *
 * Every nth label where n is chosen from the available width. Returning
 * indices rather than pre-formatted strings keeps the formatting decision with
 * the caller, which knows whether the range wants months or years.
 */
export function labelIndices(count: number, maxLabels: number): number[] {
  if (count <= 0) return [];
  if (count <= maxLabels) return Array.from({ length: count }, (_, i) => i);

  const stride = Math.ceil(count / maxLabels);
  const picked: number[] = [];
  for (let i = 0; i < count; i += stride) picked.push(i);

  // The last point carries the current value, which is the one a reader looks
  // for, so it always gets a label even if the stride missed it.
  if (picked[picked.length - 1] !== count - 1) {
    if (count - 1 - picked[picked.length - 1] < stride / 2) picked.pop();
    picked.push(count - 1);
  }
  return picked;
}
