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
 * validated payload with nothing computed behind it, and it says so at the top
 * in a warning bar. This screen is the other half of that honesty. There IS a
 * computation behind these numbers, and the same care goes into saying exactly
 * what kind of computation it was: a weighted overlay of reclassified
 * criterion rasters, classified by Jenks breaks taken from this run's own
 * distribution. Not a trained model. Every claim on the page is traceable to a
 * field in `contracts/backend-api.md`.
 *
 * Laid out as the design system's ModelMetrics view, adapted to a method that
 * has no accuracy to report: headline KPI cards first, then the class table
 * under the DataTable conventions (units in the header, numbers right-aligned
 * in tabular figures, a swatch before each class, 40px rows, no zebra), then
 * the per-criterion bars where ModelMetrics puts feature importance, and the
 * configuration last so a run can be reproduced.
 *
 * Judged against Copernicus GloFAS and the FEWS NET IPC map pages, which are
 * the reference the rubric names: the classified map sits beside the class
 * table that defines it, the breaks are printed as numbers rather than implied
 * by a colour bar, and the method is named in the body of the page rather
 * than in a footnote.
 *
 * Where this deliberately stops short of GloFAS: there is no pixel surface.
 * `result.rasters` is a pair of paths on the backend's own disk, so the
 * classified raster is not in the response and cannot be drawn. Drawing a
 * plausible-looking coloured surface anyway would be the single most dishonest
 * thing this page could do, so the map is the run's own area outlines, in SVG,
 * with the legend beside it saying what the colours in the table mean.
 */

import type { ReactNode } from "react";
import type { Route } from "next";
import { ArrowLeft20Regular, ArrowRepeatAll20Regular } from "@/components/ui/icons";

import { ButtonLink } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { Panel } from "@/components/ui/Panel";
import { StatTile } from "@/components/ui/StatTile";
import { JobBadge } from "@/components/run/JobBadge";
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

const FRAME = "mx-auto w-full max-w-band px-gutter lg:px-gutter-lg";

/* ------------------------------------------------------------ small parts */

/**
 * The class colour, as a mark that never carries meaning on its own.
 *
 * Same rule `<SeverityChip>` enforces, applied to an ordered ramp instead of
 * the reserved status scale: the swatch is `aria-hidden` and there is no code
 * path that renders it without the class label next to it. The 1px
 * colorNeutralStroke1 ring is the design system's swatch outline, which keeps
 * the pale end of the ramp from dissolving into a white card.
 */
function Swatch({ colour }: { colour: string }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-3 w-3 shrink-0 rounded-fluent-small align-middle ring-1 ring-edge-strong"
      style={{ backgroundColor: colour }}
    />
  );
}

/** A labelled fact in a definition list. Used for the provenance block. */
function Fact({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="type-caption1 text-ink-faint">{term}</dt>
      <dd className="type-body1 mt-0.5 break-words text-ink">{children}</dd>
    </div>
  );
}

/**
 * A percentage cell under a "Share (%)" header.
 *
 * DataTable's rule is units in the header, never repeated in the cell, so the
 * sign is not DRAWN. It is still in the text, visually hidden, so a screen
 * reader that lands on one cell hears "31.0 percent" rather than a bare
 * number, and so the cell's text is the value a copy-paste should carry.
 */
function Percent({ value }: { value: number }) {
  const text = formatPercent(value);
  return (
    <>
      {text.replace("%", "")}
      <span className="sr-only">%</span>
    </>
  );
}

/* DataTable conventions, once: 40px rows (spacingS vertical padding), a
   colorNeutralBackground2 header in body1Strong, colorNeutralStroke2
   dividers, numbers right-aligned. */
const TH = "type-body1 px-4 py-2 font-semibold whitespace-nowrap text-ink";
const TD = "type-body1 px-4 py-2 whitespace-nowrap tabular-nums";

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
      <section className="border-b border-edge bg-surface">
        <div className={`${FRAME} py-6 lg:py-8`}>
          <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <JobBadge kind="run" state="succeeded" />
                <span className="type-caption1 text-ink-faint">Completed run</span>
              </div>
              <h1 className="type-title3 mt-2 text-ink lg:type-title2">
                {topic.name}: {result.indicator.label}
              </h1>
              <p className="type-caption1 mt-1 text-ink-faint">
                Run <span className="font-mono text-ink-muted">{result.runId}</span>, finished{" "}
                {formatTimestamp(result.generatedAt)}.
              </p>
            </div>

            {/*
              One forward control on the screen, and this is it: the only
              primary button. Everything else, including the downloads, is
              secondary, so brand blue keeps meaning "this way".
            */}
            <div className="flex flex-wrap items-center gap-2">
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

          {/*
            The method, stated before any number is read, in the body of the
            page. This is rubric S5 and it is also the reference's own habit:
            GloFAS and the FEWS NET IPC pages name the method beside the map,
            not in a footnote a reader reaches after forming a view.
          */}
          <Notice intent="info" title="This is a weighted overlay, not a model." className="mt-5">
            Each criterion layer was reclassified onto a 1 to 5 scale, multiplied by the
            weight below and summed per pixel. The result was then split into five classes
            by Jenks natural breaks. Nothing here was fitted to observed outcomes, so there
            is no accuracy statistic and no training data behind any number on this page.
          </Notice>
        </div>
      </section>

      <div className={`${FRAME} flex flex-col gap-8 py-6 lg:py-8`}>
        {/* --------------------------------------------------- 2. headline */}
        <section aria-labelledby="headline-heading">
          <h2 id="headline-heading" className="sr-only">
            Headline figures
          </h2>
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
              detail={<span className="font-mono">{result.grid?.crs ?? config.targetCrs}</span>}
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
        </section>

        {/* ------------------------------------- 3. classification + map */}
        <section aria-labelledby="classification-heading">
          <h2 id="classification-heading" className="type-subtitle1 text-ink">
            Classification
          </h2>
          <p className="type-body1 mt-0.5 text-ink-muted">
            Five classes, cut at this run&apos;s own breaks.
          </p>

          {/*
            The interval strip. Five cells of EQUAL width, with each break
            printed on the boundary it defines.

            Equal width, not proportional, and that is the honest choice rather
            than the lazy one. `natural_breaks` returns interior breaks only, so
            the response carries no minimum and no maximum for the index. A
            proportional axis would have to invent both ends. Equal cells claim
            nothing about value ranges; the numbers on the boundaries and in the
            table carry that.
          */}
          <div className="card mt-4 px-4 pt-4 pb-3" data-testid="interval-strip">
            <div className="grid grid-cols-5 gap-0.5 overflow-hidden rounded-fluent-medium">
              {table.rows.map((row) => (
                <div
                  key={row.classNumber}
                  className="h-4 w-full"
                  style={{ backgroundColor: row.colour }}
                  aria-hidden="true"
                />
              ))}
            </div>
            <div className="grid grid-cols-5" aria-hidden="true">
              {table.rows.map((row, index) => (
                <div key={row.classNumber} className="min-w-0 pt-1">
                  {index === 0 || result.breaks[index - 1] === undefined ? null : (
                    <p className="type-caption1 truncate border-l border-ink-faint pl-1 font-mono text-ink-muted">
                      {formatIndex(result.breaks[index - 1])}
                    </p>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-2 grid grid-cols-5 gap-0.5">
              {table.rows.map((row) => (
                <div key={row.classNumber} className="min-w-0">
                  <p className="type-caption1 truncate font-semibold text-ink" title={row.label}>
                    {row.label}
                  </p>
                  <p className="type-caption1 text-ink-muted tabular-nums">
                    {formatPercent(row.percent)}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/*
            `grid-cols-[minmax(0,1fr)]` on the one-column case, not just on lg.
            A grid's implicit column is `auto`, which is sized by its content,
            so the scrollable table below stretched the column to its min-width
            and pushed the PAGE 8px wide at 360. `overflow-x-auto` cannot
            contain a child of a track that grew to fit it; the track has to be
            told it may be narrower than its content.
          */}
          <div className="mt-4 grid grid-cols-[minmax(0,1fr)] items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
            <Panel title="Class table" pad="none">
              {/*
                overflow-x-auto on the wrapper, not the page. Five columns of
                numbers cannot fit 360px without truncating a value or dropping
                a column, and both lose information the rubric asks for.

                `relative` is load-bearing. The visually hidden "%" in every
                share cell is `position: absolute`, and an absolute box whose
                containing block sits OUTSIDE a scroller is not clipped by it:
                without a positioned ancestor here, those 1px spans escaped to
                x = 550 and pushed the page 192px wide at 360.
              */}
              <div className="relative overflow-x-auto">
                <table className="w-full min-w-[34rem] border-collapse">
                  <caption className="sr-only">
                    Class table: every class with its index range, pixel count, area in square
                    kilometres and share of valid pixels.
                  </caption>
                  <thead className="bg-surface-subtle">
                    <tr className="border-b border-edge text-left">
                      <th scope="col" className={TH}>Class</th>
                      <th scope="col" className={TH}>Index range</th>
                      <th scope="col" className={`${TH} text-right`}>Pixels</th>
                      <th scope="col" className={`${TH} text-right`}>Area (km²)</th>
                      <th scope="col" className={`${TH} text-right`}>Share (%)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {table.rows.map((row) => (
                      <tr key={row.classNumber} className="border-b border-edge last:border-b-0">
                        <th scope="row" className={`${TH} text-left`}>
                          <span className="inline-flex items-center gap-2">
                            <Swatch colour={row.colour} />
                            {row.label}
                          </span>
                        </th>
                        <td className={`${TD} font-mono text-ink-muted`}>{row.interval}</td>
                        <td className={`${TD} text-right text-ink`}>{formatCount(row.pixels)}</td>
                        <td className={`${TD} text-right text-ink`}>{formatKm2(row.areaKm2)}</td>
                        <td className={`${TD} text-right font-semibold text-ink`}>
                          <Percent value={row.percent} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-edge-strong bg-surface-subtle">
                      <th scope="row" className={`${TH} text-left`}>
                        Total
                      </th>
                      <td className={`${TD} text-ink-faint`}>all valid pixels</td>
                      <td className={`${TD} text-right font-semibold text-ink`}>
                        {formatCount(table.totalPixels)}
                      </td>
                      <td className={`${TD} text-right font-semibold text-ink`}>
                        {formatKm2(table.totalAreaKm2)}
                      </td>
                      <td className={`${TD} text-right font-semibold text-ink`}>
                        <Percent
                          value={table.split.percents.reduce((sum, percent) => sum + percent, 0)}
                        />
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div className="border-t border-edge px-4 py-3">
                {table.split.withinTolerance ? (
                  <p className="type-caption1 text-ink-faint">
                    Shares are of the valid pixels and add to 100%. Each one is rounded to a
                    tenth of a point by largest remainder, so the column totals exactly 100.0%
                    rather than 99.9%; no row moves by more than a tenth of a point.
                  </p>
                ) : (
                  <p className="type-caption1 text-ink" data-testid="share-sum-warning">
                    <span className="font-semibold">These shares do not add to 100%.</span> The
                    service reported shares summing to {table.split.rawSum.toFixed(6)}, which is
                    outside the ±0.001 this screen accepts, so each row is shown rounded on its
                    own rather than adjusted to make the column total.
                  </p>
                )}
              </div>
            </Panel>

            <div className="flex flex-col gap-4">
              <Panel
                title="Area covered"
                action={<span className="type-caption1 font-mono text-ink-faint">WGS84</span>}
              >
                {outline === null ? (
                  <p className="type-body1 text-ink-muted">
                    The configuration carries no polygon this page can draw. The class table
                    is the whole result.
                  </p>
                ) : (
                  <>
                    <div className="aspect-4/3 w-full rounded-fluent-medium bg-page p-3">
                      <svg
                        role="img"
                        aria-labelledby={`${titleId} ${descId}`}
                        viewBox={outline.viewBox}
                        preserveAspectRatio="xMidYMid meet"
                        className="h-full w-full"
                      >
                        {/*
                          One string child, not several. React 19 treats
                          <title> as document metadata and wants a single text
                          node; split across JSX expressions it rendered
                          differently on the server and the client, and every
                          results page logged a hydration mismatch.
                        */}
                        <title id={titleId}>
                          {`Outline of the ${config.areas.length} ${
                            config.areas.length === 1 ? "area" : "areas"
                          } this run covered`}
                        </title>
                        <desc id={descId}>
                          Boundary only. The classified raster stays on the service, so no
                          per-pixel classes are drawn here. Extent {formatBounds(outline.bounds)}.
                        </desc>
                        {/*
                          Brand stroke on colorBrandBackground2, the design
                          system's "selected layer" pair. Not mapSelection
                          (#00e5ff): that cyan is tuned to hold its edge over
                          imagery with a dark halo, and on this plain light
                          locator it would sit near 1.3:1. One path per area,
                          so each area is exactly one element.
                        */}
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
                    <p className="type-caption1 mt-3 text-ink-faint">
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
                text, so the colour is never the only channel. Units in the
                title, as the design system asks of every legend.
              */}
              <Panel title="Legend: share of valid pixels (%)">
                <ul className="flex flex-col gap-2">
                  {table.rows.map((row) => (
                    <li key={row.classNumber} className="type-body1 flex items-center gap-2.5">
                      <Swatch colour={row.colour} />
                      <span className="text-ink">
                        Class {row.classNumber}, {row.label}
                      </span>
                      <span className="type-caption1 ml-auto whitespace-nowrap text-ink-muted tabular-nums">
                        <Percent value={row.percent} />
                      </span>
                    </li>
                  ))}
                </ul>
              </Panel>
            </div>
          </div>
        </section>

        {/* ---------------------------------- 4. breaks, weights, contribution */}
        <section aria-labelledby="method-heading">
          <h2 id="method-heading" className="type-subtitle1 text-ink">
            How the score was built
          </h2>

          <div className="mt-4 grid items-start gap-4 lg:grid-cols-2">
            <Panel title="Jenks natural breaks">
              {result.breaks.length === 0 ? (
                <p className="type-body1 text-ink-muted">
                  No break was computed. Every valid pixel in this run carries the same index
                  value, so the surface could not be split.
                </p>
              ) : (
                <>
                  <ol className="flex flex-wrap gap-2" data-testid="breaks-list">
                    {result.breaks.map((value, index) => (
                      <li
                        key={value}
                        className="min-w-24 rounded-fluent-medium bg-page px-3 py-2"
                      >
                        <span className="type-caption1 block text-ink-faint">
                          Break {index + 1}
                        </span>
                        <span className="type-subtitle2 font-mono text-ink tabular-nums">
                          {formatIndex(value)}
                        </span>
                      </li>
                    ))}
                  </ol>
                  <p className="type-body1 mt-4 text-ink-muted">
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

            <Panel title="Weights this run used" pad="none">
              <table className="w-full border-collapse">
                <caption className="sr-only">Criterion weights configured for this run</caption>
                <thead className="bg-surface-subtle">
                  <tr className="border-b border-edge text-left">
                    <th scope="col" className={TH}>Criterion</th>
                    <th scope="col" className={`${TH} text-right`}>Weight (%)</th>
                  </tr>
                </thead>
                <tbody>
                  {contributions.map((row) => (
                    <tr key={row.id} className="border-b border-edge last:border-b-0">
                      <th scope="row" className="type-body1 px-4 py-2 text-left font-normal text-ink">
                        <span className="break-words">{row.label}</span>
                      </th>
                      <td className={`${TD} text-right font-semibold text-ink`}>
                        {row.weight === null ? (
                          <span className="font-normal text-ink-faint">not given</span>
                        ) : (
                          <Percent value={row.weight * 100} />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="type-caption1 border-t border-edge px-4 py-3 text-ink-faint">
                The weights are an input, chosen before the run, and they are on the page
                because they are half of what produced the contribution below. Target CRS{" "}
                <span className="font-mono">{config.targetCrs}</span> at{" "}
                {formatCount(config.resolution)} m per pixel.
              </p>
            </Panel>
          </div>

          <div className="mt-4">
            {/*
              The definition sits in the body, not in the Panel's `action` slot.
              That slot is `shrink-0` by design, so a caption in it cannot wrap,
              and at 360px it pushed the whole page 8px wide.
            */}
            <Panel title="Per-criterion contribution">
              <p className="type-caption1 mb-4 text-ink-faint">
                mean(risk) × weight, normalised.
              </p>
              {/*
                Contribution shown AGAINST the weight that produced it, drawn
                the way ModelMetrics draws ranked bars: brand fill, sorted high
                to low, the criterion id in dataMono beside its name.

                Contribution is mean(risk_i) × weight_i normalised, so the only
                way a criterion's bar can sit away from its weight is through
                mean(risk_i): above means this run's pixels scored high on that
                criterion, below means they scored low.
              */}
              <ul className="flex flex-col gap-4" data-testid="contribution-list">
                {contributions.map((row) => (
                  <li key={row.id} className="min-w-0">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <span className="type-body1 font-semibold text-ink">
                        {row.label}
                        {row.label !== row.id ? (
                          <span className="type-caption1 ml-2 font-mono font-normal text-ink-faint">
                            {row.id}
                          </span>
                        ) : null}
                      </span>
                      <span className="type-body1 whitespace-nowrap tabular-nums">
                        <span className="font-semibold text-ink">
                          {formatPercent(row.contribution * 100)}
                        </span>
                        <span className="text-ink-faint">
                          {" "}
                          of the score
                          {row.weight === null
                            ? ""
                            : `, weight ${formatPercent(row.weight * 100)}`}
                        </span>
                      </span>
                    </div>

                    <div className="relative mt-1.5 h-3 w-full rounded-fluent-small bg-page">
                      <div
                        className="absolute inset-y-0 left-0 rounded-fluent-small bg-accent"
                        style={{ width: `${(row.contribution / contributionPeak) * 100}%` }}
                        aria-hidden="true"
                      />
                      {row.weight === null ? null : (
                        // The weight as a tick on the same scale, so the gap
                        // between input and outcome is a distance the eye reads
                        // rather than a subtraction the reader performs.
                        <div
                          className="absolute -inset-y-0.5 w-0.5 rounded-full bg-ink"
                          style={{ left: `${(row.weight / contributionPeak) * 100}%` }}
                          aria-hidden="true"
                        />
                      )}
                    </div>

                    <p className="type-caption1 mt-1 text-ink-faint">
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

              <p className="type-caption1 mt-4 flex items-center gap-3 text-ink-faint" aria-hidden="true">
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-4 rounded-fluent-small bg-accent" />
                  contribution
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-3 w-0.5 rounded-full bg-ink" />
                  weight
                </span>
              </p>

              <p className="type-body1 mt-4 border-t border-edge pt-4 text-ink">
                <span className="font-semibold">
                  This is not feature importance and it is not a sensitivity analysis.
                </span>{" "}
                Each figure is mean(risk) × weight for one criterion, normalised across all{" "}
                {contributions.length}, so it says how much of the average score came from that
                criterion in this run. It does not say how much the answer would change if a
                criterion were removed, reweighted or measured differently, and no number on
                this page answers that question. A weighted overlay has no fitted parameters to
                rank.
              </p>
            </Panel>
          </div>
        </section>

        {/* ------------------------------------- 5. provenance and exports */}
        <section aria-labelledby="provenance-heading">
          <h2 id="provenance-heading" className="type-subtitle1 text-ink">
            Reproduce and export
          </h2>

          <div className="mt-4 grid grid-cols-[minmax(0,1fr)] items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
            <Panel title="Run provenance">
              <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
                <Fact term="Run id">
                  <span className="font-mono">{result.runId}</span>
                </Fact>
                <Fact term="Generated at">{formatTimestamp(result.generatedAt)}</Fact>
                <Fact term="Topic">
                  {topic.name} <span className="font-mono text-ink-faint">({config.topic})</span>
                </Fact>
                <Fact term="Indicator">
                  {result.indicator.label}{" "}
                  <span className="font-mono text-ink-faint">({result.indicator.id})</span>
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
              <p className="type-body1 mb-4 text-ink-muted">
                Every file carries the run id, the configuration and the method note, so one
                detached from this page still says what produced it.
              </p>
              <Downloads files={files} />
              <p className="type-caption1 mt-4 border-t border-edge pt-3 text-ink-faint">
                {METHOD_NOTE}
              </p>
            </Panel>
          </div>
        </section>
      </div>
    </div>
  );
}
