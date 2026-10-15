"""The GIBS layers the prediction models read, and why each one.

Chosen against the live WMTS capabilities on 2026-10-15
(``https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/1.0.0/WMTSCapabilities.xml``).
Three properties decided every pick, in this order:

1. **A monthly product.** The forecast targets are monthly, and a monthly
   composite is one request per month. A daily layer would be ~30 requests and
   a compositing step for each month of an eight-year history.
2. **History back to 2000 or earlier.** The drought target is "below this
   pixel's own 20th percentile for that calendar month", which needs several
   years of the same month at every pixel before the percentile means anything.
3. **Short latency.** The default ``asOf`` is two months back, so a layer that
   lags five months is always stale on the newest run.

| id | GIBS layer | grid | history | why this one |
| --- | --- | --- | --- | --- |
| ndvi | MODIS_Terra_L3_NDVI_Monthly | 1km | 2000-03.. | the label source; Terra, because Aqua starts in 2002 |
| precipitation | MERRA2_Precipitation_Bias_Corrected_Monthly | ~0.5 deg | 1980.. | gauge-corrected and monthly; IMERG is 30-min/daily and would need ~30 requests a month, GLDAS lags ~5 months |
| soil_moisture | MERRA2_Soil_Water_Root_Zone_Monthly | ~0.5 deg | 1980.. | root zone is the water vegetation draws on; SMAP starts 2015 and is daily, GLDAS 0-10cm lags ~5 months |
| lst | MODIS_Terra_L3_Land_Surface_Temp_Monthly_Day | 2km | 2000-03.. | daytime surface heat, the stress term NDVI lags behind |
| igbp | MODIS_Combined_L3_IGBP_Land_Cover_Type_Annual | 500m | 2001..2024 | the contract's masks name IGBP classes, and it is global, unlike TanaRiver_LULC |

MERRA-2 is a reanalysis at roughly 50 km, so over a sub-county area it is close
to one value in space. That is not wasted: it varies strongly in TIME, which is
what a next-month forecast needs. It is left out of the flood model, which is
spatial: one value across the whole box cannot separate a hotspot from its
neighbour, and GeoServer's own rainfall raster is the spatial rainfall there.

Units are converted where the GIBS unit is not the one an analyst reads:
precipitation kg m-2 s-1 to mm/day (x 86400) and LST kelvin to degrees Celsius.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

import numpy as np

#: GIBS's EPSG:4326 tile matrix sets, as degrees per pixel. Requests are snapped
#: to this lattice so GIBS returns its own pixels unresampled; between lattice
#: points a WMS answer is a nearest-neighbour resample whose seams move with the
#: request box, which makes the same pixel decode differently in two runs.
TMS_DEGREES: dict[str, float] = {
    "250m": 360.0 / 163840,
    "500m": 360.0 / 81920,
    "1km": 360.0 / 40960,
    "2km": 360.0 / 20480,
}


@dataclass(frozen=True)
class SatelliteLayer:
    id: str
    label: str
    gibs_layer: str
    colormap: str
    tms: str
    unit: str
    #: "P1M" or "P1Y": what one time step of the product is.
    period: str
    categorical: bool = False
    #: Decoded GIBS values -> the unit above. Applied to whole arrays.
    convert: Callable[[np.ndarray], np.ndarray] | None = None
    #: Smallest meaningful difference, the floor under an anomaly's standard
    #: deviation. Set to the colormap step: a pixel whose history varies by less
    #: than the precision of the PNG has no measurable variability, and dividing
    #: by a smaller number manufactures a huge anomaly out of quantisation.
    precision: float = 0.0

    @property
    def degrees_per_pixel(self) -> float:
        return TMS_DEGREES[self.tms]

    @property
    def colormap_url(self) -> str:
        return f"https://gibs.earthdata.nasa.gov/colormaps/v1.3/{self.colormap}.xml"


def _per_second_to_per_day(value: np.ndarray) -> np.ndarray:
    # kg m-2 s-1 of water is mm per second; a day has 86400 of them.
    return value * 86400.0


def _kelvin_to_celsius(value: np.ndarray) -> np.ndarray:
    return value - 273.15


NDVI = SatelliteLayer(
    id="ndvi",
    label="NDVI",
    gibs_layer="MODIS_Terra_L3_NDVI_Monthly",
    colormap="MODIS_L3_NDVI",
    tms="1km",
    unit="NDVI",
    period="P1M",
    precision=0.005,
)

PRECIPITATION = SatelliteLayer(
    id="precipitation",
    label="Precipitation",
    gibs_layer="MERRA2_Precipitation_Bias_Corrected_Monthly",
    colormap="MERRA2_Precipitation_Bias_Corrected_Monthly",
    tms="2km",
    unit="mm/day",
    period="P1M",
    convert=_per_second_to_per_day,
    precision=0.0864,
)

SOIL_MOISTURE = SatelliteLayer(
    id="soil_moisture",
    label="Root-zone soil moisture",
    gibs_layer="MERRA2_Soil_Water_Root_Zone_Monthly",
    colormap="MERRA2_Soil_Water_Root_Zone_Monthly",
    tms="2km",
    unit="m3/m3",
    period="P1M",
    precision=0.0025,
)

LST = SatelliteLayer(
    id="lst",
    label="Land surface temperature (day)",
    gibs_layer="MODIS_Terra_L3_Land_Surface_Temp_Monthly_Day",
    colormap="MODIS_Land_Surface_Temp",
    tms="2km",
    unit="degrees C",
    period="P1M",
    convert=_kelvin_to_celsius,
    precision=0.6,
)

IGBP = SatelliteLayer(
    id="igbp",
    label="Land cover (MODIS IGBP)",
    gibs_layer="MODIS_Combined_L3_IGBP_Land_Cover_Type_Annual",
    colormap="MODIS_IGBP_Land_Cover_Type",
    tms="500m",
    unit="IGBP class",
    period="P1Y",
    categorical=True,
)

ALL: dict[str, SatelliteLayer] = {
    layer.id: layer for layer in (NDVI, PRECIPITATION, SOIL_MOISTURE, LST, IGBP)
}

#: IGBP class codes the contract's masks name. From the MODIS MCD12Q1 user
#: guide, Type 1: 6 closed shrublands, 7 open shrublands, 8 woody savannas,
#: 9 savannas, 10 grasslands, 12 croplands, 14 cropland/natural vegetation
#: mosaics.
IGBP_RANGELAND = (6, 7, 8, 9, 10)
IGBP_CROPLAND = (12, 14)
