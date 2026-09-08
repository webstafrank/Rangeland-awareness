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
| `selection.ts` | The area-of-interest state machine: add, remove, cap, focus, analysis-type transitions. |
| `request.ts` | The `AnalysisRequest` contract crossing to a future model backend, and its validator. |

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

## The request contract

`buildRequest(topic, state)` returns either a validated `AnalysisRequest` or
every problem at once, so the UI can state one reason the run button is
disabled instead of revealing problems one click at a time.

`SCHEMA_VERSION` is `1.0.0`. Changing the shape of `AnalysisRequest` bumps it,
so a backend can refuse a payload it does not understand rather than guess.

There is deliberately no model backend in this repo yet. `buildRequest` assembles
and validates the request; nothing here trains or scores anything.

## Tests

```
npm test                 # the whole gate lane
npx vitest run lib/analysis
```

Gate lane only: deterministic, node environment, no DOM, budgeted under 2s for
the whole suite. Browser behaviour belongs in the Playwright journey eval, not
here.
