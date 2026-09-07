/**
 * `services/analysis`: turns a run configuration into a result, deterministically.
 *
 * Implements `AnalysisService` from contracts/analysis.ts. Contract version 1.
 *
 * The catalogue and the geography arrive as injected dependencies rather than as
 * imports of their concrete modules. Three reasons, in order of how much they
 * matter:
 *   1. This service can be built and tested against stubs while the other two
 *      services are still being written, which is what allows three units of
 *      work to land in parallel.
 *   2. It cannot reach past the contract even by accident. There is no
 *      concrete import to reach through, so a change to the catalogue's
 *      internals cannot break a run.
 *   3. A test can hand it a two-county, two-topic world and assert on exact
 *      wording and exact numbers, which is impossible against 47 real counties.
 *
 * The lazily-wired singleton lives in ./index.ts, which is the only file here
 * that names the concrete services.
 */
import type {
  AnalysisService,
  ApiError,
  DownloadFormat,
  RunConfig,
  RunConfigQuery,
  RunResult,
  RunStage,
} from "@/contracts/analysis";
import type { CatalogService, Severity } from "@/contracts/catalog";
import type { GeoService } from "@/contracts/geo";
import { MIN_OVERLAY_CELL, OVERLAY_CELLS_ACROSS, SEVERITY_ORDER } from "./constants";
import { exportResult, type ExportPayload } from "./exporters";
import { runIdFor } from "./hash";
import { narrativeFor } from "./narrative";
import { parseQuery as parseQueryWith, toQuery, type ParseResult, type RunConfigQueryWithTopic } from "./query";
import { stagesFor } from "./stages";
import { simulateRun } from "./synthetic";

export interface AnalysisDeps {
  readonly catalog: CatalogService;
  readonly geo: GeoService;
}

/**
 * The concrete surface, which is `AnalysisService` with one parameter widened:
 * `parseQuery` also accepts the topic, which the contract's `RunConfigQuery` has
 * no slot for because the topic travels in the path. See the note on
 * `parseQuery` in ./query.ts. The widened parameter is a superset of the
 * declared one, so this type still satisfies `AnalysisService`, and a test
 * asserts exactly that.
 */
export interface AnalysisServiceImpl extends Omit<AnalysisService, "parseQuery"> {
  parseQuery(query: RunConfigQueryWithTopic, topicFromPath?: string): ParseResult;
}

/** The worst severity across areas, for the headline chip. */
export function worstSeverity(severities: readonly Severity[]): Severity {
  return severities.reduce<Severity>(
    (worst, candidate) =>
      SEVERITY_ORDER.indexOf(candidate) > SEVERITY_ORDER.indexOf(worst) ? candidate : worst,
    SEVERITY_ORDER[0],
  );
}

/**
 * Cell size handed to `geo.gridFor`, in frame units.
 *
 * Derived from the frame rather than hard-coded, so the overlay keeps roughly
 * OVERLAY_CELLS_ACROSS cells across the map whatever viewBox `services/geo`
 * settles on. A fixed pixel size would silently become one giant cell or a
 * hundred thousand tiny ones the day that frame changes.
 */
export function overlayCellSize(frameWidth: number): number {
  return Math.max(MIN_OVERLAY_CELL, Math.round(frameWidth / OVERLAY_CELLS_ACROSS));
}

export function createAnalysisService(deps: AnalysisDeps): AnalysisServiceImpl {
  const { catalog, geo } = deps;

  function run(config: RunConfig): RunResult {
    const runId = runIdFor(config);
    const topic = catalog.getTopic(config.topic);
    const model = catalog.getModel(config.model);
    const areas = geo.pickAreas(config.areas);

    // `pickAreas` skips ids it does not know, which would quietly produce a
    // result for fewer counties than the user asked about. That is worse than a
    // failure, so it is one.
    if (areas.length !== config.areas.length) {
      const known = new Set(areas.map((area) => area.id));
      const unknown = config.areas.filter((id) => !known.has(id));
      throw new Error(`analysis: unknown area ids: ${unknown.join(", ")}`);
    }

    const indicator = topic.indicator;
    const simulation = simulateRun({
      runId,
      config,
      topic,
      model,
      areas,
      classify: (value) => catalog.classify(indicator, value),
    });

    const frame = geo.frame();
    const overlay = geo.gridFor(areas, overlayCellSize(frame.width), simulation.valueAt);

    return {
      runId,
      config,
      topic,
      indicator,
      analysisType: config.analysisType,
      generatedAt: simulation.generatedAt,
      areas: simulation.areas,
      series: simulation.series,
      metrics: simulation.metrics,
      frame,
      overlay,
      narrative: narrativeFor(
        {
          areas: simulation.areas,
          indicator,
          analysisType: config.analysisType,
          format: (value) => catalog.formatValue(indicator, value),
        },
        SEVERITY_ORDER,
      ),
      headlineSeverity: worstSeverity(simulation.areas.map((entry) => entry.band.severity)),
    };
  }

  return {
    runId(config: RunConfig): string {
      return runIdFor(config);
    },

    run,

    stages(config: RunConfig): readonly RunStage[] {
      return stagesFor(config, catalog.getModel(config.model));
    },

    export(result: RunResult, format: DownloadFormat): ExportPayload {
      return exportResult(result, format);
    },

    parseQuery(query: RunConfigQueryWithTopic, topicFromPath?: string): ParseResult {
      return parseQueryWith({ catalog, geo }, query, topicFromPath);
    },

    toQuery,
  };
}

export type { ApiError, ParseResult, RunConfigQuery, RunConfigQueryWithTopic };
