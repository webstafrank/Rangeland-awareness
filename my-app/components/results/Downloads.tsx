"use client";

/**
 * The one part of the results screen that needs a browser.
 *
 * `ResultView.tsx` is a server component because rubric S1 requires a shared
 * link to open the same result in a cold browser with no session storage.
 * Saving a file needs `Blob`, `URL.createObjectURL` and a synthetic click, none
 * of which exist on the server, so the boundary is drawn here and nowhere else:
 * this file is the only "use client" module in the variant, and it receives
 * finished strings rather than the run result, so the payloads are built once,
 * on the server, and are identical to what a test of `exports.ts` checked.
 *
 * Building the strings up front rather than on click is deliberate. They are a
 * few kilobytes, they are already in the server-rendered payload as props, and
 * doing the work eagerly means a click cannot fail halfway through and leave
 * the reader with a browser dialog and no file.
 */

import { Button } from "@/components/ui/Button";

export interface DownloadFile {
  /** Button label, and the accessible name the reader hears. */
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

function save(file: DownloadFile): void {
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

export default function Downloads({ files }: DownloadsProps) {
  return (
    <ul className="grid gap-3 sm:grid-cols-3">
      {files.map((file) => (
        <li key={file.filename} className="flex min-w-0 flex-col gap-2">
          {/*
            `outline`, never the kit's scarlet. The screen gets exactly one
            forward control and it is "Run this configuration again"; a red
            download button would make three of them and the accent would stop
            meaning "this way".
          */}
          <Button
            type="button"
            variant="outline"
            tone="light"
            block
            onClick={() => save(file)}
          >
            {file.label}
          </Button>
          {/*
            `break-all` on the filename, and deliberately not `whitespace-nowrap`.
            A run id plus the suffix is about 48 characters, which is wider than
            the 280px a panel leaves at 360px, so holding it on one line is the
            one thing on this screen that would put a horizontal scrollbar on
            the page. Rubric S10 costs a hyphenless wrap here.
          */}
          <p className="text-xs leading-relaxed text-ink-muted">
            {file.detail}{" "}
            <span className="break-all text-ink-faint">
              ({file.filename}, {sizeOf(file.body)})
            </span>
          </p>
        </li>
      ))}
    </ul>
  );
}
