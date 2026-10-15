"""What each topic predicts, from what, and how it is checked.

The contract's target table, made executable. Everything topic-specific lives
here so the pipeline itself has no ``if topic == ...`` in it: a fifth topic is a
new `Recipe`, not a new branch in five files.

## The flood labels, and how their encoding was derived

`TanaRiver_Floods:TanaRiver_Flood_Hotspots` is not a 0/1 mask. Sampled over WCS
on 2026-10-15 (subset E 600000..620000, N -175000..-155000, and the whole
coverage at SCALEFACTOR=0.05) it is a continuous Float32 index:

- values from 1.95 to 5.00 in steps of 0.05, NaN outside Tana River county
  (no nodata is declared; DescribeCoverage gives the nil value as NaN);
- pixel for pixel identical to `Hazards_Dashboard:TanaRiver_Flood_Susceptability_Map`,
  whose WMS title is also "TanaRiver_Flood_Hotspots": one dataset, two names;
- the 0.05 step is exactly what a weighted sum of 1..5 risk classes with the
  notebook weights (0.25, 0.15, 0.35, 0.20, 0.05) produces. It is the notebook's
  flood index.

So "is a mapped flood hotspot" needs a threshold, and the layer's own published
style supplies one. `TanaRiver_Floods_Style` is a five-stop ramp, Very Low 2.05,
Low 2.6375, Moderate 3.225, **High 3.8125**, Very High 4.40. A pixel is a hotspot
when it is drawn at or beyond the High stop: ``index >= 3.8125``. Over the whole
county that is 12.6% of labelled pixels (Moderate and above would be 52%, which
is not a hotspot by any reading).

**What the model therefore learns.** The labels are themselves an overlay of
slope, rainfall, land cover, river distance and elevation. The model sees four
of those five (no DEM is published here, see bindings.py) plus satellite
layers, so it learns to reproduce the published hotspot map, not observed
floods. Every flood result says so in `warnings`, because a reader who assumes
the labels are flood records would trust the AUC for the wrong reason.
"""

from __future__ import annotations

from dataclasses import dataclass

from apps.analysis.satellite.catalog import IGBP_CROPLAND, IGBP_RANGELAND

FLOOD_LABEL_LAYER = "TanaRiver_Floods:TanaRiver_Flood_Hotspots"
#: The "High" stop of TanaRiver_Floods_Style. See the module docstring.
HOTSPOT_THRESHOLD = 3.8125

#: The contract's at-risk line, and the decision threshold for accuracy and F1.
AT_RISK_THRESHOLD = 0.5


@dataclass(frozen=True)
class StaticFeature:
    """A GeoServer criterion layer used as a model input."""

    id: str
    label: str
    unit: str
    categorical: bool = False


#: The GeoServer layers bound in bindings.py, as model inputs. Every topic gets
#: all of them: slope and river distance shape where water goes and where
#: riparian vegetation stays green in a drought, and land cover separates
#: cropland from bush. Where a layer does not cover the run's areas (anywhere
#: outside Tana River county today) it is dropped and named in `warnings`.
STATIC_FEATURES: tuple[StaticFeature, ...] = (
    StaticFeature("slope", "Slope", "degrees"),
    StaticFeature("rainfall", "Rainfall (long-term)", "mm"),
    StaticFeature("dist_to_river", "Distance to river", "m"),
    # TanaRiver_LULC is a local 1..6 scheme (0 is nodata), not ESA WorldCover:
    # see pipeline/overlay.py where the class-table mismatch was found. As a
    # model input that does not matter, because it is one-hot encoded by code
    # and the codes are never interpreted, only distinguished.
    StaticFeature("landcover", "Land cover (Tana River LULC)", "class", categorical=True),
)


@dataclass(frozen=True)
class Recipe:
    topic: str
    indicator_id: str
    indicator_label: str
    target_id: str
    target_label: str
    #: "spatial" (flood: where) or "forecast" (the other three: next month).
    kind: str
    validation: str
    horizon: str | None
    #: Satellite inputs by catalog id. NDVI history is implicit for forecasts.
    satellite: tuple[str, ...]
    #: IGBP codes the prediction is restricted to, or None for no mask.
    mask_codes: tuple[int, ...] | None = None
    mask_label: str | None = None
    #: Forecast label rule: "low-quintile" or "anomaly-drop".
    label_rule: str | None = None


RECIPES: dict[str, Recipe] = {
    "flood-risk": Recipe(
        topic="flood-risk",
        indicator_id="flood-hotspot-probability",
        indicator_label="Probability of being a flood hotspot",
        target_id="mapped-flood-hotspot",
        target_label="Mapped flood hotspot",
        kind="spatial",
        validation="spatial-block-cv",
        horizon=None,
        # No MERRA-2: one value across a sub-county box separates nothing in a
        # spatial model (catalog.py). NDVI, LST and soil moisture at asOf are
        # the surface state; IGBP is land cover where TanaRiver_LULC ends.
        satellite=("ndvi", "lst", "soil_moisture", "igbp"),
    ),
    "drought-monitoring": Recipe(
        topic="drought-monitoring",
        indicator_id="drought-probability",
        indicator_label="Probability of vegetation drought next month",
        target_id="ndvi-bottom-quintile-next-month",
        target_label="Vegetation drought next month",
        kind="forecast",
        validation="temporal-holdout",
        horizon="1 month",
        satellite=("ndvi", "precipitation", "soil_moisture", "lst", "igbp"),
        label_rule="low-quintile",
    ),
    "rangeland-dynamics": Recipe(
        topic="rangeland-dynamics",
        indicator_id="rangeland-decline-probability",
        indicator_label="Probability of declining rangeland condition next month",
        target_id="ndvi-anomaly-drop-next-month",
        target_label="Rangeland condition declining next month",
        kind="forecast",
        validation="temporal-holdout",
        horizon="1 month",
        satellite=("ndvi", "precipitation", "soil_moisture", "lst", "igbp"),
        mask_codes=IGBP_RANGELAND,
        mask_label="rangeland (MODIS IGBP 6-10: shrubland, savanna, woody savanna, grassland)",
        label_rule="anomaly-drop",
    ),
    "food-security": Recipe(
        topic="food-security",
        indicator_id="cropland-drought-probability",
        indicator_label="Probability of cropland vegetation drought next month",
        target_id="cropland-ndvi-bottom-quintile-next-month",
        target_label="Cropland vegetation drought next month",
        kind="forecast",
        validation="temporal-holdout",
        horizon="1 month",
        satellite=("ndvi", "precipitation", "soil_moisture", "lst", "igbp"),
        mask_codes=IGBP_CROPLAND,
        mask_label="cropland (MODIS IGBP 12 croplands, 14 cropland/natural mosaic)",
        label_rule="low-quintile",
    ),
}

MODEL_LABELS = {
    "random-forest": "Random Forest",
    "xgboost": "XGBoost",
    "combined": "Combined (Random Forest + XGBoost)",
}
MODEL_MEMBERS = {
    "random-forest": ("random-forest",),
    "xgboost": ("xgboost",),
    "combined": ("random-forest", "xgboost"),
}


def recipe_for(topic: str) -> Recipe | None:
    return RECIPES.get(topic)


def target_definition(recipe: Recipe, *, first_year: int | None = None,
                      last_year: int | None = None) -> str:
    """The target in words, with the history it was computed from."""
    span = (
        f" ({first_year}-{last_year} history)"
        if first_year is not None and last_year is not None
        else ""
    )
    if recipe.kind == "spatial":
        return (
            "Pixel lies on a mapped flood hotspot: the published Tana River flood "
            f"index is at or above {HOTSPOT_THRESHOLD}, the 'High' stop of its own "
            "style (TanaRiver_Floods_Style)."
        )
    if recipe.label_rule == "low-quintile":
        where = "Cropland NDVI" if recipe.mask_codes else "NDVI"
        return (
            f"{where} next month below this pixel's own 20th percentile for that "
            f"calendar month{span}."
        )
    return (
        "NDVI anomaly next month at least 0.5 standard deviations below this "
        "month's, both measured against this pixel's own calendar-month mean "
        f"and spread{span}, on rangeland pixels only."
    )
