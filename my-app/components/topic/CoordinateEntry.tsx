"use client";

/**
 * Type or paste a coordinate to select an area.
 *
 * This is the keyboard path. Without it the only ways in are the map (pointer
 * only) and a shapefile (needs a file to exist), so an analyst working from a
 * radio call or a field report has none, and rubric T11 is unmet.
 *
 * One field, not two, because coordinates arrive as one string: "2.4512,
 * 36.8203". Splitting that across two inputs makes the user retype what they
 * could have pasted. The parsing lives in lib/geo/box.ts and is gate-tested.
 */

import { useId, useState } from "react";
import {
  boxAroundPoint,
  isOutsideKenya,
  labelForCoordinate,
  parseCoordinatePair,
} from "@/lib/geo/box";
import { draftAreaFromGeometry, type DraftArea } from "@/lib/analysis/selection";

export interface CoordinateEntryProps {
  onAreas: (areas: DraftArea[]) => void;
  disabled?: boolean;
}

export default function CoordinateEntry({
  onAreas,
  disabled = false,
}: CoordinateEntryProps) {
  const coordId = useId();
  const radiusId = useId();
  const [text, setText] = useState("");
  const [radius, setRadius] = useState("10");
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const parsed = parseCoordinatePair(text);
  const radiusKm = Number(radius);
  const radiusValid = Number.isFinite(radiusKm) && radiusKm >= 0;
  const canAdd = parsed !== null && radiusValid && !disabled;

  const submit = () => {
    setError(null);
    setWarning(null);

    if (parsed === null) {
      setError(
        text.trim() === ""
          ? "Enter a latitude and longitude, for example 2.4512, 36.8203."
          : `Could not read "${text.trim()}" as a coordinate. Latitude first, ` +
              `then longitude, for example 2.4512, 36.8203.`,
      );
      return;
    }
    if (!radiusValid) {
      setError("Radius must be 0 or more kilometres.");
      return;
    }

    // Outside Kenya is a warning, never a block: a cross-border catchment or a
    // shared rangeland is a real analysis.
    if (isOutsideKenya(parsed)) {
      setWarning(
        `${labelForCoordinate(parsed, 0)} is outside Kenya. Added anyway.`,
      );
    }

    const draft = draftAreaFromGeometry(
      boxAroundPoint(parsed, radiusKm),
      "coordinate",
      labelForCoordinate(parsed, radiusKm),
    );
    if (draft === null) {
      setError("That coordinate produced no usable area.");
      return;
    }

    onAreas([draft]);
    setText("");
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <label htmlFor={coordId} className="block text-xs font-medium">
            Coordinates
          </label>
          <input
            id={coordId}
            type="text"
            inputMode="text"
            autoComplete="off"
            spellCheck={false}
            value={text}
            disabled={disabled}
            placeholder="2.4512, 36.8203"
            onChange={(event) => {
              setText(event.target.value);
              setError(null);
            }}
            onKeyDown={(event) => {
              // Enter submits, because the whole point of this control is that
              // it never needs the mouse.
              if (event.key === "Enter") {
                event.preventDefault();
                submit();
              }
            }}
            className="mt-1 w-full rounded-md border border-edge-strong bg-surface px-2.5 py-1.5 font-mono text-xs disabled:cursor-not-allowed disabled:opacity-60"
          />
        </div>

        <div className="w-20 shrink-0">
          <label htmlFor={radiusId} className="block text-xs font-medium">
            Radius km
          </label>
          <input
            id={radiusId}
            type="number"
            min={0}
            step={1}
            inputMode="decimal"
            value={radius}
            disabled={disabled}
            onChange={(event) => {
              setRadius(event.target.value);
              setError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                submit();
              }
            }}
            className="mt-1 w-full rounded-md border border-edge-strong bg-surface px-2.5 py-1.5 font-mono text-xs disabled:cursor-not-allowed disabled:opacity-60"
          />
        </div>

        <button
          type="button"
          onClick={submit}
          disabled={!canAdd}
          className="shrink-0 rounded-md border border-edge-strong bg-surface px-3 py-1.5 text-xs font-semibold hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
        >
          Add area
        </button>
      </div>

      <p className="text-xs leading-snug text-ink-faint">
        Latitude first. Radius 0 selects the exact point; any radius selects a
        square of that half-width around it.
      </p>

      {error !== null && (
        <p
          role="alert"
          data-testid="coordinate-error"
          className="rounded-md border border-danger-border bg-danger-soft px-3 py-2 text-xs text-danger"
        >
          {error}
        </p>
      )}

      {warning !== null && (
        <p
          role="status"
          aria-live="polite"
          className="rounded-md border border-warn-border bg-warn-soft px-3 py-2 text-xs text-warn"
        >
          {warning}
        </p>
      )}
    </div>
  );
}
