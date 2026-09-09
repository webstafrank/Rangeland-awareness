/**
 * The climate-zone proxy.
 *
 * READ THIS BEFORE TRUSTING THE NUMBER IT RETURNS. This is a proxy, not a
 * dataset. It is a smooth function of latitude and longitude, fitted by hand to
 * the coarsest true fact about Kenyan climate: the arid and semi-arid lands run
 * north and east, and the wet country is the southwest highlands, the central
 * highlands around Mount Kenya, and the coast strip. It has never seen a
 * rainfall record. Replace it with an aridity index raster the day one is
 * available and delete this file.
 *
 * It exists because the `rangeland-pages` reference keyed each area to a county
 * with a `climateZone` field, and this app has no counties: an area is a
 * polygon somebody drew. Dropping the climate term entirely was the alternative,
 * and it is worse. Without it Turkana and Kericho land in the same band half the
 * time, and anyone who knows the country reads the whole result as noise. A
 * documented proxy that gets the geography broadly right is more honest than a
 * uniform draw pretending to be neutral.
 *
 * Outside Kenya it returns near the dry base, because every wet term here is a
 * bump centred inside Kenya. That is stated rather than fixed: the app is a
 * Kenyan Space Agency tool, an area drawn over Uganda is out of scope, and
 * inventing a global climatology would be a bigger lie than admitting the edge.
 */

import { centerOf } from "@/lib/geo/bounds";
import type { BoundsTuple } from "@/lib/geo/bounds";
import { clamp } from "@/lib/run/rng";

/**
 * Base aridity before any wet term. High, because most of Kenya's surface area
 * genuinely is arid or semi-arid: roughly 80% of the country by land area.
 */
const DRY_BASE = 0.96;

/** Floor and ceiling, so no area is reported as perfectly wet or perfectly dead. */
const ARIDITY_BOUNDS: readonly [number, number] = [0.05, 0.98];

interface WetCore {
  readonly name: string;
  readonly lat: number;
  readonly lon: number;
  /** Gaussian widths, in degrees. Anisotropic because these regions are not round. */
  readonly latWidth: number;
  readonly lonWidth: number;
  /** How much aridity this core removes at its centre. */
  readonly weight: number;
}

/**
 * The three wet regions of Kenya, as Gaussian bumps.
 *
 * Centres and widths are read off the map, not fitted to data. The weights are
 * set so that the places anyone would name land where they should: Kericho and
 * Kisumu wet, Murang'a and Mombasa wet, Nairobi in between, Turkana, Marsabit,
 * Wajir and Garissa dry. Those nine are the pinned cases in
 * `__tests__/aridity.test.ts`, which is what stops a later tweak quietly
 * moving the highlands into the desert.
 */
const WET_CORES: readonly WetCore[] = [
  {
    name: "Lake Victoria basin and the western highlands",
    lat: -0.3,
    lon: 35.0,
    latWidth: 1.3,
    lonWidth: 1.4,
    weight: 0.85,
  },
  {
    name: "the coast strip",
    lat: -3.4,
    lon: 39.9,
    // Narrow in longitude on purpose: the wet strip is about a hundred
    // kilometres deep, and a round bump would make Tsavo read like Malindi.
    latWidth: 1.4,
    lonWidth: 0.9,
    weight: 0.75,
  },
  {
    name: "the central highlands around Mount Kenya and the Aberdares",
    // Tight, and centred south of the mountain rather than on it. A wider bump
    // put Isiolo in the same class as Nyeri, and Isiolo is where the highlands
    // stop and the northern rangelands begin.
    lat: -0.45,
    lon: 37.05,
    latWidth: 0.8,
    lonWidth: 0.7,
    weight: 0.8,
  },
];

function bump(value: number, centre: number, width: number): number {
  const d = (value - centre) / width;
  return Math.exp(-0.5 * d * d);
}

/**
 * Aridity at a point: 0 is the wettest highland, 1 the driest desert.
 *
 * The wet cores are combined with `max`, not by adding them. Adding would make
 * the overlap between the western and central highlands wetter than either on
 * its own, and the Rift valley floor between them, which is drier than both,
 * would come out as the wettest place in Kenya.
 */
export function aridityAt(lat: number, lon: number): number {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return 0.5;

  let wetness = 0;
  for (const core of WET_CORES) {
    const value =
      core.weight * bump(lat, core.lat, core.latWidth) * bump(lon, core.lon, core.lonWidth);
    if (value > wetness) wetness = value;
  }

  return clamp(DRY_BASE - wetness, ARIDITY_BOUNDS[0], ARIDITY_BOUNDS[1]);
}

/**
 * Aridity for an area, read at the centre of its bounding box.
 *
 * The bounding-box centre rather than a true polygon centroid: a centroid needs
 * the ring arithmetic, and for any area small enough to be one analysis unit
 * the two are within a few kilometres, which is far inside the resolution of a
 * proxy this coarse. For a horseshoe-shaped catchment the box centre can fall
 * outside the polygon, and that is accepted for the same reason.
 */
export function aridityOfBounds(bounds: BoundsTuple): number {
  const [lat, lon] = centerOf(bounds);
  return aridityAt(lat, lon);
}

/**
 * A label for the proxy value, for the UI and the CSV export.
 *
 * Three classes rather than a float, because a float invites a reader to
 * believe the third decimal place of something with no measurement behind it.
 */
export function aridityClass(aridity: number): "humid" | "semi-arid" | "arid" {
  if (aridity < 0.45) return "humid";
  if (aridity < 0.75) return "semi-arid";
  return "arid";
}
