# Acceptance rubric

Frozen before any of this app was built, and used to judge every round since.
It is the reference the design critique scores against and the checklist the
Playwright evals in `evals/` implement.

This file lives in the repo rather than in a scratch directory. The first
version sat in `/tmp` and was deleted by a session cleanup, which is a poor
property for something called frozen. A rubric that can vanish cannot hold
anyone to anything.

Changing a line here is a deliberate act. Note what changed and why, so a later
reader can tell a raised bar from a lowered one.

## Measurable outcome

An analyst goes from a cold homepage to a fully specified, validated analysis
request (topic, analysis type, at least one area of interest, model) in under
60 seconds and under 6 clicks, with no page reloads and no dead ends.

Traced by: the journey eval prints the clicks and elapsed milliseconds it
measured and asserts both budgets. Look for `JOURNEY BUDGET` in the output.

## Reference points

Judged side by side against the best existing tools of this kind:

1. Climate Engine (climateengine.org). The closest structural match: pick a
   variable, pick a region by draw, upload or click, pick processing, run.
2. FEWS NET Early Warning Explorer. Topic-led entry into geospatial food
   security data.
3. GloFAS / Copernicus Global Flood Awareness viewer. Flood-risk map
   interaction.

## Homepage

| ID | Criterion |
| --- | --- |
| H1 | Names the app and states in one sentence what it does, above the fold. |
| H2 | All four topics reachable from the homepage as distinct cards or links. |
| H3 | Each topic card says what the topic answers, not just its name. |
| H4 | Tab reaches every topic link, Enter activates, focus ring visible. |
| H5 | Works at 360px wide with no horizontal scroll. |
| H6 | Legible throughout; no hardcoded colour that breaks the theme. |

## Topic page

| ID | Criterion |
| --- | --- |
| T1 | Reached at a real URL per topic: deep-linkable, shareable, survives reload. |
| T2 | Analysis type selectable, and the choice visibly changes what the page permits. Single caps at one area. |
| T3 | Model selectable from Random Forest, XGBoost and Combined. Exactly one active. |
| T4 | Four ways to select an area, all working: click a point, draw a polygon or box, type a coordinate, upload a shapefile. |
| T5 | Selecting or uploading an area zooms the map to its bounds. The single most-cited requirement; a selection that does not move the viewport is a failure. |
| T6 | A running summary lists every selected area, each individually removable. |
| T7 | Switching from multiple to single with 2 or more areas selected does not silently corrupt state or discard data without telling the user. |
| T8 | Run is disabled with a stated reason until the request is complete, and on click emits a validated request object. |
| T9 | A bad shapefile or coordinate produces a readable error and leaves prior selections intact. No unhandled rejection. |
| T10 | No SSR crash. Leaflet touches `window`, so the map is client-only and the route renders on the server without throwing. |
| T11 | Every control labelled, and the flow completable without ever touching the map. |
| T12 | At 360px the map and the controls are both usable, with no horizontal scroll. |

## Code quality

| ID | Criterion |
| --- | --- |
| C1 | `npm run build`, `npx tsc --noEmit` and `npm run lint` all clean. |
| C2 | Topics, models and analysis types come from one typed registry, never duplicated string literals across pages. |
| C3 | Gate tests exist, are deterministic, run under 2 seconds, and cover the registry, the AOI reducer, shapefile normalization, bounds and area maths, coordinate parsing, and request validation. A test that only asserts "renders" does not count. |
| C4 | An unknown topic slug returns a real 404 status with a page that offers a way out. |

## Automatic failures

- Any of the four area-selection methods not working when driven by a real browser.
- T5 not observable: the map viewport unchanged after a selection.
- A console error or unhandled rejection during the happy path.
- A design critique verdict of "pretty good" or "acceptable". A critique names
  a winner and says why, or it has not been done.

## Added after the first round

These came from the user directly and are held to the same standard:

| ID | Criterion |
| --- | --- |
| U1 | One light theme, committed to. No `prefers-color-scheme` rule ships, and `color-scheme: light` is declared so native controls match. |
| U2 | Content spread across the page rather than crammed into one narrow column. |
| U3 | Reads as professional: a government analyst tool, not a template. |
| U4 | Styling expressed through the Tailwind theme. Design decisions are named tokens, not arbitrary values repeated across class strings. |
