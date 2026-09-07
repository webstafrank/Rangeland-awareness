/**
 * Downloads.
 *
 * Three formats, three audiences: CSV for whoever opens it in a spreadsheet,
 * GeoJSON for whoever drops it on a map, JSON for whoever writes code against
 * it. All three are produced from the result object alone, so a download can
 * never disagree with the page the user was looking at.
 *
 * The CSV path is the one with teeth. County names in Kenya include an
 * apostrophe (Murang'a), band labels and narratives include commas, and a naive
 * join would corrupt the row. RFC 4180 quoting is implemented here and tested
 * against exactly those cases.
 */
import type { DownloadFormat, RunResult } from "@/contracts/analysis";

export interface ExportPayload {
  body: string;
  contentType: string;
  filename: string;
}

/** RFC 4180 line ending. Excel and LibreOffice both accept it, and so does every parser. */
const CRLF = "\r\n";

const CONTENT_TYPES: Readonly<Record<DownloadFormat, string>> = {
  csv: "text/csv;charset=utf-8",
  geojson: "application/geo+json",
  json: "application/json",
};

const EXTENSIONS: Readonly<Record<DownloadFormat, string>> = {
  csv: "csv",
  geojson: "geojson",
  json: "json",
};

/**
 * Quotes a CSV field when it has to be quoted, and doubles any embedded quote.
 * An apostrophe needs no quoting at all (it is not a CSV metacharacter), which
 * is worth stating because it is the case people wrongly special-case.
 */
export function escapeCsvField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function csvRow(cells: readonly (string | number | null | undefined)[]): string {
  return cells.map(escapeCsvField).join(",");
}

/**
 * Three headed sections in one file: the run's identity, the per-area results,
 * and the monthly series. Sections are separated by a blank line and each opens
 * with its own title row, so a reader can see what they are looking at and a
 * script can split on the titles.
 */
export function toCsv(result: RunResult): string {
  const { indicator } = result;
  const areaIds = result.areas.map((entry) => entry.area.id);

  const lines: string[] = [];

  lines.push(csvRow(["Run"]));
  lines.push(
    csvRow([
      "run_id",
      "topic",
      "indicator",
      "unit",
      "model",
      "analysis_type",
      "window_start",
      "window_end",
      "generated_at",
      "headline_severity",
      "narrative",
    ]),
  );
  lines.push(
    csvRow([
      result.runId,
      result.topic.id,
      indicator.longLabel,
      indicator.unit,
      result.metrics.model.id,
      result.analysisType,
      result.config.dateRange.start,
      result.config.dateRange.end,
      result.generatedAt,
      result.headlineSeverity,
      result.narrative,
    ]),
  );

  lines.push("");
  lines.push(csvRow(["Area results"]));
  lines.push(
    csvRow([
      "area_id",
      "area_name",
      "climate_zone",
      "estimate",
      "lower_90",
      "upper_90",
      "band",
      "severity",
      "change_yoy",
      "population_exposed_scaffold",
      "affected_area_share",
    ]),
  );
  for (const entry of result.areas) {
    lines.push(
      csvRow([
        entry.area.id,
        entry.area.name,
        entry.area.climateZone,
        entry.estimate.value,
        entry.estimate.lower,
        entry.estimate.upper,
        entry.band.label,
        entry.band.severity,
        entry.changeYoY,
        entry.populationExposed,
        entry.affectedAreaShare,
      ]),
    );
  }

  lines.push("");
  lines.push(csvRow(["Monthly series"]));
  lines.push(csvRow(["date", ...areaIds]));
  for (const point of result.series) {
    // A cloud-obscured month is an empty cell, never a zero: a zero would be
    // read as an observation of nothing rather than as no observation.
    lines.push(csvRow([point.date, ...areaIds.map((id) => point.values[id] ?? null)]));
  }

  return lines.join(CRLF) + CRLF;
}

/**
 * A FeatureCollection, one Feature per area.
 *
 * LIMITATION, stated here and in the README: the geometry is the area's
 * centroid as a Point, not its boundary. `services/geo` publishes boundaries as
 * SVG paths in a projected frame, not as lon/lat rings, and inventing rings from
 * a projected path would produce a file that looks authoritative and is wrong.
 * A point at the label anchor is honest, and every consumer can join it back to
 * an official boundary by `shape_id`.
 */
export function toGeoJson(result: RunResult): string {
  const collection = {
    type: "FeatureCollection",
    // Foreign members are legal in GeoJSON, and this is how the caveat travels
    // with the file rather than staying on the page it was downloaded from.
    runId: result.runId,
    topic: result.topic.id,
    indicator: {
      id: result.indicator.id,
      label: result.indicator.longLabel,
      unit: result.indicator.unit,
      domain: result.indicator.domain,
      badEnd: result.indicator.badEnd,
    },
    generatedAt: result.generatedAt,
    note:
      "Synthetic scaffold output. Geometry is the county centroid as a Point, not the " +
      "county boundary: join on shape_id for official boundaries.",
    features: result.areas.map((entry) => ({
      type: "Feature",
      id: entry.area.id,
      geometry: {
        type: "Point",
        coordinates: [entry.area.centroid[0], entry.area.centroid[1]],
      },
      properties: {
        area_id: entry.area.id,
        area_name: entry.area.name,
        shape_id: entry.area.shapeId,
        climate_zone: entry.area.climateZone,
        asal: entry.area.asal,
        estimate: entry.estimate.value,
        lower_90: entry.estimate.lower,
        upper_90: entry.estimate.upper,
        band: entry.band.label,
        severity: entry.band.severity,
        change_yoy: entry.changeYoY,
        population_exposed_scaffold: entry.populationExposed,
        affected_area_share: entry.affectedAreaShare,
      },
    })),
  };
  return JSON.stringify(collection, null, 2);
}

/** The whole result, pretty printed, for anyone writing code against it. */
export function toJson(result: RunResult): string {
  return JSON.stringify(result, null, 2);
}

/**
 * The filename carries the topic and the run id, so a folder of downloads stays
 * legible and every file can be traced back to the URL that produced it.
 */
export function filenameFor(result: RunResult, format: DownloadFormat): string {
  return `${result.topic.id}-${result.runId}.${EXTENSIONS[format]}`;
}

export function exportResult(result: RunResult, format: DownloadFormat): ExportPayload {
  const body = format === "csv" ? toCsv(result) : format === "geojson" ? toGeoJson(result) : toJson(result);
  return { body, contentType: CONTENT_TYPES[format], filename: filenameFor(result, format) };
}
