/**
 * The area-of-interest selection state machine.
 *
 * All of it is pure: no React, no Leaflet, no window. The map component and the
 * topic page are adapters that dispatch into this reducer and render its state,
 * which is what lets the interesting behaviour (the area cap, the
 * comparison -> single transition, the zoom trigger) be gate-tested in node.
 */

import type { Feature, Geometry } from "geojson";
import { areaKm2 } from "@/lib/geo/area";
import { boundsOfGeometry, padBounds, unionBounds } from "@/lib/geo/bounds";
import type { BoundsTuple } from "@/lib/geo/bounds";
import {
  type AnalysisTypeId,
  type ModelId,
  getAnalysisType,
} from "@/lib/analysis/models";

/**
 * Where an area came from.
 *
 * `coordinate` is its own source rather than being filed as `point`: a typed
 * coordinate with a radius produces a real polygon with a real area, and
 * labelling that "point" would put a point badge next to a 400 km2 figure.
 */
export type AoiSource = "point" | "drawn" | "shapefile" | "coordinate";

export interface AreaOfInterest {
  /** Assigned by the reducer, monotonic per session: aoi-1, aoi-2, ... */
  id: string;
  label: string;
  source: AoiSource;
  /** Normalized: geometry is always present and always has usable coordinates. */
  feature: Feature;
  bounds: BoundsTuple;
  /** Null for points and lines. See lib/geo/area.ts. */
  areaKm2: number | null;
}

/** An area before the reducer stamps an id on it. */
export type DraftArea = Omit<AreaOfInterest, "id">;

/**
 * What the map should zoom to.
 *
 * The `token` is load-bearing. Selecting the same area twice, or re-clicking a
 * point already in the list, must re-fire the zoom, and a bounds-only value
 * would compare equal and the effect would not run. The token makes every
 * request distinct.
 */
export interface FocusRequest {
  bounds: BoundsTuple;
  token: number;
}

export interface SelectionState {
  analysisType: AnalysisTypeId;
  modelId: ModelId;
  areas: AreaOfInterest[];
  focus: FocusRequest | null;
  /**
   * A message the user must see: an area cap that truncated an upload, or areas
   * dropped by an analysis-type switch. Never used for success chatter.
   */
  notice: string | null;
  /**
   * The selection as it was immediately before an analysis-type switch dropped
   * areas, so the switch is undoable.
   *
   * Cleared by any other action. An undo offered after the user has gone on to
   * edit the selection would silently discard that newer work, so the offer
   * only stands while nothing else has happened.
   */
  undo: { analysisType: AnalysisTypeId; areas: AreaOfInterest[] } | null;
  nextId: number;
  nextToken: number;
}

export type SelectionAction =
  | { type: "setAnalysisType"; analysisType: AnalysisTypeId }
  | { type: "setModel"; modelId: ModelId }
  | { type: "addAreas"; areas: readonly DraftArea[] }
  | { type: "removeArea"; id: string }
  | { type: "clearAreas" }
  | { type: "focusArea"; id: string }
  | { type: "focusAll" }
  | { type: "dismissNotice" }
  | { type: "undoTypeSwitch" };

export const initialSelectionState: SelectionState = {
  analysisType: "single",
  modelId: "random-forest",
  areas: [],
  focus: null,
  notice: null,
  undo: null,
  nextId: 1,
  nextToken: 1,
};

/** Build a draft area from a raw geometry. Used by every selection path. */
export function draftAreaFromGeometry(
  geometry: Geometry,
  source: AoiSource,
  label: string,
  properties: Feature["properties"] = null,
): DraftArea | null {
  const bounds = boundsOfGeometry(geometry);
  if (bounds === null) return null;

  return {
    label,
    source,
    feature: { type: "Feature", geometry, properties },
    bounds,
    areaKm2: areaKm2(geometry),
  };
}

/** Pluralise without dragging in a formatting library. */
const areaWord = (n: number) => (n === 1 ? "area" : "areas");

function withFocus(
  state: SelectionState,
  bounds: BoundsTuple | null,
): SelectionState {
  if (bounds === null) return state;
  return {
    ...state,
    focus: { bounds: padBounds(bounds), token: state.nextToken },
    nextToken: state.nextToken + 1,
  };
}

export function selectionReducer(
  state: SelectionState,
  action: SelectionAction,
): SelectionState {
  switch (action.type) {
    case "setAnalysisType": {
      if (action.analysisType === state.analysisType) return state;
      const cap = getAnalysisType(action.analysisType).maxAreas;

      // Narrowing the cap (comparison -> single) has to drop areas. Keep the
      // most recently added, because that is the one the analyst just chose,
      // and say out loud what was dropped. Silently truncating here is the
      // failure this branch exists to prevent.
      if (state.areas.length > cap) {
        const kept = state.areas.slice(-cap);
        const dropped = state.areas.length - kept.length;
        return {
          ...state,
          analysisType: action.analysisType,
          areas: kept,
          // Snapshot the whole prior selection, not just the dropped tail, so
          // the undo restores the original build order rather than appending
          // the dropped areas after the kept one.
          undo: { analysisType: state.analysisType, areas: state.areas },
          notice:
            `Single location takes one area, so ${dropped} earlier ` +
            `${areaWord(dropped)} ${dropped === 1 ? "was" : "were"} removed. ` +
            `Kept "${kept[0].label}".`,
        };
      }

      return {
        ...state,
        analysisType: action.analysisType,
        notice: null,
        undo: null,
      };
    }

    case "setModel":
      return state.modelId === action.modelId
        ? state
        : { ...state, modelId: action.modelId };

    case "addAreas": {
      if (action.areas.length === 0) return state;
      const cap = getAnalysisType(state.analysisType).maxAreas;

      // At cap 1 a new selection replaces the old one. That is what clicking a
      // second point on the map means, and it is why this is not an error.
      const base = cap === 1 ? [] : state.areas;
      const room = cap - base.length;

      if (room <= 0) {
        return {
          ...state,
          undo: null,
          notice:
            `Comparison holds at most ${cap} areas. Remove one before adding ` +
            `another.`,
        };
      }

      const admitted = action.areas.slice(0, room);
      const rejected = action.areas.length - admitted.length;

      const stamped: AreaOfInterest[] = admitted.map((draft, i) => ({
        ...draft,
        id: `aoi-${state.nextId + i}`,
      }));

      const next: SelectionState = {
        ...state,
        areas: [...base, ...stamped],
        nextId: state.nextId + stamped.length,
        undo: null,
        notice:
          rejected > 0
            ? `Added ${stamped.length} of ${action.areas.length} ${areaWord(
                action.areas.length,
              )}. ${rejected} skipped: the ${cap}-area limit was reached.`
            : null,
      };

      return withFocus(next, unionBounds(stamped.map((a) => a.bounds)));
    }

    case "removeArea": {
      const areas = state.areas.filter((a) => a.id !== action.id);
      if (areas.length === state.areas.length) return state;
      return { ...state, areas, notice: null, undo: null };
    }

    case "clearAreas":
      return state.areas.length === 0
        ? state
        : { ...state, areas: [], focus: null, notice: null, undo: null };

    case "focusArea": {
      const target = state.areas.find((a) => a.id === action.id);
      return target ? withFocus(state, target.bounds) : state;
    }

    case "focusAll":
      return withFocus(state, unionBounds(state.areas.map((a) => a.bounds)));

    case "dismissNotice":
      return state.notice === null && state.undo === null
        ? state
        : { ...state, notice: null, undo: null };

    case "undoTypeSwitch": {
      if (state.undo === null) return state;

      // Fresh ids in the original build order, so the list renumbers 1, 2, 3
      // the way the analyst built it. Restoring the dropped areas after the
      // kept one would silently reorder a comparison, and the ordinals are
      // what the map badges and the result table are keyed on.
      const restored: AreaOfInterest[] = state.undo.areas.map((area, i) => ({
        ...area,
        id: `aoi-${state.nextId + i}`,
      }));

      const next: SelectionState = {
        ...state,
        analysisType: state.undo.analysisType,
        areas: restored,
        nextId: state.nextId + restored.length,
        notice: null,
        undo: null,
      };

      return withFocus(next, unionBounds(restored.map((a) => a.bounds)));
    }
  }
}

/** How many areas an undo would bring back, for the button label. */
export function undoRestoreCount(state: SelectionState): number {
  if (state.undo === null) return 0;
  return state.undo.areas.length - state.areas.length;
}

/** True when the analysis type will drop areas if selected right now. */
export function switchWouldDrop(
  state: SelectionState,
  target: AnalysisTypeId,
): number {
  const cap = getAnalysisType(target).maxAreas;
  return Math.max(0, state.areas.length - cap);
}
