import type { Area, ClimateZone } from "@/contracts/geo";
import { geo, MAP_FRAME } from "@/services/geo";

/**
 * Kenya, drawn from the county geometry the app already ships, shaded by
 * climate zone. Taken from the round-one variant B and reworked for a light
 * ground.
 *
 * A server component with no client JavaScript: the 47 county paths come from
 * services/geo, are thinned once at module load, and leave as one inline SVG.
 * The baked paths carry every vertex the area picker needs at full map size,
 * about 165 KB of path text. Drawn about 170px wide, one frame unit is a fifth
 * of a pixel, so rounding to whole units and dropping vertices closer than
 * MIN_STEP units apart is under a pixel of error and cuts the markup to about
 * 30 KB.
 *
 * No graticule. The parallels and their labels crossed the shape and the
 * legend at this size and told the reader nothing the outline does not.
 *
 * Zone fills are three steps of the brand blue, chosen so neighbours clear
 * 3:1 against each other (WCAG relative luminance):
 *   arid #0b1f3f vs semi-arid #3f74cc  3.57:1
 *   semi-arid #3f74cc vs non-ASAL #dce6f7  3.65:1
 * Non-ASAL sits close to the white ground (1.26:1), so county borders are
 * drawn in the input-edge grey, which clears 4.5:1 on white and carries the
 * outline there.
 */

const MIN_STEP = 3;

function thin(path: string): string {
  const out: string[] = [];
  for (const chunk of path.split("M")) {
    if (chunk === "") continue;
    const body = chunk.endsWith("Z") ? chunk.slice(0, -1) : chunk;
    const kept: [number, number][] = [];
    for (const pair of body.split("L")) {
      const [x, y] = pair.trim().split(/\s+/).map(Number);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      const point: [number, number] = [Math.round(x), Math.round(y)];
      const last = kept[kept.length - 1];
      if (!last || Math.hypot(point[0] - last[0], point[1] - last[1]) >= MIN_STEP) {
        kept.push(point);
      }
    }
    // A ring thinned below a triangle is a speck at this size: an islet.
    if (kept.length >= 3) out.push(`M${kept.map((p) => p.join(" ")).join("L")}Z`);
  }
  return out.join("");
}

const AREAS: readonly Area[] = geo.listAreas();

const DRAWN = AREAS.map((area) => ({
  id: area.id,
  name: area.name,
  zone: area.climateZone,
  d: thin(area.path),
})).filter((county) => county.d !== "");

/** Real counts from the shipped geometry. */
export const COUNTY_COUNT = AREAS.length;
export const ASAL_COUNT = AREAS.filter((area) => area.asal).length;
export const ZONE_COUNTS: Readonly<Record<ClimateZone, number>> = AREAS.reduce(
  (acc, area) => ({ ...acc, [area.climateZone]: acc[area.climateZone] + 1 }),
  { arid: 0, "semi-arid": 0, humid: 0 } as Record<ClimateZone, number>,
);

/** Driest first: the order of the legend. */
export const ZONES: readonly ClimateZone[] = ["arid", "semi-arid", "humid"];

export const ZONE_FILL: Readonly<Record<ClimateZone, string>> = {
  // Declared in app/globals.css with the measured ratios beside them.
  arid: "var(--data-zone-arid)",
  "semi-arid": "var(--data-zone-semi-arid)",
  humid: "var(--data-zone-humid)",
};

export const ZONE_LABEL: Readonly<Record<ClimateZone, string>> = {
  arid: "Arid",
  "semi-arid": "Semi-arid",
  humid: "Non-ASAL",
};

const BORDER = "var(--color-edge-input)";

/** A legend swatch in the same fill and border as the map. */
export function ZoneSwatch({ zone }: { zone: ClimateZone }) {
  return (
    <svg aria-hidden="true" width="12" height="12" className="shrink-0">
      <rect x="0.5" y="0.5" width="11" height="11" rx="2" fill={ZONE_FILL[zone]} stroke={BORDER} />
    </svg>
  );
}

export function KenyaMap({ className = "" }: { className?: string }) {
  const pad = 8;
  const viewBox = `${-pad} ${-pad} ${MAP_FRAME.width + pad * 2} ${MAP_FRAME.height + pad * 2}`;

  return (
    <svg
      viewBox={viewBox}
      role="img"
      aria-label={`Map of Kenya's ${COUNTY_COUNT} counties, shaded by climate zone: ${ZONE_COUNTS.arid} arid, ${ZONE_COUNTS["semi-arid"]} semi-arid, ${ZONE_COUNTS.humid} non-ASAL.`}
      className={`block ${className}`}
    >
      <g strokeLinejoin="round">
        {DRAWN.map((county) => (
          <path
            key={county.id}
            d={county.d}
            fill={ZONE_FILL[county.zone]}
            stroke={BORDER}
            strokeOpacity={0.8}
            strokeWidth={0.75}
            vectorEffect="non-scaling-stroke"
          >
            <title>{county.name}</title>
          </path>
        ))}
      </g>
    </svg>
  );
}
