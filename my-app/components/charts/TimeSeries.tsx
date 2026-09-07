"use client";

import { useId, useMemo, useState } from "react";
import { chrome as chromeTokens, light, navy } from "@/design/tokens";
import type { Tone } from "@/components/ui/tone";
import { useMeasure } from "./useMeasure";
import {
  contiguousRuns,
  labelIndices,
  nearestIndex,
  niceTicks,
  plotDomain,
  scaleX,
  scaleY,
} from "./scale";

export interface SeriesLine {
  id: string;
  /** Untrusted: a county name from the boundary data. Rendered as text only. */
  name: string;
  color: string;
  /** Same length and order as `dates`. `null` is a gap, never a zero. */
  values: readonly (number | null)[];
}

interface TimeSeriesProps {
  /** ISO yyyy-mm-dd, one per observation. */
  dates: readonly string[];
  lines: readonly SeriesLine[];
  /** What is plotted. Carries the unit, so no series has to. */
  axisLabel: string;
  unit: string;
  precision: number;
  /** The indicator's own floor and ceiling, so padding cannot invent range. */
  bounds?: readonly [number, number];
  tone?: Tone;
  height?: number;
}

const MARGIN = { top: 14, right: 74, bottom: 28, left: 46 };
/** Mark specs: 2px lines, r >= 4 markers, 2px surface ring. */
const LINE_WIDTH = 2;
const MARKER_R = 4.5;
const RING_WIDTH = 2;

/**
 * Multi-series line chart.
 *
 * The rules it follows, and why each one is not negotiable here:
 *
 *  - Gaps break the line. A cloud-obscured month has no value, and drawing
 *    through it would invent data the model never produced.
 *  - A legend is always present for two or more series, and with four or fewer
 *    the lines are also labelled at their right end, so identity never rests
 *    on colour matching alone.
 *  - Text never wears the series colour. Two of the four light-mode series
 *    slots sit below 3:1 on white, so a label in the series colour would be
 *    illegible. The colour rides a short line key beside the text instead.
 *  - The table view is not a nicety. Those same sub-3:1 slots require a
 *    relief channel, and the table is it: every value stays reachable without
 *    hover and without colour vision.
 *  - The crosshair snaps to the nearest date and the readout lists every
 *    series, so the pointer never has to land on a 2px line.
 */
export function TimeSeries({
  dates,
  lines,
  axisLabel,
  unit,
  precision,
  bounds,
  tone = "light",
  height = 300,
}: TimeSeriesProps) {
  const { ref, width } = useMeasure<HTMLDivElement>(760);
  const [hover, setHover] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);
  const titleId = useId();

  const surface = tone === "dark" ? navy[800] : light.white;
  const gridStroke = tone === "dark" ? chromeTokens.gridOnDark : chromeTokens.gridOnLight;
  const axisStroke = tone === "dark" ? chromeTokens.axisOnDark : chromeTokens.axisOnLight;
  const inkPrimary = tone === "dark" ? "text-ink-dark-primary" : "text-ink-light-primary";
  const inkSecondary = tone === "dark" ? "text-ink-dark-secondary" : "text-ink-light-secondary";
  const inkMuted = tone === "dark" ? "text-ink-dark-muted" : "text-ink-light-muted";
  const axisTextFill = tone === "dark" ? "var(--color-ink-dark-muted)" : "var(--color-ink-light-muted)";

  const plotW = Math.max(120, width - MARGIN.left - MARGIN.right);
  const plotH = height - MARGIN.top - MARGIN.bottom;

  const allValues = useMemo(() => lines.flatMap((line) => [...line.values]), [lines]);
  const domain = useMemo(() => plotDomain(allValues, bounds), [allValues, bounds]);
  const ticks = useMemo(() => niceTicks(domain[0], domain[1], 5), [domain]);
  const xLabels = useMemo(
    () => labelIndices(dates.length, Math.max(3, Math.floor(plotW / 82))),
    [dates.length, plotW],
  );

  const fmt = (value: number) => value.toFixed(precision);

  function pathFor(values: readonly (number | null)[]): string {
    return contiguousRuns(values)
      .map((run) =>
        run
          .map(
            (point, i) =>
              `${i === 0 ? "M" : "L"}${scaleX(point.index, dates.length, plotW).toFixed(2)} ${scaleY(
                point.value,
                domain,
                plotH,
              ).toFixed(2)}`,
          )
          .join(" "),
      )
      .join(" ");
  }

  /** The last present point of a series: where its direct label goes. */
  function lastPoint(values: readonly (number | null)[]) {
    for (let i = values.length - 1; i >= 0; i -= 1) {
      const value = values[i];
      if (value !== null && Number.isFinite(value)) return { index: i, value };
    }
    return null;
  }

  const directLabel = lines.length <= 4;

  return (
    <figure className="m-0 flex flex-col gap-3">
      <figcaption className="flex flex-wrap items-center justify-between gap-3">
        <p className={`text-caption font-semibold ${inkSecondary}`} id={titleId}>
          {axisLabel}
          {unit ? <span className={inkMuted}> ({unit})</span> : null}
        </p>

        <button
          type="button"
          onClick={() => setShowTable((v) => !v)}
          aria-pressed={showTable}
          className={`text-micro rounded border px-2 py-1 font-semibold tracking-wide uppercase ${
            tone === "dark"
              ? "border-navy-700 text-ink-dark-secondary hover:text-white"
              : "border-edge text-ink-light-secondary hover:text-navy-900"
          }`}
        >
          {showTable ? "Show chart" : "Show table"}
        </button>
      </figcaption>

      {/* Legend. Always present for two or more series: the dependable
          identity channel. A single series needs none, since the caption
          above already names what is plotted. */}
      {lines.length > 1 ? (
        <ul className="flex flex-wrap gap-x-5 gap-y-1.5">
          {lines.map((line) => (
            <li key={line.id} className={`text-caption flex items-center gap-2 ${inkSecondary}`}>
              <span
                aria-hidden="true"
                className="inline-block h-[2px] w-4 shrink-0 rounded-full"
                style={{ background: line.color }}
              />
              {line.name}
            </li>
          ))}
        </ul>
      ) : null}

      {showTable ? (
        <div className={`overflow-x-auto rounded border ${tone === "dark" ? "border-navy-700" : "border-edge"}`}>
          <table className="w-full border-collapse text-left text-sm">
            <caption className="sr-only">{axisLabel} by date and area</caption>
            <thead>
              <tr className={tone === "dark" ? "border-navy-700 border-b" : "border-edge border-b"}>
                <th scope="col" className={`text-micro px-3 py-2 font-semibold uppercase ${inkMuted}`}>
                  Date
                </th>
                {lines.map((line) => (
                  <th
                    key={line.id}
                    scope="col"
                    className={`text-micro px-3 py-2 text-right font-semibold uppercase ${inkMuted}`}
                  >
                    {line.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dates.map((date, index) => (
                <tr
                  key={date}
                  className={tone === "dark" ? "border-navy-700/60 border-b" : "border-edge border-b"}
                >
                  <th scope="row" className={`px-3 py-1.5 font-medium ${inkSecondary}`}>
                    {date}
                  </th>
                  {lines.map((line) => {
                    const value = line.values[index];
                    return (
                      <td key={line.id} className={`px-3 py-1.5 text-right ${inkPrimary}`}>
                        {value === null || !Number.isFinite(value) ? (
                          <span className={inkMuted} title="No observation">
                            &mdash;
                          </span>
                        ) : (
                          fmt(value)
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div ref={ref} className="relative w-full">
          <svg
            width={width}
            height={height}
            role="img"
            aria-labelledby={titleId}
            tabIndex={0}
            className="block max-w-full outline-offset-4"
            onPointerMove={(event) => {
              const box = event.currentTarget.getBoundingClientRect();
              setHover(nearestIndex(event.clientX - box.left - MARGIN.left, dates.length, plotW));
            }}
            onPointerLeave={() => setHover(null)}
            onFocus={() => setHover((h) => h ?? dates.length - 1)}
            onBlur={() => setHover(null)}
            /* Keyboard parity: the same readout the pointer gets, so the
               tooltip enhances rather than gates. */
            onKeyDown={(event) => {
              if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
              event.preventDefault();
              setHover((h) => {
                const base = h ?? dates.length - 1;
                const next = event.key === "ArrowLeft" ? base - 1 : base + 1;
                return Math.min(dates.length - 1, Math.max(0, next));
              });
            }}
          >
            <g transform={`translate(${MARGIN.left} ${MARGIN.top})`}>
              {/* Gridlines: hairline, solid, one step off the surface. They
                  orient; they never compete with the data. */}
              {ticks.map((tick) => {
                const y = scaleY(tick, domain, plotH);
                if (y < -0.5 || y > plotH + 0.5) return null;
                return (
                  <g key={tick}>
                    <line x1={0} x2={plotW} y1={y} y2={y} stroke={gridStroke} strokeWidth={1} />
                    <text
                      x={-10}
                      y={y}
                      textAnchor="end"
                      dominantBaseline="middle"
                      fontSize={11}
                      fill={axisTextFill}
                      style={{ fontVariantNumeric: "tabular-nums" }}
                    >
                      {tick}
                    </text>
                  </g>
                );
              })}

              <line x1={0} x2={plotW} y1={plotH} y2={plotH} stroke={axisStroke} strokeWidth={1} />

              {xLabels.map((index) => (
                <text
                  key={index}
                  x={scaleX(index, dates.length, plotW)}
                  y={plotH + 18}
                  textAnchor={index === 0 ? "start" : index === dates.length - 1 ? "end" : "middle"}
                  fontSize={11}
                  fill={axisTextFill}
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {dates[index]?.slice(0, 7)}
                </text>
              ))}

              {/* Crosshair sits under the marks, so it never covers a value. */}
              {hover !== null ? (
                <line
                  x1={scaleX(hover, dates.length, plotW)}
                  x2={scaleX(hover, dates.length, plotW)}
                  y1={0}
                  y2={plotH}
                  stroke={axisStroke}
                  strokeWidth={1}
                />
              ) : null}

              {lines.map((line) => (
                <path
                  key={line.id}
                  d={pathFor(line.values)}
                  fill="none"
                  stroke={line.color}
                  strokeWidth={LINE_WIDTH}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              ))}

              {/* Selective markers only: the last point of each series, plus
                  whatever the crosshair is on. A dot on every point is noise. */}
              {lines.map((line) => {
                const point = lastPoint(line.values);
                if (!point) return null;
                return (
                  <circle
                    key={line.id}
                    cx={scaleX(point.index, dates.length, plotW)}
                    cy={scaleY(point.value, domain, plotH)}
                    r={MARKER_R}
                    fill={line.color}
                    stroke={surface}
                    strokeWidth={RING_WIDTH}
                  />
                );
              })}

              {hover !== null
                ? lines.map((line) => {
                    const value = line.values[hover];
                    if (value === null || value === undefined || !Number.isFinite(value)) return null;
                    return (
                      <circle
                        key={`${line.id}-hover`}
                        cx={scaleX(hover, dates.length, plotW)}
                        cy={scaleY(value, domain, plotH)}
                        r={MARKER_R}
                        fill={line.color}
                        stroke={surface}
                        strokeWidth={RING_WIDTH}
                      />
                    );
                  })
                : null}

              {/* Direct end labels, for four series or fewer. The text wears an
                  ink token; the colour rides the marker beside it. */}
              {directLabel
                ? lines.map((line) => {
                    const point = lastPoint(line.values);
                    if (!point) return null;
                    return (
                      <text
                        key={`${line.id}-label`}
                        x={scaleX(point.index, dates.length, plotW) + 10}
                        y={scaleY(point.value, domain, plotH)}
                        dominantBaseline="middle"
                        fontSize={11}
                        fontWeight={600}
                        fill={
                          tone === "dark"
                            ? "var(--color-ink-dark-primary)"
                            : "var(--color-ink-light-primary)"
                        }
                        style={{ fontVariantNumeric: "tabular-nums" }}
                      >
                        {fmt(point.value)}
                      </text>
                    );
                  })
                : null}
            </g>
          </svg>

          {/* The readout. Values lead, series names follow: the reader already
              knows the series and wants the number. */}
          {hover !== null ? (
            <div
              role="status"
              aria-live="polite"
              className={`pointer-events-none absolute top-2 rounded border px-3 py-2 text-left shadow-sm ${
                tone === "dark" ? "border-navy-700 bg-navy-950" : "border-edge bg-white"
              }`}
              style={{
                left: Math.min(
                  Math.max(MARGIN.left + scaleX(hover, dates.length, plotW) - 70, 4),
                  Math.max(4, width - 168),
                ),
              }}
            >
              <p className={`text-micro tabular font-semibold ${inkMuted}`}>{dates[hover]}</p>
              <ul className="mt-1.5 flex flex-col gap-1">
                {lines.map((line) => {
                  const value = line.values[hover];
                  return (
                    <li key={line.id} className="flex items-center gap-2 text-sm">
                      <span
                        aria-hidden="true"
                        className="inline-block h-[2px] w-3 shrink-0 rounded-full"
                        style={{ background: line.color }}
                      />
                      <span className={`tabular font-bold ${inkPrimary}`}>
                        {value === null || value === undefined || !Number.isFinite(value)
                          ? "no data"
                          : fmt(value)}
                      </span>
                      <span className={`text-caption ${inkSecondary}`}>{line.name}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </div>
      )}
    </figure>
  );
}
