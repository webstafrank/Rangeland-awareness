# lib/run

The analysis engine: a run configuration in, a complete result out.

**Everything numeric in here is synthetic.** There is no model backend. Nothing
this module produces is an observation, a census figure or a prediction. It
exists so the pages, the charts, the map and the exports can be built and tested
against output with the right shape, ranges, seasonality and internal
consistency before a real backend exists. The app says so to the user, and
`SYNTHETIC_NOTE` is carried into every export so a downloaded CSV cannot be
mistaken for data once it is detached from the page.

`engine.ts` is the file to replace when a real backend lands. Everything around
it — the config validation, the URL codec, the indicator bands, the stage
script, the exporters, the narrative — is real code that stays.

## The surface

`index.ts` is the only entry point other modules should import.

```ts
runId(config): string                 // stable hash; same config, same id, any process
run(config): RunResult                // pure; no clock, no unseeded random, no IO
stages(config): readonly RunStage[]   // the processing screen's script
exportRun(result, "csv" | "geojson" | "json"): ExportPayload
```

Config handling lives in `config.ts` (`validateConfig`, `windowProblems`,
`formulaProblems`, `withAreas`) and the query-string codec in `url.ts`
(`buildRunQuery`, `parseRunQuery`). Validation collects **every** problem rather
than the first, because a form that reveals one error per submit makes the
analyst click, read, fix, click again.

## Purity, and why it is enforced rather than intended

`run()` is a pure function of its config. No `Date.now()`, no `Math.random()`,
no IO. Every random draw is seeded from a hash of the config, so:

- the same config produces a byte-identical result in any process, which is what
  makes a result URL shareable with no server-side storage at all;
- `generatedAt` is derived from the config, never from a clock, so a test does
  not have to freeze time and two machines agree;
- a test can assert on exact numbers instead of on ranges.

There is a test that runs the same config twice and deep-equals the results. It
is the cheapest guard against someone reaching for a clock later.

## The one deliberate departure from the `rangeland-pages` branch

That branch keyed areas by county slug (`areas: AreaId[]`). This app lets an
analyst click the map, draw a polygon, type a coordinate or upload a shapefile,
and none of those are counties. So `RunConfig.areas` carries geometry
(`RequestArea`), and the simulation seeds off a stable hash of each area's
bounds and label rather than off a county id.

The climate realism survives that change through `aridity.ts`, which derives an
aridity proxy from the area centroid: Kenya's ASAL belt is north and east, the
humid zone is the southwestern highlands and the coastal strip. It is a proxy
from coordinates, not a lookup of a real aridity raster, and it is labelled as
one. It matters because a generator that ignored climate would put Turkana and
Kericho in the same drought band half the time, and anyone who knows the country
would see that the numbers were invented.

## Invariants the tests hold it to

- every value sits inside its indicator's `domain`
- `lower <= value <= upper` for every estimate
- each `formulaValues` entry is inside that formula's declared `range`
- the selected formulas always appear by name in `metrics.featureImportances` —
  the analyst chose them, so a model reporting importances without them would be
  claiming it ignored its own input
- band classification is total: out-of-domain values clamp to an end band,
  `NaN` is rejected rather than silently painted as a real band
- the monthly series carries the bimodal Kenyan signal, peaking in May after the
  long rains with a weaker December peak after the short rains, and running the
  *other way* for food security, where rain is relief
- stage durations are whole milliseconds summing exactly to the total, so the
  processing bar cannot drift off the end of its script

## Two things that bit, kept here so they do not bite again

**A gap is `null`, never `0`.** A zero is an observation of nothing; a null is no
observation. A chart that draws the first as the second puts a spike to the floor
in the middle of the growing season.

**The seasonal swing scales by headroom, not by the domain span.** Scaling by the
span assumes every area has the whole domain beneath it. A stressed area does
not: a VHI level of 15 with a ±21 swing spends every dry season below zero and
gets clamped flat. Measured before this was fixed: 28 of 120 points pinned at
exactly 0, and the series never rose above 33 of a 0..100 domain — a quarter of
the chart was a flat line on the axis that read as missing data, and every band
above the floor was unreachable. See the comment in `series.ts`.
