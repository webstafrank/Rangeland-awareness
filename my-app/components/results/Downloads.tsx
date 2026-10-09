"use client";

/**
 * The download list, shared by both screens the results route can render.
 *
 * `ResultView.tsx` (a computed run) and `ResultsStep.tsx` (a validated request
 * with nothing computed behind it) both offer three files. They used to offer
 * them in two different shapes, buttons in one and clickable cards in the
 * other, with two copies of the save code. This is the one shape and the one
 * save path for both.
 *
 * `ResultView.tsx` is a server component because rubric S1 requires a shared
 * link to open the same result in a cold browser with no session storage.
 * Saving a file needs `Blob`, `URL.createObjectURL` and a synthetic click, none
 * of which exist on the server, so the boundary is drawn here: this module
 * receives finished strings rather than the run result, so the payloads are
 * built once, on the server, and are identical to what a test of `exports.ts`
 * checked.
 *
 * Building the strings up front rather than on click is deliberate. They are a
 * few kilobytes, they are already in the server-rendered payload as props, and
 * doing the work eagerly means a click cannot fail halfway through and leave
 * the reader with a browser dialog and no file.
 *
 * Each row is one button, the whole row, because the whole row acts. Its
 * accessible name is the label alone ("Class table (CSV)") through
 * aria-labelledby, and the detail line is its description, so a screen reader
 * hears a short name first and the explanation after rather than a paragraph
 * as a name.
 */

import { useId } from "react";
import { ArrowDownload20Regular } from "@/components/ui/icons";

export interface DownloadFile {
  /** Row label, and the accessible name the reader hears. */
  readonly label: string;
  /** One line under the label saying what is in the file. */
  readonly detail: string;
  readonly filename: string;
  readonly mimeType: string;
  readonly body: string;
}

export interface DownloadsProps {
  readonly files: readonly DownloadFile[];
}

/** Hand a finished string to the browser's download manager. */
export function saveFile(file: Pick<DownloadFile, "body" | "filename" | "mimeType">): void {
  const url = URL.createObjectURL(new Blob([file.body], { type: file.mimeType }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = file.filename;
  anchor.click();
  // Revoked immediately: the click has already handed the blob to the
  // download manager, and leaving the object URL alive pins the whole string
  // in memory for the life of the document.
  URL.revokeObjectURL(url);
}

/** Bytes, for the reader to see what they are about to save. */
function sizeOf(body: string): string {
  const bytes = new TextEncoder().encode(body).length;
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} kB`;
}

const FORMAT: Readonly<Record<string, string>> = {
  csv: "CSV",
  json: "JSON",
  geojson: "GeoJSON",
};

/** The format tag, from the extension the file is saved under. */
function formatOf(filename: string): string {
  const ext = filename.slice(filename.lastIndexOf(".") + 1).toLowerCase();
  return FORMAT[ext] ?? ext.toUpperCase();
}

function DownloadRow({ file }: { file: DownloadFile }) {
  const id = useId();
  const labelId = `${id}-label`;
  const detailId = `${id}-detail`;

  return (
    <li>
      <button
        type="button"
        onClick={() => saveFile(file)}
        aria-labelledby={labelId}
        aria-describedby={detailId}
        className="group grid w-full grid-cols-[3.75rem_minmax(0,1fr)_auto] items-start gap-x-3 px-4 py-3 text-left transition-colors duration-150 hover:bg-surface-subtle focus-visible:-outline-offset-2 lg:px-5"
      >
        <span
          aria-hidden="true"
          className="type-caption1 mt-0.5 rounded-fluent-medium bg-accent-soft px-1.5 py-0.5 text-center font-mono font-semibold text-accent"
        >
          {formatOf(file.filename)}
        </span>
        <span className="min-w-0">
          <span id={labelId} className="type-body1 block font-semibold text-ink">
            {file.label}
          </span>
          <span id={detailId} className="type-caption1 mt-0.5 block text-ink-muted">
            {file.detail}
          </span>
          {/*
            The full filename on its own line, in caption mono, wrapping only
            where the name has a hyphen (the browser's own break opportunity)
            and never inside a token. The longest token, the run id, is about
            15 characters, well inside a phone's width. The size follows on the
            same line, kept whole.
          */}
          <span className="type-caption1 mt-1 block text-ink-faint">
            <span className="font-mono break-normal">{file.filename}</span>
            <span className="whitespace-nowrap tabular-nums"> · {sizeOf(file.body)}</span>
          </span>
        </span>
        <span
          aria-hidden="true"
          className="mt-0.5 text-ink-faint transition-colors duration-150 group-hover:text-accent"
        >
          <ArrowDownload20Regular />
        </span>
      </button>
    </li>
  );
}

/**
 * The rows, as a list with hairlines between them. Sits flush inside a card
 * (a `Panel` with `pad="none"`, or a bare `.card`), so the hover fill runs to
 * the card's edges; give that card `overflow-hidden` so the fill keeps its
 * rounded corners. The focus ring is drawn inside the row for the same reason.
 */
export default function Downloads({ files }: DownloadsProps) {
  return (
    <ul className="divide-y divide-edge">
      {files.map((file) => (
        <DownloadRow key={file.filename} file={file} />
      ))}
    </ul>
  );
}
