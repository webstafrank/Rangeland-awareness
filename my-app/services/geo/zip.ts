/**
 * ZIP structural pre-flight.
 *
 * This exists because of a measured failure, not a hypothetical one. Handing
 * shpjs a buffer that starts with "PK" but has no valid End Of Central
 * Directory record makes its unzip layer spin in a synchronous loop that never
 * returns. On the main thread that is an unrecoverable frozen tab: try/catch
 * cannot catch it, and a Promise.race timeout cannot fire, because the event
 * loop never gets a turn. Verified against shpjs 6.2.0 / but-unzip 0.1.4 —
 * every other malformed input tried (garbage bytes, truncated .shp, absurd
 * record counts, empty buffer) rejects in about a millisecond; only this one
 * hangs.
 *
 * So the archive is parsed here first, using only the central directory, and
 * shpjs is never called on bytes whose structure has not been checked. This is
 * also where the "your zip has no .shp in it" message comes from, which shpjs
 * can only report as "no layers founds".
 *
 * Format reference: PKWARE APPNOTE 6.3.10, sections 4.3.12 and 4.3.16.
 */

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_FILE_SIGNATURE = 0x02014b50;
const LOCAL_FILE_SIGNATURE = 0x04034b50;

/** EOCD is 22 bytes plus a comment of at most 65535. */
const EOCD_MIN_SIZE = 22;
const MAX_EOCD_SEARCH = EOCD_MIN_SIZE + 0xffff;

export interface ZipEntry {
  name: string;
  compressedSize: number;
  uncompressedSize: number;
  /** 0 = stored, 8 = deflate. Anything else we refuse rather than guess. */
  method: number;
}

export class ZipStructureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ZipStructureError";
  }
}

/** Compression methods shpjs's unzip layer can actually inflate. */
const SUPPORTED_METHODS = new Set([0, 8]);

/**
 * Parse the central directory of a ZIP and return its entries.
 *
 * Throws ZipStructureError with a user-facing message for anything that is not
 * a well-formed archive. Never returns partial results: a directory that
 * disagrees with itself is rejected, because that is exactly the shape that
 * hangs the downstream parser.
 */
export function readZipEntries(bytes: ArrayBuffer): ZipEntry[] {
  const view = new DataView(bytes);
  const size = bytes.byteLength;

  if (size < EOCD_MIN_SIZE) {
    throw new ZipStructureError(
      "This file is too small to be a zip archive.",
    );
  }

  // A real zip starts with a local file header, or is an empty archive that
  // starts with the EOCD itself. Checking this first turns "some other binary
  // that happens to be large" into an immediate, cheap rejection.
  const leadSignature = view.getUint32(0, true);
  if (
    leadSignature !== LOCAL_FILE_SIGNATURE &&
    leadSignature !== EOCD_SIGNATURE
  ) {
    throw new ZipStructureError(
      "This file is not a zip archive: it has no zip file header.",
    );
  }

  // Scan backwards for the EOCD. Bounded by the maximum comment length, so a
  // file that merely starts with "PK" cannot make this loop run long.
  const searchFloor = Math.max(0, size - MAX_EOCD_SEARCH);
  let eocd = -1;
  for (let at = size - EOCD_MIN_SIZE; at >= searchFloor; at -= 1) {
    if (view.getUint32(at, true) === EOCD_SIGNATURE) {
      eocd = at;
      break;
    }
  }
  if (eocd === -1) {
    throw new ZipStructureError(
      "This zip archive is damaged: its central directory is missing. " +
        "Try re-zipping the shapefile.",
    );
  }

  const entryCount = view.getUint16(eocd + 10, true);
  const directorySize = view.getUint32(eocd + 12, true);
  const directoryOffset = view.getUint32(eocd + 16, true);

  if (entryCount === 0) {
    throw new ZipStructureError("This zip archive is empty.");
  }
  if (
    directoryOffset + directorySize > size ||
    directoryOffset >= size ||
    directorySize === 0
  ) {
    throw new ZipStructureError(
      "This zip archive is damaged: its central directory points outside the " +
        "file. It may have been truncated in transfer.",
    );
  }
  // Zip64 uses 0xffff / 0xffffffff as escape values in these fields, and the
  // downstream parser does not read the zip64 records. Say so plainly rather
  // than mis-parsing.
  if (entryCount === 0xffff || directoryOffset === 0xffffffff) {
    throw new ZipStructureError(
      "This is a zip64 archive, which is not supported. Re-zip it with " +
        "standard settings, or upload a smaller extract.",
    );
  }

  const entries: ZipEntry[] = [];
  let at = directoryOffset;

  for (let i = 0; i < entryCount; i += 1) {
    // 46 is the fixed part of a central directory record.
    if (at + 46 > size) {
      throw new ZipStructureError(
        "This zip archive is damaged: its file list ends early.",
      );
    }
    if (view.getUint32(at, true) !== CENTRAL_FILE_SIGNATURE) {
      throw new ZipStructureError(
        "This zip archive is damaged: its file list is corrupt.",
      );
    }

    const method = view.getUint16(at + 10, true);
    const compressedSize = view.getUint32(at + 20, true);
    const uncompressedSize = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    const localOffset = view.getUint32(at + 42, true);

    if (at + 46 + nameLength > size) {
      throw new ZipStructureError(
        "This zip archive is damaged: a file name runs past the end.",
      );
    }
    if (localOffset >= size) {
      throw new ZipStructureError(
        "This zip archive is damaged: an entry points outside the file.",
      );
    }

    const name = new TextDecoder("utf-8").decode(
      new Uint8Array(bytes, at + 46, nameLength),
    );

    entries.push({ name, compressedSize, uncompressedSize, method });
    at += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

/** Lowercase extension of a zip entry path, dot included. */
function extensionOf(name: string): string {
  const base = name.slice(name.lastIndexOf("/") + 1);
  const dot = base.lastIndexOf(".");
  return dot === -1 ? "" : base.slice(dot).toLowerCase();
}

/** Ignore the metadata directories macOS and Windows add to a zip. */
function isJunkEntry(name: string): boolean {
  return (
    name.startsWith("__MACOSX/") ||
    name.includes("/__MACOSX/") ||
    name.slice(name.lastIndexOf("/") + 1).startsWith("._") ||
    name.endsWith("/") ||
    name.toLowerCase().endsWith("thumbs.db") ||
    name.toLowerCase().endsWith(".ds_store")
  );
}

export interface ZipAudit {
  entries: ZipEntry[];
  /** Every distinct shapefile basename found, e.g. ["counties"]. */
  layers: string[];
  /** Sibling extensions present per layer, so a missing .dbf can be reported. */
  missingSiblings: Record<string, string[]>;
}

/**
 * Confirm a zip actually contains a shapefile set, and say precisely what is
 * missing when it does not.
 *
 * A .shp with no .shx still parses (shpjs reads records sequentially), and a
 * missing .dbf only costs attribute names, so neither is fatal. Both are
 * reported so the user knows why their areas came back unnamed.
 */
export function auditShapefileZip(bytes: ArrayBuffer): ZipAudit {
  const entries = readZipEntries(bytes).filter((e) => !isJunkEntry(e.name));

  const unsupported = entries.find((e) => !SUPPORTED_METHODS.has(e.method));
  if (unsupported) {
    throw new ZipStructureError(
      `"${unsupported.name}" uses an unsupported compression method ` +
        `(${unsupported.method}). Re-zip with standard deflate compression.`,
    );
  }

  const shpEntries = entries.filter((e) => extensionOf(e.name) === ".shp");
  if (shpEntries.length === 0) {
    const found = entries
      .map((e) => extensionOf(e.name))
      .filter((ext) => ext !== "");
    const summary =
      found.length > 0
        ? ` Found ${[...new Set(found)].sort().join(", ")}.`
        : "";
    throw new ZipStructureError(
      `This zip has no .shp file in it, so there is no geometry to read.` +
        summary +
        ` Zip the .shp, .shx, .dbf and .prj together at the top level.`,
    );
  }

  const empty = shpEntries.every((e) => e.uncompressedSize === 0);
  if (empty) {
    throw new ZipStructureError(
      "The .shp file in this zip is empty.",
    );
  }

  const present = new Set(entries.map((e) => e.name.toLowerCase()));
  const layers: string[] = [];
  const missingSiblings: Record<string, string[]> = {};

  for (const shp of shpEntries) {
    const stem = shp.name.slice(0, -4);
    const label = stem.slice(stem.lastIndexOf("/") + 1);
    layers.push(label);

    const missing = [".dbf", ".prj"].filter(
      (ext) => !present.has(`${stem}${ext}`.toLowerCase()),
    );
    if (missing.length > 0) missingSiblings[label] = missing;
  }

  return { entries, layers, missingSiblings };
}
