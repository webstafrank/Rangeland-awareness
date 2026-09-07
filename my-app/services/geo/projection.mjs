/**
 * The map projection, and the ONLY implementation of it in the repo.
 *
 * Two callers need identical projection maths:
 *
 *   1. `scripts/build-counties.mjs`, which bakes every county boundary into an
 *      SVG path string at build time.
 *   2. `services/geo/index.ts`, whose `project()` is called at runtime to place
 *      labels, markers and overlay cells on top of those baked paths.
 *
 * If those two ever drift by even a fraction of a degree, projected points land
 * outside the shape they belong to and nothing in the UI looks obviously broken:
 * a label just sits in the wrong county. That failure is silent, which is why
 * there is one module rather than two copies. It is written in plain Node ESM
 * (`.mjs`) because the build script runs under bare `node` with no compiler, and
 * `projection.ts` re-exports it so the TypeScript side gets the same functions
 * with contract types attached.
 *
 * The projection is equirectangular (plate carree) with a longitude correction:
 * longitude is multiplied by cos(mean latitude of the fitted bounds) before
 * scaling. A raw equirectangular projection treats one degree of longitude as
 * one degree of latitude, which is only true at the equator; Kenya straddles the
 * equator (lat -4.7 to 5.5) so the error is small but visible, and the corrected
 * form makes the country read at roughly its true width. It is not equal-area
 * and is not meant for measuring: this is a choropleth backdrop, and area
 * comparison in the app is done from tabulated numbers, never by eyeballing
 * polygon size.
 *
 * The maths is deliberately derived from `frame.width` and `frame.bounds` alone,
 * with no stored scale factor, so a frame value that has been serialised into the
 * generated data file and read back cannot disagree with a frame computed live.
 */

/**
 * Longitude compression factor for a set of bounds: cos of the mean latitude.
 *
 * Clamped away from zero so a degenerate set of bounds (a single point, or a
 * band at a pole, neither of which can occur for Kenya but both of which are
 * cheap to guard) cannot produce a divide-by-zero scale.
 *
 * @param {readonly [number, number, number, number]} bounds [minLon, minLat, maxLon, maxLat]
 * @returns {number}
 */
export function lonScale(bounds) {
  const meanLat = (bounds[1] + bounds[3]) / 2;
  return Math.max(Math.cos((meanLat * Math.PI) / 180), 1e-6);
}

/**
 * Pixels of frame per corrected degree, for a frame. Derived from the width so
 * that the horizontal fit is exact and the vertical extent follows from the
 * aspect ratio rather than being chosen independently (which is what stretches
 * a map).
 *
 * @param {{ width: number, bounds: readonly [number, number, number, number] }} frame
 * @returns {number}
 */
export function frameScale(frame) {
  const [minLon, , maxLon] = frame.bounds;
  const spanX = (maxLon - minLon) * lonScale(frame.bounds);
  return frame.width / spanX;
}

/**
 * Builds a `MapFrame` that fits `bounds` exactly into `width`, deriving the
 * height from the projected aspect ratio.
 *
 * The height is rounded to one decimal only for a tidy viewBox string; nothing
 * in `projectPoint` or `unprojectPoint` reads it, so the rounding cannot move a
 * single coordinate.
 *
 * @param {readonly [number, number, number, number]} bounds [minLon, minLat, maxLon, maxLat]
 * @param {number} width
 * @returns {{ width: number, height: number, bounds: readonly [number, number, number, number] }}
 */
export function makeFrame(bounds, width) {
  const spanY = bounds[3] - bounds[1];
  const height = Math.round(spanY * (width / ((bounds[2] - bounds[0]) * lonScale(bounds))) * 10) / 10;
  return { width, height, bounds };
}

/**
 * Projects [lon, lat] into frame coordinates.
 *
 * Y is flipped (max latitude maps to y = 0) because SVG's y axis grows downward
 * while latitude grows northward. Forgetting that flip produces a map of Kenya
 * upside down, which is at least loud enough to notice.
 *
 * @param {{ width: number, bounds: readonly [number, number, number, number] }} frame
 * @param {readonly [number, number]} lonLat
 * @returns {[number, number]}
 */
export function projectPoint(frame, lonLat) {
  const [minLon, , , maxLat] = frame.bounds;
  const scale = frameScale(frame);
  const k = lonScale(frame.bounds);
  return [(lonLat[0] - minLon) * k * scale, (maxLat - lonLat[1]) * scale];
}

/**
 * The exact inverse of `projectPoint`: frame coordinates back to [lon, lat].
 *
 * Needed because the overlay grid is laid out in frame space (so cells tile the
 * screen evenly) but indicator values are looked up geographically, so each
 * cell centre has to be turned back into a real coordinate.
 *
 * @param {{ width: number, bounds: readonly [number, number, number, number] }} frame
 * @param {readonly [number, number]} xy
 * @returns {[number, number]}
 */
export function unprojectPoint(frame, xy) {
  const [minLon, , , maxLat] = frame.bounds;
  const scale = frameScale(frame);
  const k = lonScale(frame.bounds);
  return [xy[0] / (scale * k) + minLon, maxLat - xy[1] / scale];
}
