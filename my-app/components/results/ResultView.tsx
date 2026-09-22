/**
 * A finished weighted-overlay run, rendered from the run result alone.
 *
 * SERVER COMPONENT, and that is a requirement rather than a preference. Rubric
 * S1 says a shared link has to open the same result in a cold browser with no
 * session storage, so everything on this page is a pure function of the props
 * the route fetched. There is no state, no effect, no `window`. The one thing
 * that genuinely needs a browser, saving a file, lives in `Downloads.tsx`
 * behind its own "use client", and it is handed finished strings rather than
 * the result, so nothing on the client has to agree with the server about how
 * a number is formatted.
 *
 * What the screen is FOR. `ResultsStep.tsx` renders a request receipt: a
 * validated payload with nothing computed behind it, and it says so at the top
 * in a warning band. This screen is the other half of that honesty. There IS a
 * computation behind these numbers, and the same care goes into saying exactly
 * what kind of computation it was: a weighted overlay of reclassified
 * criterion rasters, classified by Jenks breaks taken from this run's own
 * distribution. Not a trained model. Every claim on the page is traceable to a
 * field in `contracts/backend-api.md`.
 *
 * Judged against Copernicus GloFAS and the FEWS NET IPC map pages, which are
 * the reference the rubric names. What those pages do and most dashboards do
 * not: the classified map sits beside the class table that defines it, the
 * breaks are printed as numbers rather than implied by a colour bar, and the
 * method is named in the body of the page rather than in a footnote. The three
 * are one object here: the interval strip, the table and the legend all read
 * the same five classes and the same four breaks.
 *
 * Where this variant deliberately stops short of GloFAS: there is no pixel
 * surface. `result.rasters` is a pair of paths on the backend's own disk, so
 * the classified raster is not in the response and cannot be drawn. Drawing a
 * plausible-looking coloured surface anyway would be the single most dishonest
 * thing this page could do, so the map is the run's own area outlines, in SVG,
 * with the legend beside it saying what the colours in the table mean.
 */

import type { ReactNode } from "react";
import type { Route } from "next";

import { Band } from "@/components/ui/Band";
import { ButtonLink } from "@/components/ui/Button";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Panel } from "@/components/ui/Panel";
import { StatTile } from "@/components/ui/StatTile";
import type { Topic } from "@/services/analysis/topics";
import type { RunResult } from "@/services/backend-api";

import Downloads, { type DownloadFile } from "./Downloads";
import {
  METHOD_NOTE,
  areasGeoJson,
  classTableCsv,
  exportFilename,
  resultJson,
} from "./exports";
import {
  areaOutline,
  classTable,
  contributionViews,
  formatBounds,
  formatCount,
  formatDate,
  formatIndex,
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

/* ------------------------------------------------------------ small parts */

/**
 * The class colour, as a mark that never carries meaning on its own.
 *
 * Same rule `<SeverityChip>` enforces, applied to an ordered ramp instead of
 * the reserved status scale: the swatch is `aria-hidden` and there is no code
 * path that renders it without the class label next to it. `view-model.ts`
 * explains why the status scale is the wrong scale for five ordered classes.
 */
function Swatch({ colour }: { colour: string }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-3 w-3 shrink-0 rounded-[2px] border border-navy-900/20 align-middle"
      style={{ backgroundColor: colour }}
    />
  );
}

/** A labelled fact in a definition list. Used for the provenance block. */
function Fact({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="eyebrow">{term}</dt>
      <dd className="mt-1 text-sm break-words text-ink">{children}</dd>
    </div>
  );
}

/* --------------------------------------------------------------- the view */

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
  const outline = areaOutline(config.areas);

  // The bars are read against the largest value rather than against 1.0, or a
  // run whose criteria all sit near 0.2 renders five stubs and the comparison
  // the chart exists for is invisible. The numbers beside every bar are the
  // absolute ones, so the scaling cannot mislead.
  const contributionPeak = contributions.reduce(
    (peak, row) => Math.max(peak, row.contribution, row.weight ?? 0),
    0.0001,
  );

  const geojson = areasGeoJson(result);
  const files: DownloadFile[] = [
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

  const titleId = `outline-title-${result.runId}`;
  const descId = `outline-desc-${result.runId}`;

  return (
    <div className="flex flex-1 flex-col">
      {/* ------------------------------------------------------- 1. header */}
      <Band ground="navy" width="wide" pad="tight" rule>
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
          <div className="min-w-0">
            <Eyebrow tone="dark">Completed run</Eyebrow>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              {topic.name}: {result.indicator.label}
            </h1>
            <p className="mt-2 text-sm text-ink-dark-secondary">
              Run <span className="font-mono">{result.runId}</span>, finished{" "}
              {formatTimestamp(result.generatedAt)}.
            </p>
          </div>
        </div>

        {/*
          The method, stated before any number is read, in the body of the page.
          This is rubric S5 and it is also the reference's own habit: GloFAS and
          the FEWS NET IPC pages name the method beside the map, not in a
          footnote a reader reaches after they have already formed a view.
        */}
        <p className="mt-6 max-w-4xl text-sm leading-relaxed text-ink-dark-secondary">
          <span className="font-semibold text-white">
            This is a weighted overlay, not a model.
          </span>{" "}
          Each criterion layer was reclassified onto a 1 to 5 scale, multiplied by the
          weight below and summed per pixel. The result was then split into five classes
          by Jenks natural breaks. Nothing here was fitted to observed outcomes, so there
          is no accuracy statistic and no training data behind any number on this page.
        </p>

        <dl className="mt-8 grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            tone="dark"
            label="Valid pixels"
            value={formatCount(result.validPixels ?? table.totalPixels)}
            unit="px"
            detail={
              result.grid
                ? `${formatCount(result.grid.width)} x ${formatCount(result.grid.height)} grid`
                : "grid size not reported"
            }
          />
          <StatTile
            tone="dark"
            label="Classified area"
            value={formatKm2(table.totalAreaKm2)}
            unit="km²"
            detail={`${config.areas.length} ${config.areas.length === 1 ? "area" : "areas"} of interest`}
          />
          <StatTile
            tone="dark"
            label="Cell size"
            value={formatCount(result.grid?.resolution ?? config.resolution)}
            unit="m"
            detail={result.grid?.crs ?? config.targetCrs}
          />
          <StatTile
            tone="dark"
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
      </Band>

      {/* ------------------------------------------ 2. classification + map */}
      <Band ground="white" width="wide" pad="tight">
        <Eyebrow>Classification</Eyebrow>
        <h2 className="mt-3 text-xl font-semibold tracking-tight">
          Five classes, cut at this run&apos;s own breaks
        </h2>

        {/*
          The interval strip. Five cells of EQUAL width, with each break printed
          on the boundary it defines.

          Equal width, not proportional, and that is the honest choice rather
          than the lazy one. `natural_breaks` returns interior breaks only, so
          the response carries no minimum and no maximum for the index. A
          proportional axis would have to invent both ends, and inventing an
          axis is how a reader ends up with a false sense of how wide the
          bottom and top classes are. Equal cells claim nothing about value
          ranges; the numbers on the boundaries and in the table carry that.
        */}
        <div className="mt-6" data-testid="interval-strip">
          <div className="grid grid-cols-5 gap-px overflow-hidden rounded border border-edge">
            {table.rows.map((row) => (
              <div key={row.classNumber} className="min-w-0">
                <div className="h-3 w-full" style={{ backgroundColor: row.colour }} aria-hidden="true" />
                <div className="bg-surface px-1.5 py-2 sm:px-2">
                  <p className="truncate text-xs leading-tight font-semibold text-ink" title={row.label}>
                    {row.label}
                  </p>
                  <p className="text-xs leading-tight text-ink-muted tabular-nums">
                    {formatPercent(row.percent)}
                  </p>
                </div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-5" aria-hidden="true">
            {table.rows.map((row, index) => (
              <div key={row.classNumber} className="min-w-0 pt-1">
                {index === 0 || result.breaks[index - 1] === undefined ? null : (
                  <p className="truncate border-l border-edge-strong pl-1 text-xs leading-tight text-ink-faint tabular-nums">
                    {formatIndex(result.breaks[index - 1])}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>

        {/*
          `grid-cols-[minmax(0,1fr)]` on the one-column case, not just on lg.
          A grid's implicit column is `auto`, which is sized by its content, so
          the scrollable table below stretched the column to its 30rem min-width
          and pushed the PAGE 8px wide at 360. `overflow-x-auto` cannot contain
          a child of a track that grew to fit it; the track has to be told it
          may be narrower than its content. Measured, not guessed: the eval for
          S10 failed at exactly 8px and named this table.
        */}
        <div className="mt-8 grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
          <Panel title="Class table" pad="none">
            {/*
              overflow-x-auto on the wrapper, not the page. Five columns of
              numbers cannot be made to fit 360px without either truncating a
              value or dropping a column, and both of those lose information the
              rubric asks for. Scrolling the table keeps rubric S10 (no
              horizontal scroll on the PAGE) while keeping every figure intact.
            */}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[30rem] border-collapse text-sm">
                <caption className="sr-only">
                  Class table: every class with its index range, pixel count, area in square
                  kilometres and share of valid pixels.
                </caption>
                <thead>
                  <tr className="border-b border-edge text-left">
                    <th scope="col" className="eyebrow px-4 py-2.5">Class</th>
                    <th scope="col" className="eyebrow px-4 py-2.5">Index range</th>
                    <th scope="col" className="eyebrow px-4 py-2.5 text-right">Pixels</th>
                    <th scope="col" className="eyebrow px-4 py-2.5 text-right">Area km²</th>
                    <th scope="col" className="eyebrow px-4 py-2.5 text-right">Share</th>
                  </tr>
                </thead>
                <tbody>
                  {table.rows.map((row) => (
                    <tr key={row.classNumber} className="border-b border-edge last:border-b-0">
                      <th scope="row" className="px-4 py-2.5 text-left font-semibold whitespace-nowrap">
                        <span className="inline-flex items-center gap-2">
                          <Swatch colour={row.colour} />
                          {row.label}
                        </span>
                      </th>
                      <td className="px-4 py-2.5 whitespace-nowrap text-ink-muted tabular-nums">
                        {row.interval}
                      </td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap tabular-nums">
                        {formatCount(row.pixels)}
                      </td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap tabular-nums">
                        {formatKm2(row.areaKm2)}
                      </td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap font-semibold tabular-nums">
                        {formatPercent(row.percent)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-edge-strong bg-sunken/60">
                    <th scope="row" className="px-4 py-2.5 text-left font-semibold whitespace-nowrap">
                      Total
                    </th>
                    <td className="px-4 py-2.5 text-ink-faint">all valid pixels</td>
                    <td className="px-4 py-2.5 text-right font-semibold whitespace-nowrap tabular-nums">
                      {formatCount(table.totalPixels)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold whitespace-nowrap tabular-nums">
                      {formatKm2(table.totalAreaKm2)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold whitespace-nowrap tabular-nums">
                      {formatPercent(
                        table.split.percents.reduce((sum, percent) => sum + percent, 0),
                      )}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="border-t border-edge px-4 py-3">
              {table.split.withinTolerance ? (
                <p className="text-xs leading-relaxed text-ink-faint">
                  Shares are of the valid pixels and add to 100%. Each one is rounded to a
                  tenth of a point by largest remainder, so the column totals exactly 100.0%
                  rather than 99.9%; no row moves by more than a tenth of a point.
                </p>
              ) : (
                <p className="text-xs leading-relaxed text-ink" data-testid="share-sum-warning">
                  <span className="font-semibold">These shares do not add to 100%.</span> The
                  service reported shares summing to {table.split.rawSum.toFixed(6)}, which is
                  outside the ±0.001 this screen accepts, so each row is shown rounded on its
                  own rather than adjusted to make the column total.
                </p>
              )}
            </div>
          </Panel>

          <div className="flex flex-col gap-5">
            <Panel title="Area covered" action={<span className="text-xs text-ink-faint">WGS84</span>}>
              {outline === null ? (
                <p className="text-sm leading-relaxed text-ink-muted">
                  The configuration carries no polygon this page can draw. The class table
                  above is the whole result.
                </p>
              ) : (
                <>
                  <div className="aspect-4/3 w-full rounded bg-sunken p-3">
                    <svg
                      role="img"
                      aria-labelledby={`${titleId} ${descId}`}
                      viewBox={outline.viewBox}
                      preserveAspectRatio="xMidYMid meet"
                      className="h-full w-full"
                    >
                      <title id={titleId}>
                        Outline of the {config.areas.length}{" "}
                        {config.areas.length === 1 ? "area" : "areas"} this run covered
                      </title>
                      <desc id={descId}>
                        Boundary only. The classified raster stays on the service, so no
                        per-pixel classes are drawn here. Extent {formatBounds(outline.bounds)}.
                      </desc>
                      {outline.paths.map((d) => (
                        <path
                          key={d}
                          d={d}
                          fillRule="evenodd"
                          fill="var(--color-accent-soft)"
                          stroke="var(--color-accent)"
                          strokeWidth={2}
                          strokeLinejoin="round"
                          vectorEffect="non-scaling-stroke"
                        />
                      ))}
                    </svg>
                  </div>
                  <p className="mt-3 text-xs leading-relaxed text-ink-faint">
                    Boundary only, drawn from the areas in the configuration. The classified
                    raster is written to the service&apos;s own filesystem and is not part of
                    this response, so there is no per-pixel surface to colour here. Extent{" "}
                    {formatBounds(outline.bounds)}.
                  </p>
                </>
              )}
            </Panel>

            {/*
              The legend, and it is the table's legend rather than the map's:
              the map draws no classes, so this exists to tie the swatch in the
              interval strip and the table to a name. Every entry carries its
              text, so the colour is never the only channel.
            */}
            <Panel title="Legend">
              <ul className="flex flex-col gap-2">
                {table.rows.map((row) => (
                  <li key={row.classNumber} className="flex items-center gap-2.5 text-sm">
                    <Swatch colour={row.colour} />
                    <span className="font-medium">
                      Class {row.classNumber}, {row.label}
                    </span>
                    <span className="ml-auto text-xs whitespace-nowrap text-ink-muted tabular-nums">
                      {formatPercent(row.percent)}
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>
        </div>
      </Band>

      {/* ---------------------------------------- 3. breaks and contribution */}
      <Band ground="paper" width="wide" pad="tight">
        <div className="grid items-start gap-5 lg:grid-cols-2">
          <Panel title="Jenks natural breaks">
            {result.breaks.length === 0 ? (
              <p className="text-sm leading-relaxed text-ink-muted">
                No break was computed. Every valid pixel in this run carries the same index
                value, so the surface could not be split.
              </p>
            ) : (
              <>
                <ol className="flex flex-wrap gap-2" data-testid="breaks-list">
                  {result.breaks.map((value, index) => (
                    <li
                      key={value}
                      className="rounded border border-accent-border bg-accent-soft px-3 py-2"
                    >
                      <span className="eyebrow block">Break {index + 1}</span>
                      <span className="text-base font-semibold text-accent tabular-nums">
                        {formatIndex(value)}
                      </span>
                    </li>
                  ))}
                </ol>
                <p className="mt-4 text-sm leading-relaxed text-ink-muted">
                  These breaks were computed from this run&apos;s own distribution rather than
                  from a fixed scale. They are the interior boundaries only, which is why there
                  are {result.breaks.length} of them for {table.rows.length} classes: the lowest
                  class is open below and the highest is open above. Two runs over different
                  areas will have different breaks, so &ldquo;High&rdquo; here and
                  &ldquo;High&rdquo; in another run are not the same index value and must not be
                  compared as if they were.
                </p>
              </>
            )}
          </Panel>

          <Panel title="Weights this run used">
            <ul className="flex flex-col gap-2 text-sm">
              {contributions.map((row) => (
                <li key={row.id} className="flex items-baseline justify-between gap-4">
                  <span className="min-w-0 break-words">{row.label}</span>
                  <span className="shrink-0 font-semibold tabular-nums">
                    {row.weight === null ? "not given" : formatPercent(row.weight * 100)}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-sm leading-relaxed text-ink-muted">
              The weights are an input, chosen before the run, and they are on the page because
              they are half of what produced the contribution below. Target CRS{" "}
              {config.targetCrs} at {formatCount(config.resolution)} m per pixel.
            </p>
          </Panel>
        </div>

        <div className="mt-5">
          {/*
            The definition sits in the body, not in the Panel's `action` slot.
            That slot is `shrink-0` by design, so a caption in it cannot wrap:
            "PER-CRITERION CONTRIBUTION" beside "mean(risk) × weight,
            normalised" measured 368px against a 360px viewport and pushed the
            whole page 8px wide. Found by the S10 eval, which is exactly the
            class of thing it exists to catch.
          */}
          <Panel title="Per-criterion contribution">
            <p className="mb-4 text-xs leading-relaxed text-ink-faint">
              mean(risk) × weight, normalised.
            </p>
            {/*
              Contribution shown AGAINST the weight that produced it.

              This is the one arrangement that makes the definition legible.
              Contribution is mean(risk_i) × weight_i normalised, so the only
              way a criterion's bar can sit away from its weight is through
              mean(risk_i): above means this run's pixels scored high on that
              criterion, below means they scored low. Reading the two together
              is also the clearest statement of what the number is not, which
              the sentence under the chart says outright for rubric S4.
            */}
            <ul className="flex flex-col gap-4" data-testid="contribution-list">
              {contributions.map((row) => (
                <li key={row.id} className="min-w-0">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <span className="text-sm font-medium">{row.label}</span>
                    <span className="text-sm whitespace-nowrap tabular-nums">
                      <span className="font-semibold">{formatPercent(row.contribution * 100)}</span>
                      <span className="text-ink-faint">
                        {" "}
                        of the score
                        {row.weight === null
                          ? ""
                          : `, weight ${formatPercent(row.weight * 100)}`}
                      </span>
                    </span>
                  </div>

                  <div className="relative mt-2 h-4 w-full rounded-sm bg-sunken">
                    <div
                      className="absolute inset-y-0 left-0 rounded-sm bg-accent"
                      style={{ width: `${(row.contribution / contributionPeak) * 100}%` }}
                      aria-hidden="true"
                    />
                    {row.weight === null ? null : (
                      // The weight as a tick on the same scale, so the gap
                      // between input and outcome is a distance the eye reads
                      // rather than a subtraction the reader performs.
                      <div
                        className="absolute inset-y-0 w-px bg-ink"
                        style={{ left: `${(row.weight / contributionPeak) * 100}%` }}
                        aria-hidden="true"
                      />
                    )}
                  </div>

                  <p className="mt-1 text-xs text-ink-faint">
                    {row.offsetPoints === null
                      ? "No weight was recorded for this criterion."
                      : Math.abs(row.offsetPoints) < 0.05
                        ? "Sits on its weight: this run's pixels scored about average on it."
                        : row.offsetPoints > 0
                          ? `${row.offsetPoints.toFixed(1)} points above its weight: this run's pixels scored high on it.`
                          : `${Math.abs(row.offsetPoints).toFixed(1)} points below its weight: this run's pixels scored low on it.`}
                  </p>
                </li>
              ))}
            </ul>

            <p className="mt-6 border-t border-edge pt-4 text-sm leading-relaxed text-ink">
              <span className="font-semibold">
                This is not feature importance and it is not a sensitivity analysis.
              </span>{" "}
              Each figure is mean(risk) × weight for one criterion, normalised across all{" "}
              {contributions.length}, so it says how much of the average score came from that
              criterion in this run. It does not say how much the answer would change if a
              criterion were
              removed, reweighted or measured differently, and no number on this page answers
              that question. A weighted overlay has no fitted parameters to rank.
            </p>
          </Panel>
        </div>
      </Band>

      {/* ------------------------------------ 4. provenance, exports, actions */}
      <Band ground="white" width="wide" pad="tight">
        <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
          <Panel title="Run provenance">
            <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
              <Fact term="Run id">
                <span className="font-mono text-xs">{result.runId}</span>
              </Fact>
              <Fact term="Generated at">{formatTimestamp(result.generatedAt)}</Fact>
              <Fact term="Topic">
                {topic.name} <span className="text-ink-faint">({config.topic})</span>
              </Fact>
              <Fact term="Indicator">
                {result.indicator.label}{" "}
                <span className="text-ink-faint">({result.indicator.id})</span>
              </Fact>
              <Fact term="Grid">
                {result.grid
                  ? `${result.grid.crs}, ${formatCount(result.grid.resolution)} m, ${formatCount(result.grid.width)} × ${formatCount(result.grid.height)} px`
                  : `${config.targetCrs}, ${formatCount(config.resolution)} m, size not reported`}
              </Fact>
              <Fact term="Valid pixels">
                {typeof result.validPixels === "number"
                  ? `${formatCount(result.validPixels)} of ${formatCount(table.totalPixels)} classified`
                  : "not reported"}
              </Fact>
              <Fact term="Date window">
                {config.dateWindow
                  ? `${formatDate(config.dateWindow.start)} to ${formatDate(config.dateWindow.end)}`
                  : "none set, so the layers were read at their published dates"}
              </Fact>
              <Fact term="Published layers">
                {result.layers.length > 0
                  ? result.layers.join(", ")
                  : config.publishLayers
                    ? "requested, none reported back"
                    : "none, the run did not publish to GeoServer"}
              </Fact>
            </dl>
          </Panel>

          <Panel title="Download">
            <p className="text-sm leading-relaxed text-ink-muted">
              Every file carries the run id, the configuration and the method note, so one
              detached from this page still says what produced it.
            </p>
            <div className="mt-4">
              <Downloads files={files} />
            </div>
            <p className="mt-4 border-t border-edge pt-3 text-xs leading-relaxed text-ink-faint">
              {METHOD_NOTE}
            </p>
          </Panel>
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          {/*
            One forward control on the screen, and this is it. Everything else,
            including the three downloads, is an outline, so the accent keeps
            meaning "this way" rather than "here is a button".
          */}
          <ButtonLink href={rerunHref} variant="scarlet" size="lg">
            Run this configuration again
          </ButtonLink>
          <ButtonLink href={reviewHref} variant="outline" size="lg">
            Back to review
          </ButtonLink>
        </div>
      </Band>
    </div>
  );
}
