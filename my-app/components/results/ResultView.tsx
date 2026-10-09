/**
 * A finished weighted-overlay run, rendered from the run result alone.
 *
 * SERVER COMPONENT, and that is a requirement rather than a preference. Rubric
 * S1 says a shared link has to open the same result in a cold browser with no
 * session storage, so everything on this page is a pure function of the props
 * the route fetched. There is no state, no effect, no `window`. The things
 * that genuinely need a browser (saving a file, and the Fluent components,
 * whose package has no "use client" of its own) live in small client modules
 * that are handed finished strings, so nothing on the client has to agree with
 * the server about how a number is formatted.
 *
 * What the screen is FOR. `ResultsStep.tsx` renders a request receipt: a
 * validated payload with nothing computed behind it, and it says so. This
 * screen is the other half of that honesty. There IS a computation behind
 * these numbers, and the page says exactly what kind: a weighted overlay of
 * reclassified criterion rasters, classified by Jenks breaks taken from this
 * run's own distribution. Not a trained model. Every claim on the page is
 * traceable to a field in `contracts/backend-api.md`.
 *
 * Read as an operational report, top to bottom:
 *
 *   1. status and the one forward action, with the method named in one line
 *   2. the headline figures (KPI tiles)
 *   3. the classification: interval strip and class table, the area outline
 *      and the legend beside them        ClassificationSection
 *   4. how the score was built           MethodSection
 *   5. provenance and downloads          ProvenanceSection
 *
 * The explanations that qualify the numbers sit behind native disclosures, so
 * the numbers lead and the reasoning is one click away.
 */

import type { Route } from "next";
import {
  ArrowLeft20Regular,
  ArrowRepeatAll20Regular,
  Info20Regular,
} from "@/components/ui/icons";

import { ButtonLink } from "@/components/ui/Button";
import { StatTile } from "@/components/ui/StatTile";
import { FRAME } from "@/components/shell/Page";
import { JobBadge } from "@/components/run/JobBadge";
import type { Topic } from "@/services/analysis/topics";
import type { RunResult } from "@/services/backend-api";

import { ClassificationSection } from "./ClassificationSection";
import type { DownloadFile } from "./Downloads";
import { MethodSection } from "./MethodSection";
import { ProvenanceSection } from "./ProvenanceSection";
import { More } from "./result-parts";
import { areasGeoJson, classTableCsv, exportFilename, resultJson } from "./exports";
import {
  classTable,
  contributionViews,
  formatCount,
  formatKm2,
  formatPercent,
  formatTimestamp,
} from "./view-model";

export interface ResultViewProps {
  topic: Topic;
  result: RunResult;
  /** Criterion id to human label, from GET /topics/{topic}/criteria. May be missing ids. */
  criterionLabels: Readonly<Record<string, string>>;
  reviewHref: Route;
  /** A fresh run of the same configuration. */
  rerunHref: Route;
}

/** The three files, built once on the server so a click cannot fail halfway. */
function downloadFiles(
  result: RunResult,
  criterionLabels: Readonly<Record<string, string>>,
): DownloadFile[] {
  const geojson = areasGeoJson(result);
  return [
    {
      label: "Class table (CSV)",
      detail: "The five classes with pixels, area and share, under the run id, the weights and the method note.",
      filename: exportFilename(result.runId, "csv"),
      mimeType: "text/csv;charset=utf-8",
      body: classTableCsv(result, criterionLabels),
    },
    {
      label: "Full result (JSON)",
      detail: "Everything on this page, plus the configuration it came from. Server-side raster paths are omitted.",
      filename: exportFilename(result.runId, "json"),
      mimeType: "application/json;charset=utf-8",
      body: resultJson(result),
    },
    ...(geojson === null
      ? []
      : [
          {
            label: "Areas (GeoJSON)",
            detail: "The run's input geometry in WGS84. Every feature is stamped with the run id and the method note.",
            filename: exportFilename(result.runId, "geojson"),
            mimeType: "application/geo+json;charset=utf-8",
            body: geojson,
          },
        ]),
  ];
}

export default function ResultView({
  topic,
  result,
  criterionLabels,
  reviewHref,
  rerunHref,
}: ResultViewProps) {
  const { config } = result;
  const table = classTable(result.classes, result.breaks);
  const contributions = contributionViews(result.contribution, config.weights, criterionLabels);
  const files = downloadFiles(result, criterionLabels);

  return (
    // data-testid: the evals wait on it, because the route streams a loading
    // skeleton first and `main` holds only that until the result arrives.
    <div className="flex flex-1 flex-col" data-testid="result-view">
      {/* ------------------------------------------- 1. status and action */}
      <section aria-labelledby="result-heading" className="border-b border-edge bg-surface">
        <div className={`${FRAME} py-6 lg:py-8`}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between lg:gap-10">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <JobBadge kind="run" state="succeeded" />
                <span className="eyebrow">Completed run</span>
              </div>
              <h2 id="result-heading" className="type-title2 mt-2 text-ink">
                {result.indicator.label}
              </h2>
              <p className="type-caption1 mt-1 text-ink-faint">
                {topic.name}. Run{" "}
                <span className="font-mono break-all text-ink-muted">{result.runId}</span>,
                finished {formatTimestamp(result.generatedAt)}.
              </p>
            </div>

            {/*
              One forward control on the screen, and this is it: the only
              primary button. Everything else, including the downloads, is
              secondary, so brand blue keeps meaning "this way".
            */}
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <ButtonLink href={reviewHref} icon={<ArrowLeft20Regular aria-hidden="true" />}>
                Back to review
              </ButtonLink>
              <ButtonLink
                href={rerunHref}
                variant="primary"
                icon={<ArrowRepeatAll20Regular aria-hidden="true" />}
              >
                Run this configuration again
              </ButtonLink>
            </div>
          </div>

          {/* ---------------- 2. the headline figures, 2 x 2 on a phone */}
          <h3 id="headline-heading" className="sr-only">
            Headline figures
          </h3>
          <dl
            aria-labelledby="headline-heading"
            className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4"
          >
            <StatTile
              label="Valid pixels"
              value={formatCount(result.validPixels ?? table.totalPixels)}
              unit="px"
              detail={
                result.grid
                  ? `${formatCount(result.grid.width)} × ${formatCount(result.grid.height)} grid`
                  : "grid size not reported"
              }
            />
            <StatTile
              label="Classified area"
              value={formatKm2(table.totalAreaKm2)}
              unit="km²"
              detail={`${config.areas.length} ${config.areas.length === 1 ? "area" : "areas"} of interest`}
            />
            <StatTile
              label="Cell size"
              value={formatCount(result.grid?.resolution ?? config.resolution)}
              unit="m"
              detail={result.grid?.crs ?? config.targetCrs}
            />
            <StatTile
              label="Largest class"
              value={table.largest ? formatPercent(table.largest.percent).replace("%", "") : "0"}
              unit="%"
              detail={
                table.largest
                  ? `${table.largest.label}, ${formatKm2(table.largest.areaKm2)} km²`
                  : "no class carries any pixel"
              }
            />
          </dl>

          {/*
            The method, named before any number below is read (rubric S5), in
            one line, with the detail one click down.
          */}
          <div className="mt-4 flex gap-2 rounded-fluent-large bg-accent-soft px-3 py-2.5">
            <Info20Regular aria-hidden="true" className="mt-px shrink-0 text-accent" />
            <div className="min-w-0">
              <p className="type-body1 font-semibold text-ink">
                This is a weighted overlay, not a model.
              </p>
              <More summary="How the score is made">
                Criterion layers reclassified 1 to 5, weighted and summed per pixel, then split
                into five classes by Jenks natural breaks. Nothing was fitted to observed
                outcomes, so there is no accuracy statistic and no training data behind any
                number here.
              </More>
            </div>
          </div>
        </div>
      </section>

      <div className={`${FRAME} flex flex-col gap-8 py-8 lg:gap-10 lg:py-10`}>

        {/* -------------------------------- 3. classification and map */}
        <ClassificationSection result={result} table={table} />

        {/* ------------------------------------------------- 4. method */}
        <MethodSection result={result} table={table} contributions={contributions} />

        {/* --------------------------------- 5. provenance and exports */}
        <ProvenanceSection
          topic={topic}
          result={result}
          totalPixels={table.totalPixels}
          files={files}
        />
      </div>
    </div>
  );
}
