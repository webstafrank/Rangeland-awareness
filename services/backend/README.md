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

Everything this service needs is already on the machine. There is no virtualenv,
no wheel to build, no `pip install` step:

| | |
| --- | --- |
| Django 5.2.15 | the HTTP layer |
| `osgeo.gdal` 3.12.2 | every raster operation |
| numpy 2.3.5 | the array maths |
| requests | GeoServer I/O |

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

## What this service must never do

- **Serve a layer name it has not seen in capabilities.** A wrong name renders
  as a blank tile, which looks like an empty dataset rather than a typo.
- **Compute in the browser.** If a number appears in the app, it was derived
  here, where the class tables and the weights are checked.
- **Invent a statistic it cannot compute.** A weighted overlay has no AUC and no
  R². It has per-criterion contribution, which is derivable and checkable.
