# Contract: model predictions and result maps

Version 1, additive to `backend-api.md` (still `/api/v1`). It covers three
things that contract did not have:

1. Running the models the wizard offers (Random Forest, XGBoost, Combined) for
   all four topics, on GeoServer layers plus NASA GIBS satellite layers.
2. A prediction result: a probability per pixel, its distribution, and
   percentages per class and per area.
3. Drawing any finished run's rasters on the map, and downloading them.

Fields marked *required* are always present in a response. The app must ignore
fields it does not know (the rule from `backend-api.md` still holds).

## What a prediction is, per topic

A Random Forest and an XGBoost classifier need known outcomes to learn from.
Where GeoServer has them they are used; where it does not, the outcome is built
from satellite history, so the model forecasts something that has actually been
observed rather than re-deriving an index.

| topic | target (the `1` class) | where labels come from | mask |
| --- | --- | --- | --- |
| `flood-risk` | pixel is a mapped flood hotspot | GeoServer `TanaRiver_Floods:TanaRiver_Flood_Hotspots` | none |
| `drought-monitoring` | next month's vegetation is in the driest fifth for that calendar month (NDVI below the pixel's own 20th percentile for that month) | GIBS monthly NDVI history | none |
| `rangeland-dynamics` | next month's NDVI anomaly drops by more than 0.5 standard deviations versus this month (rangeland condition declining) | GIBS monthly NDVI history | rangeland land cover only (MODIS IGBP grassland, shrubland, savanna, woody savanna) |
| `food-security` | next month's cropland vegetation is in the driest fifth for that calendar month | GIBS monthly NDVI history | cropland land cover only (MODIS IGBP croplands, cropland/natural mosaic) |

Every result states its own target in words (`target.definition`), so the
screen never has to know this table.

**Features** are the topic's GeoServer criterion layers (the existing
`bindings.py`) plus satellite layers decoded from GIBS: vegetation (NDVI),
precipitation, soil moisture and land surface temperature, at the latest month
on or before `asOf`, with lagged and anomaly forms where the target is a
forecast. A feature with no coverage over the run's areas is dropped from both
training and prediction and named in `warnings`; it is never filled with zeros.

**Satellite values are decoded, not measured.** GIBS serves colour-mapped PNGs.
The backend inverts each colour through the layer's published GIBS colormap
(`https://gibs.earthdata.nasa.gov/colormaps/v1.3/<name>.xml`) back to the value
range it represents, and uses the midpoint of that range. The precision is the
colormap's step, and each feature reports its `source`, `layer` and `time`.

**Validation is held out, never in-sample.** Flood uses spatial block
cross-validation, because neighbouring pixels are near-duplicates and a random
split reports a fake 0.99. The three forecast topics hold out the most recent
year of months. Both report AUC, accuracy, F1 and Brier score per model.

**Combined** is the per-pixel mean of the Random Forest and XGBoost
probabilities. Where the two disagree is itself a map (`disagreement`).

## `POST /api/v1/runs`, changed fields

| field | rule |
| --- | --- |
| `topic` | any of the four routable topics |
| `model` | `random-forest` \| `xgboost` \| `combined`. **Required** for `drought-monitoring`, `rangeland-dynamics`, `food-security`. Optional for `flood-risk`: present means a prediction run, absent means the weighted overlay exactly as before |
| `weights` | overlay runs only. Must be absent on a prediction run (a model learns its own weights; sending some is refused rather than ignored) |
| `asOf` | optional ISO date. The month the features describe. Default: the first day of the month two calendar months before today (UTC), which is the latest month every monthly GIBS layer used here has published. The resolved value is written into the stored config before hashing, so the run id is stable |
| `resolution` | 10..1000 as before. The app sends **250** for prediction runs: satellite inputs are ~1 km and a 30 m prediction over a county is ~100M pixels for no extra information |
| `areas`, `targetCrs`, `publishLayers` | unchanged |

A prediction run over more than **20,000,000** grid pixels is refused at
validation with the pixel count and the resolution that would fit.

Errors use the existing `400 {"error": "Invalid run configuration", "fieldErrors": {"field": ["message"]}}` shape.

## Stages of a prediction run

`resolve`, `fetch` (GeoServer layers), `satellite` (GIBS layers),
`features`, `labels`, `train`, `validate`, `predict`, `statistics`, `publish`
(always `skipped`, same reason as the overlay). Same `{id,label,state,...}`
shape and the same monotonic `progress` rule.

## `GET /api/v1/runs/{id}/result` for a prediction run

```json
{
  "kind": "prediction",
  "runId": "r_1a2b3c4d5e6f",
  "config": { "topic": "drought-monitoring", "model": "combined", "asOf": "2026-08-01", "...": "echoed whole" },
  "generatedAt": "2026-10-14T13:02:11Z",
  "indicator": { "id": "drought-probability", "label": "Probability of vegetation drought next month" },
  "model": { "id": "combined", "label": "Combined (Random Forest + XGBoost)", "members": ["random-forest", "xgboost"] },
  "target": {
    "id": "ndvi-bottom-quintile-next-month",
    "label": "Vegetation drought next month",
    "definition": "NDVI next month below this pixel's own 20th percentile for that calendar month (2018-2025 history).",
    "labelSource": "gibs:MODIS_Terra_L3_NDVI_Monthly",
    "horizon": "1 month"
  },
  "asOf": "2026-08-01",
  "summary": {
    "meanProbability": 0.31,
    "medianProbability": 0.27,
    "p10": 0.08,
    "p90": 0.61,
    "atRiskThreshold": 0.5,
    "areaAtRiskKm2": 812.5,
    "shareAtRisk": 0.18
  },
  "histogram": {
    "edges": [0.0, 0.05, 0.1, "... 21 edges ...", 1.0],
    "counts": [1203, 4410, "... 20 counts ..."],
    "shares": [0.004, 0.015, "... 20 shares, summing to 1 ..."]
  },
  "classes": [
    { "class": 1, "label": "Very low", "range": [0.0, 0.2], "pixels": 120344, "areaKm2": 7521.5, "share": 0.41 },
    { "class": 5, "label": "Very high", "range": [0.8, 1.0], "pixels": 9012, "areaKm2": 563.3, "share": 0.03 }
  ],
  "areas": [
    {
      "index": 0,
      "name": "Garissa",
      "areaKm2": 44175.0,
      "validPixels": 706800,
      "meanProbability": 0.29,
      "shareAtRisk": 0.16,
      "classShares": [0.43, 0.22, 0.17, 0.12, 0.06]
    }
  ],
  "metrics": {
    "validation": "temporal-holdout",
    "validationDetail": "Trained on 2018-01..2024-12, scored on 2025-01..2025-12.",
    "trainSamples": 48000,
    "testSamples": 12000,
    "positiveShare": 0.2,
    "members": {
      "random-forest": { "auc": 0.81, "accuracy": 0.79, "f1": 0.52, "brier": 0.14 },
      "xgboost":       { "auc": 0.83, "accuracy": 0.80, "f1": 0.55, "brier": 0.13 },
      "combined":      { "auc": 0.84, "accuracy": 0.81, "f1": 0.56, "brier": 0.13 }
    }
  },
  "importance": { "ndvi_anomaly": 0.34, "precip_3m_anomaly": 0.22, "soil_moisture": 0.18, "lst_anomaly": 0.14, "slope": 0.12 },
  "agreement": { "meanAbsDifference": 0.06 },
  "features": [
    { "id": "ndvi_anomaly", "label": "NDVI anomaly", "source": "gibs", "layer": "MODIS_Terra_L3_NDVI_Monthly", "time": "2026-08-01", "unit": "standard deviations" },
    { "id": "slope", "label": "Slope", "source": "geoserver", "layer": "Hazards_Dashboard:TanaRiver_Slope", "time": null, "unit": "degrees" }
  ],
  "warnings": [],
  "bbox": [38.43, -3.07, 40.73, -0.02],
  "grid": { "crs": "EPSG:32637", "resolution": 250, "width": 920, "height": 1210 },
  "validPixels": 293601,
  "rasters": { "probability": "probability.tif", "classes": "classes.tif", "disagreement": "disagreement.tif" },
  "maps": [ "see 'Result maps' below" ],
  "layers": []
}
```

Rules the numbers obey (the backend tests assert each one):

- `classes` are fixed probability bands of width 0.2, labelled Very low, Low,
  Moderate, High, Very high. They are not Jenks: a probability has a meaning
  that fixed bands keep, and two runs stay comparable.
- `classes[].share` and `histogram.shares` each sum to 1 within 1e-6 over the
  valid pixels. Pixels outside the areas or masked out are not counted.
- `areaKm2 = pixels * resolution^2 / 1e6`.
- `summary.shareAtRisk` is the share of valid pixels with probability >= 0.5.
- `areas[]` has one row per config area, in config order. `name` comes from the
  area feature's `properties.name` when present, else `"Area 1"`, `"Area 2"`.
- `importance` is the members' normalised importances averaged (for a single
  model, that model's own), summing to 1.
- `agreement` is `null` unless `model` is `combined`.
- `warnings` say, in words, anything that weakens the answer: the areas lie
  outside the labelled extent and the model is extrapolating; a feature was
  dropped; fewer than 200 positive training samples.

## Overlay results

Unchanged except two additive fields: `kind: "overlay"` (a result without
`kind` is an overlay), and `maps` (below). `rasters` values become file names,
not server paths.

## Result maps

`maps` is added to every result by the result view, from `rasters`. Each entry
is something the app can draw and download without knowing what produced it:

```json
{
  "id": "probability",
  "label": "Probability",
  "tiles": "/api/v1/runs/r_1a2b3c4d5e6f/tiles/probability?BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256",
  "download": "/api/v1/runs/r_1a2b3c4d5e6f/rasters/probability.tif",
  "legend": {
    "type": "continuous",
    "min": 0, "max": 1, "unit": "probability",
    "stops": [[0.0, "#2c7bb6"], [0.25, "#abd9e9"], [0.5, "#ffffbf"], [0.75, "#fdae61"], [1.0, "#d7191c"]]
  }
}
```

`legend.type` is `continuous` (with `stops`) or `classes` (with
`items: [{"value": 1, "label": "Very low", "color": "#..."}]`). Paths are
relative to the backend base URL. Known maps, in this order: `probability`
(continuous 0..1; for a combined run, the mean of the two members),
`probability-random-forest` and `probability-xgboost` (each member's own
probability, same legend as `probability`, combined runs only), `classes` (the
five classes, for both overlay and prediction runs), `disagreement`
(continuous 0..1, combined runs only). The two member maps are additive to v1:
a client that does not know them ignores them.

## `GET /api/v1/runs/{id}/tiles/{map}`

Query: `BBOX` (EPSG:3857 metres, `minx,miny,maxx,maxy`), `WIDTH`, `HEIGHT`
(1..1024). Answers a transparent PNG, the run raster warped to that box and
coloured with the map's legend; pixels outside the areas or with no data are
transparent. `Cache-Control: public, max-age=86400`: a run's rasters never
change after it succeeds.

`404` for an unknown run or map, `409` if the run has not succeeded, `400` for a
bad BBOX or size.

## `GET /api/v1/runs/{id}/rasters/{name}.tif`

The GeoTIFF as computed, in the run's `grid.crs`.
`Content-Disposition: attachment; filename="<runId>-<name>.tif"`. Same status
codes. Only names listed in the run's `rasters` are served; anything else is
`404`, so the endpoint cannot be walked to other files in the workspace.
