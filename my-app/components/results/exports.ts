/**
 * The download payloads, as pure string builders.
 *
 * Pure on purpose. A file that leaves this app outlives the page it came from,
 * so what it says about itself is the only context its reader gets, and that
 * text is worth a test rather than a click-through. `Downloads.tsx` does the
 * Blob and the anchor; everything that decides CONTENT is here and runs in the
 * node lane's style of test even though it lives under `components/`.
 *
 * Rubric S6: every export carries the run id, the configuration and the method
 * note, and no export can be mistaken for the output of a trained model.
 */

import type { RunResult } from "@/services/backend-api";
import { formatIndex } from "./view-model";

/**
 * The one sentence every file repeats.
 *
 * Deliberately says what the method IS before what it is not. A file that only
 * disclaims reads like a hedge; a file that names the method lets the reader
 * judge it. The wording matches the page, so a reader holding both cannot find
 * two descriptions of the same run.
 */
export const METHOD_NOTE =
  "Method: weighted overlay. Each criterion raster was reclassified onto a 1-5 " +
  "scale, multiplied by its weight and summed, then split into five classes by " +
  "Jenks natural breaks computed from this run's own distribution. This is not " +
  "a trained model: there is no accuracy statistic and no training data behind " +
  "any number in this file.";

/**
 * What `contribution` means, repeated in the exports.
 *
 * The page carries this sentence for rubric S4, and a CSV opened in a
 * spreadsheet three weeks later is exactly where the misreading would happen,
 * so the column gets the sentence too rather than a bare header.
 */
export const CONTRIBUTION_NOTE =
  "Contribution is mean(risk) x weight, normalised across criteria. It is not " +
  "feature importance and it is not a sensitivity analysis.";

/** Files are named by run id, so two downloads never collide in ~/Downloads. */
export function exportFilename(runId: string, extension: string): string {
  const safe = runId.replace(/[^A-Za-z0-9._-]/g, "-");
  return `${safe}-weighted-overlay.${extension}`;
}

/* -------------------------------------------------------------------- csv */

/**
 * RFC 4180 quoting on every field, not only the ones that look risky.
 *
 * Criterion labels are free text from the service and Kenyan place names carry
 * apostrophes and commas (Murang'a, Tana River). Quoting conditionally means
 * deciding, per field, whether this is the day the rule is wrong.
 */
function field(value: string | number): string {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function row(values: readonly (string | number)[]): string {
  return values.map(field).join(",");
}

/**
 * The class table as CSV, with the run's identity and configuration above it.
 *
 * The metadata sits in the same file rather than in a sidecar README because a
 * sidecar is the file that gets left behind. A spreadsheet opens this with the
 * notice in row 1, which is the first thing the reader sees.
 */
export function classTableCsv(
  result: RunResult,
  criterionLabels: Readonly<Record<string, string>>,
): string {
  const { config } = result;
  const lines: string[] = [];

  lines.push(row(["notice", METHOD_NOTE]));
  lines.push(row(["run_id", result.runId]));
  lines.push(row(["topic", config.topic]));
  lines.push(row(["indicator", `${result.indicator.label} (${result.indicator.id})`]));
  lines.push(row(["generated_at", result.generatedAt ?? "not reported"]));
  lines.push(row(["target_crs", config.targetCrs]));
  lines.push(row(["resolution_m", config.resolution]));
  if (result.grid) {
    lines.push(row(["grid_crs", result.grid.crs]));
    lines.push(row(["grid_size_px", `${result.grid.width} x ${result.grid.height}`]));
  }
  if (typeof result.validPixels === "number") {
    lines.push(row(["valid_pixels", result.validPixels]));
  }
  if (config.dateWindow) {
    lines.push(row(["date_window", `${config.dateWindow.start} to ${config.dateWindow.end}`]));
  }
  lines.push(row(["areas_count", config.areas.length]));
  lines.push(row(["jenks_breaks", result.breaks.map(formatIndex).join(" | ")]));
  lines.push(
    row([
      "breaks_note",
      "Interior breaks only, computed from this run's own distribution, not a fixed scale.",
    ]),
  );
  lines.push("");

  lines.push(row(["section", "weights"]));
  lines.push(row(["criterion_id", "criterion_label", "weight"]));
  for (const [id, weight] of Object.entries(config.weights)) {
    lines.push(row([id, criterionLabels[id] ?? id, weight]));
  }
  lines.push("");

  lines.push(row(["section", "contribution"]));
  lines.push(row(["note", CONTRIBUTION_NOTE]));
  lines.push(row(["criterion_id", "criterion_label", "contribution_mean_risk_x_weight_normalised"]));
  for (const [id, value] of Object.entries(result.contribution)) {
    lines.push(row([id, criterionLabels[id] ?? id, value]));
  }
  lines.push("");

  lines.push(row(["section", "classes"]));
  lines.push(row(["class", "label", "pixels", "area_km2", "share_of_valid_pixels"]));
  for (const cls of result.classes) {
    lines.push(row([cls.class, cls.label, cls.pixels, cls.areaKm2, cls.share]));
  }

  return `${lines.join("\n")}\n`;
}

/* ------------------------------------------------------------------- json */

/**
 * The whole result, wrapped in its own description.
 *
 * Two deliberate departures from "the whole result":
 *
 * `rasters` is dropped. It is a map of absolute paths on the backend's disk,
 * useless to anyone holding this file and a small piece of infrastructure
 * disclosure if the file is shared. The key is replaced by a note saying so,
 * so a reader comparing this against the contract can see the omission was a
 * decision.
 *
 * `method`, `notice` and `contributionNote` are added at the top level. A JSON
 * file is read by a machine and then by a person, and the person needs the
 * same sentence the page gave them.
 */
export function resultJson(result: RunResult): string {
  const { rasters, ...rest } = result;
  void rasters;

  return `${JSON.stringify(
    {
      notice: METHOD_NOTE,
      contributionNote: CONTRIBUTION_NOTE,
      breaksNote:
        "Jenks natural breaks, interior breaks only, computed from this run's " +
        "own distribution rather than from a fixed scale.",
      rastersNote:
        "Omitted. The service reports the index and class rasters as paths on " +
        "its own filesystem, which are not meaningful outside it.",
      contract: "contracts/backend-api.md v1, GET /api/v1/runs/{id}/result",
      exportedFrom: "Rangeland awareness, results screen",
      ...rest,
    },
    null,
    2,
  )}\n`;
}

/* ---------------------------------------------------------------- geojson */

/**
 * The areas the run was computed over, as a FeatureCollection in WGS84.
 *
 * This is the run's INPUT geometry, not its output, and every feature says so
 * in its own properties. Handing back a polygon file from a results screen is
 * the easiest thing on this page to mistake for a result, so the disclaimer is
 * per feature rather than only on the collection: a GIS that splits the
 * collection keeps the sentence attached to each part.
 *
 * Returns null when the config carries no drawable geometry, so the button can
 * be absent rather than produce an empty file.
 */
export function areasGeoJson(result: RunResult): string | null {
  const features = result.config.areas
    .map((area, index) => {
      if (typeof area !== "object" || area === null) return null;
      const node = area as { type?: unknown; geometry?: unknown; properties?: unknown };
      const geometry = node.type === "Feature" ? node.geometry : node;
      if (typeof geometry !== "object" || geometry === null) return null;

      const existing =
        node.type === "Feature" && typeof node.properties === "object" && node.properties !== null
          ? (node.properties as Record<string, unknown>)
          : {};

      return {
        type: "Feature" as const,
        geometry,
        properties: {
          ...existing,
          runId: result.runId,
          topic: result.config.topic,
          areaIndex: index,
          content: "Run input geometry. This is the area the run was computed over, not a result.",
          notice: METHOD_NOTE,
        },
      };
    })
    .filter((feature) => feature !== null);

  if (features.length === 0) return null;

  return `${JSON.stringify(
    {
      type: "FeatureCollection",
      // Not a GeoJSON member the spec knows; readers ignore what they do not
      // recognise, and a reader that does not ignore it shows the notice.
      notice: METHOD_NOTE,
      runId: result.runId,
      generatedAt: result.generatedAt,
      features,
    },
    null,
    2,
  )}\n`;
}
