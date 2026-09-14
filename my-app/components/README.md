# components

The UI. Every rule lives in `lib/`; these files render its state and dispatch
its actions. If you find yourself writing an `if` about area caps or analysis
types here, it belongs in `lib/analysis/selection.ts` instead.

## The SSR boundary

Leaflet reads `window` at module scope, so it can never be part of a server
render. Exactly one file crosses that boundary:

```
app/topics/[topic]/areas/page.tsx   server component, no Leaflet in its graph
  -> AreasStep.tsx                  "use client", reads the shared store
       -> MapPanel.tsx              "use client", dynamic(AoiMap, {ssr:false})
            -> AoiMap.tsx           Leaflet lives here and nowhere above it
```

Only the areas step is on that path. The other three step routes never reach
Leaflet at all, which is a second benefit of the split worth naming: three of
the four screens no longer ship or parse a mapping library they never render.

`ssr: false` is only legal inside a client component, which is the whole reason
`MapPanel.tsx` exists as its own module rather than the route importing
`AoiMap` directly. Anything that imports Leaflet, geoman, or their CSS goes
under `map/` and is reached only through `MapPanel`.

## map/

| File | What it owns |
| --- | --- |
| `MapPanel.tsx` | The ssr:false boundary and the loading placeholder. |
| `AoiMap.tsx` | The Leaflet map: basemaps, click-to-select, geoman drawing, fly-to-focus, the view readout. |
| `tools.ts` | Tool ids, labels, hints and the initial Kenya bounds. Plain module, so a server component can import the type. |

Three things in `AoiMap.tsx` are not obvious:

**The test id is on `MapPanel`'s wrapper, not on `MapContainer`.** react-leaflet
destructures only `className`, `id` and `style` off `MapContainer` and forwards
everything else to Leaflet as *map options*, so a `data-*` attribute put there
is silently swallowed and never reaches the DOM. This cost a full eval run to
find.

**Drawn layers are read then removed.** Selected areas render from props like
every other area, so leaving geoman's own layer on the map would draw each
shape twice and let the user drag a copy the reducer knows nothing about.

**Points render as `circleMarker`, not `Marker`.** Leaflet's default marker
icon resolves its image URLs relative to the CSS file, which breaks under every
bundler. A circle sidesteps the problem and themes correctly.

## topic/

The flow is four routes, one decision each. `lib/analysis/steps.ts` is the one
description of that sequence; nothing here hardcodes a step order or a URL.

| File | What it owns |
| --- | --- |
| `useWizard.ts` | The hook every step uses: the shared state, the dispatch, the validation, the query string to thread into links. |
| `StepShell.tsx` | The frame every step renders inside: the rail, the heading, and the sticky footer carrying the receipt and the movement. |
| `StepRail.tsx` | The four steps as an `<ol>` of links, with the current one marked `aria-current="step"`. |
| `ScopeStep.tsx` | Step 1: the analysis type, which carries the area cap. |
| `ModelStep.tsx` | Step 2: the model, on its trade-off. |
| `AreasStep.tsx` | Step 3: the three input methods, the map, the running list. |
| `ReviewStep.tsx` | Step 4: every decision restated, then Run. |
| `RadioCards.tsx` | A labelled `role="radiogroup"` of native radios. |
| `CoordinateEntry.tsx` | The keyboard path to an area: type or paste a coordinate. |
| `ShapefileUpload.tsx` | File picking, drag and drop, and every upload failure message. |
| `SelectedAreas.tsx` | The running list, each row removable and clickable to re-centre. |
| `SelectionNotice.tsx` | The banner for a selection change, with the undo. |
| `RequestReceipt.tsx` | One line restating the whole request. |
| `RunAction.tsx` | The run button and the one reason it is disabled. |
| `RequestResult.tsx` | The validated payload a run produced. |
| `MapSizeStepper.tsx`, `map-size.ts`, `map-size-store.ts` | The mobile map height. |

### Why the radios are shaped the way they are

Native `input[type=radio]` inside an explicit `role="radiogroup"`, never a div
of buttons with `aria-checked`. The browser gives arrow-key navigation, roving
focus and "2 of 3" announcements for free; a button group has to reimplement
all three and usually gets the roving tabindex wrong. `fieldset` is not used
because it maps to `role="group"`, not `radiogroup`, so the choice would not be
announced as single-select.

The input is transparent and stretched over the whole card so it is the real
click target. It is deliberately **not** collapsed to `0x0`: a zero-size
control cannot be clicked by a pointer at all, and automated drivers refuse it.
That also cost an eval run.

### Why the map height uses an external store

`map-size-store.ts` exists because the obvious version is wrong twice. The
areas step is server-rendered, so reading `sessionStorage` during the first
client render produces HTML that differs from the server's, which is a
hydration mismatch; and reading it in an effect and calling `setState` forces a
second render on every mount. `useSyncExternalStore` with a server snapshot is
the shape that avoids both.

`lib/analysis/selection-store.ts` is the same shape one level up, for the same
reason plus one more. React state inside a step dies when that step unmounts,
and every Continue unmounts one, so the selection has to live outside the tree.
Three shapes were considered and two rejected:

| Shape | Why not |
| --- | --- |
| Context in `app/topics/[topic]/layout.tsx` | Survives sibling navigation, but a layout cannot read `searchParams`, so a bookmarked configuration could only be applied in an effect: a flash of the defaults on every shared link. |
| Everything in the URL | A drawn polygon is kilobytes of coordinates. It does not fit and it makes a shared link unreadable. |
| An external store | What ships. The server snapshot comes from the step route's `searchParams`, so hydration matches; the client snapshot adds whatever `sessionStorage` held. |

The store runs the same pure reducer the single page used, so every rule about
area caps, the comparison-to-single transition and the undo offer is unchanged
and still gate-tested in `lib/analysis/__tests__/selection.test.ts`. What is new
is subscription, persistence, and the URL seed, and the pure half of that is
tested in `selection-store.test.ts`.

### Design tokens

Everything lives in one `@theme` block in `app/globals.css`. Tailwind v4 emits
each token as a custom property on `:root` **and** generates the matching
utilities, so `--color-surface` is both `var(--color-surface)` for the Leaflet
rules and `bg-surface` / `text-surface` / `border-surface` in markup. One
declaration, two uses.

An earlier version declared every value twice: a `:root` block of raw variables
plus an `@theme inline` block re-mapping each one. That shape is only needed
when a token's value changes at runtime, which is what a second theme would
require. With one light theme it bought nothing and cost about sixty lines that
could drift apart.

Three tokens are not colours and are worth knowing about, because they replace
values that were repeated across twelve class strings:

| Token | Utility | What it is |
| --- | --- | --- |
| `--container-band` | `max-w-band` | The content ceiling every band agrees on. |
| `--container-step` | `max-w-step` | One step's reading width. Narrower than the band, because a decision is a column. |
| `--spacing-gutter`, `--spacing-gutter-lg` | `px-gutter`, `lg:px-gutter-lg` | The page gutter. |
| `--shadow-lifted` | `shadow-lifted` | The sticky action bar, which casts upward. |

Two custom utilities are defined with `@utility`, both because a repeated
decision is a decision and should be named once:

| Utility | Replaces |
| --- | --- |
| `eyebrow` | The section-label style, which was the same four classes copied across six files. |
| `band-chrome` | The header, footer and hero ground. On the CHROME tokens, unlike `band-navy`, which belongs to `design/tokens.ts` and is asserted against it. Borrowing a data-viz colour that happens to look similar today is how two namespaces become one. |
| `rule-action` | The 3px red-and-navy strip under the header and above the footer. |
| `z-map-overlay`, `z-action-bar`, `z-header`, `z-skip-link` | Loose z-index numbers. These four have to agree or the page breaks visibly and the diff looks innocent: the action bar covering the header, the map readout over Leaflet's zoom controls, the skip link behind the header it exists to skip. Leaflet's panes occupy 200 to 700 and its controls sit at 800, which is why the app's chrome starts above that instead of at Tailwind's default `z-50`. |

Tailwind tree-shakes theme tokens that no utility uses, so a token added here
and never referenced simply will not appear in the built CSS. If you add one,
use it or drop it.

Raw CSS survives in `globals.css` for exactly one reason: the Leaflet overrides
target third-party class names on elements Leaflet creates itself, so there is
no markup to hang a utility on. They consume the same tokens, so there is no
second palette hiding down there.

### Units

`svh`, not `dvh` or `vh`, for every mobile height. On iOS the URL bar collapses
as the page scrolls; `dvh` changes with it and resizes the map container
mid-gesture, so Leaflet needs an `invalidateSize` and a half-drawn polygon's
vertices shift under the finger. `svh` is the small stable viewport and holds
one height for the session.

### Layout

Four routes, one decision each, all framed identically by `StepShell`:

```
band-chrome     the topic: breadcrumb, glyph, name, question   (the layout)
white strip     the rail: four steps, current in red           (StepShell)
page ground     the step's own question and its controls       (the step)
sticky footer   the receipt, Back, and the one red control     (StepShell)
```

Three things about that frame are decisions rather than defaults.

**The furniture does not move between steps.** What makes a split flow feel
like one flow is that the rail, the heading position and the footer sit in the
same place on all four screens. That is why the frame is one component and a
step supplies only its content.

**The receipt is on every step, not just the last.** It matters more now than
it did on the single page: an analyst can no longer scroll up to check which
model they picked, because the model is on another URL.

**The furniture is on a budget, and the budget is measured.** The header, the
topic band, the rail and the sticky bar are the four things that repeat on
every step, so every pixel they take is taken four times. Measured before and
after the fit pass:

| | desktop chrome | phone chrome | scope step @1280x900 | areas map |
| --- | --- | --- | --- | --- |
| first cut | 385px | 522px | 978px, scrolls | fixed 620px |
| now | 266px | 303px | 900px, no scroll | 360-620px, from the viewport |

What moved: the topic band went from three rows (breadcrumb, name, question) to
one; the rail fits four labelled steps in a single row at 360px; the spacer
above the sticky bar is sized to the bar instead of to 112px; and the step
heading dropped one size. Nothing was removed from any screen. `evals/journey.spec.ts`
has a `fits the screen` block that fails if the chrome grows past 300px on
desktop or 360px on a phone, or if the scope and model steps ever need
scrolling on a 900px viewport.

**The areas step puts its tools beside the map, not above it.** In a row across
the top, that step was 1737px tall — 969px of scrolling on a 1366x768 laptop —
and the map was never on screen at the same time as the controls that drive it,
so every selection moved a viewport the analyst could not see. On `lg` and up
the three methods and the running list stack in a 340px column, the map takes
the rest, and the map is `sticky` so the column scrolls past it. Below `lg`
they stay stacked: a phone has no second column to give.

This is not the arrangement the old single page rejected. That one put eight
controls in a narrow rail, including the scope and the model; those have their
own screens now, so the column holds three panels and a list.

The map's height comes from the viewport (`clamp(360px, 100svh - 320px, 620px)`)
rather than a fixed 620, so it fits the screen it is on. The `sticky` only
works because the grid does **not** set `items-start`: that would size the map
column to the map, leaving it nothing to travel inside.

**Only the CONTENT narrows; the frame never does.** The rail, the heading and
the footer sit at the same x on all four steps, and only the areas step's
content column runs the full band, because a decision has a reading width and a
map does not. The first version applied the width to the whole frame, so the
rail and the run bar slid 230px sideways on every entry to and exit from Areas
— which is exactly the thing the paragraph above says must not happen, and it
was invisible in any single screenshot.

`RunAction` and `RequestResult` are separate components because the button
belongs in the footer and the payload belongs in the page. One component
rendered in both places would mean two buttons and two copies of every id, which
is exactly the strict-mode failure the eval caught.

### Where red is allowed

Red is the forward action: Continue on three steps, Run on the fourth, and the
current step's marker in the rail. It is also the brand mark (the rule under
the header, the dot on the wordmark) and the identity of two of the four
topics, because a four-colour system has no fifth hue to give a topic.

The rule is not "red is rare", it is **red is never a second interactive
colour**. No red secondary button, no red link, nothing red that a navy control
could have been. The first version of the topic cards broke this: on a
red-headed card the "Start analysis" link was also red, so the identity and the
action were the same colour and neither said anything. The link is navy now.

`--color-danger` is a separate, deeper red for the same reason in the other
direction: a failed upload must not be painted in the colour of the button the
reader just pressed. `palette.test.ts` asserts the two stay at least 25 RGB
units apart.

### The map takes its colour from the theme

Leaflet paints SVG through JS options, not class names, so it needs a real
colour string and cannot take a Tailwind utility. `AoiMap.tsx` therefore reads
`--color-accent` off the document with `getComputedStyle` rather than carrying
its own hex values. Four hardcoded teals used to live there, close to the accent
but not equal to it, which made the "no second palette" claim in this file false.

Its fallback, for the instant before the stylesheet loads, comes from
`token("--color-accent")` rather than a literal. The literal that replaced the
teals outlived the move to navy by a commit, because nothing on screen could
show it; `token()` throws on a name that no longer exists, so the same mistake
is now a build failure.

The read happens once per mount, memoised, because computing a style forces a
recalculation and a comparison can hold twelve areas.

## Accessibility commitments

These are asserted by `evals/journey.spec.ts`, so breaking one fails the eval
rather than quietly shipping:

- Every radio group has an accessible name; every radio has a label.
- The step rail is a `<nav><ol>` of links with `aria-current="step"` on the
  current one, and a step that cannot be reached yet says "not yet available"
  in text rather than only being grey.
- Continue refuses as a real disabled `<button>` with its reason printed beside
  it, never as a link that looks enabled and does nothing.
- A step navigation moves focus to the new step's heading (`tabIndex={-1}`), so
  a keyboard user does not restart from the skip link four times. Not on a cold
  load, where taking focus out of the address bar is its own bug.
- The analysis-type radios are wired to `aria-describedby` carrying the
  consequence warning, so the loss is heard before the click, not only seen.
- The upload input has a real `<label>`, so it is reachable and nameable.
- The map publishes its centre and zoom as polite live text, because a screen
  reader user otherwise has no way to know the viewport moved.
- The whole flow completes without touching the map, via coordinate entry or a
  shapefile.
- Errors are `role="alert"`, selection changes are `role="status"`.
- Unselected radio indicators use `--color-ink-faint`, not `--color-edge-strong`.
  The ring is the only thing saying "not selected", so WCAG 1.4.11 treats it as
  a meaningful graphic and wants 3:1. edge-strong is 1.24:1 on white and fails.
