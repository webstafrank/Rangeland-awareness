/**
 * The engine's public surface (CONTRACT section 3).
 *
 * Four functions. Everything else in `lib/run/` is an implementation detail,
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
 * rule is absolute: nothing under `lib/run/` may call `Date.now()`, `new Date()`
 * with no argument, `Math.random()`, `crypto.randomUUID()`, or read a file, an
 * environment variable or a network. `__tests__/purity.test.ts` greps for
 * exactly that, because a comment does not stop anyone.
 */

import { areaResults, generatedMinutes } from "@/lib/run/engine";
import type { RunConfig } from "@/lib/run/config";
import { isoTimestamp } from "@/lib/run/dates";
import { exportRun as exportRunImpl } from "@/lib/run/exporters";
import { runIdFor } from "@/lib/run/hash";
import { indicatorFor, worseBand } from "@/lib/run/indicators";
import { metricsFor } from "@/lib/run/metrics";
import { narrativeFor } from "@/lib/run/narrative";
import type { ExportFormat, ExportPayload, RunResult, RunStage } from "@/lib/run/result";
import { seriesFor } from "@/lib/run/series";
import { stagesFor } from "@/lib/run/stages";

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
 * imports "@/lib/run" and nothing deeper. Generators are deliberately NOT here:
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
} from "@/lib/run/config";
export type { DateWindow, PartialRunConfig, Problem, RunConfig } from "@/lib/run/config";

export { EXPORT_FORMATS } from "@/lib/run/result";
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
} from "@/lib/run/result";

export { SEVERITY_ORDER } from "@/lib/run/constants";
export {
  allIndicators,
  classify,
  formatValue,
  indicatorFor,
  spanOf,
} from "@/lib/run/indicators";
export { aridityClass, aridityOfBounds } from "@/lib/run/aridity";
// isWorse is here because a comparison table has to rank areas, and "worse"
// is not a comparison the UI can safely re-derive: it depends on the
// indicator's badEnd, so a table that sorted by raw value would put the best
// area at the top for VHI and the worst area at the top for flood risk. One
// definition, imported, rather than a second copy in a component.
export { isDeterioration, isWorse, worstArea } from "@/lib/run/narrative";
export { worseBand } from "@/lib/run/indicators";
export { SYNTHETIC_NOTE } from "@/lib/run/exporters";
export { STAGE_SCRIPT, stageTotalMs } from "@/lib/run/stages";
export {
  FORMULAS_PARAM,
  FROM_PARAM,
  MODEL_PARAM,
  TO_PARAM,
  TYPE_PARAM,
  buildRunQuery,
  firstProblem,
  parseRunQuery,
} from "@/lib/run/url";
export type { ParseResult, QueryInput } from "@/lib/run/url";
