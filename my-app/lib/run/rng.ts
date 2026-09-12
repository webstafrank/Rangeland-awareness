/**
 * The seeded pseudo-random generator every synthetic number comes from.
 *
 * Hand-written rather than pulled from npm because `run()` promises that a
 * config produces byte-identical output in any process, forever. That promise
 * is only as strong as the generator behind it, and a library upgrade that
 * changed one constant would silently repoint every shared result URL at
 * different numbers. Fifteen lines here, pinned by tests against a known seed,
 * cannot do that.
 *
 * mulberry32: 32-bit state, period 2^32. Cheap enough to call a few thousand
 * times a run, spread good enough for output nobody is betting money on.
 */

/** A stateful stream of numbers in [0, 1). */
export type Rng = () => number;

/** `seed` is coerced to uint32, so any integer works, `fnv1a32` output included. */
export function mulberry32(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Uniform draw in [lo, hi). */
export function uniform(rng: Rng, lo: number, hi: number): number {
  return lo + (hi - lo) * rng();
}

/**
 * Bell-shaped draw in [0, 1), mean 0.5, from the mean of three uniforms.
 *
 * Used wherever a flat distribution would look wrong. Areas cluster around the
 * middle of an indicator's domain rather than spreading evenly across it, and a
 * uniform draw makes every result page look like a random number generator,
 * which is exactly the impression this module has to avoid. Not a true
 * Gaussian, and does not need to be.
 */
export function bell(rng: Rng): number {
  return (rng() + rng() + rng()) / 3;
}

/** Symmetric bell-shaped draw in (-1, 1), mean 0. */
export function signedBell(rng: Rng): number {
  return bell(rng) * 2 - 1;
}

/**
 * `count` distinct integers from [0, n), ascending.
 *
 * Partial Fisher-Yates over an index array rather than "draw until you find a
 * free slot": the loop version's number of draws depends on collisions, so the
 * stream position after the call would vary and every later generator would
 * shift. Here the draw count is exactly `count`, whatever comes back.
 */
export function pickDistinct(
  rng: Rng,
  count: number,
  n: number,
): readonly number[] {
  const wanted = Math.max(0, Math.min(count, n));
  const pool = Array.from({ length: n }, (_, i) => i);
  for (let i = 0; i < wanted; i += 1) {
    const j = i + Math.floor(rng() * (n - i));
    const swap = pool[i];
    pool[i] = pool[j];
    pool[j] = swap;
  }
  return pool.slice(0, wanted).sort((a, b) => a - b);
}

/** Clamps `value` into [lo, hi]. Here rather than a util file: every generator needs it. */
export function clamp(value: number, lo: number, hi: number): number {
  if (value < lo) return lo;
  if (value > hi) return hi;
  return value;
}

/**
 * Rounds to `places` decimals.
 *
 * Naive on purpose: `roundTo(1.005, 2)` is 1, not 1.01, because 1.005 is
 * 1.00499999999999989 in binary floating point. Pinned in the tests with that
 * explanation so nobody "fixes" it with an epsilon and shifts every synthetic
 * value in the module. It only ever trims display values here, never money and
 * never anything that gets summed.
 */
export function roundTo(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}
