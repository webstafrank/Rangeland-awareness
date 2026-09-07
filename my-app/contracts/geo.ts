/**
 * Contract: geography.
 *
 * Areas of interest are Kenya's 47 counties (ADM1). `services/geo` owns the
 * boundary data, the id scheme and the map projection; nothing else may read
 * the raw GeoJSON.
 *
 * Contract version: 1.
 */
import { z } from "zod";

export const GEO_CONTRACT_VERSION = 1;

/** Kebab-case county slug, e.g. "turkana", "taita-taveta". */
export const AreaIdSchema = z
  .string()
  .min(2)
  .max(40)
  .regex(/^[a-z][a-z0-9-]*[a-z0-9]$/, "area id must be a lowercase kebab-case slug");

export type AreaId = z.infer<typeof AreaIdSchema>;

/** Kenya's ASAL classification, used only to group and filter the picker. */
export const CLIMATE_ZONES = ["arid", "semi-arid", "humid"] as const;
export const ClimateZoneSchema = z.enum(CLIMATE_ZONES);
export type ClimateZone = z.infer<typeof ClimateZoneSchema>;

export interface Area {
  readonly id: AreaId;
  /** Official county name as published by the boundary source. */
  readonly name: string;
  /** Boundary-source identifier, kept so a row can be traced back upstream. */
  readonly shapeId: string;
  readonly climateZone: ClimateZone;
  /** True for the counties in Kenya's ASAL group. See services/geo/README.md. */
  readonly asal: boolean;
  /** [lon, lat] label anchor, precomputed from the polygon. */
  readonly centroid: readonly [number, number];
  /** [minLon, minLat, maxLon, maxLat] */
  readonly bbox: readonly [number, number, number, number];
  /**
   * Boundary as an SVG path in the shared projected viewBox. Precomputed at
   * build time so the client never ships a projection library or raw GeoJSON.
   */
  readonly path: string;
}

/** The projected canvas every area path and overlay cell is expressed in. */
export interface MapFrame {
  readonly width: number;
  readonly height: number;
  /** Geographic bounds the frame was fitted to: [minLon, minLat, maxLon, maxLat]. */
  readonly bounds: readonly [number, number, number, number];
}

/** One cell of the raster-style overlay drawn on top of the boundaries. */
export interface OverlayCell {
  /** Projected frame coordinates of the cell's top-left corner. */
  readonly x: number;
  readonly y: number;
  readonly size: number;
  /** Indicator value for the cell, in the indicator's own units. */
  readonly value: number;
  /** Area this cell belongs to, so hover can name it. */
  readonly areaId: AreaId;
}

/** The surface `services/geo` must expose. */
export interface GeoService {
  listAreas(): readonly Area[];
  getArea(id: AreaId): Area;
  findArea(id: string): Area | undefined;
  /** Areas whose id is in `ids`, in the order given, skipping unknown ids. */
  pickAreas(ids: readonly string[]): readonly Area[];
  frame(): MapFrame;
  /** Projects [lon, lat] into frame coordinates. */
  project(lonLat: readonly [number, number]): readonly [number, number];
  /**
   * A deterministic grid of cells covering the given areas, used as the map
   * overlay. `valueAt` is called once per cell with the cell centre in
   * geographic coordinates.
   */
  gridFor(
    areas: readonly Area[],
    cellSize: number,
    valueAt: (areaId: AreaId, lonLat: readonly [number, number]) => number,
  ): readonly OverlayCell[];
}
