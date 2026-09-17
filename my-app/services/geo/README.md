# `services/geo`

Everything geospatial. Two halves that used to be two directories, merged when
`lib/` was folded into `services/`:

**The county registry.** Kenya's 47 counties, their boundaries, the projection
and the shared map frame. This is the only module in the repo allowed to read
the raw boundary data.

**The user-geometry pipeline.** What turns a click, a drawn polygon, a typed
coordinate or an uploaded shapefile into an area of interest: bounds, geodesic
area, coordinate parsing, and the ZIP pre-flight that stops a malformed upload
freezing the tab.

They belong together because they answer the same question from two directions:
the first supplies geometry the app already has, the second accepts geometry the
analyst brings. Both produce the same `AreaOfInterest`, and both are pure and
node-testable with no Leaflet import anywhere, which is what lets bounds and
zoom behaviour be proved without a browser.

- **Contract:** `contracts/geo.ts`, `GEO_CONTRACT_VERSION = 1`
- **Public surface:** `import { geo } from "@/services/geo"` (also the default
  export, plus `MAP_FRAME` for a component that needs a viewBox before anything
  is selected). The geometry pipeline is imported by file:
  `@/services/geo/bounds`, `/area`, `/box`, `/shapefile`, `/zip`.
- **Owns:** the county id scheme, the boundary geometry, the projection, the
  shared map frame, the ASAL grouping, the overlay grid, and every path a
  user-supplied geometry takes to become an area.
- **Depends on:** `contracts/geo`, `zod`, and `shpjs` for the upload path.
  Nothing else, and no other service.

## The geometry pipeline's files

| File | What it owns |
| --- | --- |
| `bounds.ts` | Bounds from any GeoJSON, union, padding, the `fitBounds` argument. |
| `area.ts` | Geodesic polygon area and its display format. |
| `box.ts` | Parsing a typed coordinate and building a box around it. |
| `zip.ts` | ZIP structural pre-flight. Exists because of a measured hang, see below. |
| `shapefile.ts` | Shapefile ingestion and every failure path a user can hit. |

## What it exposes

```ts
import { geo } from "@/services/geo";

geo.listAreas();                          // all 47 Area records, sorted by name
geo.getArea("turkana");                   // Area, throws on an unknown id
geo.findArea(idFromUrl);                  // Area | undefined
geo.pickAreas(["turkana", "kilifi"]);     // in the order given, unknown ids skipped
geo.frame();                              // MapFrame: { width, height, bounds }
geo.project([36.8219, -1.2921]);          // [lon, lat] -> [x, y] in frame units
geo.gridFor(areas, cellSize, valueAt);    // readonly OverlayCell[]
```

Two internal modules are exported for tests and for anything that needs the
maths without the data: `./projection` (`projectPoint`, `unprojectPoint`,
`makeFrame`, `lonScale`, `frameScale`) and `./geometry` (`parsePath`,
`pointInRings`, `ringsOfArea`). Other services should not need either.

Notes on the surface that are behaviour rather than detail:

- **`pickAreas` order is load-bearing.** Downstream charts assign series colours
  by position, so the returned order is exactly the requested order. Unknown ids
  are dropped silently (the usual source of one is a stale URL, and degrading the
  page beats breaking it); duplicates are kept, because removing one would shift
  every later colour.
- **`getArea` throws, `findArea` does not.** Use `getArea` when the id came from
  your own code and `findArea` when it came from a URL, a saved comparison, or a
  user.
- **`listAreas()` and `frame()` return the same objects on every call**, so they
  are safe as React dependencies and cheap to call in a render.

## Regenerating the data

```bash
npm run geo:build          # node services/geo/scripts/build-counties.mjs
npx vitest run services/geo
```

The script reads `data/raw/geoBoundaries-KEN-ADM1_simplified.geojson` and writes
`data/counties.generated.ts`. Both the input and the output are committed: see
`data/README.md` for why, and for the full provenance record.

The script asserts its way through the build rather than trusting its input. It
fails, loudly, if the source does not contain exactly 47 features, if any slug
does not satisfy `AreaIdSchema`, if two counties produce the same slug, if the
ASAL constant does not name 23 counties, or if a county simplifies away to
nothing. A boundary refresh that would silently change a county id therefore
breaks the build instead of breaking every saved URL.

## Provenance and license

Boundaries: **geoBoundaries** gbOpen release `KEN-ADM1-32016919`, ADM1
(Counties), boundary year **2020**, sourced from the **RCMRD GeoPortal / Africa
GeoPortal** dataset. **License: Public Domain.**

> Runfola, D. et al. (2020) geoBoundaries: A global database of political
> administrative boundaries. PLoS ONE 15(4): e0231866.
> <https://doi.org/10.1371/journal.pone.0231866>

Full record, pinned upstream URLs and the note on disputed boundaries (the Ilemi
Triangle, Migingo): `data/README.md`.

## The projection, and why there is exactly one of it

**Corrected equirectangular.** Longitude is multiplied by cos(mean latitude of
the fitted bounds), then both axes are scaled by a single factor derived from the
frame width, and the Y axis is flipped so north is up.

Why this and not something better known:

- A plain equirectangular projection treats a degree of longitude as a degree of
  latitude, which is only true at the equator. Kenya spans lat -4.7 to 5.5, so
  the error is small but visible, and the cos correction removes it: the country
  renders at roughly its true width instead of stretched.
- Web Mercator would need no explanation but wastes vertical space and inflates
  the northern counties relative to the southern ones, which is the wrong bias
  for a map whose subject is the arid north.
- An equal-area projection (Albers, say) would be the right answer if anyone were
  meant to compare county sizes by eye. Nobody is: every area figure in this app
  comes from tabulated numbers, and the map is a choropleth backdrop. So the
  simpler projection wins.
- No dependency. `proj4` and `d3-geo` each solve a much larger problem than one
  country needs, and this is twenty lines.

**One implementation, in `projection.mjs`.** Two callers need identical maths:
the build script (which bakes every boundary into an SVG path) and the runtime
service (whose `project()` places labels and overlay cells on top of those baked
paths). If they drift, nothing looks broken: a label just sits in the wrong
county, silently. So the maths lives in a single plain-Node ESM module, imported
directly by `scripts/build-counties.mjs` (which runs under bare `node`, with no
compiler) and re-exported with contract types by `projection.ts` for the
TypeScript side. `projection.d.mts` carries the signatures so the contract's
`readonly` tuple shapes survive the hop; it is declarations only.

Two more properties are deliberate:

- The maths reads `frame.width` and `frame.bounds` and never `frame.height`, so a
  frame that was serialised into the generated file and read back cannot disagree
  with one computed live. The height is derived from the fitted aspect ratio (it
  is not a chosen number, which is how maps end up stretched) and is rounded to
  one decimal only to keep the viewBox tidy. `ProjectionInput` in
  `projection.ts` is typed as width plus bounds to make that explicit.
- `unprojectPoint` is the exact algebraic inverse, not an approximation. The
  overlay grid is laid out in frame space and its values are looked up
  geographically, so every cell centre makes the trip back.

The frame this build produces: **800 x 1014 units**, fitted to
`[33.911819, -4.702209, 41.906258, 5.430648]`. About 100 units per degree, so
path coordinates rounded to 0.1 carry roughly 100m of positional precision, finer
than the source data.

The tests that keep this honest are, in `__tests__/areas.test.ts`, "projects
every centroid inside its own projected bbox" and the stronger "puts every
projected centroid inside its own drawn boundary". Both tie the runtime
projection to the baked paths through independent code, so a drift between the
two fails the suite rather than shipping.

## Size and fidelity: the measured trade-off

Boundaries are simplified with Douglas-Peucker (implemented in the build script,
iterative so a 12,000-point ring cannot overflow the stack) in **projected**
space, so the tolerance is a visual distance rather than an anisotropic distance
in degrees. Coordinates are then rounded to one decimal, and points that collapse
onto each other in the rounding are dropped.

Measured on this dataset, tolerance against the generated file's size:

| Tolerance (frame units) | Points kept | Generated `.ts` |
| --- | --- | --- |
| 0.10 | 18,046 (92.1%) | 212.9KB |
| **0.15** | **13,790 (70.4%)** | **165.2KB** |
| 0.20 | 11,174 (57.0%) | 135.8KB |
| 0.30 | 8,188 (41.8%) | 102.2KB |
| 0.60 | 4,673 (23.9%) | 62.6KB |
| 1.00 | 2,968 (15.1%) | 43.5KB |

**Shipping 0.15**: 841.4KB of raw GeoJSON becomes a 165.2KB generated module
(19.6% of the source), keeping 70.4% of the source's 19,591 points. That is
inside the 220KB budget with room for a boundary refresh, and it keeps the detail
that makes the map read as Kenya: Winam Gulf's inlets around Kisumu and Homa Bay,
the Lamu archipelago's coast, and the Turkana wedge up to the Ilemi Triangle. One
frame unit is ~1.1km, so the error budget is ~165m, finer than the source (which
is geoBoundaries' already-simplified release), which is why pulling the tolerance
lower buys bytes and no accuracy. Going the other way is where it hurts: by 0.6
the smaller Winam Gulf peninsulas are gone and the map looks wrong rather than
simplified.

43 of the source's 159 rings are dropped for falling below four points after
simplification, leaving 116. All 43 come out of the four multipolygon counties
(Lamu with 63 parts, Kilifi 23, Kwale 21, Mombasa 9) and are offshore islets and
sandbars; every county keeps its mainland, and the build asserts that none
simplifies away entirely.

Two things are computed from the **unsimplified** rings, on purpose:

- **`bbox`**, because a bbox that shrank with simplification would exclude real
  coastline from the map fit and from containment pre-filters.
- **`centroid`**, as the area-weighted polygon centroid of the county's largest
  outer ring. Not the bbox centre, which falls outside any sufficiently concave
  shape: Homa Bay's label would sit in Lake Victoria and Tana River's in
  Garissa. Largest ring, not an average over all of them, because Lamu, Kilifi,
  Kwale and Mombasa are multipolygons whose smaller parts are islands, and an
  average would drag the label offshore. If a centroid still escapes its own
  ring, the script nudges it inward and prints a note; on the current data that
  happens for none of the 47.

## The ASAL classification: read this before relying on it

`climateZone` is `arid`, `semi-arid` or `humid`, and `asal` is true for the first
two. The classification lives in **one constant**, `ASAL_CLASSIFICATION` in
`scripts/build-counties.mjs`, so it can be reviewed and changed in one place. As
shipped it marks the 23 counties commonly described as Kenya's arid and semi-arid
lands:

- **Arid (8):** Turkana, Marsabit, Mandera, Wajir, Garissa, Tana River, Isiolo,
  Samburu
- **Semi-arid (15):** West Pokot, Baringo, Laikipia, Kajiado, Narok, Kitui,
  Makueni, Machakos, Embu, Tharaka, Meru, Kilifi, Kwale, Lamu, Taita Taveta
- **Humid:** the remaining 24

**This grouping follows Kenya's ASAL policy classification and is not
authoritative here.** Confirm it against the current NDMA county list before
production use. Three reasons to be careful with it:

1. Aridity is a spectrum and the classification is applied to whole counties.
   Meru and Embu each contain both highland and lowland zones and are marked
   semi-arid on the strength of the lowland part alone. The county the source
   calls "Tharaka" is the semi-arid half of a county whose other half is not
   (see the naming note below), so the label fits the name better than it fits
   the territory.
2. The official grouping has been restated more than once, and the count of ASAL
   counties quoted in Kenyan policy documents is not always 23.
3. In this app it is used only to group and filter the area picker. Nothing
   computes an indicator from it, and no output is labelled with it. If that
   changes, this constant needs a cited source behind it first.

## One naming difference from the official county list

`Area.name` is whatever the boundary source publishes, verbatim, so a row can be
matched back upstream without a translation table. On this release that agrees
with the Constitution's First Schedule for 46 of the 47 counties, with one
difference worth knowing before a name is put in front of a user:

| Source name (and id) | Official name |
| --- | --- |
| `Tharaka` (`tharaka`) | Tharaka-Nithi |

The county is officially **Tharaka-Nithi**, formed from the former Tharaka and
Meru South (Nithi) districts. The source calls it Tharaka, so this service does
too, and the id is `tharaka`.

Two smaller cosmetic differences, which the slug erases anyway: the source writes
"Taita Taveta" where the official list hyphenates it, and "Murang'a" keeps its
apostrophe (slug `muranga`, which drops it rather than turning it into a dash).

Do not "fix" the name in the generated file: it is regenerated from the source on
every build. If a display name has to differ from the source name, that belongs
in a display-name map next to `ASAL_CLASSIFICATION` in the build script, so both
values are visible in one diff.

## The overlay grid

`gridFor(areas, cellSize, valueAt)` returns cells that tile the union of the
given areas. Four decisions worth knowing:

- **Laid out in frame coordinates**, not geographic ones, so cells are square on
  screen and tile without seams.
- **Origins snapped to the `cellSize` lattice**, so two different area selections
  put cells at the same coordinates. Changing the selection slides the overlay
  instead of making it shimmer.
- **Row-major over integer row/column counters**, never by adding `cellSize` to a
  running float. Repeated addition accumulates error and would make the output
  depend on how far from the origin the grid starts. This is what makes two calls
  with the same inputs byte-identical.
- **A cell belongs to the area containing its CENTRE**, decided by even-odd
  ray-cast against the same rings the SVG is filled with, first match in the
  caller's own order. Kenya's counties tile with no gaps, so every boundary cell
  overlaps two of them and only a single point can settle the ownership.

`gridFor` gets its geometry by parsing the baked path strings back into rings
(`geometry.ts`), memoised per path. Keeping a second copy of the same rings as
coordinate arrays would double the payload and create a pair of things that can
disagree.

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

## The typed-coordinate path

`box.ts` is the keyboard route to an area. Without it the only ways to select
one are the map (pointer only) and a shapefile (needs a file to exist), so an
analyst working from a radio call or a field report has none.

`parseCoordinatePair` takes one string, not two fields, because that is how
coordinates arrive: `"2.4512, 36.8203"`. It accepts commas, spaces, slashes,
semicolons, degree symbols and N/S/E/W suffixes, and uses hemisphere letters to
order the pair when they are present, so `"36.82E, 2.45N"` parses correctly
despite being written longitude first. With no letters it reads latitude first,
which is the reporting convention and the opposite of GeoJSON.

Coordinates outside Kenya warn but are never blocked: a cross-border catchment
or a shared rangeland is a real analysis.

`boxAroundPoint` treats radius as half-width, so radius 10 gives a 20km box,
and divides the east-west span by `cos(latitude)`. Without that the box is
square in degrees but visibly taller than wide on the ground. The test asserts
the two ground spans are equal *and* that the degree spans deliberately are
not.

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

```bash
npx vitest run services/geo
```

71 gate tests in three files, all deterministic, no network, well inside the 2s
gate budget:

- `__tests__/areas.test.ts` covers the generated data's invariants: 47 counties,
  unique ids, every id validated against the real `AreaIdSchema` from
  `@/contracts/geo`, the awkward slugs (`muranga`, `elgeyo-marakwet`,
  `taita-taveta`, `homa-bay`, `trans-nzoia`), 23 ASAL and exactly the 8 expected
  arid counties, well-formed paths inside the frame, centroids inside their own
  bbox, every bbox inside Kenya's national envelope, and the two containment
  checks that catch a drifted projection.
- `__tests__/service.test.ts` covers the contract surface: frame shape and aspect
  ratio, projection round trip in both directions, lookup and throwing
  behaviour, `pickAreas` ordering, and `gridFor` (cells only inside the requested
  areas, byte-identical across two calls, row-major order, lattice snapping,
  fewer cells as `cellSize` grows, one owner per boundary cell).
- `__tests__/geometry.test.ts` covers the path parser and the even-odd containment
  test on synthetic shapes, where the edge cases live (a hole, a point exactly on
  a shared edge, reversed winding, a malformed path), plus the projection maths
  on frames that are not Kenya.

The containment tests in the first two files use their own parser and
point-in-polygon implementation rather than the service's `geometry.ts`. Twelve
duplicated lines, deliberately: a test that shares the code it is checking agrees
with a bug instead of catching it.

## Where this would break

- **A boundary refresh that renames a county.** The slug is derived from the
  name, so a rename silently changes an id that lives in URLs. The build's
  uniqueness and count assertions catch a split or a merge, not a rename. If
  Kenya renames a county, pin the old slug explicitly rather than letting
  `slugify` decide.
- **A source file with polygon holes.** The current release has none (159 rings,
  0 holes), so the hole path through `pointInRings` is covered only by synthetic
  tests. Even-odd handles them correctly; nothing else in the service assumes
  they are absent.
- **A `cellSize` far smaller than the path precision.** Below about 0.2 frame
  units the grid resolves finer than the rounded boundary coordinates, so
  boundary cells get assigned by rounding artefacts. Nothing enforces a floor:
  `gridFor` only rejects a non-positive or non-finite `cellSize`.
- **A caller mutating an `Area`.** The records are typed `readonly` and the
  `listAreas()` array is frozen, but the objects themselves are not deep-frozen.
  A caller that reassigns `area.path` would poison the memoised ring cache for
  everyone.
