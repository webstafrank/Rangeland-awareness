"use client";

/**
 * Shapefile upload.
 *
 * Parsing happens entirely in the browser (lib/geo/shapefile.ts), so nothing
 * is sent to a server and there is no route handler behind this. It owns only
 * its own transient state: busy, the last error, the last warnings. The areas
 * it produces go straight to the reducer.
 *
 * Failure never clears the caller's selection. That is enforced here by only
 * ever calling onAreas on success.
 */

import { useCallback, useId, useRef, useState } from "react";
import type { DraftArea } from "@/lib/analysis/selection";
import {
  ACCEPTED_EXTENSIONS,
  ShapefileError,
  readShapefile,
} from "@/lib/geo/shapefile";

export interface ShapefileUploadProps {
  onAreas: (areas: DraftArea[]) => void;
  /** True when the selection is full, so the control explains why it is off. */
  disabled?: boolean;
  disabledReason?: string;
}

export default function ShapefileUpload({
  onAreas,
  disabled = false,
  disabledReason,
}: ShapefileUploadProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const [copied, setCopied] = useState(false);

  const ingest = useCallback(
    async (file: File | undefined) => {
      if (!file) return;

      setBusy(true);
      setError(null);
      setWarnings([]);
      setCopied(false);

      try {
        const result = await readShapefile(file);
        setWarnings(result.warnings);
        onAreas(result.areas);
      } catch (cause) {
        // A ShapefileError message is already written for a user. Anything
        // else is a bug, and gets a message that says so rather than leaking
        // a stack trace into the page.
        setError(
          cause instanceof ShapefileError
            ? cause.message
            : `Could not read "${file.name}". This looks like a bug rather ` +
                `than a problem with your file.`,
        );
        if (!(cause instanceof ShapefileError)) {
          console.error("unexpected shapefile failure", cause);
        }
      } finally {
        setBusy(false);
        // Clear the input so re-picking the same file fires change again.
        if (inputRef.current) inputRef.current.value = "";
      }
    },
    [onAreas],
  );

  return (
    <div className="flex flex-col gap-2">
      <div
        onDragOver={(event) => {
          if (disabled) return;
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          if (disabled) return;
          event.preventDefault();
          setDragging(false);
          void ingest(event.dataTransfer.files[0]);
        }}
        className={[
          "rounded-lg border border-dashed px-3 py-3 transition-colors",
          dragging
            ? "border-accent bg-accent-soft"
            : "border-edge-strong bg-sunken",
          disabled ? "opacity-60" : "",
        ].join(" ")}
      >
        <label
          htmlFor={inputId}
          className="block cursor-pointer text-sm font-medium"
        >
          Upload shapefile
        </label>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={`${ACCEPTED_EXTENSIONS.join(",")},application/zip`}
          disabled={disabled || busy}
          onChange={(event) => void ingest(event.target.files?.[0])}
          className="mt-1.5 block w-full text-xs text-ink-muted file:mr-3 file:cursor-pointer file:rounded-md file:border file:border-edge-strong file:bg-surface file:px-2.5 file:py-1.5 file:text-xs file:font-medium file:text-ink disabled:cursor-not-allowed"
        />
        <p className="mt-1.5 text-xs text-ink-faint">
          {disabled && disabledReason
            ? disabledReason
            : "A .zip holding .shp, .shx, .dbf and .prj, or drag one here. Polygons only."}
        </p>
      </div>

      {busy && (
        <p role="status" aria-live="polite" className="text-xs text-ink-muted">
          Reading shapefile...
        </p>
      )}

      {error !== null && (
        <div
          role="alert"
          // Next injects its own role="alert" route announcer into every page,
          // so an eval cannot address this one by role alone.
          data-testid="shapefile-error"
          className="rounded-md border border-danger-border bg-danger-soft px-3 py-2 text-xs text-danger"
        >
          {/*
            Verbatim and never clamped: every clause of these messages is
            actionable, and the instruction is usually the last sentence, so
            truncating hides exactly the part the reader needs. Capped height
            with an internal scroll instead, so a long message cannot push the
            rest of the rail off screen either.
          */}
          <p className="max-h-32 overflow-y-auto break-words">{error}</p>

          <button
            type="button"
            onClick={() => {
              // The analyst's next move after "this zip has no .shp in it" is
              // pasting that sentence to whoever produced the shapefile.
              void navigator.clipboard?.writeText(error).then(
                () => setCopied(true),
                () => setCopied(false),
              );
            }}
            className="mt-1.5 rounded border border-danger-border px-2 py-1 text-[11px] font-semibold hover:bg-white"
          >
            {copied ? "Copied" : "Copy message"}
          </button>
        </div>
      )}

      {warnings.length > 0 && (
        <ul
          role="status"
          aria-live="polite"
          className="space-y-1 rounded-md border border-warn-border bg-warn-soft px-3 py-2 text-xs text-warn"
        >
          {warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
