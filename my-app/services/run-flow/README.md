# services/run-flow

The gap between what the wizard collects and what the service accepts, closed in
one pure function.

The four steps produce an `AnalysisRequest`: a topic, an analysis type, a model
and a list of areas. `POST /api/v1/runs` wants a topic, polygons, a weight per
criterion, a projected CRS and a resolution. Those are not the same object, and
every difference between them is a decision someone has to make.

```
AnalysisRequest + TopicCriteria  ->  planRun()  ->  CreateRunBody + notes
                                              \->  a refusal with a reason
```

## The rule

**Never quietly change what was asked for.**

Every transformation applied to a selection produces a note, the notes are
rendered on the running screen, and anything that cannot be transformed honestly
is a refusal rather than a best guess. A run is minutes of compute and a map a
county officer may act on. A silently widened area of interest is a wrong answer
that looks right.

## What it transforms

| in | out | note |
| --- | --- | --- |
| Polygon, MultiPolygon | unchanged | none |
| Point (a map click, or a coordinate typed with radius 0) | a 20km square centred on it | yes, naming the area and the size |
| LineString, MultiPoint, anything else | refused | n/a |

The 10km half-width is not invented here: `CoordinateEntry.tsx` has defaulted to
a 10km radius since it was written, so a clicked point and a typed coordinate now
produce the same area rather than two different ones for no reason a user could
discover.

Every feature carries the app's labelling into its `properties` (`area_id`,
`label`, `source`, `area_km2`). The service echoes the configuration back whole
in the result, so this is all the results page has to name an area with, months
later, in a browser that never saw the selection.

## What it refuses, and why each is its own reason

| reason | when |
| --- | --- |
| `model-topic` | the topic has no weighted overlay behind it. Not an error, a different screen |
| `no-runnable-criteria` | every criterion this topic needs is unfilled on this deployment |
| `no-areas` | nothing selected |
| `too-many-areas` | more than the 12 the service takes |
| `unusable-geometry` | a line or a point set, which has no interior to compute over |

`model-topic` prefers the service's own sentence (`criteria.detail`) over one
written here, because the service is the side that knows why.

## No date window

The field is optional and the wizard collects no dates, so none is sent.
Defaulting one would make the run id depend on a date nobody chose: the same
selection submitted next month would hash differently and miss the cache for no
reason the analyst caused.

## Duplicating the service's checks on purpose

The service re-checks all of this and is authoritative. Checking here too is not
duplication for its own sake: a refusal the app can state immediately is a
sentence under the button instead of a round trip, and the two cannot drift into
disagreement because the app's checks are strictly the looser ones. Anything the
app allows and the service refuses comes back as a `400` with field errors,
which `StartRun` renders verbatim.

## Known limit: the CRS is fixed

`DEFAULT_TARGET_CRS` is `EPSG:32637`, UTM zone 37N, which covers the Tana River
basin and most of eastern Kenya and is what the first real run was computed in.
A selection in western Kenya belongs in 36N, and computing it in 37N stretches
distances the further west it sits.

Choosing the zone from the selection's centroid is the obvious next step and is
deliberately not guessed at, because which CRS a KSA product is published in is
their call. The service refuses a geographic CRS outright, so the current
default is at least always in metres, which is the property the distance
transform actually depends on.

## Tests

```
npx vitest run --project=node services/run-flow
```

18 gate tests. Most of them are refusals, which is the point of the module.
