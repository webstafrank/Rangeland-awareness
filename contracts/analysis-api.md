# Contract: the analysis API

Version 1. The boundary between the Next.js app (`my-app/`) and the Python
analysis service (`services/analysis/`). Both sides import this; neither reaches
past it.

## Why the service is Python and not TypeScript

The computation is raster algebra: reproject, clip, derive slope and aspect from
a DEM, Euclidean distance transform, reclassify, weighted sum, Jenks natural
breaks, zonal statistics. That is `rasterio`, `geopandas`, `scipy` and `jenkspy`,
all GDAL-backed, with no TypeScript equivalent worth having — and Franklyn's
model already exists as a Python notebook. Porting it to TS would mean
reimplementing GDAL badly and then maintaining a second copy of the science.

So the app renders and the service computes. `my-app/lib/run/engine.ts` is a
synthetic stand-in that gets deleted when this service is reachable; everything
else under `lib/run/` (config validation, the URL codec, indicators, exporters)
stays and simply gets its numbers from here instead.

## Why runs are asynchronous

A 30 m overlay over a Kenyan county is minutes of work, not milliseconds. A
synchronous POST would sit past every sensible proxy timeout and give the user a
blank screen with no way to tell "still working" from "died".

So a run is created, then polled. That is also what makes the processing screen
honest: it currently animates a fabricated script, and against this API it
reports stages the pipeline actually finished.

```
POST /v1/runs            -> 202 { runId, statusUrl }
GET  /v1/runs/{runId}     -> status, stage, progress          (poll this)
GET  /v1/runs/{runId}/result   -> the numbers, once succeeded
```

## Base URL and versioning

Base path `/v1`. A breaking change to any shape here bumps to `/v2` and both
paths serve until the app is migrated. Additive fields are not breaking; the app
must ignore fields it does not know.

`ANALYSIS_API_URL` on the app side, defaulting to `http://127.0.0.1:8000`.

## Endpoints

### `GET /v1/health`

Readiness, including whether the things the service depends on are actually
reachable. The app shows this rather than discovering a dead GeoServer halfway
through a run.

```json
{
  "status": "ok",
  "version": "1.0.0",
  "geoserver": {
    "endpoint": "http://192.168.0.40:8080/geoserver",
    "reachable": true,
    "checkedAt": "2026-09-09T13:04:11Z",
    "detail": null
  }
}
```

`status` is `"ok"` when a run could start now, `"degraded"` when the service is
up but GeoServer is not, `"error"` otherwise. A `degraded` service still answers
every read endpoint, so a finished run stays viewable when GeoServer goes down.

### `GET /v1/topics/{topic}/criteria`

The criteria, their class tables and their calibration state. **The service is
authoritative**, not the app: the tables decide the numbers, so shipping a second
copy in the browser that could drift is exactly the bug this avoids. The app's
`lib/criteria` is the type and the default, and this endpoint overrides it.

```json
{
  "topic": "flood-risk",
  "method": "weighted-overlay",
  "criteria": [ Criterion, ... ],
  "defaultWeights": { "elevation": 0.25, "...": 0.0 },
  "unfilled": []
}
```

`unfilled` names criteria that cannot run as configured — `["lithology"]` for
landslide until its code table is filled. A run naming an unfilled criterion is
refused at creation with a stated reason rather than producing an empty map.

### `POST /v1/weights/derive`

AHP. The app implements this too (`my-app/lib/ahp`) so the form is responsive
without a round trip; the service implements it because it will not accept
weights it has not checked.

```json
{ "matrix": [[1, 3, 5], [0.3333, 1, 3], [0.2, 0.3333, 1]] }
```

```json
{
  "weights": [0.6370, 0.2583, 0.1047],
  "lambdaMax": 3.0385,
  "consistencyIndex": 0.0193,
  "consistencyRatio": 0.0332,
  "acceptable": true
}
```

`400` with field-keyed problems for a non-reciprocal or non-positive matrix.
Both implementations are tested against the same fixtures, including Saaty's
published 3×3, so they cannot disagree.

### `POST /v1/runs`

Create a run. Returns `202` immediately.

```json
{
  "schemaVersion": "2.0.0",
  "topic": "flood-risk",
  "areas": [ GeoJSON Feature, ... ],
  "dateWindow": { "start": "2024-01-01", "end": "2024-12-31" },
  "weights": { "elevation": 0.25, "slope": 0.15, "dist_to_river": 0.35, "rainfall": 0.20, "landcover": 0.05 },
  "targetCrs": "EPSG:32637",
  "resolution": 30,
  "criteriaOverrides": null,
  "publishLayers": true
}
```

| field | rule |
| --- | --- |
| `topic` | must be a weighted-overlay topic; a model topic is `409` until a model exists |
| `areas` | 1..12 GeoJSON Features, polygons only, WGS84 |
| `weights` | one key per criterion, no extras, each > 0, sum 1.0 ± 1e-6 |
| `dateWindow` | ISO dates, 30..3660 days, `start <= end` |
| `targetCrs` | projected CRS in metres. Rejected if geographic: a distance transform in degrees is meaningless |
| `resolution` | metres per pixel, 10..1000 |
| `criteriaOverrides` | optional recalibrated class tables, validated the same way as the shipped ones |
| `publishLayers` | when false, compute numbers only and skip the GeoServer publish |

Response:

```json
{ "runId": "r_8f3c21a9", "statusUrl": "/v1/runs/r_8f3c21a9", "stages": [ RunStage, ... ] }
```

`runId` is a hash of the normalised config, so **the same config returns the same
id**, and re-posting an identical config returns `200` with the existing run
rather than recomputing it. That is the cache, and it is why the id is not a
UUID.

Refusals are `400` with every problem at once, keyed by field:

```json
{
  "error": "Invalid run configuration",
  "fieldErrors": {
    "weights": ["Weights sum to 0.95, not 1.0.", "No weight given for \"landcover\"."],
    "targetCrs": ["EPSG:4326 is geographic; distances would be computed in degrees."]
  }
}
```

### `GET /v1/runs/{runId}`

Poll this. Cheap, no computation.

```json
{
  "runId": "r_8f3c21a9",
  "status": "running",
  "stages": [
    { "id": "resolve",     "label": "Resolving area geometry",              "state": "done",    "startedAt": "...", "endedAt": "..." },
    { "id": "fetch",       "label": "Fetching criterion layers",            "state": "done",    "startedAt": "...", "endedAt": "..." },
    { "id": "reproject",   "label": "Reprojecting and clipping to the area", "state": "running", "startedAt": "...", "endedAt": null },
    { "id": "derive",      "label": "Deriving slope and aspect",            "state": "pending", "startedAt": null,  "endedAt": null },
    { "id": "distance",    "label": "Computing distance to drainage",       "state": "pending", "startedAt": null,  "endedAt": null },
    { "id": "reclassify",  "label": "Reclassifying each criterion to risk", "state": "pending", "startedAt": null,  "endedAt": null },
    { "id": "overlay",     "label": "Weighted overlay",                     "state": "pending", "startedAt": null,  "endedAt": null },
    { "id": "classify",    "label": "Jenks natural breaks",                 "state": "pending", "startedAt": null,  "endedAt": null },
    { "id": "statistics",  "label": "Per-class and per-area statistics",    "state": "pending", "startedAt": null,  "endedAt": null },
    { "id": "publish",     "label": "Publishing layers to GeoServer",       "state": "pending", "startedAt": null,  "endedAt": null }
  ],
  "progress": 0.31,
  "startedAt": "2026-09-09T13:04:11Z",
  "endedAt": null,
  "error": null
}
```

`status` is `queued | running | succeeded | failed | cancelled`.
Stage `state` is `pending | running | done | skipped | failed`.

**`progress` is monotonic and derived from completed stage weights, never from a
clock.** A progress bar that goes backwards is worse than no progress bar. Stages
that do not apply are reported `skipped` rather than dropped, so the list has one
shape and the UI does not reflow mid-run.

`publish` is `skipped` when `publishLayers` was false.

On failure, `error` carries `{ "stage": "fetch", "message": "..." }` — which
stage failed is the useful half, and it is what makes "GeoServer went away"
distinguishable from "your geometry is invalid".

Poll every 2s. `Retry-After` is set on the response; honour it.

### `GET /v1/runs/{runId}/result`

`409` unless the run succeeded.

```json
{
  "runId": "r_8f3c21a9",
  "config": { ... },
  "generatedAt": "2026-09-09T13:09:44Z",
  "indicator": {
    "id": "fhi", "label": "Flood Hotspot Index", "unit": "",
    "domain": [1, 5], "badEnd": "high",
    "bands": [ { "id": "very-low", "label": "Very Low", "min": 1.0, "max": 1.83, "severity": "none" }, ... ]
  },
  "breaks": [1.0, 1.83, 2.41, 3.02, 3.77, 5.0],
  "classes": [
    { "risk": 1, "label": "Very Low",  "areaKm2": 1840.2, "share": 0.312, "pixels": 2044667 },
    { "risk": 5, "label": "Very High", "areaKm2":  402.7, "share": 0.068, "pixels":  447444 }
  ],
  "criteria": [
    { "id": "dist_to_river", "label": "Distance to river", "weight": 0.35,
      "meanRisk": 3.91, "contribution": 1.3685, "share": 0.402,
      "calibration": "regional" }
  ],
  "areas": [
    { "areaId": "aoi-1", "label": "Tana River County",
      "meanIndex": 3.41, "band": "high", "areaKm2": 5893.4,
      "classes": [ { "risk": 5, "areaKm2": 402.7, "share": 0.068 } ] }
  ],
  "layers": {
    "index":   "rangeland:fhi_r_8f3c21a9",
    "classes": "rangeland:fhi_classes_r_8f3c21a9",
    "wms":     "http://192.168.0.40:8080/geoserver/wms"
  },
  "warnings": [
    { "code": "uncalibrated-criteria", "message": "aspect, elevation and land cover are running on regional defaults.", "criteria": ["aspect", "elevation", "landcover"] }
  ],
  "provenance": {
    "sourceLayers": { "dem": "rangeland:srtm_30m", "rainfall": "rangeland:chirps_2024" },
    "targetCrs": "EPSG:32637",
    "resolution": 30,
    "engine": "services/analysis 1.0.0"
  }
}
```

Three deliberate choices in that shape:

**`criteria[].contribution` replaces feature importance.** A weighted overlay has
no AUC, no R², no training samples, and rendering any of them would be
fabricating a statistic. What it does have is `weight × meanRisk` per criterion,
which is derivable, checkable by hand, and answers the same question a reader
brings: which input drove this result.

**`breaks` is returned alongside `bands`.** Jenks breaks are computed from this
run's own distribution, so they differ between runs and the legend cannot be
hardcoded. Returning them makes the map legend and the table agree by
construction.

**`warnings` is structured, not prose.** `uncalibrated-criteria` is the one that
matters today: a susceptibility map on regional defaults is unvalidated rather
than wrong, and the reader is told which criteria those were.

### `GET /v1/runs/{runId}/export?format=csv|geojson|json`

`Content-Disposition: attachment`. Every export carries the synthetic/calibration
notice in a header row or a top-level field, so a file detached from the page
cannot be mistaken for validated output.

### `DELETE /v1/runs/{runId}`

Cancels a running job, or deletes a finished one and its published layers.
Idempotent: `204` whether or not it existed.

### `GET /v1/layers`

What GeoServer publishes, proxied and cached for 5 minutes: name, title, CRS
list, time extent. Same information as `scripts/wms-preflight.mjs`, so the app
can populate a layer picker without every browser hitting GeoServer directly.

## Layer naming

Published outputs are `<workspace>:fhi_<runId>` and
`<workspace>:fhi_classes_<runId>`. Deterministic, so re-running an identical
config reuses the layer instead of accumulating one per click, and a layer left
behind can be traced back to the run that made it.

Retention is the service's problem, not the app's: layers older than
`RUN_RETENTION_DAYS` (default 30) are swept, and `DELETE` removes them
immediately.

## Errors

Every error is the same shape.

```json
{ "error": "human sentence", "fieldErrors": { "field": ["..."] }, "runId": "r_..." }
```

| status | meaning |
| --- | --- |
| 400 | the request is malformed or invalid; `fieldErrors` says how |
| 404 | no such run |
| 409 | the run exists but is in the wrong state, or the topic has no method yet |
| 422 | the request is valid but cannot be computed — an unfilled criterion, a layer GeoServer does not publish |
| 502 | GeoServer failed |
| 503 | the service is up but not ready (`/health` is `degraded`) |

`422` versus `400` is load-bearing: `400` means the user typed something wrong
and the form can point at it; `422` means the configuration is reasonable and the
data is not there, which is a different sentence and a different fix.

## What the app must not do

- **Not compute anything scientific.** No reclassification, no overlay, no
  breaks. The app renders what the service returns. Two implementations of the
  science is the failure mode this contract exists to prevent.
- **Not hardcode Jenks breaks or band edges.** They come from the run.
- **Not fetch GeoServer directly for tiles it could get a layer name for.** The
  browser fetches WMS tiles (that is unavoidable and correct); it does not fetch
  GetCapabilities on every page load.

The one deliberate duplication is AHP, and it is duplicated because the form has
to be responsive. Both sides are tested against the same fixtures.
