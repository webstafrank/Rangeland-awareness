# `services/geo/data`

Boundary data for Kenya's 47 counties, and the file generated from it.

| File | What it is |
| --- | --- |
| `raw/geoBoundaries-KEN-ADM1_simplified.geojson` | The source boundaries. Committed, never edited. |
| `raw/geoBoundaries-KEN-ADM1-metadata.json` | The provenance record shipped with the boundaries. |
| `counties.generated.ts` | Generated. Do not hand-edit. See below. |

## Provenance

The boundaries are the ADM1 (county) release for Kenya from **geoBoundaries**,
open release **gbOpen**, boundary id `KEN-ADM1-32016919`.

| Field | Value |
| --- | --- |
| Country | Kenya (`KEN`) |
| Level | ADM1, canonically "Counties", 47 units |
| Boundary year represented | 2020 |
| Source | RCMRD GeoPortal, Africa GeoPortal (`rcmrd.africageoportal.com/datasets/africageoportal`) |
| Published via | geoBoundaries (gbOpen), commit `9469f09` |
| Release build date | 12 December 2023 |
| Source data update date | 19 January 2023 |
| **License** | **Public Domain** |
| CRS | EPSG:4326, lon/lat degrees |
| File | the `_simplified` variant of the release, not the full-resolution one |

Citation for the dataset, as its authors ask for it:

> Runfola, D. et al. (2020) geoBoundaries: A global database of political
> administrative boundaries. PLoS ONE 15(4): e0231866.
> <https://doi.org/10.1371/journal.pone.0231866>

Upstream files, for a refresh:

- GeoJSON: <https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/KEN/ADM1/geoBoundaries-KEN-ADM1_simplified.geojson>
- Full release archive: <https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/KEN/ADM1/geoBoundaries-KEN-ADM1-all.zip>

Both are pinned to a commit rather than to `main`, so a re-download reproduces
the file that is committed here.

`raw/` is committed on purpose. The whole point of a build step is that the
generated data can be rebuilt and re-reviewed offline, and a build input that
has to be fetched from the network is not that.

### One name differs from the official list

The release names 46 of the 47 counties exactly as the Constitution's First
Schedule does. The exception is **Tharaka-Nithi**, which the source calls
`Tharaka`. The service keeps the source spelling (and derives the id `tharaka`
from it) so a row can be traced upstream without a translation table. See
`../README.md` for the full note.

### Boundaries are not a political statement

Administrative boundaries published by any source are approximate, and some are
disputed. In this dataset that matters at the Ilemi Triangle (north of Turkana,
claimed by both Kenya and South Sudan) and at the Migingo area in Lake Victoria.
The release draws them as Kenyan. Nothing in this app depends on that being the
last word, and no county area figure here should be quoted as authoritative.

## The generated file

`counties.generated.ts` is written by `../scripts/build-counties.mjs`:

```bash
npm run geo:build
```

It is committed so the app builds and the tests run without a generation step,
and so a change to the boundary data or to the id scheme shows up as a reviewable
diff. Hand edits are lost on the next regeneration. Everything that shapes its
content (the id slugs, the ASAL classification, the simplification tolerance)
lives in the build script; the projection lives in `../projection.mjs`.

See `../README.md` for what the service does with all of this.
