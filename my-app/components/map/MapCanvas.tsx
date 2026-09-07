"use client";

import { useId, useMemo, useState } from "react";
import type { MapFrame, OverlayCell } from "@/contracts/geo";
import type { Severity } from "@/contracts/catalog";
import { chrome as chromeTokens, light, navy } from "@/design/tokens";
import type { Tone } from "@/components/ui/tone";
import { colourFor, legendStops } from "./ramp";

export interface ContextArea {
  id: string;
  name: string;
  path: string;
}

export interface SelectedArea extends ContextArea {
  value: number;
  bandLabel: string;
  severity: Severity;
  /** Centroid already projected into frame coordinates by the server. */
  labelXY: readonly [number, number];
  /** Series colour, so the map and the time series agree on identity. */
  colour: string;
}

export interface MapIndicator {
  label: string;
  unit: string;
  precision: number;
  domain: readonly [number, number];
  badEnd: "low" | "high";
}

interface MapCanvasProps {
  frame: MapFrame;
  /** All 47 counties, drawn faintly so the selection has a country around it. */
  context: readonly ContextArea[];
  selected: readonly SelectedArea[];
  overlay: readonly OverlayCell[];
  indicator: MapIndicator;
  tone?: Tone;
}

/**
 * The map half of the results screen.
 *
 * It is inline SVG over real boundary geometry, not a tile basemap. That is a
 * deliberate scaffold decision with a real payoff: it renders with no network,
 * no API key and no third-party script, so the screen is reviewable offline
 * and in a test. `services/geo` already projects each county to a path in a
 * shared frame, so this component does no geography of its own.
 *
 * To swap in a real basemap later, replace this component only: it reads
 * nothing but the contract types, so `MapLibre` or `Leaflet` can take over
 * without touching the page, the services or the result shape.
 */
export function MapCanvas({
  frame,
  context,
  selected,
  overlay,
  indicator,
  tone = "dark",
}: MapCanvasProps) {
  const [showField, setShowField] = useState(true);
  const [showBoundaries, setShowBoundaries] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [opacity, setOpacity] = useState(0.85);
  const [hovered, setHovered] = useState<{ cell: OverlayCell; name: string } | null>(null);
  const opacityId = useId();

  const selectedIds = useMemo(() => new Set(selected.map((area) => area.id)), [selected]);
  const nameById = useMemo(
    () => new Map(context.map((area) => [area.id, area.name])),
    [context],
  );

  const stops = useMemo(
    () => legendStops(indicator.domain, indicator.badEnd, tone),
    [indicator.domain, indicator.badEnd, tone],
  );

  const contextFill = tone === "dark" ? navy[800] : light.paper;
  const contextStroke = tone === "dark" ? navy[700] : "#dde5f0";
  const boundaryStroke = tone === "dark" ? chromeTokens.boundaryOnDark : chromeTokens.boundaryOnLight;
  const inkSecondary = tone === "dark" ? "text-ink-dark-secondary" : "text-ink-light-secondary";
  const inkMuted = tone === "dark" ? "text-ink-dark-muted" : "text-ink-light-muted";
  const labelInk = tone === "dark" ? "#ffffff" : navy[900];
  const labelHalo = tone === "dark" ? navy[950] : light.white;

  const fmt = (value: number) => value.toFixed(indicator.precision);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Layer controls sit in one row above the canvas, never inside it. */}
      <div
        className={`flex flex-wrap items-center gap-x-5 gap-y-2.5 border-b px-4 py-2.5 ${
          tone === "dark" ? "border-navy-700" : "border-edge"
        }`}
      >
        {(
          [
            ["Indicator field", showField, setShowField],
            ["Boundaries", showBoundaries, setShowBoundaries],
            ["Labels", showLabels, setShowLabels],
          ] as const
        ).map(([label, value, set]) => (
          <label key={label} className={`text-caption flex items-center gap-2 font-medium ${inkSecondary}`}>
            <input
              type="checkbox"
              checked={value}
              onChange={(event) => set(event.target.checked)}
              className="accent-scarlet-fill h-3.5 w-3.5"
            />
            {label}
          </label>
        ))}

        <span className="flex items-center gap-2">
          <label htmlFor={opacityId} className={`text-caption font-medium ${inkSecondary}`}>
            Field opacity
          </label>
          <input
            id={opacityId}
            type="range"
            min={0.15}
            max={1}
            step={0.05}
            value={opacity}
            disabled={!showField}
            onChange={(event) => setOpacity(Number(event.target.value))}
            className="accent-scarlet-fill h-1 w-24 disabled:opacity-40"
          />
          <span className={`text-micro tabular w-8 ${inkMuted}`}>{Math.round(opacity * 100)}%</span>
        </span>
      </div>

      {/* ------------------------------------------------------- the canvas */}
      <div className="relative min-h-0 flex-1">
        <svg
          viewBox={`0 0 ${frame.width} ${frame.height}`}
          className="h-full max-h-full w-full"
          role="img"
          aria-label={`Map of Kenya showing ${indicator.label} for ${selected
            .map((area) => area.name)
            .join(", ")}`}
        >
          {/* Every county, faint. Without this the selection floats in
              nothing and a reader cannot tell where in Kenya they are. */}
          <g>
            {context.map((area) => (
              <path
                key={area.id}
                d={area.path}
                fill={contextFill}
                stroke={showBoundaries ? contextStroke : "none"}
                strokeWidth={0.6}
              />
            ))}
          </g>

          {/* The indicator field. Cells are clipped to the selected counties
              by services/geo, so nothing is painted outside the analysis. */}
          {showField ? (
            <g opacity={opacity}>
              {overlay.map((cell) => (
                <rect
                  key={`${cell.x},${cell.y}`}
                  x={cell.x}
                  y={cell.y}
                  width={cell.size}
                  height={cell.size}
                  fill={colourFor(cell.value, indicator.domain, indicator.badEnd, tone)}
                  onPointerEnter={() =>
                    setHovered({ cell, name: nameById.get(cell.areaId) ?? cell.areaId })
                  }
                  onPointerLeave={() => setHovered(null)}
                />
              ))}
            </g>
          ) : null}

          {/* The selection, on top. Scarlet as a 2px stroke, never a fill:
              it marks what the reader asked for without repainting the data. */}
          <g>
            {selected.map((area) => (
              <path
                key={area.id}
                d={area.path}
                fill="none"
                stroke="var(--color-scarlet-mark)"
                strokeWidth={2}
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </g>

          {showLabels ? (
            <g>
              {selected.map((area) => (
                <g key={area.id} transform={`translate(${area.labelXY[0]} ${area.labelXY[1]})`}>
                  {/* Halo stroke under the text, so a label stays readable
                      wherever it lands on the field. */}
                  <text
                    textAnchor="middle"
                    fontSize={17}
                    fontWeight={700}
                    stroke={labelHalo}
                    strokeWidth={4}
                    strokeLinejoin="round"
                    fill="none"
                    style={{ paintOrder: "stroke" }}
                  >
                    {area.name}
                  </text>
                  <text textAnchor="middle" fontSize={17} fontWeight={700} fill={labelInk}>
                    {area.name}
                  </text>

                  <text
                    y={20}
                    textAnchor="middle"
                    fontSize={15}
                    fontWeight={600}
                    stroke={labelHalo}
                    strokeWidth={4}
                    strokeLinejoin="round"
                    fill="none"
                    style={{ paintOrder: "stroke", fontVariantNumeric: "tabular-nums" }}
                  >
                    {fmt(area.value)}
                    {indicator.unit ? ` ${indicator.unit}` : ""}
                  </text>
                  <text
                    y={20}
                    textAnchor="middle"
                    fontSize={15}
                    fontWeight={600}
                    fill={labelInk}
                    style={{ fontVariantNumeric: "tabular-nums" }}
                  >
                    {fmt(area.value)}
                    {indicator.unit ? ` ${indicator.unit}` : ""}
                  </text>
                </g>
              ))}
            </g>
          ) : null}
        </svg>

        {hovered ? (
          <div
            className={`pointer-events-none absolute top-3 left-3 rounded border px-3 py-2 ${
              tone === "dark" ? "border-navy-700 bg-navy-950" : "border-edge bg-white"
            }`}
          >
            <p
              className={`tabular text-sm font-bold ${
                tone === "dark" ? "text-ink-dark-primary" : "text-ink-light-primary"
              }`}
            >
              {fmt(hovered.cell.value)}
              {indicator.unit ? ` ${indicator.unit}` : ""}
            </p>
            <p className={`text-caption ${inkSecondary}`}>{hovered.name}</p>
          </div>
        ) : null}
      </div>

      {/* ------------------------------------------------------- the legend */}
      <div className={`border-t px-4 py-3 ${tone === "dark" ? "border-navy-700" : "border-edge"}`}>
        <div className="flex items-baseline justify-between gap-3">
          <p className={`text-micro font-semibold tracking-[0.14em] uppercase ${inkMuted}`}>
            {indicator.label}
            {indicator.unit ? ` (${indicator.unit})` : ""}
          </p>
          {/* The orientation stated in words. A single-hue ramp is ambiguous
              about which end is bad, and for VCI the bad end is the low one. */}
          <p className={`text-micro ${inkMuted}`}>Darker means more concerning</p>
        </div>

        <ul className="mt-2 flex">
          {stops.map((stop, index) => (
            <li key={stop.colour} className="min-w-0 flex-1">
              <span
                className="block h-2.5"
                style={{ background: stop.colour }}
                aria-hidden="true"
              />
              <span className={`text-micro tabular mt-1 block truncate ${inkMuted}`}>
                {index === 0 ? fmt(stop.from) : ""}
                {index === stops.length - 1 ? fmt(stop.to) : ""}
              </span>
            </li>
          ))}
        </ul>

        {/* The band table is the meaning behind the ramp, so the chips sit
            with it rather than in a separate panel. */}
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          {selected.map((area) => (
            <li key={area.id} className={`text-caption flex items-center gap-2 ${inkSecondary}`}>
              <span
                aria-hidden="true"
                className="inline-block h-2 w-2 shrink-0 rounded-full"
                style={{ background: area.colour }}
              />
              <span className="font-semibold">{area.name}</span>
              <span className={inkMuted}>{area.bandLabel}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
