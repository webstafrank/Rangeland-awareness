# services/analysis

Turns a `RunConfig` into a `RunResult`. Contract: `contracts/analysis.ts`,
version 1.

## Every number here is synthetic

Read this first.

**No model is trained and no Earth observation data is read.** Every value a
user sees, the estimates, the intervals, the time series, the model metrics,
the exposed population, comes out of a seeded pseudo-random generator in
`synthetic.ts`. The figures are shaped to be plausible for Kenya (bimodal
rainfall response, ASAL counties reading worse than the highlands) so the
interface can be reviewed against something that looks like real output. They
are not measurements, and nothing here should inform a real decision.

The UI says so too: the site footer carries the note, so a screenshot of a
result cannot be mistaken for a finding.

### The one function to replace

```
simulateRun()   services/analysis/synthetic.ts:445
```

`createAnalysisService` in `service.ts` calls it once per run and does nothing
else that touches numbers. Point `simulateRun` at a real backend, keep its
return shape, and every page, export and API route keeps working unchanged.
Everything around it (validation, banding, exports, staging, the URL codec) is
real code that a real backend still needs.

## Determinism is the storage layer

There is no database and no run table. `runId(config)` is an FNV-1a hash of a
canonical string built from the config, and `run(config)` seeds its generator
from that hash. So:

- The same config always produces the same id and byte-identical results, in
  any process, on any machine.
- A result URL is the whole of its persistence. `/analysis/drought/results?...`
  re-derives the result on the server every time, which is why a link can be
  shared, bookmarked and reopened months later with no stored state.
- `__tests__/hash.test.ts` pins the id of a reference config. If that test
  fails, every URL anyone saved now points at a different study: bump the `v1|`
  prefix in `canonicalConfigString` rather than editing the pinned value.

Nothing calls `Math.random`, `Date.now` or `crypto.randomUUID`. `generatedAt`
is derived from the config, not the clock, or the "same config, same result"
guarantee would be false the moment you looked at it twice.

## Injected dependencies

```ts
createAnalysisService({ catalog, geo }): AnalysisServiceImpl
```

The catalogue and geography services arrive as constructor arguments typed only
as `CatalogService` and `GeoService`. Two reasons:

1. The whole test suite runs against stubs in `__tests__/stubs.ts`, with two
   fake topics (one `badEnd: "low"`, one `badEnd: "high"`) and three fake
   areas. That is what let this service be built in parallel with the two it
   depends on, before either existed.
2. Swapping in a real geometry source touches `index.ts` and nothing else.

`index.ts` is the only file that names the concrete services, and it contains
exactly one statement.

## Layout

| File | Role |
| --- | --- |
| `service.ts` | `createAnalysisService`, the `AnalysisService` surface |
| `hash.ts` | `runIdFor`, `canonicalConfigString`, `fnv1a32`, `studySeed` |
| `rng.ts` | mulberry32, plus `clamp` / `roundTo` / sampling helpers |
| `synthetic.ts` | `simulateRun`: the model stand-in, including the monthly series and its deterministic gaps. Replace this one. |
| `seasonality.ts` | Kenya's bimodal seasonal response, as two Gaussian bumps |
| `narrative.ts` | the plain-language reading, correct for both `badEnd` directions |
| `stages.ts` | the running screen's stage script, sized by model cost and area count |
| `query.ts` | `parseQuery` (field-keyed errors), `toQuery` (delegates to the contract) |
| `exporters.ts` | CSV, GeoJSON and JSON downloads |
| `dates.ts` | ISO date arithmetic, UTC only |
| `constants.ts` | every tunable, named and commented in one place |

## Known limits

- **GeoJSON export uses Point geometry, not polygons.** The service receives
  each county already projected to an SVG path in frame coordinates, and it has
  no lon/lat rings to write. Rather than fabricate polygons it exports the
  county centroid as a Point with the result values in `properties`. A real
  export should carry the source geometry. Noted in `exporters.ts`.
- **`populationExposed` is invented.** It is derived from a seeded per-county
  population in a plausible range weighted by climate zone, not from the census.
- **`parseQuery` widens the contract's signature.** `RunConfigQuery` carries no
  `topic`, because the topic travels in the URL path, but a `RunConfig` cannot
  be built without one. So `parseQuery` also accepts the topic, either as a
  member of the query object or as a second argument, and reports a missing
  topic as a field error like any other. The parameter is a superset of the
  declared one, so a caller holding an `AnalysisService` still typechecks, and
  the contract file is untouched.
- **`roundTo(1.005, 2)` is 1, not 1.01.** Naive decimal rounding in binary
  floating point. Pinned with its explanation in `__tests__/rng.test.ts`;
  acceptable because `roundTo` only trims display values.

## Tests

```
npx vitest run services/analysis
```

207 gate tests across 12 files. The determinism tests matter most: id stability
per field, deep equality across repeat runs, key-order independence, stable
null gaps, and the pinned reference id.
