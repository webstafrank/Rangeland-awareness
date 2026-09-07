/**
 * The four study topics and the indicator each one reports.
 *
 * Every indicator here is one a Kenyan drought or food security analyst
 * already reads, with the class breaks those institutions publish where they
 * exist (VCI-3M, IPC phase). Where no Kenyan standard publishes breaks (flood
 * hazard probability, herbaceous biomass) the bands are this project's own
 * convention and say so in `source`, because a made-up threshold presented as
 * an official one is worse than no threshold.
 *
 * Two rules the bands obey, enforced by `assertIndicatorInvariants` and by the
 * gate tests rather than by types:
 *
 *   1. Bands tile the domain: the first `min` is `domain[0]`, each `max` is the
 *      next `min`, and the top band's `max` is null. `classify` relies on this
 *      to be total, so a gap would be a returned-undefined bug at the seam.
 *   2. `severity` only ever takes one of the four reserved palette values. Two
 *      bands sharing a severity is expected (drought's "Normal greenness" and
 *      "Above normal greenness" are both `good`); the label carries the
 *      distinction the colour cannot.
 *
 * `dataStart` is the earliest date every driver of that topic has coverage,
 * not the earliest date any one of them does. It is the left bound of the date
 * picker, so being optimistic here produces empty analyses.
 */
import type { TopicSpec } from "@/contracts/catalog";
import { ALL_MODEL_IDS } from "./models";

/**
 * Flood risk.
 *
 * Probability rather than depth or extent: the drivers available at national
 * scale (rainfall anomaly, soil moisture, discharge, terrain) support a
 * likelihood-of-inundation estimate, not a hydraulic depth. Class breaks at
 * 10/25/50/75 % are the project's own probability classes.
 */
export const FLOOD_RISK: TopicSpec = {
  id: "flood-risk",
  label: "Flood risk",
  blurb:
    "How likely an area is to flood, from rainfall, how wet the ground already is, and river levels.",
  description:
    "Estimates the probability that an area is inundated in the current season. The model combines rainfall anomaly with the water already stored in the soil and in the river network, because the same storm floods saturated ground and drains away from dry ground. Output is a likelihood, not a flood depth or an extent map.",
  indicator: {
    id: "flood-hazard-probability",
    label: "Flood hazard",
    longLabel: "Flood Hazard Probability",
    unit: "%",
    precision: 1,
    domain: [0, 100],
    badEnd: "high",
    bands: [
      { min: 0, max: 10, label: "Very low", severity: "good" },
      { min: 10, max: 25, label: "Low", severity: "good" },
      { min: 25, max: 50, label: "Moderate", severity: "warning" },
      { min: 50, max: 75, label: "High", severity: "serious" },
      { min: 75, max: null, label: "Very high", severity: "critical" },
    ],
    source:
      "Standard flood hazard framing (rainfall accumulation plus antecedent soil saturation plus river discharge), as used in Kenya Meteorological Department flood advisories and ICPAC/IGAD flood hazard outlooks. The 10/25/50/75 % class breaks are this project's probability classes, not a published Kenyan standard.",
  },
  drivers: [
    "Rainfall anomaly",
    "Antecedent soil moisture",
    "River discharge",
    "Terrain wetness index",
    "Land cover",
  ],
  models: ALL_MODEL_IDS,
  // Start of the MODIS era, which is what bounds the land cover and soil
  // moisture drivers; the rainfall record itself reaches further back.
  dataStart: "2001-01-01",
};

/**
 * Drought.
 *
 * VCI over a 3-month window, not 1-month: the shorter window tracks
 * individual rain events and flips class from one bulletin to the next, which
 * is why NDMA reports the 3-month form for drought phase decisions. Breaks at
 * 10/20/35/50 are NDMA's published vegetation deficit classes, so they are not
 * ours to move.
 */
export const DROUGHT: TopicSpec = {
  id: "drought",
  label: "Drought",
  blurb:
    "How green the vegetation is compared with the same season in past years.",
  description:
    "Reports the Vegetation Condition Index over a 3-month window, which scales current greenness against the range seen in the satellite record for the same place and season. Low values mean vegetation is failing relative to what that place normally manages, which is the signal Kenya's drought phase classification is built on. The 3-month window is deliberate: a 1-month index swings on single rain events.",
  indicator: {
    id: "vci-3m",
    label: "VCI-3M",
    longLabel: "Vegetation Condition Index (3-month)",
    // Dimensionless: VCI is a 0-100 rescaling of NDVI against its own
    // historical range, so a percent sign would suggest a share of something.
    unit: "",
    precision: 1,
    domain: [0, 100],
    badEnd: "low",
    bands: [
      { min: 0, max: 10, label: "Extreme vegetation deficit", severity: "critical" },
      { min: 10, max: 20, label: "Severe vegetation deficit", severity: "serious" },
      { min: 20, max: 35, label: "Moderate vegetation deficit", severity: "warning" },
      { min: 35, max: 50, label: "Normal greenness", severity: "good" },
      { min: 50, max: null, label: "Above normal greenness", severity: "good" },
    ],
    source:
      "Kenya National Drought Management Authority (NDMA) drought early warning bulletins: VCI derived from MODIS/eMODIS NDVI against the historical range for the same season, reported over a 3-month window, with NDMA's vegetation deficit classes at 10, 20, 35 and 50.",
  },
  drivers: [
    "NDVI",
    "Rainfall anomaly",
    "Land surface temperature",
    "Soil moisture",
  ],
  models: ALL_MODEL_IDS,
  // MODIS NDVI starts in early 2000, and the 3-month window cannot be filled
  // until mid-2001 once the first year is spent establishing the baseline.
  dataStart: "2001-07-01",
};

/**
 * Food security.
 *
 * IPC phase is an expert consensus classification, not a measurement, so this
 * topic predicts a phase that analysts would assign rather than deriving one
 * from any single driver. Bands are the IPC phases themselves: the domain is
 * 1 to 5 and the precision is 0 because a phase 2.4 does not exist.
 */
export const FOOD_SECURITY: TopicSpec = {
  id: "food-security",
  label: "Food security",
  blurb:
    "The severity of acute food insecurity on the five-phase international scale.",
  description:
    "Predicts the IPC Acute Food Insecurity phase for an area: how much of the population cannot meet its food needs and what it is giving up to try. The drivers are the evidence IPC analysts weigh (consumption, coping, market prices, terms of trade, malnutrition), so this is a projection of the classification, not a substitute for the consensus process that produces the official one.",
  indicator: {
    id: "ipc-phase",
    label: "IPC phase",
    longLabel: "IPC Acute Food Insecurity Phase",
    /*
     * Empty, not "phase". The generic format rule is value + space + unit,
     * which would render phase 3 as "3 phase". A phase is a class, not a
     * measured quantity in some unit: the word belongs in the label ("IPC
     * phase") and in the band ("Phase 3 Crisis"), which is where every screen
     * takes it from. Leaving `unit` set would put it in a third place, badly.
     */
    unit: "",
    // A phase is an ordinal class. Nothing downstream should ever print a
    // fractional phase, so the precision does the rounding once, here.
    precision: 0,
    domain: [1, 5],
    badEnd: "high",
    bands: [
      { min: 1, max: 2, label: "Phase 1 Minimal", severity: "good" },
      { min: 2, max: 3, label: "Phase 2 Stressed", severity: "warning" },
      { min: 3, max: 4, label: "Phase 3 Crisis", severity: "serious" },
      { min: 4, max: 5, label: "Phase 4 Emergency", severity: "critical" },
      { min: 5, max: null, label: "Phase 5 Famine", severity: "critical" },
    ],
    source:
      "IPC Acute Food Insecurity reference scale (IPC Global Partners, Technical Manual v3.1), phases 1 Minimal to 5 Famine, as applied in Kenya through the Kenya Food Security Steering Group short and long rains assessments.",
  },
  drivers: [
    "Food consumption score",
    "Livelihood coping strategies",
    "Market prices",
    "Terms of trade",
    "Acute malnutrition",
  ],
  models: ALL_MODEL_IDS,
  // Kenya's first IPC-classified assessments; earlier bulletins used a
  // different, non-comparable severity vocabulary.
  dataStart: "2009-01-01",
};

/**
 * Rangeland dynamics.
 *
 * Biomass in kg of dry matter per hectare rather than an index, because this
 * is the topic a livestock officer converts into grazing days. Breaks at
 * 300/700/1200/2000 are this project's convention for ASAL herbaceous
 * rangeland and are calibrated to forage availability, not to a published
 * degradation standard.
 */
export const RANGELAND_DYNAMICS: TopicSpec = {
  id: "rangeland-dynamics",
  label: "Rangeland dynamics",
  blurb:
    "How much grazeable grass a rangeland is carrying, in kilograms of dry matter per hectare.",
  description:
    "Estimates standing herbaceous biomass, the forage actually available to livestock. Satellite greenness gives the seasonal growth signal, rainfall gives the water that drove it, and grazing pressure, land cover change and fire history explain why two places with the same rainfall carry different amounts of grass. Reported in kilograms of dry matter per hectare so it can be turned into carrying capacity.",
  indicator: {
    id: "herbaceous-biomass",
    label: "Biomass",
    longLabel: "Herbaceous biomass (dry matter)",
    unit: "kg DM/ha",
    precision: 0,
    domain: [0, 3000],
    badEnd: "low",
    bands: [
      { min: 0, max: 300, label: "Severely degraded", severity: "critical" },
      { min: 300, max: 700, label: "Degraded", severity: "serious" },
      { min: 700, max: 1200, label: "Stressed", severity: "warning" },
      { min: 1200, max: 2000, label: "Stable", severity: "good" },
      { min: 2000, max: null, label: "Productive", severity: "good" },
    ],
    source:
      "Herbaceous dry-matter biomass estimated from seasonal NDVI integrals (kg DM/ha), the approach used in FAO and ILRI rangeland forage assessments and in ICPAC/FAO forage condition monitoring for the Horn of Africa. The 300/700/1200/2000 kg DM/ha class breaks are this project's convention for Kenyan ASAL herbaceous rangeland.",
  },
  drivers: [
    "NDVI integral",
    "Rainfall",
    "Grazing pressure",
    "Land cover change",
    "Fire frequency",
  ],
  models: ALL_MODEL_IDS,
  dataStart: "2001-01-01",
};

/**
 * Display order for the topic grid. Flood and drought lead because they are
 * the two the agency is asked about most; the order is presentation only and
 * nothing keys off the index.
 */
export const TOPICS: readonly TopicSpec[] = [
  FLOOD_RISK,
  DROUGHT,
  FOOD_SECURITY,
  RANGELAND_DYNAMICS,
] as const;
