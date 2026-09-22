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

## Added for the run wiring and the deploy unit

Written on 2026-09-22, **before** any of the running screen, the results page or
the deploy unit was built, and frozen at that point. The task was: the app has a
Django backend that can actually run a weighted overlay, and no page that starts
one, watches it, or shows what came back. These are the criteria that work is
judged against, and the critic sub-agents see this file and the deliverable,
never the builder's reasoning.

### Reference points for these screens

Named before building, judged side by side, not copied:

4. **Vercel's deployment view** for the running screen: a stage list that is
   there from the first frame, each stage carrying its own state, the failing
   stage named in place rather than in a toast, and a log detail per stage.
5. **GitHub Actions' job view** for the same: skipped steps shown as skipped
   rather than dropped, so the list never reflows mid-run.
6. **Copernicus GloFAS and the FEWS NET IPC map pages** for the results screen:
   a classified map beside the class table that defines it, the breaks stated
   numerically, and the method named on the page rather than in a footnote.

### Measurable outcome for this round

From a completed review step, an analyst reaches a finished, classified result
in one click and never sees a screen that cannot say what it is doing. Traced
by: the run eval drives review → running → results against a stubbed backend and
asserts the stage list is present before the first poll returns, that progress
never decreases across polls, and that the class shares sum to 1.0 ± 0.001 on
the rendered table.

### Running screen

| ID | Criterion |
| --- | --- |
| R1 | The stage list renders before the first poll answers, from the POST response, so the screen is never an undifferentiated spinner. |
| R2 | Progress is monotonic on screen. A poll reporting a lower number than the one shown does not move the bar backwards. |
| R3 | Stage states are all five: pending, running, done, skipped, failed. A skipped stage is shown as skipped, never dropped, and the list does not reflow. |
| R4 | A failed run names the stage that failed and its message, on the page, with a way back to review. |
| R5 | Polling honours `Retry-After` and stops on a terminal status. It never polls a finished run, and it stops when the tab is hidden. |
| R6 | A backend that is unreachable is distinguished from a run that failed, in the user-facing copy. |
| R7 | `?run=` is enough: reloading mid-run resumes watching the same run rather than starting a second one. |
| R8 | A cached run (HTTP 200, `cached: true`) goes straight to its result without re-running it. |
| R9 | Announced to a screen reader: the live region reports the current stage, not every poll. |
| R10 | Works at 360px with no horizontal scroll, like every other screen. |

### Results screen

| ID | Criterion |
| --- | --- |
| S1 | A real run renders from the run result alone, server-side. A shared link opens the same result in a cold browser with no session storage. |
| S2 | The class table shows every class with its label, pixel count, area in km² and share, and the shares sum to 1.0 ± 0.001. |
| S3 | The Jenks breaks are stated as numbers, and the page says they were computed from this run's own distribution. |
| S4 | Per-criterion contribution is rendered and labelled as `mean(risk) × weight`, normalised, with the sentence that it is not feature importance and not a sensitivity analysis. |
| S5 | The method is named on the page: weighted overlay, not a model. No AUC, no R², no training samples anywhere. |
| S6 | Every download carries the run id, the configuration and the method note, and no export can be mistaken for model output. |
| S7 | A topic with no method behind it says so and offers the request receipt, rather than rendering an empty result. |
| S8 | A run id that does not exist, or one whose result is not ready, is distinguished from a wrong URL: 409 is "not finished", 404 is "no such run". |
| S9 | The existing request-receipt path still works unchanged when there is no backend, and says which of the two it is showing. |
| S10 | Works at 360px with no horizontal scroll. |

### The deploy unit

| ID | Criterion |
| --- | --- |
| D1 | `docker compose up` from a clean clone brings up both services, and the app answers on its port with the backend reachable from it. |
| D2 | Each service has a healthcheck the orchestrator can read, and the app's depends on the backend being healthy, not merely started. |
| D3 | No secret is baked into an image or committed. `.env.example` names every variable, and the compose file reads them from the environment. |
| D4 | The app image runs as a non-root user and ships only the standalone output, not the source tree or `node_modules`. |
| D5 | The backend image carries GDAL. `import osgeo.gdal` and `manage.py test` both pass inside it. |
| D6 | Production defaults are safe: `DJANGO_DEBUG=0`, a real `DJANGO_SECRET_KEY` required, `ALLOWED_HOSTS` and `CORS_ALLOWED_ORIGINS` set explicitly rather than `*`. |
| D7 | CI runs the gate lane and the Django suite on every push, and fails the build on either. |
| D8 | The deployment is documented start to finish, and a reader who has never seen the repo can follow it without asking a question. |
