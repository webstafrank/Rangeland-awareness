"use client";

/**
 * Mobile map height control.
 *
 * A button that cycles three stops, not a drag handle. A drag gesture on the
 * edge of a map fights the map's own pan and loses: the user tries to resize
 * and pans instead, or tries to pan and resizes instead. A button has one
 * meaning.
 *
 * Three stops, not two. The small stop exists for the moment the analyst wants
 * to read a twelve-row area list on a phone, which a half-screen map makes
 * impossible.
 *
 * Desktop never shows this: the map has its own column there.
 */

import type { MapSize } from "@/components/topic/map-size";
import { MAP_SIZES, nextMapSize } from "@/components/topic/map-size";

export interface MapSizeStepperProps {
  size: MapSize;
  onChange: (size: MapSize) => void;
}

export default function MapSizeStepper({ size, onChange }: MapSizeStepperProps) {
  const current = MAP_SIZES[size];
  const next = MAP_SIZES[nextMapSize(size)];

  return (
    <button
      type="button"
      onClick={() => onChange(nextMapSize(size))}
      data-testid="map-size-stepper"
      // The label states the current size and what the press does, so a screen
      // reader user knows both before and after. 36px tall for a thumb.
      aria-label={`Map size: ${current.label}. Press to make it ${next.label}.`}
      className="flex h-9 w-full items-center justify-center gap-1.5 border-b border-edge bg-surface text-xs font-medium text-ink-muted lg:hidden"
    >
      <span aria-hidden="true">{current.glyph}</span>
      Map: {current.label}
      <span aria-hidden="true" className="text-ink-faint">
        &middot; tap to {next.label === "small" ? "shrink" : "grow"}
      </span>
    </button>
  );
}
