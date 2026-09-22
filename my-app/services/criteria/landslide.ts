/**
 * Landslide susceptibility criteria.
 *
 * Seven criteria, chosen by Franklyn: slope, aspect, elevation, lithology,
 * land cover, distance to drainage, rainfall.
 *
 * WHAT IS AND IS NOT CALIBRATED HERE
 *
 * Weights are not in this file at all. They are derived in-app from pairwise
 * comparison, which is the whole point of services/ahp, so there is no
 * `defaultWeights` below and the form opens on judgements rather than on
 * numbers somebody would have to un-guess.
 *
 * The class tables are a different question, and they are NOT all equally
 * trustworthy. Each carries a `calibration` marker that the UI shows:
 *
 *   established  direction and breaks are settled across the literature
 *   regional     direction is settled, the break VALUES want local data
 *   required     cannot be shipped at all; depends on the source layer
 *
 * Lithology is `required` and ships EMPTY. Its codes are whatever the geology
 * layer on the GeoServer uses, and inventing a mapping would produce a
 * confident susceptibility map keyed to codes that do not exist. That is the
 * worst failure available in this file, so it is structurally impossible: the
 * class list is empty and the overlay refuses to run until it is filled.
 *
 * Tana River is floodplain, so landslide work means a different area entirely
 * (the highlands: Murang'a, Nyeri, Elgeyo-Marakwet, Kisii). Areas are free-form
 * geometry, so that costs nothing structurally, but the DEM and geology
 * coverage has to exist for those areas.
 */

import type { Criterion, TopicMethod } from "@/services/criteria/types";

export const LANDSLIDE_CRITERIA: readonly Criterion[] = [
  {
    id: "slope",
    label: "Slope",
    unit: "degrees",
    source: { kind: "derived", from: "DEM", how: "gradient magnitude, in degrees" },
    calibration: "established",
    /*
     * The inversion. Flood scores <= 2 degrees as 5; this scores it as 1.
     * A shared slope table between the two topics would map landslide
     * susceptibility upside down and the result would look entirely
     * reasonable. `__tests__/criteria.test.ts` asserts the two tables differ.
     *
     * Shipped monotonic increasing, which is what operational susceptibility
     * mapping generally uses. The literature also reports a peak around 30-45
     * degrees with a decline on the steepest faces, where bedrock is exposed
     * and there is little regolith left to fail. That refinement needs local
     * inventory data to justify, so it is noted rather than assumed: the table
     * is data, and adding a sixth band is an edit here.
     */
    direction:
      "Steep ground fails. Risk RISES with slope, the opposite of the flood model.",
    reference:
      "Standard practice in landslide susceptibility mapping. Monotonic increasing; a decline above roughly 50 degrees is reported where regolith is thin, and needs a local inventory to justify.",
    scale: {
      kind: "continuous",
      classes: [
        { risk: 1, label: "<= 5 deg", max: 5 },
        { risk: 2, label: "5-15 deg", max: 15 },
        { risk: 3, label: "15-25 deg", max: 25 },
        { risk: 4, label: "25-35 deg", max: 35 },
        { risk: 5, label: "> 35 deg", max: null },
      ],
    },
  },
  {
    id: "aspect",
    label: "Aspect",
    unit: "degrees from north",
    source: { kind: "derived", from: "DEM", how: "downslope direction, 0-360 clockwise from north" },
    calibration: "regional",
    /*
     * Aspect matters because it decides how much rain a slope takes and how
     * long it stays wet. Which aspects are worst is therefore a question about
     * the prevailing moisture-bearing wind, and in Kenya that is the southeast
     * monsoon, so windward south and east faces are scored higher here.
     *
     * That is a defensible starting point and NOT a settled fact for any given
     * range: a valley whose orientation shelters its own east face will not
     * behave like this. Marked regional so the UI says so.
     *
     * Flat is its own class at risk 1. Aspect is undefined on flat ground, and
     * a DEM commonly encodes it as -1; folding that into "north" would put a
     * spurious band across every plain.
     */
    direction:
      "Slopes facing the rain-bearing wind stay wetter. Southeast-facing scores highest; flat ground scores lowest.",
    reference:
      "Regional assumption, southeast monsoon as the dominant moisture source. Verify against a local landslide inventory before relying on it.",
    scale: {
      kind: "continuous",
      classes: [
        /*
         * The eight octants, ordered by the raw 0-360 value so the bands
         * ascend as the type requires. The risk column carries the meaning,
         * not the order, which is why this table is non-monotonic where every
         * other continuous one is not.
         *
         * North appears twice because it wraps the origin: 337.5-360 and
         * 0-22.5 are the same compass direction and therefore carry the same
         * risk. Getting that wrong - folding the wrap into the neighbouring
         * octant, or giving the two halves different scores - puts a seam
         * across every north-facing slope in the output.
         */
        { risk: 2, label: "North (0-22.5)", max: 22.5 },
        { risk: 3, label: "Northeast (22.5-67.5)", max: 67.5 },
        { risk: 4, label: "East (67.5-112.5)", max: 112.5 },
        { risk: 5, label: "Southeast (112.5-157.5)", max: 157.5 },
        { risk: 4, label: "South (157.5-202.5)", max: 202.5 },
        { risk: 3, label: "Southwest (202.5-247.5)", max: 247.5 },
        { risk: 2, label: "West (247.5-292.5)", max: 292.5 },
        { risk: 1, label: "Northwest (292.5-337.5)", max: 337.5 },
        { risk: 2, label: "North (337.5-360)", max: null },
      ],
    },
  },
  {
    id: "elevation",
    label: "Elevation",
    unit: "m",
    source: { kind: "layer", hint: "DEM" },
    calibration: "regional",
    /*
     * Non-monotonic on purpose, and the one criterion most likely to be wrong
     * as shipped. Landslides in the Kenyan highlands concentrate at MIDDLE
     * elevations, where steep terrain, deep weathered regolith and high
     * rainfall coincide. The valley floors below are depositional and the
     * highest summits are often gentler and thinner-soiled.
     *
     * The band centre therefore depends entirely on which range is being
     * mapped, and the values below are a placeholder shaped for the central
     * highlands. This is the first table to recalibrate against an inventory.
     */
    direction:
      "Middle elevations are worst, where steep terrain, deep regolith and high rainfall coincide.",
    reference:
      "Placeholder shaped for the central Kenyan highlands. Recalibrate the band centre for the range being mapped.",
    scale: {
      kind: "continuous",
      classes: [
        { risk: 1, label: "<= 500 m", max: 500 },
        { risk: 3, label: "500-1200 m", max: 1200 },
        { risk: 5, label: "1200-2000 m", max: 2000 },
        { risk: 4, label: "2000-2600 m", max: 2600 },
        { risk: 2, label: "> 2600 m", max: null },
      ],
    },
  },
  {
    id: "lithology",
    label: "Lithology",
    unit: "",
    source: { kind: "layer", hint: "geology / lithology polygons, rasterised" },
    calibration: "required",
    /*
     * Deliberately EMPTY. Lithology codes belong to whatever geology layer the
     * GeoServer publishes, and there is no cross-dataset standard the way
     * there is for ESA WorldCover. A plausible-looking invented mapping would
     * be the most damaging thing in this file: the map would render, the
     * numbers would look reasonable, and the strongest predictor in most
     * landslide models would be keyed to codes that mean nothing.
     *
     * `unlisted: "nodata"` plus an empty class list means every pixel is
     * nodata, so the overlay cannot run on this criterion until someone fills
     * it in. That is the intended behaviour, not a gap to paper over.
     *
     * To fill it: run `node scripts/wms-preflight.mjs` for the layer name, read
     * its attribute table for the code-to-unit mapping, then group the units by
     * failure susceptibility - unconsolidated and deeply weathered material
     * high, fresh crystalline rock low.
     */
    direction:
      "Weak and deeply weathered material fails; fresh competent rock does not. Codes are specific to the geology layer in use.",
    reference:
      "No default possible. Fill from the attribute table of the geology layer published on the GeoServer.",
    scale: { kind: "categorical", classes: [], unlisted: "nodata" },
  },
  {
    id: "landcover",
    label: "Land cover",
    unit: "",
    source: { kind: "layer", hint: "ESA WorldCover 2021" },
    calibration: "regional",
    /*
     * Same source layer as the flood model, DIFFERENT scores, for the same
     * reason slope differs. Root systems bind regolith, so tree cover is the
     * SAFEST class here while the flood model also scores it 1 but for an
     * unrelated reason (interception and infiltration). Bare ground and
     * cropland are worst: no root cohesion, and tillage on a slope.
     *
     * Water, wetland and mangrove score 1 rather than being excluded: they are
     * not slopes, and scoring them high (as the flood model does) would put a
     * landslide hotspot on a lake.
     */
    direction:
      "Root cohesion holds slopes together. Bare ground and cropland score highest; tree cover lowest.",
    reference:
      "ESA WorldCover 2021 codes, scored for slope stability rather than for runoff. Regional: the cropland score depends on local tillage practice on slopes.",
    scale: {
      kind: "categorical",
      classes: [
        {
          risk: 1,
          label: "Tree cover, water, wetland, mangroves, snow",
          codes: [10, 70, 80, 90, 95],
        },
        { risk: 2, label: "Shrubland, moss and lichen", codes: [20, 100] },
        { risk: 3, label: "Grassland", codes: [30] },
        { risk: 4, label: "Cropland, built-up", codes: [40, 50] },
        { risk: 5, label: "Bare or sparse vegetation", codes: [60] },
      ],
      unlisted: "nodata",
    },
  },
  {
    id: "dist_to_drainage",
    label: "Distance to drainage",
    unit: "m",
    source: {
      kind: "distance",
      from: "drainage network",
      // Same ring-artifact fix the flood model needs, for the same reason.
      smoothSigmaPx: 3,
    },
    calibration: "regional",
    /*
     * Same direction as the flood model, ENTIRELY different scale. Flood cares
     * about a floodplain kilometres wide; this cares about a stream undercutting
     * the toe of a slope, which is a effect measured in tens to low hundreds of
     * metres. Reusing the flood breaks would score every pixel within a
     * kilometre of any stream as maximum risk and flatten the criterion.
     */
    direction:
      "Streams undercut slope toes. Risk falls sharply with distance, over hundreds of metres not kilometres.",
    reference:
      "Regional. Break values scale with channel incision; verify against the drainage density of the range being mapped.",
    scale: {
      kind: "continuous",
      classes: [
        { risk: 5, label: "<= 50 m", max: 50 },
        { risk: 4, label: "50-100 m", max: 100 },
        { risk: 3, label: "100-200 m", max: 200 },
        { risk: 2, label: "200-500 m", max: 500 },
        { risk: 1, label: "> 500 m", max: null },
      ],
    },
  },
  {
    id: "rainfall",
    label: "Rainfall",
    unit: "mm",
    source: { kind: "layer", hint: "annual or seasonal rainfall raster" },
    calibration: "established",
    direction:
      "Rain is the trigger. Scored against the local distribution, not fixed depths.",
    reference:
      "Percentile scoring, as in the flood model: rainfall variation within one mapping area is usually too narrow for fixed thresholds to separate.",
    scale: { kind: "percentile", breaks: [20, 40, 60, 80], ascending: true },
  },
];

/**
 * No default weights, on purpose.
 *
 * The flood model has published weights to open on. This one does not, and
 * inventing a set would defeat the reason pairwise comparison was built: the
 * analyst states their judgements, the app derives the weights and checks
 * whether the judgements contradict each other.
 */
export const LANDSLIDE_METHOD: TopicMethod = {
  kind: "weighted-overlay",
  criteria: LANDSLIDE_CRITERIA,
};
