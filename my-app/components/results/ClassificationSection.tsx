/**
 * The centre of the result: the class table, with the run's areas on the
 * basemap beside it.
 *
 * Judged against Copernicus GloFAS and the FEWS NET IPC map pages: the map
 * sits beside the table that defines the classes, and every number is printed
 * once. The swatch in each row is the legend; the breaks are the Index range
 * column here and the Jenks card below.
 *
 * Where this deliberately stops short of GloFAS: there is no class surface.
 * `result.rasters` is a pair of paths on the backend's own disk, so the
 * classified raster is not in the response and cannot be drawn. The map shows
 * the areas the run covered, from its own configuration, and says so.
 */

import { Panel } from "@/components/ui/Panel";
import type { RunResult } from "@/services/backend-api";

import { ResultAreaMap } from "./ResultAreaMap";
import { More, Percent, RH, SectionHead, Swatch, TD, TH } from "./result-parts";
import { areaOutline, formatBounds, formatCount, formatKm2, type classTable } from "./view-model";

type ClassTable = ReturnType<typeof classTable>;

/*
 * On a phone the table keeps Class, Area and Share as columns and moves the
 * Index range and Pixels under the class name, so Share, the figure a reader
 * came for, is never pushed off the card. From `sm` up every column is a
 * column. The hidden cells stay in the DOM in the same order, so a row reads
 * the same to a screen reader at every width.
 */
const WIDE = "hidden sm:table-cell";

export function ClassificationSection({
  result,
  table,
}: {
  result: RunResult;
  table: ClassTable;
}) {
  const { config } = result;
  const outline = areaOutline(config.areas);
  const titleId = `outline-title-${result.runId}`;
  const descId = `outline-desc-${result.runId}`;
  const count = config.areas.length;

  return (
    <section aria-labelledby="classification-heading">
      <SectionHead
        id="classification-heading"
        title="Classification"
        lead={<>Five classes, cut at this run&apos;s own breaks.</>}
      />

      {/*
        `grid-cols-[minmax(0,1fr)]` on the one-column case, not just on lg: a
        grid's implicit column is sized by its content, and the table would
        stretch it past 360px. Stretch alignment, so the map card ends where
        the table card ends.
      */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
        <Panel title="Class table" pad="none" className="overflow-hidden">
          {/*
            `relative` is load-bearing: the visually hidden "%" in every share
            cell is `position: absolute`, and without a positioned ancestor
            those 1px spans escaped the scroller and widened the page at 360.
          */}
          <div className="relative overflow-x-auto">
            <table className="w-full border-collapse sm:min-w-[34rem]">
              <caption className="sr-only">
                Class table: every class with its index range, pixel count, area in square
                kilometres and share of valid pixels.
              </caption>
              <thead className="bg-surface-subtle">
                <tr className="border-b border-edge text-left">
                  <th scope="col" className={TH}>Class</th>
                  <th scope="col" className={`${TH} ${WIDE}`}>Index range</th>
                  <th scope="col" className={`${TH} ${WIDE} text-right`}>Pixels</th>
                  <th scope="col" className={`${TH} text-right`}>Area (km²)</th>
                  <th scope="col" className={`${TH} text-right`}>Share (%)</th>
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row) => (
                  <tr key={row.classNumber} className="border-b border-edge last:border-b-0">
                    <th scope="row" className={`${RH} text-left`}>
                      <span className="inline-flex items-center gap-2">
                        <Swatch colour={row.colour} />
                        {row.label}
                      </span>{" "}
                      <span
                        aria-hidden="true"
                        className="type-caption1 block pl-5 font-normal text-ink-faint tabular-nums sm:hidden"
                      >
                        {row.interval} · {formatCount(row.pixels)} px
                      </span>
                    </th>
                    <td className={`${TD} ${WIDE} text-ink-muted`}>{row.interval}</td>
                    <td className={`${TD} ${WIDE} text-right text-ink`}>{formatCount(row.pixels)}</td>
                    <td className={`${TD} text-right text-ink`}>{formatKm2(row.areaKm2)}</td>
                    <td className={`${TD} text-right font-semibold text-ink`}>
                      <Percent value={row.percent} />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-edge-strong bg-surface-subtle">
                  <th scope="row" className={`${RH} text-left`}>
                    Total{" "}
                    <span
                      aria-hidden="true"
                      className="type-caption1 block font-normal text-ink-faint tabular-nums sm:hidden"
                    >
                      {formatCount(table.totalPixels)} px
                    </span>
                  </th>
                  <td className={`${TD} ${WIDE} text-ink-faint`}>all valid pixels</td>
                  <td className={`${TD} ${WIDE} text-right font-semibold text-ink`}>
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

          <div className="border-t border-edge px-4 py-3 lg:px-5">
            {table.split.withinTolerance ? (
              <p className="type-caption1 text-ink-faint">
                Shares are of the valid pixels and add to 100%. Each one is rounded to a
                tenth of a point by largest remainder, so the column totals exactly 100.0%
                rather than 99.9%; no row moves by more than a tenth of a point.
              </p>
            ) : (
              <p className="type-caption1 text-ink" data-testid="share-sum-warning">
                <span className="font-semibold text-danger">These shares do not add to 100%.</span>{" "}
                The service reported shares summing to {table.split.rawSum.toFixed(6)}, which
                is outside the ±0.001 this screen accepts, so each row is shown rounded on its
                own rather than adjusted to make the column total.
              </p>
            )}
          </div>
        </Panel>

        <Panel
          title="Area covered"
          pad="none"
          className="overflow-hidden"
          action={<span className="type-caption1 text-ink-faint">{count} {count === 1 ? "area" : "areas"}</span>}
        >
          {outline === null ? (
            <p className="type-body1 p-4 text-ink-muted lg:p-5">
              The configuration carries no polygon this page can draw. The class table is the
              whole result.
            </p>
          ) : (
            <div className="flex h-full flex-col">
              <div className="min-h-[280px] flex-1">
                <ResultAreaMap
                  areas={config.areas}
                  fallback={
                    <svg
                      role="img"
                      aria-labelledby={`${titleId} ${descId}`}
                      viewBox={outline.viewBox}
                      preserveAspectRatio="xMidYMid meet"
                      className="h-full max-h-64 w-full"
                    >
                      {/*
                        One string child, not several. React 19 treats <title>
                        as document metadata and wants a single text node;
                        split across JSX expressions it rendered differently
                        on the server and the client.
                      */}
                      <title id={titleId}>
                        {`Outline of the ${count} ${count === 1 ? "area" : "areas"} this run covered`}
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
                  }
                />
              </div>
              <div className="border-t border-edge px-4 py-3 lg:px-5">
                <p className="type-caption1 break-words text-ink-faint tabular-nums">
                  Extent {formatBounds(outline.bounds)}, WGS84
                </p>
                <More summary="Why the classes are not drawn on the map">
                  The map shows the areas from the run&apos;s configuration. The classified
                  raster is written to the service&apos;s own filesystem and is not part of
                  this response, so there is no per-pixel surface to colour here.
                </More>
              </div>
            </div>
          )}
        </Panel>
      </div>
    </section>
  );
}
