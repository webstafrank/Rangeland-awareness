/**
 * Downloads.
 *
 * Three formats, three audiences: CSV for whoever opens it in a spreadsheet,
 * GeoJSON for whoever drops it on a map, JSON for whoever writes code against
 * it. All three are produced from the result object alone, so a download can
 * never disagree with the page the analyst was looking at.
 *
 * The CSV path is the one with teeth. Kenyan place names carry apostrophes
 * (Murang'a), an analyst can type any label they like into the coordinate
 * field, and a narrative always contains commas. A naive join corrupts the row,
 * and nobody notices until the numbers have been quoted in a report. RFC 4180
 * quoting is implemented here and tested against exactly those cases.
 *
 * The GeoJSON export carries REAL GEOMETRY, which the `rangeland-pages`
 * reference could not: it held counties as projected SVG paths and had to
 * export a centroid Point with a caveat. Here the geometry the analyst drew is
 * already in the config as a lon/lat Feature, so the export is the actual
 * shape with the results in its properties.
 */

import { formatArea } from "@/services/geo/area";
import { aridityClass, aridityOfBounds } from "@/services/run/aridity";
import { EXPORT_FORMATS } from "@/services/run/result";
import type { ExportFormat, ExportPayload, RunResult } from "@/services/run/result";

/** RFC 4180 line ending. Excel, LibreOffice and every parser accept it. */
const CRLF = "\r\n";

const CONTENT_TYPES: Readonly<Record<ExportFormat, string>> = {
  csv: "text/csv;charset=utf-8",
  geojson: "application/geo+json",
  json: "application/json",
};

const EXTENSIONS: Readonly<Record<ExportFormat, string>> = {
  csv: "csv",
  geojson: "geojson",
  json: "json",
};

/**
 * The note that travels with every export.
 *
 * On the file, not only on the page it was downloaded from. A CSV opened next
 * week in a meeting has no footer, and this is the sentence that stops its
 * numbers being read as measurements.
 */
export const SYNTHETIC_NOTE =
  "Synthetic output from a seeded stand-in model. Not an observation, not a " +
  "prediction, and not a basis for any decision.";

/**
 * Quotes a CSV field when it has to be quoted, doubling any embedded quote.
 *
 * An apostrophe needs no quoting at all: it is not a CSV metacharacter. Worth
 * stating because it is the case people wrongly special-case, usually by
 * stripping it, which turns Murang'a into Muranga in the file and nowhere else.
 */
export function escapeCsvField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function csvRow(cells: readonly (string | number | null | undefined)[]): string {
  return cells.map(escapeCsvField).join(",");
}

/**
 * Four headed sections in one file: the run's identity, the per-area results,
 * the per-area formula values, and the monthly series. Sections are separated
 * by a blank line and each opens with its own title row, so a person can see
 * what they are looking at and a script can split on the titles.
 *
 * The formula values get their own section rather than extra columns on the
 * results section, because the column set changes with the analyst's selection
 * and a table whose width moves between runs is hostile to anything parsing it.
 */
export function toCsv(result: RunResult): string {
  const { indicator, config } = result;
  const areaIds = result.areas.map((entry) => entry.areaId);
  const formulaIds = config.formulas;
  const boundsById = new Map(config.areas.map((area) => [area.id, area.bounds]));
  const areaKm2ById = new Map(config.areas.map((area) => [area.id, area.areaKm2]));
  const lines: string[] = [];

  lines.push(csvRow(["Run"]));
  lines.push(
    csvRow([
      "run_id",
      "schema_version",
      "topic",
      "indicator",
      "unit",
      "model",
      "analysis_type",
      "formulas",
      "window_start",
      "window_end",
      "generated_at",
      "headline_band",
      "headline_severity",
      "narrative",
      "note",
    ]),
  );
  lines.push(
    csvRow([
      result.runId,
      config.schemaVersion,
      config.topic,
      indicator.label,
      indicator.unit,
      config.model,
      config.analysisType,
      formulaIds.join(" "),
      config.dateWindow.start,
      config.dateWindow.end,
      result.generatedAt,
      result.headlineBand.label,
      result.headlineBand.severity,
      result.narrative,
      SYNTHETIC_NOTE,
    ]),
  );

  lines.push("");
  lines.push(csvRow(["Model fit"]));
  lines.push(csvRow(["auc", "r2", "rmse", "training_samples"]));
  lines.push(
    csvRow([
      result.metrics.auc,
      result.metrics.r2,
      result.metrics.rmse,
      result.metrics.trainingSamples,
    ]),
  );

  lines.push("");
  lines.push(csvRow(["Feature importances"]));
  lines.push(csvRow(["feature", "weight"]));
  for (const entry of result.metrics.featureImportances) {
    lines.push(csvRow([entry.feature, entry.weight]));
  }

  lines.push("");
  lines.push(csvRow(["Area results"]));
  lines.push(
    csvRow([
      "area_id",
      "label",
      "area_km2",
      "aridity_proxy_class",
      "estimate",
      "lower_90",
      "upper_90",
      "band",
      "severity",
      "change_yoy",
      "affected_area_share",
    ]),
  );
  for (const entry of result.areas) {
    const bounds = boundsById.get(entry.areaId);
    lines.push(
      csvRow([
        entry.areaId,
        entry.label,
        // The same string the selection list shows, so a reader can match a row
        // to the area they clicked without doing arithmetic.
        formatArea(areaKm2ById.get(entry.areaId) ?? null),
        bounds ? aridityClass(aridityOfBounds(bounds)) : "",
        entry.estimate.value,
        entry.estimate.lower,
        entry.estimate.upper,
        entry.band.label,
        entry.band.severity,
        entry.changeYoY,
        entry.affectedAreaShare,
      ]),
    );
  }

  lines.push("");
  lines.push(csvRow(["Index values"]));
  lines.push(csvRow(["area_id", ...formulaIds]));
  for (const entry of result.areas) {
    lines.push(
      csvRow([entry.areaId, ...formulaIds.map((id) => entry.formulaValues[id] ?? null)]),
    );
  }

  lines.push("");
  lines.push(csvRow(["Monthly series"]));
  lines.push(csvRow(["date", ...areaIds]));
  for (const point of result.series) {
    // A cloud-obscured month is an empty cell, never a zero. A zero reads as an
    // observation of nothing rather than as no observation, and a spreadsheet
    // will happily average it into the year.
    lines.push(csvRow([point.date, ...areaIds.map((id) => point.values[id] ?? null)]));
  }

  return lines.join(CRLF) + CRLF;
}

/**
 * A FeatureCollection: the analyst's own geometry with the result in
 * `properties`.
 *
 * Foreign members on the collection are legal GeoJSON (RFC 7946 section 6.1),
 * and are how the run's identity and the synthetic caveat travel with the file
 * rather than staying on the page it came from.
 *
 * An area whose feature has no geometry (possible for a malformed shapefile
 * that got this far) is written with `geometry: null`, which is also legal, and
 * keeps the feature count equal to the area count. Dropping it would silently
 * export fewer areas than the run reported.
 */
export function toGeoJson(result: RunResult): string {
  const areaById = new Map(result.config.areas.map((area) => [area.id, area]));
  const collection = {
    type: "FeatureCollection",
    runId: result.runId,
    schemaVersion: result.config.schemaVersion,
    topic: result.config.topic,
    model: result.config.model,
    formulas: result.config.formulas,
    window: result.config.dateWindow,
    indicator: {
      id: result.indicator.id,
      label: result.indicator.label,
      unit: result.indicator.unit,
      domain: result.indicator.domain,
      badEnd: result.indicator.badEnd,
    },
    generatedAt: result.generatedAt,
    note: SYNTHETIC_NOTE,
    features: result.areas.map((entry) => {
      const area = areaById.get(entry.areaId);
      return {
        type: "Feature",
        id: entry.areaId,
        geometry: area?.feature.geometry ?? null,
        properties: {
          area_id: entry.areaId,
          label: entry.label,
          source: area?.source ?? null,
          area_km2: area?.areaKm2 ?? null,
          aridity_proxy_class: area ? aridityClass(aridityOfBounds(area.bounds)) : null,
          estimate: entry.estimate.value,
          lower_90: entry.estimate.lower,
          upper_90: entry.estimate.upper,
          band: entry.band.label,
          band_id: entry.band.id,
          severity: entry.band.severity,
          change_yoy: entry.changeYoY,
          affected_area_share: entry.affectedAreaShare,
          // Spread rather than nested, so the file opens usefully in QGIS,
          // which shows flat attributes and hides nested objects.
          ...Object.fromEntries(
            Object.entries(entry.formulaValues).map(([id, value]) => [`index_${id}`, value]),
          ),
        },
      };
    }),
  };
  return JSON.stringify(collection, null, 2);
}

/** The whole result, pretty printed, for anyone writing code against it. */
export function toJson(result: RunResult): string {
  return JSON.stringify({ note: SYNTHETIC_NOTE, ...result }, null, 2);
}

/**
 * The filename carries the topic and the run id, so a folder of downloads stays
 * legible and every file traces back to the URL that produced it.
 */
export function filenameFor(result: RunResult, format: ExportFormat): string {
  return `${result.config.topic}-${result.runId}.${EXTENSIONS[format]}`;
}

export function exportRun(result: RunResult, format: ExportFormat): ExportPayload {
  if (!EXPORT_FORMATS.includes(format)) {
    throw new Error(`run: unknown export format "${String(format)}"`);
  }
  const body =
    format === "csv" ? toCsv(result) : format === "geojson" ? toGeoJson(result) : toJson(result);
  return { body, contentType: CONTENT_TYPES[format], filename: filenameFor(result, format) };
}
