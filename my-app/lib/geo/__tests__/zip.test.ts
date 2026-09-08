import { describe, expect, it } from "vitest";
import {
  ZipStructureError,
  auditShapefileZip,
  readZipEntries,
} from "@/lib/geo/zip";
import { makePolygonShapefileZip, makeZip, rect } from "./fixtures/make-shapefile";

const toArrayBuffer = (b: Buffer): ArrayBuffer =>
  b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;

const BOX = rect(37.9, 2.2, 38.1, 2.4);

describe("readZipEntries", () => {
  it("lists every member of a well-formed archive", () => {
    const zip = makeZip({ "a.txt": "one", "b/c.bin": Buffer.alloc(8, 1) });
    const entries = readZipEntries(toArrayBuffer(zip));
    expect(entries.map((e) => e.name)).toEqual(["a.txt", "b/c.bin"]);
    expect(entries[0].uncompressedSize).toBe(3);
    expect(entries[1].uncompressedSize).toBe(8);
    expect(entries.every((e) => e.method === 0)).toBe(true);
  });

  it("rejects a file too small to be an archive", () => {
    expect(() => readZipEntries(new ArrayBuffer(4))).toThrow(/too small/);
  });

  it("rejects bytes with no zip file header", () => {
    const notZip = Buffer.from("id,rainfall\n1,220\n2,190\n".repeat(4));
    expect(() => readZipEntries(toArrayBuffer(notZip))).toThrow(
      /not a zip archive/,
    );
  });

  it("rejects zip-ish bytes with no central directory, in bounded time", () => {
    // This is the exact input that hangs shpjs. The backward scan for the EOCD
    // is bounded by the maximum comment length, so it must return fast.
    const junk = Buffer.from("PK and then nothing valid at all");
    const started = Date.now();
    expect(() => readZipEntries(toArrayBuffer(junk))).toThrow(ZipStructureError);
    expect(Date.now() - started).toBeLessThan(200);
  });

  it("stays bounded on a large PK-prefixed blob", () => {
    // 4MB of "PK" noise: the scan must look at the last 64KB only, not all of it.
    const big = Buffer.alloc(4 * 1024 * 1024, 0x50);
    big.writeUInt32LE(0x04034b50, 0); // convincing lead signature
    const started = Date.now();
    expect(() => readZipEntries(toArrayBuffer(big))).toThrow(ZipStructureError);
    expect(Date.now() - started).toBeLessThan(500);
  });

  it("rejects a directory that points past the end of the file", () => {
    const zip = makeZip({ "a.txt": "one" });
    const view = new DataView(toArrayBuffer(zip));
    // Find the EOCD and push its central-directory offset out of range.
    const eocd = zip.length - 22;
    const patched = Buffer.from(zip);
    patched.writeUInt32LE(0xfffffff0 >>> 0, eocd + 16);
    expect(view.byteLength).toBeGreaterThan(0);
    expect(() => readZipEntries(toArrayBuffer(patched))).toThrow(
      /outside the file|zip64/,
    );
  });

  it("rejects an archive claiming zero entries", () => {
    const zip = makeZip({ "a.txt": "one" });
    const patched = Buffer.from(zip);
    patched.writeUInt16LE(0, zip.length - 22 + 10);
    expect(() => readZipEntries(toArrayBuffer(patched))).toThrow(/empty/);
  });

  it("rejects a corrupt central directory record", () => {
    const zip = makeZip({ "a.txt": "one" });
    const patched = Buffer.from(zip);
    const cdOffset = zip.readUInt32LE(zip.length - 22 + 16);
    patched.writeUInt32LE(0xdeadbeef, cdOffset); // wrong signature
    expect(() => readZipEntries(toArrayBuffer(patched))).toThrow(
      /file list is corrupt/,
    );
  });
});

describe("auditShapefileZip", () => {
  it("finds the layer in a complete shapefile set", () => {
    const zip = makePolygonShapefileZip({ base: "counties", polygons: [BOX] });
    const audit = auditShapefileZip(toArrayBuffer(zip));
    expect(audit.layers).toEqual(["counties"]);
    expect(audit.missingSiblings).toEqual({});
  });

  it("names the extensions present when there is no .shp", () => {
    const zip = makeZip({
      "notes.txt": "hello",
      "rainfall.csv": "a,b",
      "map.png": Buffer.alloc(4),
    });
    const error = (() => {
      try {
        auditShapefileZip(toArrayBuffer(zip));
        return null;
      } catch (e) {
        return e as Error;
      }
    })();

    expect(error).toBeInstanceOf(ZipStructureError);
    expect(error?.message).toMatch(/no \.shp file in it/);
    expect(error?.message).toMatch(/Found \.csv, \.png, \.txt/);
  });

  it("reports a missing .dbf and .prj without failing", () => {
    const zip = makePolygonShapefileZip({
      base: "aoi",
      polygons: [BOX],
      includeDbf: false,
      prj: null,
    });
    const audit = auditShapefileZip(toArrayBuffer(zip));
    expect(audit.layers).toEqual(["aoi"]);
    expect(audit.missingSiblings.aoi).toEqual([".dbf", ".prj"]);
  });

  it("ignores mac and windows metadata when finding layers", () => {
    const zip = makePolygonShapefileZip({
      base: "counties",
      polygons: [BOX],
      extras: {
        "__MACOSX/._counties.shp": Buffer.from("resource fork"),
        "._counties.shp": Buffer.from("resource fork"),
        ".DS_Store": Buffer.from("finder"),
        "Thumbs.db": Buffer.from("windows"),
      },
    });
    const audit = auditShapefileZip(toArrayBuffer(zip));
    // Exactly one layer, despite three entries whose names end in .shp.
    expect(audit.layers).toEqual(["counties"]);
  });

  it("rejects an empty .shp", () => {
    const zip = makeZip({ "empty.shp": Buffer.alloc(0), "empty.dbf": "x" });
    expect(() => auditShapefileZip(toArrayBuffer(zip))).toThrow(
      /\.shp file in this zip is empty/,
    );
  });

  it("finds a shapefile nested in a folder inside the zip", () => {
    const zip = makePolygonShapefileZip({
      base: "export/kenya/counties",
      polygons: [BOX],
    });
    const audit = auditShapefileZip(toArrayBuffer(zip));
    // The layer label is the basename, not the whole path.
    expect(audit.layers).toEqual(["counties"]);
    expect(audit.missingSiblings).toEqual({});
  });

  it("rejects an unsupported compression method by name", () => {
    const zip = makeZip({ "a.shp": Buffer.alloc(120, 1) });
    const patched = Buffer.from(zip);
    // Method field in the central directory record: bzip2 (12).
    const cdOffset = zip.readUInt32LE(zip.length - 22 + 16);
    patched.writeUInt16LE(12, cdOffset + 10);
    expect(() => auditShapefileZip(toArrayBuffer(patched))).toThrow(
      /unsupported compression method \(12\)/,
    );
  });
});
