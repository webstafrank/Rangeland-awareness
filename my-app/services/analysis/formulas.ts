import type { TopicSlug } from "@/services/analysis/topics";

/**
 * The spectral index registry. One source of truth for the thirteen formulas
 * an analyst can put behind a run.
 *
 * The pre-analysis page offers these, the engine keys its per-formula
 * contributions by these ids, and the results page restates the arithmetic
 * next to the number it produced. That last one is why `expression` is a
 * contract and not a caption: it is rendered beside a value at a national
 * space agency, so a wrong coefficient here is a wrong published figure. Every
 * expression below is the published arithmetic and every `reference` names the
 * paper or the agency document that defines it. Change an expression and you
 * are changing a citation; do it with the source open.
 *
 * Ids are contract, labels are not. The engine and the URL codec both carry
 * these strings, so `ndvi` and `lst-anomaly` are frozen; `name`, `fullName`
 * and `interpretation` are free to be reworded.
 *
 * Band names in `inputs` are the physical bands, not a sensor's numbering
 * (`SWIR1`, not `B11`). The registry has to survive a switch from Sentinel-2
 * to Landsat to MODIS without an edit, and band numbers do not.
 */

export const FORMULA_IDS = [
  "ndvi",
  "evi",
  "savi",
  "ndmi",
  "ndwi",
  "mndwi",
  "bsi",
  "vci",
  "tci",
  "vhi",
  "spi",
  "lst-anomaly",
  "twi",
] as const;

export type FormulaId = (typeof FORMULA_IDS)[number];

export interface Formula {
  id: FormulaId;
  /** Short label, used in chips, legends and the results table header. */
  name: string;
  fullName: string;
  /**
   * The published arithmetic, as renderable text. Correctness here is the
   * whole point of this file: it is shown beside the value it produced.
   */
  expression: string;
  /** The bands or variables the expression consumes, named as they appear in it. */
  inputs: readonly string[];
  unit: string;
  range: readonly [number, number];
  /** One sentence: what a high value means. Plain language, no jargon. */
  interpretation: string;
  topics: readonly TopicSlug[];
  /** Citation for the formula. Author and year at minimum. */
  reference: string;
}

/**
 * Declared in the frozen id order so `FORMULA_IDS` and `FORMULAS` read as one
 * list. `formulasForTopic` returns this order, which is why the vegetation
 * indices come before the water ones and the drought composites last: an
 * analyst scanning a topic's options sees related indices adjacent.
 *
 * `topics` on each entry is the single source of truth for the topic mapping.
 * There is deliberately no second per-topic table to drift out of step with it.
 */
export const FORMULAS: readonly Formula[] = [
  {
    id: "ndvi",
    name: "NDVI",
    fullName: "Normalised Difference Vegetation Index",
    expression: "(NIR - Red) / (NIR + Red)",
    inputs: ["NIR", "Red"],
    unit: "index",
    range: [-1, 1],
    interpretation:
      "High values mean dense, green, photosynthetically active vegetation.",
    topics: ["rangeland-dynamics", "food-security"],
    reference:
      "Rouse, Haas, Schell & Deering (1974), Monitoring vegetation systems in the Great Plains with ERTS, Third ERTS-1 Symposium, NASA SP-351, 309-317.",
  },
  {
    id: "evi",
    name: "EVI",
    fullName: "Enhanced Vegetation Index",
    // G = 2.5, C1 = 6, C2 = 7.5, L = 1 are the MODIS MOD13 coefficients, not
    // free parameters: C1 and C2 are tuned to cancel aerosol scattering using
    // the blue band, and L = 1 is the canopy background adjustment. Rounding
    // any of them changes the product this index is supposed to reproduce.
    expression: "2.5 * (NIR - Red) / (NIR + 6 * Red - 7.5 * Blue + 1)",
    inputs: ["NIR", "Red", "Blue"],
    unit: "index",
    // Not a hard mathematical bound: the denominator can approach zero over
    // very bright blue targets, so EVI is only bounded in practice. MODIS
    // clamps its product to -0.2..1.0; we keep the wider symmetric window so a
    // legitimately negative reading over water is not silently clipped.
    range: [-1, 1],
    interpretation:
      "High values mean a dense green canopy, and EVI keeps separating dense canopies where NDVI has already saturated.",
    topics: ["rangeland-dynamics"],
    reference:
      "Huete, Didan, Miura, Rodriguez, Gao & Ferreira (2002), Remote Sensing of Environment 83(1-2):195-213; coefficients are the MODIS MOD13 values.",
  },
  {
    id: "savi",
    name: "SAVI",
    fullName: "Soil-Adjusted Vegetation Index",
    // Both halves of the adjustment matter. L in the denominator shifts the
    // origin off the soil line; the (1 + L) factor rescales the result back to
    // roughly NDVI's dynamic range. Ship one without the other and the numbers
    // are no longer comparable to published SAVI at all.
    expression: "((NIR - Red) / (NIR + Red + L)) * (1 + L),  L = 0.5",
    inputs: ["NIR", "Red"],
    unit: "index",
    range: [-1, 1],
    interpretation:
      "High values mean green vegetation cover, with the brightness of bare soil showing between plants discounted.",
    // The rangeland reason for carrying SAVI at all: Kenyan rangeland is sparse
    // cover over bright soil, which is exactly the case where NDVI reads the
    // soil and SAVI does not.
    topics: ["rangeland-dynamics"],
    reference:
      "Huete (1988), A soil-adjusted vegetation index (SAVI), Remote Sensing of Environment 25(3):295-309.",
  },
  {
    id: "ndmi",
    name: "NDMI",
    fullName: "Normalised Difference Moisture Index",
    // NIR against SWIR1 (~1.6 um), where liquid water in leaves absorbs. This
    // is NOT ndwi below, and the two must never be collapsed: swap SWIR1 for
    // Green here and you get McFeeters water extent, which answers a different
    // question and is read on a different scale.
    expression: "(NIR - SWIR1) / (NIR + SWIR1)",
    inputs: ["NIR", "SWIR1"],
    unit: "index",
    range: [-1, 1],
    interpretation:
      "High values mean vegetation holding plenty of water, and a falling value is the early sign of moisture stress before the canopy browns.",
    topics: ["flood-risk", "rangeland-dynamics"],
    reference:
      "Wilson & Sader (2002), Remote Sensing of Environment 80(3):385-396. Gao (1996), Remote Sensing of Environment 58(3):257-266 published the same NIR/SWIR construction at 0.86 and 1.24 um under the name NDWI.",
  },
  {
    id: "ndwi",
    name: "NDWI",
    fullName: "Normalised Difference Water Index (McFeeters)",
    // The name is genuinely ambiguous in the literature and this is the choice:
    //
    //   McFeeters (1996)  (Green - NIR)  / (Green + NIR)   -> open surface WATER
    //   Gao (1996)        (NIR - SWIR)   / (NIR + SWIR)    -> vegetation MOISTURE
    //
    // We ship McFeeters here because this app offers NDWI under flood risk,
    // where the question is "is there standing water", and we ship Gao's
    // construction separately above under its unambiguous name, NDMI. An
    // analyst who ticks both gets two different measurements, which is the
    // point; if they were the same arithmetic the results table would show one
    // number twice under two headings and nobody would notice.
    expression: "(Green - NIR) / (Green + NIR)",
    inputs: ["Green", "NIR"],
    unit: "index",
    range: [-1, 1],
    interpretation:
      "High values mean open surface water; vegetation and soil of any kind sit below zero.",
    topics: ["flood-risk"],
    reference:
      "McFeeters (1996), The use of the Normalized Difference Water Index (NDWI) in the delineation of open water features, International Journal of Remote Sensing 17(7):1425-1432.",
  },
  {
    id: "mndwi",
    name: "MNDWI",
    fullName: "Modified Normalised Difference Water Index",
    // Xu's modification is exactly one substitution: SWIR1 in place of NIR in
    // McFeeters. That is what stops built-up land reading as water, which is
    // why this is the default for flood mapping over towns rather than ndwi.
    expression: "(Green - SWIR1) / (Green + SWIR1)",
    inputs: ["Green", "SWIR1"],
    unit: "index",
    range: [-1, 1],
    interpretation:
      "High values mean open surface water, including inside built-up areas where NDWI reads concrete and rooftops as water.",
    topics: ["flood-risk"],
    reference:
      "Xu (2006), Modification of normalised difference water index (NDWI) to enhance open water features in remotely sensed imagery, International Journal of Remote Sensing 27(14):3025-3033.",
  },
  {
    id: "bsi",
    name: "BSI",
    fullName: "Bare Soil Index",
    // SWIR1 + Red respond to soil mineral content, NIR + Blue to vegetation, so
    // the index is a normalised difference between a soil sum and a vegetation
    // sum rather than between two bands.
    expression:
      "((SWIR1 + Red) - (NIR + Blue)) / ((SWIR1 + Red) + (NIR + Blue))",
    inputs: ["SWIR1", "Red", "NIR", "Blue"],
    unit: "index",
    // Rikimaru's forest canopy density model rescales this to 0..200 with a
    // "* 100 + 100" tail. We ship the plain normalised form because that is
    // what every operational tool an analyst will cross-check against reports
    // (Sentinel Hub, ClimateEngine, Digital Earth Africa), and because -1..1
    // puts it on the same axis as the other normalised differences here.
    range: [-1, 1],
    interpretation:
      "High values mean exposed bare soil with little vegetation covering it.",
    topics: ["rangeland-dynamics", "food-security"],
    reference:
      "Rikimaru, Roy & Miyatake (2002), Tropical forest cover density mapping, Tropical Ecology 43(1):39-47; normalised four-band form as used operationally by Sentinel Hub and Digital Earth Africa.",
  },
  {
    id: "vci",
    name: "VCI",
    fullName: "Vegetation Condition Index",
    // The min and max are per-pixel and per-calendar-period across the whole
    // record, not scene extremes. That is the entire idea: it asks "how does
    // this place compare to its own history at this time of year", so a
    // permanently sparse pixel can still read 100 in a good season.
    expression: "100 * (NDVI - NDVI_min) / (NDVI_max - NDVI_min)",
    inputs: ["NDVI", "NDVI_min", "NDVI_max"],
    unit: "%",
    range: [0, 100],
    interpretation:
      "High values mean the vegetation is near the best condition ever recorded for this place at this time of year.",
    topics: ["drought-monitoring", "food-security"],
    reference:
      "Kogan (1990), Remote sensing of weather impacts on vegetation in non-homogeneous areas, International Journal of Remote Sensing 11(8):1405-1419.",
  },
  {
    id: "tci",
    name: "TCI",
    fullName: "Temperature Condition Index",
    // Note the inverted numerator: BT_max - BT, not BT - BT_min. Hot is bad for
    // vegetation, so TCI is deliberately built to read the same direction as
    // VCI (high = favourable) and the two can be averaged into VHI below.
    // Flip the subtraction and VHI silently becomes a nonsense average of two
    // indices pointing opposite ways.
    expression: "100 * (BT_max - BT) / (BT_max - BT_min)",
    inputs: ["BT", "BT_min", "BT_max"],
    unit: "%",
    range: [0, 100],
    interpretation:
      "High values mean the surface is cool relative to its own record, so heat is not stressing the vegetation.",
    topics: ["drought-monitoring"],
    reference:
      "Kogan (1995), Application of vegetation index and brightness temperature for drought detection, Advances in Space Research 15(11):91-100.",
  },
  {
    id: "vhi",
    name: "VHI",
    fullName: "Vegetation Health Index",
    // alpha weights moisture stress (VCI) against thermal stress (TCI). Kogan
    // left it open; 0.5 is the value NOAA STAR runs operationally and the one
    // every VHI figure an analyst has seen is computed with, so it is the
    // default here rather than a tunable.
    expression: "α * VCI + (1 - α) * TCI,  α = 0.5",
    inputs: ["VCI", "TCI"],
    unit: "%",
    range: [0, 100],
    interpretation:
      "High values mean healthy vegetation; below 40 is the conventional drought threshold and below 15 is extreme drought.",
    topics: ["drought-monitoring", "food-security"],
    reference:
      "Kogan (1995), Advances in Space Research 15(11):91-100; α = 0.5 is the NOAA STAR Global Vegetation Health operational default.",
  },
  {
    id: "spi",
    name: "SPI",
    fullName: "Standardised Precipitation Index",
    // Not a plain z-score. Rainfall totals are skewed and bounded at zero, so
    // the accumulation is fitted to a gamma distribution first and the fitted
    // probability is then pushed through the inverse standard normal. Skip the
    // gamma step and dry-climate SPI is systematically wrong in the tail that
    // matters, which is the dry one.
    expression:
      "Φ⁻¹( G(Precipitation) ),  G = gamma CDF fitted to the same accumulation window across the climatology",
    inputs: ["Precipitation"],
    unit: "σ",
    // Unbounded in principle; ±3 is the practical window. WMO classifies
    // ≤ -2.0 as extremely dry and ≥ 2.0 as extremely wet, so a ±3 axis shows
    // every class with headroom.
    range: [-3, 3],
    interpretation:
      "High values mean rainfall well above the local normal for the window; at or below -1.5 the window is in drought.",
    topics: ["drought-monitoring", "food-security"],
    reference:
      "McKee, Doesken & Kleist (1993), The relationship of drought frequency and duration to time scales, 8th Conference on Applied Climatology, AMS, Anaheim CA; operational procedure in WMO-No. 1090 (2012), Standardized Precipitation Index User Guide.",
  },
  {
    id: "lst-anomaly",
    name: "LST anomaly",
    fullName: "Land Surface Temperature Anomaly",
    // A departure, not a temperature. The baseline is per-pixel and per-calendar
    // period, so this reads "hotter than this place normally is now" rather
    // than "hot", which is what makes it comparable between the highlands and
    // the north-east.
    expression:
      "LST - LST_baseline,  LST_baseline = mean LST for this pixel and calendar period over the climate normal",
    inputs: ["LST", "LST_baseline"],
    unit: "°C",
    // Physically unbounded; ±10 K covers the range of real monthly LST
    // departures and keeps the diverging colour scale centred on zero, which
    // is the only place it can be centred for an anomaly.
    range: [-10, 10],
    interpretation:
      "High values mean the land surface is hotter than its own baseline for this time of year.",
    topics: ["drought-monitoring"],
    reference:
      "Wan (2014), Remote Sensing of Environment 140:36-45 for the MODIS LST retrieval; anomaly taken against a climate normal per WMO-No. 1203 (2017), Guidelines on the Calculation of Climate Normals.",
  },
  {
    id: "twi",
    name: "TWI",
    fullName: "Topographic Wetness Index",
    // Beven & Kirkby's ln(a / tan β) from TOPMODEL. "Upslope area" is a, the
    // upslope contributing area PER UNIT CONTOUR LENGTH (m²/m), not the raw
    // catchment area: drop the per-unit-length normalisation and the index
    // stops being comparable between grids of different cell size.
    expression: "ln( Upslope area / tan(Slope) )",
    inputs: ["Upslope area", "Slope"],
    unit: "index",
    // Unbounded above in principle, and it blows up as slope approaches zero,
    // which is why implementations floor tan(Slope). 0..30 is the range real
    // DEM-derived TWI occupies.
    range: [0, 30],
    interpretation:
      "High values mean a flat spot with a large area draining into it, so water gathers there and stays.",
    // The only formula here that is not spectral. It carries the terrain half
    // of flood risk: rainfall decides how much water arrives, terrain decides
    // where it ends up.
    topics: ["flood-risk"],
    reference:
      "Beven & Kirkby (1979), A physically based, variable contributing area model of basin hydrology, Hydrological Sciences Bulletin 24(1):43-69.",
  },
];

const FORMULA_BY_ID: ReadonlyMap<string, Formula> = new Map(
  FORMULAS.map((f) => [f.id, f]),
);

/**
 * The formulas offered for a topic, in registry order.
 *
 * Derived from each formula's `topics` rather than from a per-topic table, so
 * the mapping cannot disagree with itself. Adding a topic to a formula is the
 * only edit needed to offer it there.
 */
export function formulasForTopic(slug: TopicSlug): readonly Formula[] {
  return FORMULAS.filter((f) => f.topics.includes(slug));
}

/** Type guard so a raw query-string value can be narrowed before use. */
export function isFormulaId(value: string): value is FormulaId {
  return FORMULA_BY_ID.has(value);
}

/**
 * Look up a formula. Returns undefined for anything unknown so the caller can
 * decide: the URL codec collects it as a problem, the results page skips it.
 */
export function getFormula(id: string): Formula | undefined {
  return FORMULA_BY_ID.get(id);
}

/**
 * What is ticked when the pre-analysis page first opens.
 *
 * Two per topic, never zero: the run button requires at least one formula, and
 * opening on an invalid config would greet every analyst with a disabled
 * button and a complaint. Two rather than all of them because a default of
 * "everything" is not a recommendation, and the pair chosen for each topic
 * measures two different things rather than the same thing twice.
 */
export const DEFAULT_FORMULAS: Readonly<Record<TopicSlug, readonly FormulaId[]>> =
  {
    // Water extent now, plus the terrain that decides where it collects.
    "flood-risk": ["mndwi", "twi"],
    // The composite vegetation-health signal, plus the rainfall deficit driving it.
    "drought-monitoring": ["vhi", "spi"],
    // Greenness, plus the soil-corrected version that sparse rangeland needs.
    "rangeland-dynamics": ["ndvi", "savi"],
    // Crop and pasture condition, plus the rainfall that sets the next season.
    "food-security": ["vhi", "spi"],
  };
