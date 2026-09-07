/**
 * Types for `projection.mjs`.
 *
 * The implementation is plain Node ESM so that `scripts/build-counties.mjs` can
 * import it under bare `node`, with no compile step and no dependencies. This
 * declaration file is what lets the TypeScript side import the same module
 * without losing the contract's `readonly` tuple shapes, which JSDoc in a `.mjs`
 * file expresses only awkwardly. It is signatures only: there is still exactly
 * one implementation.
 */

/** [minLon, minLat, maxLon, maxLat] */
export type GeoBounds = readonly [number, number, number, number];

/** Structurally the `MapFrame` of `contracts/geo.ts`, restated here so this
 * declaration file stays importable from plain Node without the alias. */
export interface ProjectionFrame {
  readonly width: number;
  readonly height: number;
  readonly bounds: GeoBounds;
}

/** The part of a frame the projection maths actually reads. */
export type ProjectionInput = {
  readonly width: number;
  readonly bounds: GeoBounds;
};

export function lonScale(bounds: GeoBounds): number;
export function frameScale(frame: ProjectionInput): number;
export function makeFrame(bounds: GeoBounds, width: number): ProjectionFrame;
export function projectPoint(frame: ProjectionInput, lonLat: readonly [number, number]): [number, number];
export function unprojectPoint(frame: ProjectionInput, xy: readonly [number, number]): [number, number];
