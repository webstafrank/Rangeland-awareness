"use client";

/**
 * Shapefile upload.
 *
 * Parsing happens entirely in the browser (services/geo/shapefile.ts), so nothing
 * is sent to a server and there is no route handler behind this. It owns only
 * its own transient state: busy, the last error, the last warnings. The areas
 * it produces go straight to the reducer.
 *
 * Failure never clears the caller's selection. That is enforced here by only
 * ever calling onAreas on success.
 */

import { useCallback, useId, useRef, useState } from "react";
import type { DraftArea } from "@/services/analysis/selection";
import {
  ACCEPTED_EXTENSIONS,
  MAX_SHAPEFILE_BYTES,
  ShapefileError,
  readShapefile,
} from "@/services/geo/shapefile";

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
          // Padding is constant across states on purpose. An earlier version
          // went from p-0 to p-3 on dragover, so the drop target grew under
          // the cursor mid-drag and could slide out from under the pointer.
          "rounded-lg border border-dashed p-3 transition-colors",
          // A dashed outline with no fill reads as a drop target rather than
          // a second card inside the panel, which is what a filled box did.
          dragging
            ? "border-accent bg-accent-soft"
            : "border-edge-strong bg-transparent",
          disabled ? "opacity-60" : "",
        ].join(" ")}
      >
        <label
          htmlFor={inputId}
          className="block cursor-pointer text-xs font-medium"
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
          className="mt-1.5 block w-full text-xs text-ink-faint file:mr-3 file:cursor-pointer file:rounded-md file:border file:border-edge-strong file:bg-surface file:px-2.5 file:py-1.5 file:text-xs file:font-semibold file:text-ink hover:file:bg-sunken disabled:cursor-not-allowed"
        />
        <p className="mt-2 text-xs leading-relaxed text-ink-faint">
          {disabled && disabledReason
            ? disabledReason
            : dragging
              ? "Drop to read it."
              : `Or drag a file into this box. ${
                  MAX_SHAPEFILE_BYTES / 1024 / 1024
                }MB limit.`}
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
