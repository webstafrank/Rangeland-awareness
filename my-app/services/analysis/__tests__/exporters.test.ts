/**
 * Downloads. The CSV quoting is the part with real failure modes, so it is
 * tested against the two cases that actually occur in Kenyan county data: a name
 * with an apostrophe (Murang'a) and a field with a comma in it. A file that
 * splits a county across two columns is worse than no download, because nobody
 * notices until the numbers have been quoted in a report.
 */
import { describe, expect, it } from "vitest";
import { DOWNLOAD_FORMATS } from "@/contracts/analysis";
import { escapeCsvField } from "../exporters";
import { createAnalysisService } from "../service";
import { BASE_CONFIG, COMPARISON_CONFIG, stubCatalog, stubGeo } from "./stubs";

const geo = stubGeo();
const analysis = createAnalysisService({ catalog: stubCatalog(), geo });

/** Four areas, so both the apostrophe and the comma name are in the file. */
const ALL_AREAS = {
  ...COMPARISON_CONFIG,
  areas: ["turkana", "marsabit", "muranga", "taita-taveta"],
};

const lines = (body: string): readonly string[] => body.split("\r\n");

describe("escapeCsvField", () => {
  it("leaves a plain field alone, apostrophes included", () => {
    expect(escapeCsvField("Turkana")).toBe("Turkana");
    expect(escapeCsvField("Murang'a")).toBe("Murang'a");
    expect(escapeCsvField(18.4)).toBe("18.4");
    expect(escapeCsvField(0)).toBe("0");
  });

  it("quotes a field with a comma", () => {
    expect(escapeCsvField("Taita, Taveta")).toBe('"Taita, Taveta"');
  });

  it("quotes a field with a quote and doubles the quote", () => {
    expect(escapeCsvField('the "long rains"')).toBe('"the ""long rains"""');
    expect(escapeCsvField('"')).toBe('""""');
  });

  it("quotes a field with a newline or a carriage return", () => {
    expect(escapeCsvField("two\nlines")).toBe('"two\nlines"');
    expect(escapeCsvField("two\r\nlines")).toBe('"two\r\nlines"');
  });

  it("writes nothing for a gap, never a zero", () => {
    expect(escapeCsvField(null)).toBe("");
    expect(escapeCsvField(undefined)).toBe("");
  });
});

describe("csv", () => {
  const result = analysis.run(ALL_AREAS);
  const payload = analysis.export(result, "csv");

  it("has the three headed sections, separated by blank lines", () => {
    const rows = lines(payload.body);
    expect(rows[0]).toBe("Run");
    expect(rows).toContain("Area results");
    expect(rows).toContain("Monthly series");
    expect(rows.filter((row) => row === "")).not.toHaveLength(0);
  });

  it("keeps the apostrophe in a county name unquoted and intact", () => {
    const row = lines(payload.body).find((line) => line.startsWith("muranga,"));
    expect(row).toBeDefined();
    expect(row).toContain("muranga,Murang'a,humid,");
  });

  it("quotes the county name that contains a comma, so the columns still line up", () => {
    const rows = lines(payload.body);
    const header = rows[rows.indexOf("Area results") + 1];
    const row = rows.find((line) => line.startsWith("taita-taveta,"));
    expect(row).toBeDefined();
    expect(row).toContain('"Taita, Taveta"');
    // The quoting is what makes this true: same number of fields as the header.
    expect(splitCsvRow(row ?? "")).toHaveLength(splitCsvRow(header).length);
  });

  it("quotes the narrative, which always contains commas", () => {
    const rows = lines(payload.body);
    const runRow = rows[2];
    expect(runRow).toContain(`"${result.narrative}"`);
    expect(splitCsvRow(runRow)).toHaveLength(splitCsvRow(rows[1]).length);
  });

  it("writes one series row per month with one column per area", () => {
    const rows = lines(payload.body);
    const start = rows.indexOf("Monthly series");
    const header = splitCsvRow(rows[start + 1]);
    expect(header).toEqual(["date", ...ALL_AREAS.areas]);
    const dataRows = rows.slice(start + 2).filter((row) => row !== "");
    expect(dataRows).toHaveLength(result.series.length);
    for (const row of dataRows) {
      expect(splitCsvRow(row)).toHaveLength(header.length);
    }
  });

  it("leaves a cloud-obscured month empty rather than zero", () => {
    const rows = lines(payload.body);
    const start = rows.indexOf("Monthly series");
    const dataRows = rows.slice(start + 2).filter((row) => row !== "");
    const gapRow = dataRows.find((row) => row.includes(",,") || row.endsWith(","));
    expect(gapRow).toBeDefined();
  });

  it("ends with a line ending, as a well-formed CSV does", () => {
    expect(payload.body.endsWith("\r\n")).toBe(true);
  });

  it("is served as csv and named for the topic and the run", () => {
    expect(payload.contentType).toBe("text/csv;charset=utf-8");
    expect(payload.filename).toBe(`drought-${result.runId}.csv`);
  });
});

describe("geojson", () => {
  const result = analysis.run(ALL_AREAS);
  const payload = analysis.export(result, "geojson");
  const parsed = JSON.parse(payload.body);

  it("is a FeatureCollection with one feature per area", () => {
    expect(parsed.type).toBe("FeatureCollection");
    expect(parsed.features).toHaveLength(ALL_AREAS.areas.length);
    expect(parsed.features.map((feature: { id: string }) => feature.id)).toEqual(ALL_AREAS.areas);
  });

  it("uses the centroid as a Point, because geo publishes no lon/lat rings", () => {
    for (const feature of parsed.features) {
      expect(feature.type).toBe("Feature");
      expect(feature.geometry.type).toBe("Point");
      expect(feature.geometry.coordinates).toHaveLength(2);
      const [lon, lat] = feature.geometry.coordinates;
      const area = geo.getArea(feature.id);
      expect([lon, lat]).toEqual([area.centroid[0], area.centroid[1]]);
    }
  });

  it("carries the caveat with the file, not just on the page it came from", () => {
    expect(parsed.note).toMatch(/[Ss]ynthetic/);
    expect(parsed.note).toMatch(/centroid/);
  });

  it("puts the result values in properties, with the names untouched", () => {
    const muranga = parsed.features.find((feature: { id: string }) => feature.id === "muranga");
    expect(muranga.properties.area_name).toBe("Murang'a");
    expect(muranga.properties.shape_id).toBe("KE-021");
    const entry = result.areas.find((candidate) => candidate.area.id === "muranga");
    expect(muranga.properties.estimate).toBe(entry?.estimate.value);
    expect(muranga.properties.band).toBe(entry?.band.label);
    expect(muranga.properties.severity).toBe(entry?.band.severity);
    expect(muranga.properties.change_yoy).toBe(entry?.changeYoY);
    expect(muranga.properties.affected_area_share).toBe(entry?.affectedAreaShare);
  });

  it("is served as geojson and named for the topic and the run", () => {
    expect(payload.contentType).toBe("application/geo+json");
    expect(payload.filename).toBe(`drought-${result.runId}.geojson`);
  });
});

describe("json", () => {
  const result = analysis.run(BASE_CONFIG);
  const payload = analysis.export(result, "json");

  it("round trips the whole result", () => {
    expect(JSON.parse(payload.body)).toEqual(JSON.parse(JSON.stringify(result)));
  });

  it("is pretty printed, so a human can read it in a browser tab", () => {
    expect(payload.body).toContain("\n  ");
    expect(payload.body.split("\n").length).toBeGreaterThan(20);
  });

  it("is served as json and named for the topic and the run", () => {
    expect(payload.contentType).toBe("application/json");
    expect(payload.filename).toBe(`drought-${result.runId}.json`);
  });
});

describe("all three formats", () => {
  const result = analysis.run(COMPARISON_CONFIG);

  it.each(DOWNLOAD_FORMATS)("%s returns a body, a content type and a filename", (format) => {
    const payload = analysis.export(result, format);
    expect(payload.body.length).toBeGreaterThan(0);
    expect(payload.contentType).toMatch(/\//);
    expect(payload.filename).toContain(result.runId);
    expect(payload.filename).toContain(result.topic.id);
    expect(payload.filename.endsWith(`.${format}`)).toBe(true);
  });

  it("is deterministic, like everything else here", () => {
    for (const format of DOWNLOAD_FORMATS) {
      expect(analysis.export(result, format)).toEqual(analysis.export(analysis.run(COMPARISON_CONFIG), format));
    }
  });
});

/**
 * A small RFC 4180 reader, so the tests check the file the way a spreadsheet
 * would rather than by naive splitting on commas (which is the bug being tested
 * for in the first place).
 */
function splitCsvRow(row: string): readonly string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < row.length; i += 1) {
    const character = row[i];
    if (inQuotes) {
      if (character === '"') {
        if (row[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += character;
      }
    } else if (character === '"') {
      inQuotes = true;
    } else if (character === ",") {
      fields.push(current);
      current = "";
    } else {
      current += character;
    }
  }
  fields.push(current);
  return fields;
}
