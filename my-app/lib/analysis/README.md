# lib/analysis

The analysis domain. No React, no Leaflet, no `window`: everything here is pure
and gate-tested in node, which is why the interesting behaviour (the area cap,
the analysis-type transition, request validation) is provable without a browser.

`app/` and `components/` are adapters over this. They render its state and
dispatch its actions; they do not own any of these rules.

## Files

| File | What it owns |
| --- | --- |
| `topics.ts` | The four topics. Slugs, copy, accent colours, lookup + type guard. |
| `models.ts` | Model choices (Random Forest, XGBoost, Combined) and analysis types (single, comparison), including each type's area cap. |
| `selection.ts` | The area-of-interest state machine: add, remove, cap, focus, analysis-type transitions, undo. |
| `request.ts` | The `AnalysisRequest` contract crossing to a future model backend, and its validator. |
| `url-state.ts` | Reading and writing the `type` and `model` query params. |

## The registries are the single source of truth

Nothing outside this directory hardcodes a topic name, model id or analysis
type. A topic added to `TOPICS` appears on the homepage and gets a working
route with no other edit, and `registry.test.ts` fails if `TOPICS` and
`TOPIC_SLUGS` ever drift apart.

Ids are contract, labels are not. `"random-forest"`, `"xgboost"`,
`"combined"`, `"single"`, `"comparison"` and the four topic slugs are what a
backend receives; change a label freely, change an id and you have made a
contract change.

## The selection reducer

`selectionReducer(state, action)` is the whole model. Three things in it are
load-bearing and not obvious:

**Ids are monotonic, never reused.** `nextId` only ever increases, so removing
`aoi-2` and adding another area gives `aoi-3`. Reusing the id would make React
reconcile a brand new area onto the removed one's row.

**`focus` carries a token, not just bounds.** Clicking an already-selected area
must re-zoom to it. A bounds-only value would compare equal to the previous
one and the map effect would not re-run, so every focus request gets a fresh
`token`.

**The area cap comes from the analysis type, not from an `if`.** `single` has
`maxAreas: 1`, so adding a second area *replaces* the first, which is what
clicking a second point on a map means. `comparison` has `maxAreas: 12` and
appends. Narrowing the cap (comparison to single) keeps the most recently
added area and sets a `notice` naming what was dropped: silent truncation is
the failure that branch exists to prevent.

**The cap is never enforced by disabling a control.** At 12 of 12 the tools
stay enabled and a thirteenth add produces a stated notice. Disabling the
control would hide the reducer's answer instead of giving it.

### The undo

Narrowing the analysis type snapshots the *whole* prior selection into `undo`,
not just the dropped tail, because restoring has to rebuild the original order.
Readmitting the dropped areas after the kept one would silently reorder a
comparison, and the ordinals are what the map badges and the eventual result
table are keyed on. `undoTypeSwitch` restamps every id in build order so the
list reads 1, 2, 3 as the analyst built it.

`undo` is cleared by every other action. An undo still on offer after the user
has gone on to add or remove an area would discard that newer work when
pressed. `undoRestoreCount(state)` is what the button label uses, so it reads
"Restore 4 areas" rather than "Undo".

### Sources

`AoiSource` is `point | drawn | shapefile | coordinate`. `coordinate` is its
own source and not filed under `point`: a typed coordinate with a radius is a
real polygon with a real area, and calling it a point would put a point badge
next to a 400 km2 figure. `SOURCE_LABEL` in `SelectedAreas.tsx` is a
`Record<AoiSource, string>`, so adding a source is a compile error there rather
than a blank badge.

## The request contract

`buildRequest(topic, state)` returns either a validated `AnalysisRequest` or
every problem at once, so the UI can state one reason the run button is
disabled instead of revealing problems one click at a time.

`SCHEMA_VERSION` is `1.0.0`. Changing the shape of `AnalysisRequest` bumps it,
so a backend can refuse a payload it does not understand rather than guess.

There is deliberately no model backend in this repo yet. `buildRequest` assembles
and validates the request; nothing here trains or scores anything.

`buildRequest` does not trust its input. The reducer already caps the
selection, but the validator re-checks the count anyway: it is the second line
of defence and is what a backend would run on the same payload.

## URL state

`url-state.ts` puts the analysis type and the model in the query string, so
`/topics/drought-monitoring?type=comparison&model=combined` is bookmarkable and
a repeat user starts two decisions ahead.

Areas are deliberately excluded. A drawn polygon is kilobytes of coordinates,
which would blow past URL length limits and make the link unreadable. It also
gives a shared link the right meaning: "my configuration, your areas".

Unrecognised values are dropped rather than rejected, so a stale bookmark from
before a rename still opens the page on the defaults. Defaults are omitted when
writing, so a fresh page keeps a clean URL.

## Tests

```
npm test                 # the whole gate lane
npx vitest run lib/analysis
```

Gate lane only: deterministic, node environment, no DOM, budgeted under 2s for
the whole suite. Browser behaviour belongs in the Playwright journey eval, not
here.
