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

import { FullScreenMaximize16Regular, FullScreenMinimize16Regular } from "@/components/ui/icons";
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
      className="type-caption1 flex h-9 w-full items-center justify-center gap-1.5 border-b border-edge bg-surface-subtle font-semibold text-ink-muted transition-colors duration-150 hover:bg-page hover:text-ink lg:hidden"
    >
      {/* Fluent's own grow and shrink icons, not a block character: the
          glyph rendered as a stray black square in some fonts. */}
      {next.label === "small" ? (
        <FullScreenMinimize16Regular aria-hidden="true" />
      ) : (
        <FullScreenMaximize16Regular aria-hidden="true" />
      )}
      Map: {current.label}
      <span aria-hidden="true" className="text-ink-faint">
        &middot; tap to {next.label === "small" ? "shrink" : "grow"}
      </span>
    </button>
  );
}
