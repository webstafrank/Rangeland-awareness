/**
 * The layer registry.
 *
 * Layer names are server-specific, so a registry belongs to one source and
 * never travels between them. `GIBS_LAYERS` is the built-in default; a KSA
 * GeoServer gets its own array in source.ts. See services/wms/README.md for how to
 * build one.
 *
 * Every `layerName`, `timeExtent` and `timeDefault` below was read out of the
 * live GetCapabilities document on `verifiedOn`, and every `legendUrl` was
 * fetched and confirmed to answer `200 image/png`. That is not ceremony:
 *
 *   - a layer name that does not exist answers HTTP 200 with a
 *     `ServiceExceptionReport` XML body, and
 *   - a TIME outside the advertised extent answers HTTP 200 with a fully
 *     transparent PNG (334 bytes at 256x256).
 *
 * Both arrive as "the map just isn't showing anything", which is the one
 * failure this app must never produce silently. The extents are what let
 * time.ts state the second case in words before a tile is ever requested.
 */

import type { TopicSlug } from "@/services/analysis/topics";
import type { WmsLayerSpec, WmsSource } from "@/services/wms/types";

/** The day the GIBS entries below were checked against GetCapabilities. */
const GIBS_VERIFIED_ON = "2026-09-09";

const GIBS_ATTRIBUTION =
  'Imagery courtesy of <a href="https://worldview.earthdata.nasa.gov/">NASA EOSDIS GIBS</a>';

/** Most GIBS legends are a horizontal colour bar of this size. */
const WIDE_LEGEND = { width: 378, height: 86 } as const;

export const GIBS_LAYERS: readonly WmsLayerSpec[] = [
  {
    id: "ndvi-8day",
    layerName: "MODIS_Terra_NDVI_8Day",
    title: "Vegetation index (NDVI, 8-day)",
    description:
      "Greenness of the land surface. High values mean dense, healthy vegetation; near zero means bare ground.",
    topics: ["drought-monitoring", "rangeland-dynamics", "food-security"],
    attribution: `MODIS/Terra. ${GIBS_ATTRIBUTION}`,
    legendUrl: "https://gibs.earthdata.nasa.gov/legends/MODIS_NDVI_H.png",
    legendSize: WIDE_LEGEND,
    timeDimension: true,
    // A ROLLING archive: GIBS keeps roughly the last 19 months of this
    // product, so unlike every other layer here its start date moves FORWARD.
    // Anything before 2025-02-12 is an empty tile, which is why this layer is
    // the reason the coverage check exists at all. Note the one-day hole at
    // 2026-02-09 between the two intervals.
    timeExtent: "2025-02-12/2026-02-08/P1D,2026-02-10/2026-09-08/P1D",
    timeDefault: "2026-09-08",
    verifiedOn: GIBS_VERIFIED_ON,
  },
  {
    id: "evi-16day",
    layerName: "MODIS_Terra_L3_EVI_16Day",
    title: "Enhanced vegetation index (EVI, 16-day)",
    description:
      "Greenness corrected for soil background and haze. More reliable than NDVI over dense canopy and bright soils.",
    topics: ["rangeland-dynamics", "food-security"],
    attribution: `MODIS/Terra. ${GIBS_ATTRIBUTION}`,
    legendUrl: "https://gibs.earthdata.nasa.gov/legends/MODIS_L3_EVI_H.png",
    legendSize: WIDE_LEGEND,
    timeDimension: true,
    // One interval per calendar year: the 16-day compositing window restarts
    // every 1 January, so the last composite of a year is 13 or 14 days long
    // and the sequence cannot be written as a single triple.
    timeExtent:
      "2000-03-05/2000-12-18/P16D,2001-01-01/2001-12-19/P16D,2002-01-01/2002-12-19/P16D,2003-01-01/2003-12-19/P16D,2004-01-01/2004-12-18/P16D,2005-01-01/2005-12-19/P16D,2006-01-01/2006-12-19/P16D,2007-01-01/2007-12-19/P16D,2008-01-01/2008-12-18/P16D,2009-01-01/2009-12-19/P16D,2010-01-01/2010-12-19/P16D,2011-01-01/2011-12-19/P16D,2012-01-01/2012-12-18/P16D,2013-01-01/2013-12-19/P16D,2014-01-01/2014-12-19/P16D,2015-01-01/2015-12-19/P16D,2016-01-01/2016-12-18/P16D,2017-01-01/2017-12-19/P16D,2018-01-01/2018-12-19/P16D,2019-01-01/2019-12-19/P16D,2020-01-01/2020-12-18/P16D,2021-01-01/2021-12-19/P16D,2022-01-01/2022-12-19/P16D,2023-01-01/2023-12-19/P16D,2024-01-01/2024-12-18/P16D,2025-01-01/2025-12-19/P16D,2026-01-01/2026-08-13/P16D",
    timeDefault: "2026-08-13",
    verifiedOn: GIBS_VERIFIED_ON,
  },
  {
    id: "lst-terra-monthly",
    layerName: "MODIS_Terra_L3_Land_Surface_Temp_Monthly_Day",
    title: "Land surface temperature, day (Terra, monthly)",
    description:
      "Monthly mean daytime skin temperature of the ground. Sustained highs over rangeland indicate heat stress.",
    topics: ["drought-monitoring", "food-security"],
    attribution: `MODIS/Terra. ${GIBS_ATTRIBUTION}`,
    legendUrl:
      "https://gibs.earthdata.nasa.gov/legends/MODIS_Land_Surface_Temp_H.png",
    legendSize: WIDE_LEGEND,
    timeDimension: true,
    timeExtent: "2000-03-01/2026-08-01/P1M",
    timeDefault: "2026-08-01",
    verifiedOn: GIBS_VERIFIED_ON,
  },
  {
    id: "lst-aqua-monthly",
    layerName: "MODIS_Aqua_L3_Land_Surface_Temp_Monthly_Day",
    title: "Land surface temperature, day (Aqua, monthly)",
    description:
      "The early-afternoon counterpart to the Terra pass, so the two together bracket the daily temperature peak.",
    topics: ["drought-monitoring"],
    attribution: `MODIS/Aqua. ${GIBS_ATTRIBUTION}`,
    legendUrl:
      "https://gibs.earthdata.nasa.gov/legends/MODIS_Land_Surface_Temp_H.png",
    legendSize: WIDE_LEGEND,
    timeDimension: true,
    timeExtent: "2002-07-01/2026-08-01/P1M",
    timeDefault: "2026-08-01",
    verifiedOn: GIBS_VERIFIED_ON,
  },
  {
    id: "precipitation",
    layerName: "IMERG_Precipitation_Rate",
    title: "Precipitation rate (IMERG)",
    description:
      "Satellite-merged rainfall rate. The driver behind both flood onset and the rainfall anomaly used for drought.",
    topics: ["flood-risk", "drought-monitoring", "food-security"],
    attribution: `GPM IMERG. ${GIBS_ATTRIBUTION}`,
    legendUrl:
      "https://gibs.earthdata.nasa.gov/legends/GPM_Precipitation_Rate_H.png",
    legendSize: { width: 378, height: 176 },
    timeDimension: true,
    timeExtent:
      "2000-06-01/2025-10-22/P1D,2025-10-30/2026-02-02/P1D,2026-02-04/2026-02-09/P1D,2026-02-12/2026-05-24/P1D,2026-05-27/2026-09-07/P1D",
    timeDefault: "2026-09-07",
    verifiedOn: GIBS_VERIFIED_ON,
  },
  {
    id: "flood-2day",
    layerName: "MODIS_Combined_Flood_2-Day",
    title: "Surface water and flooding (2-day composite)",
    description:
      "Water detected on the land surface over a rolling two-day window, separated into normal water and flood water.",
    topics: ["flood-risk"],
    attribution: `MODIS Combined. ${GIBS_ATTRIBUTION}`,
    legendUrl: "https://gibs.earthdata.nasa.gov/legends/MODIS_Flood_H.png",
    legendSize: { width: 270, height: 135 },
    timeDimension: true,
    timeExtent:
      "2021-01-01/2021-01-05/P1D,2021-03-05/2021-03-07/P1D,2021-03-22/2021-12-20/P1D,2021-12-23/2023-07-20/P1D,2023-07-26/2026-09-09/P1D",
    timeDefault: "2026-09-09",
    verifiedOn: GIBS_VERIFIED_ON,
  },
  {
    id: "soil-moisture-root-zone",
    layerName: "SMAP_L4_Analyzed_Root_Zone_Soil_Moisture",
    title: "Root zone soil moisture (SMAP L4)",
    description:
      "Water available in the top metre of soil, the depth grass and crops actually draw from.",
    topics: ["flood-risk", "drought-monitoring"],
    attribution: `SMAP L4. ${GIBS_ATTRIBUTION}`,
    legendUrl:
      "https://gibs.earthdata.nasa.gov/legends/SMAP_Analyzed_Soil_Moisture_H.png",
    legendSize: WIDE_LEGEND,
    timeDimension: true,
    // Eight intervals with real production gaps in them, the most fragmented
    // extent shipped here. A date in one of those gaps renders nothing, so it
    // has to be reported as a gap and not as "the layer is broken".
    timeExtent:
      "2015-03-31/2025-10-09/P1D,2025-12-12/2026-03-16/P1D,2026-03-18/2026-05-10/P1D,2026-05-12/2026-05-16/P1D,2026-05-19/2026-08-09/P1D,2026-08-16/2026-08-30/P1D,2026-09-02/2026-09-03/P1D,2026-09-06/2026-09-06/P1D",
    timeDefault: "2026-09-06",
    verifiedOn: GIBS_VERIFIED_ON,
  },
  {
    id: "land-cover",
    layerName: "MODIS_Combined_L3_IGBP_Land_Cover_Type_Annual",
    title: "Land cover type (IGBP, annual)",
    description:
      "The IGBP land cover class of each pixel, which is what separates grassland and savanna from cropland.",
    topics: ["rangeland-dynamics", "food-security"],
    attribution: `MODIS Combined. ${GIBS_ATTRIBUTION}`,
    legendUrl:
      "https://gibs.earthdata.nasa.gov/legends/MODIS_IGBP_Land_Cover_Type_H.png",
    legendSize: { width: 270, height: 270 },
    timeDimension: true,
    // Annual, and the archive stops well short of today. Any run window that
    // ends after 2024-01-01 gets clamped back to it with the substitution
    // stated, which is the case that proves the clamp earns its keep.
    timeExtent: "2001-01-01/2024-01-01/P1Y",
    timeDefault: "2024-01-01",
    verifiedOn: GIBS_VERIFIED_ON,
  },
];

/**
 * The Kenya Space Agency GeoServer's layers.
 *
 * Empty until someone has read that server's GetCapabilities. Every entry here
 * must have had its `layerName` checked against the live document first: a name
 * that does not exist answers HTTP 200 with an XML exception body, which the
 * browser drops as a broken image and which looks identical to "the layer is
 * empty here". README.md has the three-command check.
 */
export const KSA_LAYERS: readonly WmsLayerSpec[] = [];

/**
 * Layers a source offers for one topic, in registry order.
 *
 * Registry order is deliberate rather than alphabetical: the first layer of a
 * topic is the one the results page turns on by default, so the ordering is a
 * statement about which layer answers that topic's question first.
 */
export function layersForSource(
  source: WmsSource,
  slug: TopicSlug,
): readonly WmsLayerSpec[] {
  return source.layers.filter((layer) => layer.topics.includes(slug));
}

/** Look up a layer by app-side id within a source. */
export function getSourceLayer(
  source: WmsSource,
  id: string,
): WmsLayerSpec | undefined {
  return source.layers.find((layer) => layer.id === id);
}
