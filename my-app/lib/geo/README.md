# lib/geo

Geospatial primitives. Pure and node-testable, with no Leaflet import anywhere:
the map component is a thin adapter over these functions, which is what lets
bounds and zoom behaviour be tested without a browser.

## Files

| File | What it owns |
| --- | --- |
| `bounds.ts` | Bounds from any GeoJSON, union, padding, the `fitBounds` argument. |
| `area.ts` | Geodesic polygon area and its display format. |
| `zip.ts` | ZIP structural pre-flight. Exists because of a measured hang, see below. |
| `shapefile.ts` | Shapefile ingestion and every failure path a user can hit. |

## Coordinate order, in one place

GeoJSON is `[lng, lat]`. Leaflet is `[lat, lng]`. That flip is the most common
bug in this kind of code, so it happens in exactly one function,
`boundsOfGeometry`, and nowhere else. A `BoundsTuple` is always
`[[south, west], [north, east]]`, the shape Leaflet's `fitBounds` accepts.

## Why points get padded

`padBounds` grows a degenerate box to a minimum span of 0.05 degrees, about
5.5km of latitude. A clicked point has `south === north`, and `fitBounds` on a
zero-area box jumps to maximum zoom, which is a disorienting 20-level slam.
Padding turns that into a neighbourhood-level view: close enough to read the
place, wide enough to keep context.

## Why area is hand-written instead of `@turf/area`

Turf is the obvious choice and was installed first, then removed. This app needs
exactly one function from it and turf costs about 500KB in a client bundle for
that one function. `area.ts` is the same spherical-excess formula turf uses
(Chamberlain & Duquette, NASA/JPL 2007), about 40 lines, and
`bounds.test.ts` checks it against the independent closed-form area of a
lat/lng cell, `R^2 * dLng * (sin lat2 - sin lat1)`. The two agree to 4
significant figures at 12,364 km2 for a 1x1 degree cell at the equator.

Points and lines return `null`, not `0`. "This has no area" and "this has an
area of zero" are different facts, and the UI shows a dash for the first.

## Why there is a ZIP pre-flight

This is the one piece here that looks like over-engineering and is not.

Handing shpjs a buffer that starts with `PK` but carries no valid End Of
Central Directory record makes its unzip layer spin in a **synchronous** loop
that never returns. On the main thread that is an unrecoverable frozen tab:
`try/catch` cannot catch it, and a `Promise.race` timeout cannot fire, because
the event loop never gets a turn.

Measured against shpjs 6.2.0 / but-unzip 0.1.4. Every other malformed input
tried rejects in about a millisecond:

| Input | Result |
| --- | --- |
| `"PK and then nothing valid at all"` | **hangs forever** |
| bytes with no `PK` prefix | rejects, 1ms |
| empty buffer | rejects, 1ms |
| valid zip, garbage `.shp` | rejects, 1ms |
| valid zip, truncated `.shp` | resolves with 0 features |
| valid zip, absurd record count | rejects, 1ms |

So `zip.ts` parses the central directory itself before shpjs is handed
anything, and `shapefile.test.ts` pins the hang case with a test that asserts
it rejects in under a second. If that test ever *times out* rather than
failing, the pre-flight has been removed.

The pre-flight also produces better errors than shpjs can. "This zip has no
.shp file in it. Found .csv, .txt." beats "no layers founds".

A Web Worker was the other option, and would contain any future hang rather
than this one specific class. It was not taken because the pre-flight closes
the only hang actually reachable here, is deterministic, and is testable in
node, where a worker is neither. If a new hang class ever shows up, the worker
is the answer and this note is the reason to reach for it.

## The two read paths

`readShapefile(file)` splits on extension, because they need different calls:

- `.zip` runs the pre-flight, then `shp()`, which reads the `.prj` and
  reprojects through proj4. A UTM shapefile with its `.prj` arrives in degrees.
- `.shp` alone goes to `parseShp()` directly. `shp()` would try to unzip it and
  fail. Verified never to hang on junk, so it needs no pre-flight.

Coordinates outside the WGS84 domain are skipped with an explanation rather than
plotted. A projected shapefile with no `.prj` parses fine and yields metres,
which render as a dot near null island and look like a bug in the map instead of
a bug in the input.

Failures never clear the existing selection. A bad upload leaves prior work
alone and reports `error.message` verbatim.

## Test fixtures are real bytes

`__tests__/fixtures/make-shapefile.ts` writes genuine `.shp`, `.shx`, `.dbf`,
`.prj` and ZIP bytes. The first test in `shapefile.test.ts` parses a fixture
with shpjs, the same third-party parser the app uses, and asserts the polygon
comes back exactly as encoded. That round trip is what makes the rest of the
file meaningful: if the writer were wrong, everything after it would be testing
nothing.

Nothing binary is checked in, which also keeps Safety's no-binaries rule.

## Tests

```
npx vitest run lib/geo
```
