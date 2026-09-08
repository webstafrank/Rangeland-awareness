/**
 * Real shapefile bytes, built in code.
 *
 * The gate tests parse these with shpjs, the same third-party parser the app
 * uses. That round trip is the point: if shpjs reads back the polygon that was
 * encoded here, the writer and the reader are both right, and neither is
 * mocked. A hand-rolled fixture .zip checked into the repo would be a binary
 * blob nobody can inspect, which Safety forbids anyway.
 *
 * Format reference: ESRI Shapefile Technical Description, July 1998 (the .shp
 * and .shx layouts), and the dBASE III table format for .dbf.
 */

import { crc32 } from "node:zlib";

const SHAPE_TYPE_POLYGON = 5;
const SHAPE_TYPE_POINT = 1;

/** A ring of [lng, lat] pairs. Closed automatically if it is not already. */
export type Ring = readonly [number, number][];

function closeRing(ring: Ring): [number, number][] {
  const points = ring.map(([x, y]) => [x, y] as [number, number]);
  const first = points[0];
  const last = points[points.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) points.push([...first]);
  return points;
}

function bboxOf(rings: readonly Ring[]): [number, number, number, number] {
  const xs = rings.flatMap((r) => r.map(([x]) => x));
  const ys = rings.flatMap((r) => r.map(([, y]) => y));
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

/**
 * .shp / .shx pair for a set of single-ring polygons, one polygon per record.
 * Shapefile lengths are counted in 16-bit words, which is the detail that
 * makes every from-scratch writer wrong on the first try.
 */
function writePolygonShp(polygons: readonly Ring[]): {
  shp: Buffer;
  shx: Buffer;
} {
  const records = polygons.map(closeRing);

  const contents = records.map((points) => {
    // shape type + bbox(4d) + numParts + numPoints + parts(1) + points(2d each)
    const size = 4 + 32 + 4 + 4 + 4 + points.length * 16;
    const buf = Buffer.alloc(size);
    const [xmin, ymin, xmax, ymax] = bboxOf([points]);

    let o = 0;
    buf.writeInt32LE(SHAPE_TYPE_POLYGON, o); o += 4;
    buf.writeDoubleLE(xmin, o); o += 8;
    buf.writeDoubleLE(ymin, o); o += 8;
    buf.writeDoubleLE(xmax, o); o += 8;
    buf.writeDoubleLE(ymax, o); o += 8;
    buf.writeInt32LE(1, o); o += 4;               // one part
    buf.writeInt32LE(points.length, o); o += 4;
    buf.writeInt32LE(0, o); o += 4;               // part 0 starts at point 0
    for (const [x, y] of points) {
      buf.writeDoubleLE(x, o); o += 8;
      buf.writeDoubleLE(y, o); o += 8;
    }
    return buf;
  });

  return assemble(contents, SHAPE_TYPE_POLYGON, bboxOf(records));
}

/** .shp / .shx pair for point records. Used to test the non-area skip path. */
function writePointShp(points: readonly [number, number][]): {
  shp: Buffer;
  shx: Buffer;
} {
  const contents = points.map(([x, y]) => {
    const buf = Buffer.alloc(20);
    buf.writeInt32LE(SHAPE_TYPE_POINT, 0);
    buf.writeDoubleLE(x, 4);
    buf.writeDoubleLE(y, 12);
    return buf;
  });
  return assemble(contents, SHAPE_TYPE_POINT, bboxOf([points]));
}

/** Shared header/record framing for both shape types. */
function assemble(
  contents: readonly Buffer[],
  shapeType: number,
  bbox: [number, number, number, number],
): { shp: Buffer; shx: Buffer } {
  const HEADER = 100;
  const RECORD_HEADER = 8;

  const shpSize =
    HEADER + contents.reduce((n, c) => n + RECORD_HEADER + c.length, 0);
  const shp = Buffer.alloc(shpSize);
  const shx = Buffer.alloc(HEADER + contents.length * 8);

  const header = (buf: Buffer, totalBytes: number) => {
    buf.writeInt32BE(9994, 0);                    // file code
    buf.writeInt32BE(totalBytes / 2, 24);         // length in 16-bit words
    buf.writeInt32LE(1000, 28);                   // version
    buf.writeInt32LE(shapeType, 32);
    buf.writeDoubleLE(bbox[0], 36);
    buf.writeDoubleLE(bbox[1], 44);
    buf.writeDoubleLE(bbox[2], 52);
    buf.writeDoubleLE(bbox[3], 60);
  };
  header(shp, shpSize);
  header(shx, shx.length);

  let offset = HEADER;
  contents.forEach((content, i) => {
    shp.writeInt32BE(i + 1, offset);              // record number, 1-based
    shp.writeInt32BE(content.length / 2, offset + 4);
    content.copy(shp, offset + RECORD_HEADER);

    shx.writeInt32BE(offset / 2, HEADER + i * 8);
    shx.writeInt32BE(content.length / 2, HEADER + i * 8 + 4);

    offset += RECORD_HEADER + content.length;
  });

  return { shp, shx };
}

/**
 * A dBASE III .dbf holding one character column per key.
 * Every value is written as a fixed-width character field, which is legal and
 * is what most GIS exporters do for name columns anyway.
 */
function writeDbf(rows: readonly Record<string, string>[]): Buffer {
  const columns = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const widths = new Map(
    columns.map((c) => [
      c,
      Math.max(1, ...rows.map((r) => Buffer.byteLength(r[c] ?? ""))),
    ]),
  );

  const headerLength = 32 + 32 * columns.length + 1;
  const recordLength =
    1 + columns.reduce((n, c) => n + (widths.get(c) as number), 0);

  const header = Buffer.alloc(headerLength);
  header.writeUInt8(0x03, 0);                     // dBASE III, no memo
  header.writeUInt8(26, 1);                       // year 1926 -> stable bytes
  header.writeUInt8(9, 2);
  header.writeUInt8(8, 3);
  header.writeInt32LE(rows.length, 4);
  header.writeInt16LE(headerLength, 8);
  header.writeInt16LE(recordLength, 10);

  columns.forEach((column, i) => {
    const at = 32 + i * 32;
    // Field names are 11 bytes, null-terminated, and truncated hard by spec.
    header.write(column.slice(0, 10), at, 10, "ascii");
    header.write("C", at + 11, 1, "ascii");       // character type
    header.writeUInt8(widths.get(column) as number, at + 16);
    header.writeUInt8(0, at + 17);                // decimal count
  });
  header.writeUInt8(0x0d, headerLength - 1);      // field descriptor terminator

  const body = Buffer.concat(
    rows.map((row) => {
      const record = Buffer.alloc(recordLength, 0x20); // space-filled
      let o = 1;                                       // byte 0 = not deleted
      for (const column of columns) {
        const width = widths.get(column) as number;
        record.write((row[column] ?? "").slice(0, width), o, width, "ascii");
        o += width;
      }
      return record;
    }),
  );

  return Buffer.concat([header, body, Buffer.from([0x1a])]);
}

/** WKT for EPSG:4326, so shpjs treats coordinates as degrees. */
export const WGS84_PRJ =
  'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,' +
  '298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]';

/** WKT for UTM zone 37N, used to prove the projected-coordinate guard. */
export const UTM37N_PRJ =
  'PROJCS["WGS_1984_UTM_Zone_37N",GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",' +
  'SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],' +
  'UNIT["Degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],' +
  'PARAMETER["False_Easting",500000.0],PARAMETER["False_Northing",0.0],' +
  'PARAMETER["Central_Meridian",39.0],PARAMETER["Scale_Factor",0.9996],' +
  'PARAMETER["Latitude_Of_Origin",0.0],UNIT["Meter",1.0]]';

/**
 * A stored (uncompressed) ZIP. No compression on purpose: it keeps this writer
 * to one CRC call and removes deflate as a variable when a parse fails.
 */
export function makeZip(entries: Record<string, Buffer | string>): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const [rawName, rawData] of Object.entries(entries)) {
    const name = Buffer.from(rawName, "ascii");
    const data = Buffer.isBuffer(rawData) ? rawData : Buffer.from(rawData, "utf8");
    const sum = crc32(data);

    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);           // local file header signature
    local.writeUInt16LE(20, 4);                   // version needed
    local.writeUInt16LE(0, 6);                    // flags
    local.writeUInt16LE(0, 8);                    // method 0 = stored
    local.writeUInt16LE(0, 10);                   // time
    local.writeUInt16LE(0x21, 12);                // date, fixed for determinism
    local.writeUInt32LE(sum, 14);
    local.writeUInt32LE(data.length, 18);         // compressed size
    local.writeUInt32LE(data.length, 22);         // uncompressed size
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);                   // extra field length
    name.copy(local, 30);

    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);         // central directory signature
    central.writeUInt16LE(20, 4);                 // version made by
    central.writeUInt16LE(20, 6);                 // version needed
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0x21, 14);
    central.writeUInt32LE(sum, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);                 // extra
    central.writeUInt16LE(0, 32);                 // comment
    central.writeUInt16LE(0, 34);                 // disk number
    central.writeUInt16LE(0, 36);                 // internal attrs
    central.writeUInt32LE(0, 38);                 // external attrs
    central.writeUInt32LE(offset, 42);            // offset of local header
    name.copy(central, 46);

    locals.push(local, data);
    centrals.push(central);
    offset += local.length + data.length;
  }

  const centralDirectory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);               // end of central directory
  end.writeUInt16LE(0, 4);                        // this disk
  end.writeUInt16LE(0, 6);                        // disk with central dir
  end.writeUInt16LE(centrals.length, 8);
  end.writeUInt16LE(centrals.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);                       // comment length

  return Buffer.concat([...locals, centralDirectory, end]);
}

export interface PolygonShapefileSpec {
  /** Base name inside the zip. shpjs uses it as fileName on the collection. */
  base?: string;
  polygons: readonly Ring[];
  /** One attribute row per polygon. */
  rows?: readonly Record<string, string>[];
  /** Omit to leave out the .prj entirely. */
  prj?: string | null;
  /** Omit the .dbf, to test a set with no attribute table. */
  includeDbf?: boolean;
  /** Extra archive members, e.g. the metadata a mac zip adds. */
  extras?: Record<string, Buffer | string>;
}

/** A zipped polygon shapefile, ready to hand to shpjs or a file input. */
export function makePolygonShapefileZip(spec: PolygonShapefileSpec): Buffer {
  const base = spec.base ?? "areas";
  const { shp, shx } = writePolygonShp(spec.polygons);
  const entries: Record<string, Buffer | string> = { ...spec.extras };
  entries[`${base}.shp`] = shp;
  entries[`${base}.shx`] = shx;
  if (spec.includeDbf !== false) {
    entries[`${base}.dbf`] = writeDbf(
      spec.rows ?? spec.polygons.map((_, i) => ({ NAME: `Area ${i + 1}` })),
    );
  }
  if (spec.prj !== null) entries[`${base}.prj`] = spec.prj ?? WGS84_PRJ;
  return makeZip(entries);
}

/** A bare, unzipped .shp file: geometry only, no attributes, no projection. */
export function bareShp(polygons: readonly Ring[]): Buffer {
  return writePolygonShp(polygons).shp;
}

/** A zipped point shapefile, for the "polygons only" rejection path. */
export function makePointShapefileZip(
  points: readonly [number, number][],
  base = "points",
): Buffer {
  const { shp, shx } = writePointShp(points);
  return makeZip({
    [`${base}.shp`]: shp,
    [`${base}.shx`]: shx,
    [`${base}.dbf`]: writeDbf(points.map((_, i) => ({ NAME: `Point ${i + 1}` }))),
    [`${base}.prj`]: WGS84_PRJ,
  });
}

/** A rectangle ring, in [lng, lat], closed. */
export function rect(
  west: number,
  south: number,
  east: number,
  north: number,
): Ring {
  return [
    [west, south],
    [east, south],
    [east, north],
    [west, north],
    [west, south],
  ];
}

/**
 * A Ring as the mutable `number[][]` GeoJSON's Polygon type wants.
 * Ring is readonly so fixtures cannot be edited by accident; GeoJSON's
 * coordinates are mutable, so the copy happens here rather than at each use.
 */
export function ringCoordinates(ring: Ring): number[][] {
  return ring.map(([lng, lat]) => [lng, lat]);
}
