"use client";

/**
 * The By name boxes and the map, kept in step both ways.
 *
 *   Boxes to map  choosing a county, sub-county or ward outlines it on the
 *                 map (dashed: chosen, not yet added) and flies there.
 *   Map to boxes  in Identify place mode, a click looks up the ward under it
 *                 (services/geo/locate.ts) and fills all three boxes. The
 *                 outline appears where the analyst clicked; the map does
 *                 not move, since they are already looking at the place.
 *
 * The choice lives here rather than in AdminPicker because both directions
 * write it. Nothing is added to the selection until Add is pressed: the
 * outline is a preview, and the reducer never hears about it.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { MapPreview } from "@/components/map/AoiMap";
import type { MapTool } from "@/components/map/tools";
import type { AreaOfInterest } from "@/services/analysis/selection";
import {
  ADMIN_BY_ID,
  ADMIN_LEVEL_LABEL,
  EMPTY_CHOICE,
  choose,
  loadAdminGeometry,
  mostSpecific,
  unitContext,
  type AdminChoice,
} from "@/services/geo/admin";
import { boundsOfGeometry, padBounds } from "@/services/geo/bounds";
import { locateAdminUnit } from "@/services/geo/locate";

export const IDENTIFY_NOTES = {
  finding: "Finding the place...",
  outside: "That is outside Kenya's counties. Click inside the border.",
  failed: "Could not look that place up. Check the connection and click again.",
} as const;

export interface AdminMapSync {
  choice: AdminChoice;
  /** For the boxes: a choice made there, which the map flies to. */
  setChoice: (next: AdminChoice) => void;
  tool: MapTool;
  setTool: (tool: MapTool) => void;
  /** The chosen unit's outline, or null while loading, when nothing is chosen, or once it is added. */
  preview: MapPreview | null;
  /** The map's status line. */
  note: string | null;
  identify: (lon: number, lat: number) => void;
}

export function useAdminMapSync(areas: readonly AreaOfInterest[]): AdminMapSync {
  const [choice, setChoiceState] = useState<AdminChoice>(EMPTY_CHOICE);
  const [tool, setToolState] = useState<MapTool>("identify");
  const [loaded, setLoaded] = useState<MapPreview | null>(null);
  const [note, setNote] = useState<string | null>(null);

  // Whether the current choice came from the boxes (fly to it) or the map
  // (stay put). A ref, read once by the effect the choice triggers.
  const flyNext = useRef(false);
  const nextToken = useRef(1);
  // Only the newest click's answer is used; a slow lookup that finishes after
  // a newer click is dropped.
  const lookup = useRef(0);

  const unit = mostSpecific(choice);

  useEffect(() => {
    if (unit === null) return;
    const fly = flyNext.current;
    let live = true;
    loadAdminGeometry(unit)
      .then((geometry) => {
        if (!live) return;
        const bounds = boundsOfGeometry(geometry);
        setLoaded({
          id: unit.id,
          feature: { type: "Feature", geometry, properties: { adminId: unit.id } },
          focus: fly && bounds !== null ? { bounds: padBounds(bounds), token: nextToken.current++ } : null,
        });
      })
      // No outline is the honest result of a failed load. Add reports the
      // failure itself, with a retry, if the analyst goes on to press it.
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [unit]);

  // Derived at render, not cleared in the effect: an outline is shown only
  // for the unit chosen right now, and never once that unit is in the list,
  // where it is already drawn solid.
  const preview =
    loaded !== null &&
    unit !== null &&
    loaded.id === unit.id &&
    !areas.some((a) => a.feature.properties?.adminId === unit.id)
      ? loaded
      : null;

  const setChoice = useCallback((next: AdminChoice) => {
    flyNext.current = true;
    lookup.current += 1;
    setNote(null);
    setChoiceState(next);
  }, []);

  const setTool = useCallback((next: MapTool) => {
    lookup.current += 1;
    setNote(null);
    setToolState(next);
  }, []);

  const identify = useCallback((lon: number, lat: number) => {
    const mine = ++lookup.current;
    setNote(IDENTIFY_NOTES.finding);
    locateAdminUnit(lon, lat).then(
      (found) => {
        if (mine !== lookup.current) return;
        if (found === null) {
          setNote(IDENTIFY_NOTES.outside);
          return;
        }
        flyNext.current = false;
        setChoiceState(choose(EMPTY_CHOICE, found.level, found, ADMIN_BY_ID));
        setNote(identifiedNote(found.id));
      },
      () => {
        if (mine === lookup.current) setNote(IDENTIFY_NOTES.failed);
      },
    );
  }, []);

  return { choice, setChoice, tool, setTool, preview, note, identify };
}

/** "Bangale ward, Bura, Tana River. Press Add to add it." */
export function identifiedNote(unitId: string): string {
  const unit = ADMIN_BY_ID.get(unitId);
  if (unit === undefined) return "";
  const context = unitContext(unit, ADMIN_BY_ID);
  const name = `${unit.name} ${ADMIN_LEVEL_LABEL[unit.level].toLowerCase()}`;
  return `${context === "" ? name : `${name}, ${context}`}. Press Add to add it.`;
}
