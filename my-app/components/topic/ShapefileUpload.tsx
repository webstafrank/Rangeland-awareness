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
import { ArrowUpload20Regular, Copy16Regular } from "@/components/ui/icons";
import { Button } from "@/components/ui/Button";
import { buttonClasses } from "@/components/ui/button-classes";
import { Notice } from "@/components/ui/Notice";

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
  /** The last file picked or dropped, shown in place of the native control's own text. */
  const [fileName, setFileName] = useState<string | null>(null);

  const ingest = useCallback(
    async (file: File | undefined) => {
      if (!file) return;

      setBusy(true);
      setFileName(file.name);
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
          "rounded-fluent-large border border-dashed p-3 transition-colors duration-150",
          // The input is visually hidden, so its keyboard focus is drawn on
          // the whole drop zone instead.
          "has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-accent",
          // A dashed outline with no fill reads as a drop target rather than
          // a second card inside the panel, which is what a filled box did.
          dragging
            ? "border-accent bg-accent-soft"
            : "border-edge-strong bg-surface-subtle",
          disabled ? "text-ink-faint" : "",
        ].join(" ")}
      >
        {/*
          The real file input, visually hidden but still in the tab order and
          still labelled "Upload shapefile", so a keyboard, a screen reader and
          the evals (getByLabel, setInputFiles) all reach it. What shows is the
          kit's drop zone: a title, a secondary "Choose .zip" button that is a
          second label for the same input, and the chosen file's name, instead
          of the browser's own "Choose File / No file chosen".
        */}
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={`${ACCEPTED_EXTENSIONS.join(",")},application/zip`}
          disabled={disabled || busy}
          onChange={(event) => void ingest(event.target.files?.[0])}
          className="sr-only"
        />
        <label
          htmlFor={inputId}
          className="type-body1 flex cursor-pointer items-center gap-1.5 font-semibold text-ink"
        >
          <ArrowUpload20Regular aria-hidden="true" className="text-accent" />
          Upload shapefile
        </label>
        <p className="type-caption1 mt-0.5 pl-6.5 text-ink-faint">
          {disabled && disabledReason
            ? disabledReason
            : dragging
              ? "Drop to read it."
              : `Drag a .zip here, or choose one. ${
                  MAX_SHAPEFILE_BYTES / 1024 / 1024
                } MB limit.`}
        </p>
        <div className="mt-2.5 flex min-w-0 items-center gap-2.5 pl-6.5">
          <label
            htmlFor={inputId}
            className={buttonClasses({
              appearance: "secondary",
              size: "sm",
              className: `shrink-0 cursor-pointer ${disabled || busy ? "pointer-events-none opacity-60" : ""}`,
            })}
          >
            Choose .zip
          </label>
          <span className="type-caption1 min-w-0 truncate text-ink-muted">
            {fileName ?? "No file chosen yet"}
          </span>
        </div>
      </div>

      {busy && (
        <p
          role="status"
          aria-live="polite"
          className="type-caption1 text-ink-muted"
        >
          Reading shapefile...
        </p>
      )}

      {error !== null && (
        <Notice
          intent="error"
          role="alert"
          // Next injects its own role="alert" route announcer into every page,
          // so an eval cannot address this one by role alone.
          data-testid="shapefile-error"
          actions={
            <Button
              type="button"
              size="sm"
              icon={<Copy16Regular />}
              onClick={() => {
                // The analyst's next move after "this zip has no .shp in it"
                // is pasting that sentence to whoever produced the shapefile.
                void navigator.clipboard?.writeText(error).then(
                  () => setCopied(true),
                  () => setCopied(false),
                );
              }}
            >
              {copied ? "Copied" : "Copy message"}
            </Button>
          }
        >
          {/*
            Verbatim and never clamped: every clause of these messages is
            actionable, and the instruction is usually the last sentence, so
            truncating hides exactly the part the reader needs. Capped height
            with an internal scroll instead, so a long message cannot push the
            rest of the rail off screen either.
          */}
          <span className="block max-h-32 overflow-y-auto break-words">
            {error}
          </span>
        </Notice>
      )}

      {warnings.length > 0 && (
        <Notice intent="warning" role="status" aria-live="polite">
          <ul className="space-y-1">
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </Notice>
      )}
    </div>
  );
}
