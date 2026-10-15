# services/backend

The Django backend. It is the only thing that talks to GeoServer, it holds every
rule and every calculation, and it hands the app finished answers.

```
browser ──HTTP──▶ Django ──WMS/WCS/WFS──▶ GeoServer
   ▲                 │
   └── tiles, JSON ──┘        the browser never addresses GeoServer directly
```

Two jobs, and the split is the point:

**GeoServer supplies layers.** Nothing else. It is a data source: the catalogue
of what exists, the tiles that draw it, the rasters and features the maths reads.
No logic lives there.

**Django carries the logic.** Validation, AHP weights, the weighted overlay, the
classification, the statistics — all of it here, in one place, in Python, beside
the data it reads. The app renders what this returns and computes nothing.

## Why the browser cannot just call GeoServer

`192.168.0.40:8080` is a private address. It resolves on the office LAN and
nowhere else, so a browser anywhere but this network draws an empty map. That is
not a deployment detail to fix later — it is the reason the tile proxy below
exists. The proxy also keeps GeoServer credentials server-side, where a browser
cannot read them, and gives one place to cache tiles rather than one per client.

## What is installed, and what is deliberately absent

The overlay needs only what is already on the machine. Prediction runs add the
two models they train, scikit-learn and XGBoost, which are not:

| | |
| --- | --- |
| Django 5.2.15 | the HTTP layer |
| `osgeo.gdal` 3.12.2 | every raster operation |
| numpy 2.3.5 | the array maths |
| requests | GeoServer and NASA GIBS I/O |
| scikit-learn 1.9 | Random Forest, held-out metrics (prediction runs) |
| XGBoost 3.4 | gradient-boosted trees (prediction runs) |

They go in a virtualenv that can still see the system GDAL and numpy, created
once (`python3-venv` is installed now, which it was not when the paragraphs
below were written):

```bash
cd services/backend
python3 -m venv --system-site-packages .venv
.venv/bin/pip install scikit-learn xgboost
.venv/bin/python manage.py runserver
```

`--system-site-packages` is the important flag: GDAL's Python bindings live in
the system dist-packages and are compiled against the system numpy, so a venv
that cannot see them has no raster stack at all. `.venv/` is gitignored. The
Docker image installs the same two with numpy pinned to the apt copy
(`Dockerfile.backend` explains why).

**No Django REST Framework.** This API is a handful of endpoints that return
JSON and one that streams an image. `JsonResponse` and `View` do that with no
dependency, and `python3 -m venv` is broken on this box anyway (`ensurepip` is
missing; it needs `sudo apt install python3-venv`). Serializers and a browsable
API would be nice; they are not worth a dependency that cannot currently be
installed.

**No rasterio, scipy or geopandas.** The original plan, in a `services/analysis`
FastAPI skeleton that has since been deleted, pinned Python to `>=3.12,<3.14`
because those three are compiled and their
wheels lag a new CPython by months — and this machine runs 3.14, so none of them
install. They turned out to be unnecessary: `osgeo.gdal` is already here and
does all of it, generally by calling the same C++ the others wrap.

| the plan wanted | what is used instead |
| --- | --- |
| `rasterio` read/write | `gdal.Open`, `band.ReadAsArray`, the GTiff driver |
| `rasterio.warp` | `gdal.Warp` (reproject, clip to cutline, resample) |
| `scipy.ndimage` distance | `gdal.ComputeProximity` |
| slope from a DEM | `gdal.DEMProcessing` |
| `geopandas` zonal stats | `gdal.RasterizeLayer` + numpy |
| `jenkspy` | `domain/jenks.py`, ~60 lines of pure Python |

**No Celery.** A run is executed on a worker thread and its state lives in the
database, so polling works and a restart does not lose a finished run. That is
honest for one analyst on one machine and it needs no broker. It is also the
first thing to replace for real concurrency, and the seam is one class:
`jobs/runner.py`.

## Running it

```bash
cd services/backend
python3 manage.py migrate
python3 manage.py runserver 8000
```

Point it at a different GeoServer with the environment, never an edit:

```bash
export GEOSERVER_URL=http://192.168.0.40:8080/geoserver
export GEOSERVER_USER=admin          # optional
export GEOSERVER_PASSWORD=...        # optional
```

## The API

Full shapes in [`contracts/backend-api.md`](../../contracts/backend-api.md).

| endpoint | what it does |
| --- | --- |
| `GET /api/v1/health` | is the service up, and is GeoServer reachable from it |
| `GET /api/v1/layers` | the catalogue, read from GeoServer's own capabilities |
| `GET /api/v1/layers/{id}` | one layer: bbox, CRS list, styles, legend |
| `GET /api/v1/layers/{id}/legend` | the legend graphic, proxied |
| `GET /api/v1/tiles/{id}` | a WMS tile, proxied. This is what the map draws |
| `POST /api/v1/runs` | start an analysis. Returns immediately |
| `GET /api/v1/runs/{id}` | poll: status, stage, monotonic progress |
| `GET /api/v1/runs/{id}/result` | the numbers, once it has succeeded |
| `POST /api/v1/weights/derive` | AHP weights and consistency ratio |

## Tests

```bash
cd services/backend
python3 manage.py test
```

The GeoServer tests run against a recorded capabilities document
(`apps/layers/tests/fixtures/`), captured from the live server, so the suite is
deterministic and runs with the network down. The live server is exercised
separately, on purpose:

```bash
python3 manage.py check_geoserver     # hits the real thing, prints what it finds
```

The prediction tests (`apps/analysis/tests/test_prediction.py`) run every
topic end to end through the real pipeline on synthetic layers (a `FakeSources`
behind the same interface the live GeoServer and GIBS client implement) and
decode against GIBS colormaps recorded in `apps/analysis/tests/fixtures/gibs/`.
The live equivalent, which trains on real GeoServer and GIBS data over a small
Tana River box and prints the result summary:

```bash
.venv/bin/python manage.py predict_smoke --topic drought-monitoring --model combined
```

## Prediction runs

`POST /api/v1/runs` with a `model` (`random-forest`, `xgboost` or `combined`)
trains and applies the models instead of the weighted overlay. The contract,
including what each topic predicts and where its training labels come from, is
`contracts/prediction.md`. In short:

| topic | the model predicts | labels from |
| --- | --- | --- |
| flood-risk | pixel is a mapped flood hotspot | GeoServer `TanaRiver_Flood_Hotspots` |
| drought-monitoring | NDVI in its driest fifth next month | NASA GIBS NDVI history |
| rangeland-dynamics | NDVI anomaly falling next month, rangeland only | NASA GIBS NDVI history |
| food-security | cropland NDVI in its driest fifth next month | NASA GIBS NDVI history |

Features are the GeoServer criterion layers plus NASA GIBS satellite layers
(NDVI, MERRA-2 precipitation and soil moisture, land surface temperature, MODIS
land cover), decoded from GIBS's colour-mapped PNGs through each layer's
published colormap (`apps/analysis/satellite/`). Validation is always held out:
spatial blocks for flood, the most recent year for the forecasts. A run writes
`probability.tif`, `classes.tif` and (for `combined`) `disagreement.tif`, with
overviews, and `GET /api/v1/runs/{id}/tiles/{map}` draws them on the map.

GIBS responses are cached under `WORKSPACE_DIR/gibs-cache`; a forecast on a
cold cache makes about 400 requests (eight years of monthly layers), about a
minute, and a warm one none.

## What this service must never do

- **Serve a layer name it has not seen in capabilities.** A wrong name renders
  as a blank tile, which looks like an empty dataset rather than a typo.
- **Compute in the browser.** If a number appears in the app, it was derived
  here, where the class tables and the weights are checked.
- **Invent a statistic it cannot compute.** A weighted overlay has no AUC and no
  R². It has per-criterion contribution, which is derivable and checkable.
