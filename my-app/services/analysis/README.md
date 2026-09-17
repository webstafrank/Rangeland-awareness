# services/analysis

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
| `steps.ts` | The four steps of the flow: their order, their route segments, the href builder, and what unlocks the last one. |
| `selection-store.ts` | The selection shared across the four step routes: persistence, subscription, and the URL seed. The only file here that touches a browser API, and it does so behind pure serialise/parse functions. |

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

Every step link threads the query through (`stepHref` in `steps.ts`), because
the split made "Continue" a navigation: a link that dropped `?type=` would put
the analyst back on the default scope one step later, silently.

## The steps

`steps.ts` is the single description of the flow. Two properties are worth
naming:

**Step one has no segment of its own.** `/topics/flood-risk` IS the scope step,
so a link from the homepage lands on the first decision rather than on a
redirect.

**Reachability is not a route guard.** `furthestReachableStep` is what greys a
rail entry and what disables Continue, but typing `/topics/flood-risk/review`
with nothing selected still renders the review step, with the gap named and Run
disabled for a stated reason. A redirect would discard the address the analyst
typed and explain nothing.

`steps.test.ts` reads `app/topics/[topic]/` off the filesystem and compares it
to this registry in both directions, because the registry and the route tree
are two descriptions of one thing and nothing at runtime checks that they
agree: a renamed segment would otherwise produce links that 404 only when a
human clicks one.

## The shared selection

`selection-store.ts` holds the state the four routes share. It runs this
directory's own reducer, so no rule moved: it adds subscription, `sessionStorage`
persistence and the URL seed, and nothing else.

Four of its decisions are load-bearing:

**Persistence drops the transient fields.** `focus` is a one-shot map
instruction, and replaying it on reload would yank the viewport for no reason.
`notice` and `undo` describe something that just happened, and a notice
restored an hour later is a message about an event the reader has no memory of.

**A payload for a different topic is refused, not migrated.** Areas are chosen
against a question, so carrying them into another topic would silently answer
one the analyst did not ask.

**One broken area rejects the whole payload.** A truncated read that restored
three of five areas would be a comparison quietly answering a different
question, which is worse than starting clean.

**Restored ids continue from the highest suffix, not from the count.** Ids are
monotonic and never reused, so removing the first of three leaves a gap:
`areas.length + 1` lands back inside the range in use, the next area gets an id
an existing one already has, and pressing Remove on either row deletes both.
React logs nothing, because the duplicate keys are in the reducer's array
rather than in one render's children. `selection-store.dom.test.ts` restores a
gapped set and asserts both halves.

**One storage key per topic.** A single key made the four topics take turns:
opening a second topic and touching any control overwrote the first topic's
areas, permanently and silently, and drawn polygons cannot be re-derived.

**The URL wins over storage, through the reducer.** A shared link means "my
configuration, your areas", so the sender's type and model override a session
already in progress. Narrowing the scope that way goes through
`setAnalysisType` rather than being assigned, so a link to `?type=single`
arriving at a five-area selection drops four areas *with* the notice and the
undo, exactly as clicking the radio would. Assigning the field directly is the
silent-truncation bug this directory exists to prevent, one layer up.

## Tests

```
npm test                 # the whole gate lane
npx vitest run services/analysis
```

Node lane by default: deterministic, no DOM, no globals, budgeted under 2s.

One exception, and it is marked in the filename. `selection-store.dom.test.ts`
runs in the **dom** lane, because the stateful half of the store needs a real
`sessionStorage` and a module registry it can reset between tests. That half is
where the store's first two bugs lived — a shared storage key and a colliding
`nextId` — and neither was reachable from a pure test, so "the pure half is
tested" was not good enough. The `.dom.` infix is the opt-in; `vitest.config.mts`
routes it and excludes it from the node lane, which shares one worker between
files and would carry a storage global into the pure suites beside it.

Browser behaviour still belongs in the Playwright journey eval, not here.
