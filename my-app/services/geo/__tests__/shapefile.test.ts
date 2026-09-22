import { describe, expect, it } from "vitest";
import shp from "shpjs";
import {
  ACCEPTED_EXTENSIONS,
  MAX_SHAPEFILE_BYTES,
  ShapefileError,
  labelFromProperties,
  normalizeCollections,
  readShapefile,
} from "@/services/geo/shapefile";
import {
  UTM37N_PRJ,
  bareShp,
  makePointShapefileZip,
  makePolygonShapefileZip,
  makeZip,
  rect,
  ringCoordinates,
} from "./fixtures/make-shapefile";
import type { FeatureCollection } from "geojson";

/** Wrap bytes in a File the way a browser file input would. */
function asFile(bytes: Buffer, name: string): File {
  return new File([new Uint8Array(bytes)], name);
}

const toArrayBuffer = (b: Buffer): ArrayBuffer =>
  b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;

/** Two small boxes near Marsabit and Turkana, in [lng, lat]. */
const MARSABIT = rect(37.9, 2.2, 38.1, 2.4);
const TURKANA = rect(35.5, 3.0, 35.8, 3.3);

describe("fixture round trip through shpjs", () => {
  // If the fixture writer were wrong, every test below would be testing
  // nothing. This is the test that makes the rest of the file meaningful:
  // a third-party parser reads back exactly the polygon that was encoded.
  it("parses a zipped polygon shapefile back into the polygon it encoded", async () => {
    const zip = makePolygonShapefileZip({
      polygons: [MARSABIT],
      rows: [{ NAME: "Marsabit" }],
    });

    const parsed = (await shp(toArrayBuffer(zip))) as FeatureCollection;

    expect(parsed.type).toBe("FeatureCollection");
    expect(parsed.features).toHaveLength(1);
    expect(parsed.features[0].geometry.type).toBe("Polygon");
    expect(parsed.features[0].properties).toMatchObject({ NAME: "Marsabit" });

    const coords = (parsed.features[0].geometry as { coordinates: number[][][] })
      .coordinates[0];
    expect(Math.min(...coords.map(([lng]) => lng))).toBeCloseTo(37.9, 6);
    expect(Math.max(...coords.map(([lng]) => lng))).toBeCloseTo(38.1, 6);
    expect(Math.min(...coords.map(([, lat]) => lat))).toBeCloseTo(2.2, 6);
    expect(Math.max(...coords.map(([, lat]) => lat))).toBeCloseTo(2.4, 6);
  });
});

describe("readShapefile: the happy path", () => {
  it("reads a two-feature zip into two named areas with bounds and area", async () => {
    const zip = makePolygonShapefileZip({
      base: "counties",
      polygons: [MARSABIT, TURKANA],
      rows: [{ NAME: "Marsabit" }, { NAME: "Turkana" }],
    });

    const { areas, warnings } = await readShapefile(asFile(zip, "counties.zip"));

    expect(warnings).toEqual([]);
    expect(areas.map((a) => a.label)).toEqual(["Marsabit", "Turkana"]);
    expect(areas.every((a) => a.source === "shapefile")).toBe(true);

    const [marsabit] = areas;
    expect(marsabit.bounds[0][0]).toBeCloseTo(2.2, 6); // south
    expect(marsabit.bounds[0][1]).toBeCloseTo(37.9, 6); // west
    expect(marsabit.bounds[1][0]).toBeCloseTo(2.4, 6); // north
    expect(marsabit.bounds[1][1]).toBeCloseTo(38.1, 6); // east

    // 0.2 x 0.2 degrees near the equator is roughly 22.2 x 22.2 km.
    expect(marsabit.areaKm2).toBeGreaterThan(480);
    expect(marsabit.areaKm2).toBeLessThan(500);
  });

  it("keeps the attribute row on the feature for later use", async () => {
    const zip = makePolygonShapefileZip({
      polygons: [MARSABIT],
      rows: [{ NAME: "Marsabit", CODE: "011" }],
    });
    const { areas } = await readShapefile(asFile(zip, "a.zip"));
    expect(areas[0].feature.properties).toMatchObject({
      NAME: "Marsabit",
      CODE: "011",
    });
  });

  it("falls back to the layer name when there is no attribute table", async () => {
    const zip = makePolygonShapefileZip({
      base: "aoi",
      polygons: [MARSABIT],
      includeDbf: false,
    });

    const { areas, warnings } = await readShapefile(asFile(zip, "aoi.zip"));
    expect(areas).toHaveLength(1);
    expect(areas[0].label).toBe("aoi");
    expect(warnings.join(" ")).toMatch(/no \.dbf/);
  });

  it("warns when the .prj is missing rather than silently assuming WGS84", async () => {
    const zip = makePolygonShapefileZip({
      base: "aoi",
      polygons: [MARSABIT],
      rows: [{ NAME: "Marsabit" }],
      prj: null,
    });
    const { areas, warnings } = await readShapefile(asFile(zip, "aoi.zip"));
    expect(areas).toHaveLength(1);
    expect(warnings.join(" ")).toMatch(/no \.prj/);
  });

  it("reprojects a UTM shapefile when the .prj is present", async () => {
    // 500000E is the zone-37N false easting, i.e. the 39E central meridian.
    const utmBox: [number, number][] = [
      [500000, 250000],
      [510000, 250000],
      [510000, 260000],
      [500000, 260000],
      [500000, 250000],
    ];
    const zip = makePolygonShapefileZip({
      base: "utm",
      polygons: [utmBox],
      rows: [{ NAME: "Reprojected" }],
      prj: UTM37N_PRJ,
    });

    const { areas } = await readShapefile(asFile(zip, "utm.zip"));
    expect(areas).toHaveLength(1);
    // Reprojected, so bounds must land in degrees near 39E / 2.3N.
    expect(areas[0].bounds[0][1]).toBeGreaterThan(38.5);
    expect(areas[0].bounds[1][1]).toBeLessThan(39.5);
    expect(areas[0].bounds[0][0]).toBeGreaterThan(2);
    expect(areas[0].bounds[1][0]).toBeLessThan(2.5);
  });

  it("ignores mac metadata sitting next to the shapefile", async () => {
    const zip = makePolygonShapefileZip({
      base: "counties",
      polygons: [MARSABIT],
      rows: [{ NAME: "Marsabit" }],
      extras: {
        "__MACOSX/._counties.shp": Buffer.from("resource fork junk"),
        ".DS_Store": Buffer.from("finder junk"),
      },
    });

    const { areas } = await readShapefile(asFile(zip, "counties.zip"));
    // One area, not two: the ._counties.shp must not register as a layer.
    expect(areas).toHaveLength(1);
    expect(areas[0].label).toBe("Marsabit");
  });
});

describe("readShapefile: a bare .shp", () => {
  it("reads geometry and says why the areas are unnamed", async () => {
    const { areas, warnings } = await readShapefile(
      asFile(bareShp([MARSABIT]), "block.shp"),
    );
    expect(areas).toHaveLength(1);
    expect(areas[0].label).toBe("block");
    expect(warnings[0]).toMatch(/geometry only/);
    expect(warnings[0]).toMatch(/unnamed/);
  });

  it("reports a readable error for a corrupt .shp", async () => {
    const error = await readShapefile(
      asFile(Buffer.alloc(400, 0xab), "junk.shp"),
    ).catch((e) => e);
    expect(error).toBeInstanceOf(ShapefileError);
    expect((error as Error).message).toMatch(/Could not read "junk\.shp"/);
  });
});

describe("readShapefile: rejections the user can act on", () => {
  it("rejects a file whose extension is not a shapefile", async () => {
    await expect(
      readShapefile(asFile(Buffer.from("nope"), "rainfall.csv")),
    ).rejects.toThrow(/not a shapefile/);
  });

  it("rejects an empty file", async () => {
    await expect(
      readShapefile(asFile(Buffer.alloc(0), "empty.zip")),
    ).rejects.toThrow(/is empty/);
  });

  it("rejects a file over the size limit without trying to parse it", async () => {
    const oversized = asFile(Buffer.from("x"), "big.zip");
    // Patch size rather than allocating 64MB inside a gate test.
    Object.defineProperty(oversized, "size", {
      value: MAX_SHAPEFILE_BYTES + 1,
    });
    await expect(readShapefile(oversized)).rejects.toThrow(/The limit is 64MB/);
  });

  it("names the missing .shp for a zip that has none", async () => {
    const zip = makeZip({ "readme.txt": "not a shapefile", "data.csv": "a,b" });
    const error = await readShapefile(asFile(zip, "bundle.zip")).catch((e) => e);
    expect(error).toBeInstanceOf(ShapefileError);
    expect((error as Error).message).toMatch(/no \.shp file in it/);
    // The message names what was actually in the archive.
    expect((error as Error).message).toMatch(/Found \.csv, \.txt/);
  });

  it("rejects zip-ish bytes that are not a zip, WITHOUT hanging", async () => {
    // Regression test for a measured hang. A buffer whose first bytes are "PK"
    // but which carries no End Of Central Directory record makes shpjs's unzip
    // layer spin synchronously and forever: try/catch cannot catch it and a
    // Promise timeout cannot fire, because the event loop never gets a turn.
    // The pre-flight in services/geo/zip.ts must reject it before shpjs sees it.
    // If this test ever TIMES OUT rather than failing, the pre-flight is gone.
    const junk = Buffer.from("PK and then nothing valid at all");
    const started = Date.now();
    const error = await readShapefile(asFile(junk, "corrupt.zip")).catch((e) => e);

    expect(error).toBeInstanceOf(ShapefileError);
    expect((error as Error).message).toMatch(/corrupt\.zip/);
    expect((error as Error).message).toMatch(/not a zip archive/);
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it("rejects a zip truncated in transfer", async () => {
    const zip = makePolygonShapefileZip({ polygons: [MARSABIT] });
    const truncated = zip.subarray(0, Math.floor(zip.length / 2));
    const error = await readShapefile(asFile(truncated, "half.zip")).catch((e) => e);
    expect(error).toBeInstanceOf(ShapefileError);
    expect((error as Error).message).toMatch(/damaged|not a zip archive/);
  });

  it("skips point features and says an area needs a polygon", async () => {
    const zip = makePointShapefileZip([
      [37.9, 2.2],
      [35.5, 3.0],
    ]);
    const error = await readShapefile(asFile(zip, "points.zip")).catch((e) => e);
    expect(error).toBeInstanceOf(ShapefileError);
    expect((error as Error).message).toMatch(/needs a polygon/);
  });

  it("accepts exactly .zip and .shp", () => {
    expect([...ACCEPTED_EXTENSIONS]).toEqual([".zip", ".shp"]);
  });
});

describe("projected coordinates with no .prj to fix them", () => {
  it("skips features whose coordinates are metres, not degrees", () => {
    const projected: FeatureCollection = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { NAME: "Utm block" },
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [600000, 250000],
                [610000, 250000],
                [610000, 260000],
                [600000, 260000],
                [600000, 250000],
              ],
            ],
          },
        },
      ],
    };

    let thrown: unknown = null;
    try {
      normalizeCollections([projected]);
    } catch (e) {
      thrown = e;
    }

    expect(thrown).toBeInstanceOf(ShapefileError);
    expect((thrown as Error).message).toMatch(/latitude and longitude/);
    expect((thrown as Error).message).toMatch(/EPSG:4326/);
  });

  it("accepts coordinates exactly on the domain edge", () => {
    const edge: FeatureCollection = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { NAME: "Whole world" },
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [-180, -90],
                [180, -90],
                [180, 90],
                [-180, 90],
                [-180, -90],
              ],
            ],
          },
        },
      ],
    };
    expect(normalizeCollections([edge]).areas).toHaveLength(1);
  });
});

describe("labelFromProperties", () => {
  it("prefers a name column", () => {
    expect(labelFromProperties({ NAME: "Isiolo", ID: 7 }, "fallback")).toBe(
      "Isiolo",
    );
  });

  it("is case insensitive across the whole key set", () => {
    expect(labelFromProperties({ County: "Garissa" }, "fallback")).toBe("Garissa");
    expect(labelFromProperties({ ADM2_EN: "Laisamis" }, "fallback")).toBe(
      "Laisamis",
    );
  });

  it("matches prefixed variants like NAME_1", () => {
    expect(labelFromProperties({ NAME_1: "Wajir" }, "fallback")).toBe("Wajir");
  });

  it("ignores blank and non-string values", () => {
    expect(labelFromProperties({ name: "   ", admin: "Tana River" }, "f")).toBe(
      "Tana River",
    );
    expect(labelFromProperties({ name: null }, "fallback")).toBe("fallback");
  });

  it("uses the fallback when there is nothing usable", () => {
    expect(labelFromProperties({ pop: 1200 }, "Area 3")).toBe("Area 3");
    expect(labelFromProperties(null, "Area 3")).toBe("Area 3");
  });

  it("accepts a numeric id as a last resort", () => {
    expect(labelFromProperties({ id: 42 }, "fallback")).toBe("42");
  });

  it("trims surrounding whitespace, which dbf padding always leaves", () => {
    expect(labelFromProperties({ NAME: "  Samburu  " }, "fallback")).toBe(
      "Samburu",
    );
  });
});

describe("normalizeCollections", () => {
  it("numbers unnamed features per layer", () => {
    const collection: FeatureCollection & { fileName?: string } = {
      type: "FeatureCollection",
      fileName: "blocks",
      features: [MARSABIT, TURKANA].map((ring) => ({
        type: "Feature" as const,
        properties: { pop: 10 },
        geometry: { type: "Polygon" as const, coordinates: [ringCoordinates(ring)] },
      })),
    };

    const { areas } = normalizeCollections([collection]);
    expect(areas.map((a) => a.label)).toEqual(["blocks 1", "blocks 2"]);
  });

  it("uses the bare layer name when the layer holds exactly one feature", () => {
    const { areas } = normalizeCollections([
      {
        type: "FeatureCollection",
        fileName: "aoi",
        features: [
          {
            type: "Feature",
            properties: {},
            geometry: { type: "Polygon", coordinates: [ringCoordinates(MARSABIT)] },
          },
        ],
      } as FeatureCollection & { fileName?: string },
    ]);
    expect(areas[0].label).toBe("aoi");
  });

  it("throws rather than returning an empty selection", () => {
    expect(() =>
      normalizeCollections([{ type: "FeatureCollection", features: [] }]),
    ).toThrow(ShapefileError);
  });

  it("merges features from several layers in one archive", () => {
    const layer = (name: string, ring: readonly [number, number][]) =>
      ({
        type: "FeatureCollection",
        fileName: name,
        features: [
          {
            type: "Feature" as const,
            properties: { NAME: name },
            geometry: { type: "Polygon" as const, coordinates: [ringCoordinates(ring)] },
          },
        ],
      }) as FeatureCollection & { fileName?: string };

    const { areas } = normalizeCollections([
      layer("north", MARSABIT),
      layer("west", TURKANA),
    ]);
    expect(areas.map((a) => a.label)).toEqual(["north", "west"]);
  });
});
