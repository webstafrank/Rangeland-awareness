# Rangeland Awareness

Earth observation analysis for Kenya's rangelands. An analyst picks a topic,
selects one area or several to compare, chooses a model, and runs it.

Four topics: flood risk, drought monitoring, rangeland dynamics, food security
assessment. Three models: Random Forest, XGBoost, Combined.

## Status

The pages and the analysis contract are built. **There is no model backend
yet.** Running an analysis validates the request and shows the exact
`AnalysisRequest` payload a future service will receive. Nothing is trained or
scored.

## Run it

```bash
npm install
npm run dev          # http://localhost:3000
```

## Checks

Two lanes, different budgets.

```bash
npm test             # gate lane: 193 tests, node, deterministic, ~0.7s
npm run typecheck    # tsc --noEmit
npm run lint         # eslint
npm run eval         # eval lane: Playwright, real browser, builds first
npm run eval:desktop # just the desktop project
```

**Gate lane** (`vitest`, `lib/**/__tests__`) is pure functions only: no DOM, no
browser, budgeted under 2 seconds so it can run on every commit. Install the
hook with:

```bash
git config core.hooksPath scripts
```

**Eval lane** (`playwright`, `evals/`) drives a real browser at 1280px and
360px: 59 journey checks and 36 theme checks. It proves the things the gate
lane structurally cannot: that all four area-selection methods work, that a
selection moves the map viewport, that a corrupt upload fails fast instead of
freezing the tab, that every control has an accessible name, that the light
theme holds under a dark OS preference, and that the journey fits its budget. It uses the system Chrome
(`channel: "chrome"`), so no browser download is needed, and picks a port from
the session id so two sessions do not collide.

Every locator in `evals/journey.spec.ts` is a role or an accessible name, never
a CSS class, so the file doubles as the DOM contract: it fails if a control
loses its label, which is the same thing that would break a screen reader.

The eval prints the journey budget it measured:

```
JOURNEY BUDGET: 6 clicks, 1507ms elapsed
```

## Layout

```
app/                      routes only, no business logic
  page.tsx                homepage, server component, four topic cards
  topics/[topic]/         the workbench route, server component
  layout.tsx              shell, header, footer, skip link
  globals.css             design tokens and the Leaflet chrome overrides
components/               UI. See components/README.md
  map/                    everything that touches Leaflet
  topic/                  the request rail
lib/
  analysis/               topics, models, the AOI state machine, the request
                          contract. See lib/analysis/README.md
  geo/                    bounds, area, shapefile, zip pre-flight.
                          See lib/geo/README.md
evals/                    the Playwright journey eval
scripts/pre-commit        the gate lane hook
```

`lib/` holds every rule and imports nothing from `app/` or `components/`. It is
pure and node-testable, which is why the area cap, the analysis-type
transition, the zoom trigger and request validation are all provable without a
browser. `app/` and `components/` are adapters over it.

## Decisions worth knowing

**One registry drives everything.** Adding a topic to `lib/analysis/topics.ts`
adds a homepage card and a working prerendered route with no other edit. A test
fails if the slug list and the topic list ever drift apart.

**`typedRoutes` is on**, so a link to a route that does not exist is a build
error rather than a 404 found in production.

**There is a ZIP pre-flight before shpjs ever sees a byte.** Not defensive
programming for its own sake: a buffer starting with `PK` that has no valid
central directory makes shpjs spin *synchronously* forever, which on the main
thread is a frozen tab that no `try/catch` or timeout can rescue. Every other
malformed input tried rejects in about a millisecond. The measurements and the
reasoning are in `lib/geo/README.md`, and a test fails, rather than times out,
if the pre-flight is removed.

**`@turf/turf` was installed and then removed.** One function was needed
(polygon area) and turf costs roughly 500KB in a client bundle for it.
`lib/geo/area.ts` is the same spherical-excess formula, checked against the
independent closed-form area of a lat/lng cell.

**One light theme, committed to.** There are no `prefers-color-scheme` blocks
anywhere, so every colour has exactly one definition and cannot be legible in
one theme and invisible in the other. `color-scheme: light` on the root is
load-bearing: without it a visitor whose OS is dark gets dark native form
controls, dark scrollbars and a dark autofill highlight painted through a light
page, which no CSS on our own elements can fix. `evals/theme.spec.ts` runs every
check twice, under a light and a dark OS preference, and asserts the same light
result both times, plus that no `prefers-color-scheme` rule ships in the parsed
stylesheets.

**The topic route is server-rendered on demand, not prerendered.** It reads a
search param, and outside partial prerendering you cannot read one and keep a
static shell. The trade is deliberate: a correct 404 status, no flash of default
choices, and the query validated on the server before first paint, against
CDN-cacheable HTML for four pages that render in single-digit milliseconds. The
reasoning is in `app/topics/[topic]/page.tsx`.

**Type and model live in the URL**, areas do not.
`/topics/drought-monitoring?type=comparison&model=combined` is bookmarkable, so
a repeat user starts two decisions ahead. Areas are excluded deliberately: a
drawn polygon is kilobytes, and it gives a shared link the right meaning, "my
configuration, your areas".

## Known gaps

**County search is not built, and needs a decision.** The fastest possible way
to select an area is to type a county name and get its real boundary. That
needs an authoritative Kenya county boundary dataset, and which one to use is a
call for KSA to make, not something to guess at: shipping approximate
government boundaries in a government tool is worse than shipping none. The
coordinate-entry path covers the keyboard requirement in the meantime. Once a
source and its licence are settled, the component slots in beside
`CoordinateEntry.tsx` and reuses the `coordinate` selection path.

**No model backend.** See Status above.
