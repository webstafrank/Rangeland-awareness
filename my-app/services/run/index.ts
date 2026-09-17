/**
 * The engine's public surface (CONTRACT section 3).
 *
 * Four functions. Everything else in `services/run/` is an implementation detail,
 * and a page that reaches past this file is reaching into the model stand-in
 * that gets deleted when a real backend lands.
 *
 *   runId(config)              stable id for a config
 *   run(config)                the result. Pure: no clock, no unseeded random, no IO
 *   stages(config)             the processing screen's script
 *   exportRun(result, format)  csv | geojson | json
 *
 * `run()` is a pure function of its argument. Same config in, byte-identical
 * result out, in any process, on any machine, today or next year. That is not a
 * nicety: it IS the storage layer. There is no run table, so a result URL
 * re-derives its own numbers every time it is opened, which is what lets a link
 * be shared and reopened months later with nothing stored anywhere.
 *
 * The only way to break that promise is to introduce something ambient, so the
 * rule is absolute: nothing under `services/run/` may call `Date.now()`, `new Date()`
 * with no argument, `Math.random()`, `crypto.randomUUID()`, or read a file, an
 * environment variable or a network. `__tests__/purity.test.ts` greps for
 * exactly that, because a comment does not stop anyone.
 */

import { areaResults, generatedMinutes } from "@/services/run/engine";
import type { RunConfig } from "@/services/run/config";
import { isoTimestamp } from "@/services/run/dates";
import { exportRun as exportRunImpl } from "@/services/run/exporters";
import { runIdFor } from "@/services/run/hash";
import { indicatorFor, worseBand } from "@/services/run/indicators";
import { metricsFor } from "@/services/run/metrics";
import { narrativeFor } from "@/services/run/narrative";
import type { ExportFormat, ExportPayload, RunResult, RunStage } from "@/services/run/result";
import { seriesFor } from "@/services/run/series";
import { stagesFor } from "@/services/run/stages";

/** Stable id for a config. Same config in, same id out, across processes. */
export function runId(config: RunConfig): string {
  return runIdFor(config);
}

export function run(config: RunConfig): RunResult {
  const id = runIdFor(config);
  const indicator = indicatorFor(config.topic);
  const areas = areaResults({ runId: id, config, indicator });

  return {
    runId: id,
    config,
    // Derived from the window's end date and the id, never from a clock.
    generatedAt: isoTimestamp(config.dateWindow.end, generatedMinutes(id)),
    indicator,
    areas,
    series: seriesFor(id, config, indicator),
    metrics: metricsFor(id, config, indicator),
    narrative: narrativeFor(areas, indicator, config.analysisType),
    // The worst band across areas. Seeded with the mildest band rather than
    // with `areas[0]`, so an empty run still returns a band the headline chip
    // can render instead of undefined.
    headlineBand: areas.reduce(
      (worst, entry) => worseBand(worst, entry.band),
      indicator.bands[indicator.badEnd === "high" ? 0 : indicator.bands.length - 1],
    ),
  };
}

/** The processing screen's script, sized by model cost and area count. */
export function stages(config: RunConfig): readonly RunStage[] {
  return stagesFor(config);
}

/** Serialises a result for download. Body, content type and filename. */
export function exportRun(result: RunResult, format: ExportFormat): ExportPayload {
  return exportRunImpl(result, format);
}

/* ------------------------------------------------------------ re-exports */

/*
 * The types and the small pure helpers a page needs, re-exported so a component
 * imports "@/services/run" and nothing deeper. Generators are deliberately NOT here:
 * `engine.ts`, `series.ts` and `metrics.ts` are the files that disappear when a
 * real backend lands, and nothing outside should have learned their names.
 */
export {
  MAX_WINDOW_DAYS,
  MIN_WINDOW_DAYS,
  RUN_SCHEMA_VERSION,
  formulaProblems,
  validateConfig,
  windowDays,
  windowProblems,
  withAreas,
} from "@/services/run/config";
export type { DateWindow, PartialRunConfig, Problem, RunConfig } from "@/services/run/config";

export { EXPORT_FORMATS } from "@/services/run/result";
export type {
  AreaResult,
  Estimate,
  ExportFormat,
  ExportPayload,
  FeatureImportance,
  IndicatorBand,
  IndicatorSpec,
  ModelMetrics,
  RunResult,
  RunStage,
  SeriesPoint,
  Severity,
} from "@/services/run/result";

export { SEVERITY_ORDER } from "@/services/run/constants";
export {
  allIndicators,
  classify,
  formatValue,
  indicatorFor,
  spanOf,
} from "@/services/run/indicators";
export { aridityClass, aridityOfBounds } from "@/services/run/aridity";
// isWorse is here because a comparison table has to rank areas, and "worse"
// is not a comparison the UI can safely re-derive: it depends on the
// indicator's badEnd, so a table that sorted by raw value would put the best
// area at the top for VHI and the worst area at the top for flood risk. One
// definition, imported, rather than a second copy in a component.
export { isDeterioration, isWorse, worstArea } from "@/services/run/narrative";
export { worseBand } from "@/services/run/indicators";
export { SYNTHETIC_NOTE } from "@/services/run/exporters";
export { STAGE_SCRIPT, stageTotalMs } from "@/services/run/stages";
export {
  FORMULAS_PARAM,
  FROM_PARAM,
  MODEL_PARAM,
  TO_PARAM,
  TYPE_PARAM,
  buildRunQuery,
  firstProblem,
  parseRunQuery,
} from "@/services/run/url";
export type { ParseResult, QueryInput } from "@/services/run/url";
