/**
 * Typed view of the shared projection.
 *
 * The maths lives in `projection.mjs` (see the long comment there for why the
 * projection is what it is). This file adds nothing but `contracts/geo` types on
 * top, so the runtime service and the build script provably run the same code
 * rather than two implementations that agree today.
 */
import type { MapFrame } from "@/contracts/geo";
import {
  frameScale as frameScaleImpl,
  lonScale as lonScaleImpl,
  makeFrame as makeFrameImpl,
  projectPoint as projectPointImpl,
  unprojectPoint as unprojectPointImpl,
} from "./projection.mjs";

/** [minLon, minLat, maxLon, maxLat], matching `Area.bbox` and `MapFrame.bounds`. */
export type GeoBounds = readonly [number, number, number, number];

/**
 * The part of a `MapFrame` the projection actually reads.
 *
 * Typed narrower than `MapFrame` on purpose: the height is derived from the
 * width and the bounds, so a function that consumed it could disagree with the
 * one that produced it. A `MapFrame` is structurally assignable here, so callers
 * just pass `geo.frame()`.
 */
export type ProjectionInput = {
  readonly width: number;
  readonly bounds: GeoBounds;
};

/** cos(mean latitude) for a set of bounds: the longitude correction factor. */
export const lonScale: (bounds: GeoBounds) => number = lonScaleImpl;

/** Frame units per corrected degree of longitude. */
export const frameScale: (frame: ProjectionInput) => number = frameScaleImpl;

/** Fits `bounds` into `width`, deriving height from the projected aspect ratio. */
export const makeFrame: (bounds: GeoBounds, width: number) => MapFrame = makeFrameImpl;

/** Projects [lon, lat] into frame coordinates. */
export const projectPoint: (
  frame: ProjectionInput,
  lonLat: readonly [number, number],
) => readonly [number, number] = projectPointImpl;

/** Frame coordinates back to [lon, lat]: the exact inverse of `projectPoint`. */
export const unprojectPoint: (
  frame: ProjectionInput,
  xy: readonly [number, number],
) => readonly [number, number] = unprojectPointImpl;
