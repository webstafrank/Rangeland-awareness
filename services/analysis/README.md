# services/analysis

The analysis service. Takes a run configuration, fetches criterion layers from
GeoServer, runs the weighted overlay, classifies with Jenks natural breaks, and
returns the numbers plus published result layers.

API contract: [`contracts/analysis-api.md`](../../contracts/analysis-api.md).
Nothing here is reachable except through it.

## Why this is Python

The computation is raster algebra: reproject, clip, derive slope and aspect from
a DEM, Euclidean distance transform, reclassify, weighted sum, Jenks, zonal
statistics. That is `rasterio`, `geopandas`, `scipy` and `jenkspy`, all
GDAL-backed, none with a TypeScript equivalent worth having — and the model
already exists as a Python notebook
(`TR_Floods_Hotspots_Mapping-Final`). Porting it to TS would mean
reimplementing GDAL badly and maintaining a second copy of the science.

So the app renders and this service computes.

## Layout

```
app/
  domain/
    ahp.py          pairwise comparison -> weights + consistency ratio
    criteria.py     loads contracts/criteria.json; classify helpers
    jenks.py        natural breaks                             [not yet written]
    overlay.py      reclassify -> weighted sum -> statistics   [not yet written]
  jobs/
    stages.py       the pipeline's real stages and monotonic progress
    store.py        run state, keyed by config hash            [not yet written]
    runner.py       executes a run, advancing stages           [not yet written]
  io/
    geoserver.py    WCS/WFS fetch, WMS publish                 [not yet written]
  api/              FastAPI routes                             [not yet written]
  config.py         settings from the environment              [not yet written]
tests/
  test_ahp_conformance.py       against the SHARED fixtures
  test_criteria_and_stages.py   artifact loading, stage plan, progress
```

Everything marked `[not yet written]` needs a reachable GeoServer to be worth
writing, and as of 2026-09-09 `192.168.0.40:8080` answers `Connection refused`
on every common port while the host itself answers ping. The pieces that do not
need it are written and tested.

## The two shared contracts, and why they exist

There are exactly two places where the same knowledge lives on both sides of the
language boundary. Both are fenced by a file rather than by discipline.

**AHP** is implemented twice, in `app/domain/ahp.py` and in
`my-app/lib/ahp/pairwise.ts`. The duplication is deliberate: the pairwise form
must respond without a round trip, and this service must not accept weights it
has not itself checked. `contracts/ahp-fixtures.json` is read by both test
suites. If they drifted, the map would be computed with weights the analyst
never saw, and nothing downstream would notice.

**Criteria** are authored once, in TypeScript, and generated into
`contracts/criteria.json`, which this service reads. There is no second copy of
any class table. `my-app/lib/criteria/__tests__/export-sync.test.ts` fails if
the artifact is stale, so forgetting to regenerate is a red gate.

Regenerate after editing a class table:

```bash
cd my-app && npx vite-node -c vitest.config.mts scripts/export-criteria.ts
```

The service refuses to start without that artifact, which is correct: it cannot
compute anything meaningful without it.

## Running the tests

The tested modules deliberately have no third-party dependencies, so they run on
a bare interpreter with no install:

```bash
cd services/analysis
python3 -m unittest discover -s tests -t .
```

37 tests, all passing as of this commit.

## Installing, when the pipeline lands

```bash
python3 -m venv .venv && . .venv/bin/activate
pip install -e '.[dev]'
```

**A warning about the interpreter.** This machine has Python 3.14.4. `rasterio`,
`geopandas` and `scipy` are compiled and their wheels routinely lag a new
CPython release by months; a 3.14 install may have to build GDAL from source or
may simply fail. If it does, the fix is a 3.12 virtualenv, not a fight with the
toolchain — pin it in `.python-version` and move on. Nothing in the service
depends on a 3.13+ feature.

## The pipeline, once written

Ten stages, in `app/jobs/stages.py`, matching what the notebook actually does:

| stage | work |
| --- | --- |
| `resolve` | validate the areas, compute the reference grid from the DEM |
| `fetch` | pull each criterion layer from GeoServer over WCS/WFS |
| `reproject` | warp to the target CRS and resolution, clip to the area |
| `derive` | slope and aspect from the DEM |
| `distance` | Euclidean distance to drainage, Gaussian-smoothed |
| `reclassify` | each criterion to a 1..5 risk, per its own table |
| `overlay` | `sum(risk_i * weight_i)` |
| `classify` | Jenks natural breaks into five classes |
| `statistics` | per-class area and share, per-criterion contribution |
| `publish` | write the two GeoTIFFs to GeoServer as layers |

Progress is derived from completed stage weights, never from a clock: a bar that
goes backwards is worse than no bar. Inapplicable stages are reported `skipped`
rather than dropped, so the list has one shape and the app does not reflow
mid-run.

## What this service must never do

- **Invent a statistic it cannot compute.** A weighted overlay has no AUC, no
  R², no training samples. It has per-criterion contribution, which is
  derivable and checkable by hand.
- **Ship a class table it was not given.** Lithology is the live case: its codes
  belong to whatever geology layer the GeoServer publishes, so it is empty and a
  run naming it is refused with a stated reason rather than returning a blank
  raster.
- **Reuse a class table across topics.** Flood scores flat ground 5; landslide
  scores it 1. The tables are keyed by topic-criterion pair, and both test
  suites assert they disagree.
