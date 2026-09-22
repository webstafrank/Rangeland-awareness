# Contract: the backend API

Version 1. The boundary between the Next.js app (`my-app/`) and the Django
backend (`services/backend/`). Both sides import this; neither reaches past it.

This replaced `analysis-api.md`, which described a FastAPI service whose
GeoServer half was never written because GeoServer was unreachable at the time.
That document and its service are deleted: GeoServer is reachable, the service
is Django, and the shapes below are what actually ships. The FastAPI plan also
pinned rasterio, geopandas and scipy, none of which install on this machine's
Python 3.14, while Django, osgeo.gdal and numpy are already present.

## The division of labour

```
browser ──HTTP──▶ Django ──WMS/WCS/WFS──▶ GeoServer
   ▲                 │
   └── tiles, JSON ──┘
```

**GeoServer supplies layers and nothing else.** The catalogue of what exists,
the tiles that draw it, the rasters and features the maths reads. No logic.

**Django carries the logic.** Validation, AHP, the weighted overlay, the
classification, the statistics. The app renders what comes back and computes
nothing.

**The browser never addresses GeoServer.** `192.168.0.40` is a private address,
so a browser off that network draws an empty map; the proxy also keeps GeoServer
credentials server-side and gives one place to cache.

## Base URL and versioning

Base path `/api/v1`. A breaking change to any shape here bumps to `/api/v2` and
both serve until the app is migrated. Additive fields are not breaking, and the
app must ignore fields it does not know.

`NEXT_PUBLIC_BACKEND_URL` on the app side, defaulting to `http://127.0.0.1:8000`.

## Errors

One shape everywhere: a `message`-carrying `error`, plus whatever context helps.

```json
{ "error": "No layer named \"TanaRiver_Slope\".",
  "didYouMean": ["Hazards_Dashboard:TanaRiver_Slope"] }
```

Validation failures carry every problem at once, keyed by field, because the
checks are independent and revealing them one submit at a time makes the analyst
click, read, fix and click again:

```json
{
  "error": "Invalid run configuration",
  "fieldErrors": {
    "weights": ["Weights sum to 0.9000, not 1.0.", "No weight given for \"landcover\"."],
    "targetCrs": ["EPSG:4326 is geographic, so distances would be computed in degrees. ..."]
  }
}
```

---

## `GET /api/v1/health`

Is the service up, and can it reach GeoServer. Reported separately because they
fail apart: the service being down is "try later", GeoServer being down is "the
map will not draw and a run cannot start".

```json
{
  "status": "ok",
  "service": "rangeland-backend",
  "version": "1.0.0",
  "geoserver": {
    "endpoint": "http://192.168.0.40:8080/geoserver",
    "reachable": true,
    "detail": null,
    "layerCount": 23,
    "elapsedMs": 221
  }
}
```

`status` is `ok` when a run could start now, `degraded` when the service is up
and GeoServer is not. A degraded service still answers every read endpoint, so a
finished run stays viewable.

---

## `GET /api/v1/layers`

The catalogue, read from GeoServer's own capabilities and cached for
`GEOSERVER_CAPABILITIES_TTL` seconds (300 by default).

Query: `?workspace=` and `?kind=raster|vector` filter; `?refresh=1` forces a
re-read.

```json
{
  "endpoint": "http://192.168.0.40:8080/geoserver",
  "count": 23,
  "workspaces": ["Agriculture", "Hazards_Dashboard", "..."],
  "stale": false,
  "staleReason": null,
  "fetchedAgoSeconds": 12.4,
  "layers": [
    {
      "id": "Hazards_Dashboard:TanaRiver_Slope",
      "name": "Hazards_Dashboard:TanaRiver_Slope",
      "title": "TR_Slope",
      "abstract": "",
      "workspace": "Hazards_Dashboard",
      "crs": ["EPSG:3857", "EPSG:4326", "CRS:84", "EPSG:900913"],
      "crsCount": 7957,
      "bbox": [38.4332, -3.0731, 40.7316, -0.0154],
      "styles": ["raster"],
      "queryable": true,
      "kind": "raster"
    }
  ]
}
```

**`id` is the qualified name and is the identifier everywhere.** `title` is for
humans and may change without breaking anything — this deployment has a layer
*named* `TanaRiver_Slope` and *titled* `TR_Slope`, so anything keying off the
title breaks when somebody renames it in the GeoServer UI.

**`crs` is not the full list.** GeoServer declares its whole EPSG database on the
root layer and WMS inheritance gives every child all 7957 codes. Emitting that
across 23 layers would be ~180,000 strings to answer one question: can I ask for
Web Mercator. `crs` is the usable intersection; `crsCount` is the rest.

**`stale: true`** means GeoServer could not be reached and a cached catalogue is
being served. A map that keeps drawing beats a correct refusal, but it says so.

## `GET /api/v1/layers/{id}`

One layer, plus its WCS grid when it is a raster — the grid the pipeline would
compute on.

```json
{
  "id": "Hazards_Dashboard:TanaRiver_Slope",
  "...": "as above",
  "coverage": {
    "crs": "EPSG:32637",
    "size": [8514, 11266],
    "extent": [437014.0339, -339677.8732, 692434.0339, -1697.8732],
    "resolution": [30.0, 30.0],
    "bands": ["GRAY_INDEX"]
  }
}
```

`coverage` is `null` with a `coverageDetail` message when the layer is published
over WMS but not WCS, which is a normal state and not an error.

## `GET /api/v1/tiles/{id}`

**This is what the map draws.** A WMS `GetMap`, proxied and streamed.

```
/api/v1/tiles/Hazards_Dashboard:TanaRiver_Slope
   ?BBOX=4300000,-300000,4550000,-50000
   &WIDTH=512&HEIGHT=512&CRS=EPSG:3857&FORMAT=image/png
```

A drop-in for Leaflet's `L.tileLayer.wms`: `SRS` is accepted and normalised to
WMS 1.3.0's `CRS`.

Forwarded parameters are an **allow-list** — `BBOX`, `WIDTH`, `HEIGHT`, `CRS`,
`SRS`, `FORMAT`, `TRANSPARENT`, `STYLES`, `TIME`, `ELEVATION`, `BGCOLOR`,
`EXCEPTIONS`. Everything else is dropped. That is the security boundary: without
it this endpoint is an open proxy into an internal GeoServer, and some WMS
vendor parameters make GeoServer read local files.

| refusal | status |
| --- | --- |
| layer not in the catalogue | `404` |
| `FORMAT` not an image type | `400` |
| `WIDTH`/`HEIGHT` missing, non-integer, or over 4096 | `400` |
| `BBOX` missing | `400` |
| GeoServer returned a `ServiceException` | `502` with its text |

That last one matters: GeoServer answers errors with a **200 and an XML body**.
Passed through, it renders as a broken image and the real message is never seen.

## `GET /api/v1/layers/{id}/legend`

The legend graphic, proxied. `404` when no legend is published.

## `POST /api/v1/layers/refresh`

Drop the catalogue cache, for when a layer was just published.

---

## `GET /api/v1/topics/{topic}/criteria`

The criteria, their class tables, and what cannot run. **The service is
authoritative**, not the app: the tables decide the numbers, so a second copy in
the browser that could drift is exactly the bug the shared artifact prevents.

```json
{
  "topic": "flood-risk",
  "method": "weighted-overlay",
  "criteria": [ { "id": "slope", "label": "...", "scale": { "kind": "continuous", "classes": [...] }, "filled": true } ],
  "defaultWeights": { "elevation": 0.25, "slope": 0.15, "dist_to_river": 0.35, "rainfall": 0.2, "landcover": 0.05 },
  "unfilled": []
}
```

`unfilled` names criteria whose class table ships empty because its codes belong
to a layer this deployment has not published. A run naming one is refused at
creation rather than producing an empty map.

A topic on the model track answers `200` with `method` naming it and an empty
criteria list, so the app can show the right screen rather than an empty form.

## `POST /api/v1/weights/derive`

AHP. Implemented here *and* in `my-app/services/ahp` — the form must respond without
a round trip, and this service will not accept weights it has not checked. Both
are tested against `contracts/ahp-fixtures.json`.

```json
{ "matrix": [[1, 3, 5], [0.3333333333333333, 1, 3], [0.2, 0.3333333333333333, 1]] }
```

```json
{
  "weights": [0.636986, 0.258285, 0.104729],
  "lambdaMax": 3.038511,
  "consistencyIndex": 0.019256,
  "consistencyRatio": 0.033199,
  "acceptable": true,
  "maxAcceptableRatio": 0.1
}
```

**Reciprocals must be exact to 1e-6.** The superseded `analysis-api.md`
documented this example with `0.3333`, which cannot validate: 3 × 0.3333 is
0.9999. A client building
the matrix from an upper triangle computes `1/v` in full precision and is fine;
a hand-written one must not truncate. `400` names every offending cell.

---

## `POST /api/v1/runs`

Create a run. Returns immediately — a 30m overlay over a county is minutes, and
a synchronous POST would sit past every proxy timeout and give the browser a
blank screen with no way to tell "still working" from "died".

```json
{
  "topic": "flood-risk",
  "areas": [ { "type": "Feature", "geometry": { "type": "Polygon", "coordinates": [...] } } ],
  "weights": { "elevation": 0.25, "slope": 0.15, "dist_to_river": 0.35, "rainfall": 0.2, "landcover": 0.05 },
  "targetCrs": "EPSG:32637",
  "resolution": 30,
  "dateWindow": { "start": "2024-01-01", "end": "2024-12-31" },
  "publishLayers": false
}
```

| field | rule |
| --- | --- |
| `topic` | must be a weighted-overlay topic |
| `areas` | 1..12 GeoJSON Features or geometries, **polygons only**, WGS84 |
| `weights` | one key per criterion, no extras, each > 0, sum 1.0 ± 1e-6 |
| `targetCrs` | projected, in metres. A geographic CRS is refused |
| `resolution` | metres per pixel, 10..1000. Default 30 |
| `dateWindow` | optional; ISO dates, 30..3660 days, `start <= end` |
| `publishLayers` | write results back to GeoServer. Default `false` |

**A geographic `targetCrs` is refused, and this is not pedantry.** The pipeline
computes a Euclidean distance transform. In EPSG:4326 that distance is in
degrees, where one unit is 111km at the equator and 0km at the pole, so the
"distance to river" raster is meaningless and looks entirely normal.

**A zero weight is refused** rather than accepted: it means the analyst did not
want that criterion, and keeping it makes the pipeline fetch and warp a raster
that cannot affect the answer.

Response `202` for new work:

```json
{
  "runId": "r_8f3c21a9c4e1",
  "statusUrl": "/api/v1/runs/r_8f3c21a9c4e1",
  "status": "queued",
  "cached": false,
  "stages": [ { "id": "resolve", "label": "Resolving area geometry", "state": "pending" } ]
}
```

**`runId` is a hash of the normalised configuration, so the same configuration
returns the same id** and re-posting an identical one answers `200` with
`cached: true` rather than recomputing. That is the cache, and it is why the id
is not a UUID. Weights are rounded to six places before hashing, or 0.35 and
0.3500000000000001 would be different runs.

## `GET /api/v1/runs/{id}`

Poll this. One row read, no computation. Honour the `Retry-After: 2` header.

```json
{
  "runId": "r_8f3c21a9c4e1",
  "topic": "flood-risk",
  "status": "running",
  "stages": [
    { "id": "resolve",    "label": "Resolving area geometry",   "state": "done",    "startedAt": "...", "endedAt": "..." },
    { "id": "fetch",      "label": "Fetching criterion layers", "state": "running", "startedAt": "...", "endedAt": null },
    { "id": "publish",    "label": "Publishing layers to GeoServer", "state": "skipped", "startedAt": null, "endedAt": null }
  ],
  "progress": 0.28,
  "startedAt": "2026-09-14T15:04:11Z",
  "endedAt": null,
  "error": null
}
```

`status` is `queued | running | succeeded | failed | cancelled`.
Stage `state` is `pending | running | done | skipped | failed`.

**`progress` is monotonic and derived from finished stage weights, never from a
clock.** A progress bar that goes backwards is worse than no progress bar.
Inapplicable stages are reported `skipped` rather than dropped, so the list has
one shape and the UI never reflows mid-run.

On failure, `error` is `{"stage": "fetch", "message": "..."}`. Which stage
failed is the useful half: it distinguishes "GeoServer went away" from "your
geometry is invalid" without reading a log.

## `GET /api/v1/runs/{id}/result`

`409` unless the run succeeded — the run exists, it simply has no result yet,
and a `404` would send the client looking for a wrong id.

```json
{
  "runId": "r_8f3c21a9c4e1",
  "config": { "...": "the configuration, echoed whole" },
  "generatedAt": "2026-09-14T15:09:44Z",
  "indicator": { "id": "fhi", "label": "Flood Hotspot Index" },
  "breaks": [1.82, 2.41, 3.05, 3.76],
  "classes": [
    { "class": 1, "label": "Very low", "pixels": 412033, "areaKm2": 370.8, "share": 0.31 }
  ],
  "contribution": { "dist_to_river": 0.38, "elevation": 0.24, "slope": 0.16, "rainfall": 0.18, "landcover": 0.04 },
  "layers": []
}
```

`contribution` is `mean(risk_i) * weight_i`, normalised: how much of the score,
on average, came from each criterion. **It is not feature importance and not a
sensitivity analysis.** A weighted overlay has no AUC, no R² and no training
samples; this is the one per-criterion statistic it can honestly report, and it
is checkable by hand.

`layers` carries published GeoServer layer names when `publishLayers` was true,
and is empty otherwise.
