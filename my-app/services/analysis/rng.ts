/**
 * The seeded pseudo random number generator every synthetic number comes from.
 *
 * Why hand-written rather than a dependency: the contract promises that a run is
 * a pure function of its config, in any process, on any machine, forever. That
 * promise is only as strong as the generator behind it, so the generator lives
 * here, in fifteen lines, pinned by tests that assert its exact output for a
 * known seed. A library upgrade cannot silently change a shared result URL.
 *
 * mulberry32: 32-bit state, period 2^32, good enough spread for a scaffold and
 * cheap enough to call a few thousand times per run for the map overlay.
 */

/** A stateful stream of numbers in [0, 1). */
export type Rng = () => number;

/**
 * mulberry32. `seed` is coerced to a uint32, so any integer works, including the
 * output of `fnv1a32`.
 */
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
 * Used where a flat distribution would look wrong (area levels, noise terms):
 * counties cluster around the middle of a domain rather than spreading evenly
 * across it. Not a true Gaussian, and does not need to be.
 */
export function bell(rng: Rng): number {
  return (rng() + rng() + rng()) / 3;
}

/** Symmetric bell-shaped draw in (-1, 1), mean 0. */
export function signedBell(rng: Rng): number {
  return bell(rng) * 2 - 1;
}

/**
 * `count` distinct integers from [0, n), ascending. Drawn by partial
 * Fisher-Yates over an index array, so the result depends only on the stream and
 * never loops waiting for a free slot.
 */
export function pickDistinct(rng: Rng, count: number, n: number): readonly number[] {
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

/** Clamps `value` into [lo, hi]. Here rather than in a util file: every generator needs it. */
export function clamp(value: number, lo: number, hi: number): number {
  if (value < lo) return lo;
  if (value > hi) return hi;
  return value;
}

/** Rounds to `places` decimals without the float drift of `toFixed` round-tripping. */
export function roundTo(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}
