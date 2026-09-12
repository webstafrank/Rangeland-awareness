# components

The UI. Every rule lives in `lib/`; these files render its state and dispatch
its actions. If you find yourself writing an `if` about area caps or analysis
types here, it belongs in `lib/analysis/selection.ts` instead.

## The SSR boundary

Leaflet reads `window` at module scope, so it can never be part of a server
render. Exactly one file crosses that boundary:

```
app/topics/[topic]/page.tsx   server component, no Leaflet in its module graph
  -> TopicWorkbench.tsx       "use client", owns the reducer
       -> MapPanel.tsx        "use client", dynamic(AoiMap, { ssr: false })
            -> AoiMap.tsx     Leaflet lives here and nowhere above it
```

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

| File | What it owns |
| --- | --- |
| `TopicWorkbench.tsx` | The reducer, the four bands, URL sync, the submitted request. |
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

`map-size-store.ts` exists because the obvious version is wrong twice.
`TopicWorkbench` is server-rendered, so reading `sessionStorage` during the
first client render produces HTML that differs from the server's, which is a
hydration mismatch; and reading it in an effect and calling `setState` forces a
second render on every mount. `useSyncExternalStore` with a server snapshot is
the shape that avoids both.

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
| `--spacing-gutter`, `--spacing-gutter-lg` | `px-gutter`, `lg:px-gutter-lg` | The page gutter. |
| `--shadow-lifted` | `shadow-lifted` | The sticky action bar, which casts upward. |

Two custom utilities are defined with `@utility`, both because a repeated
decision is a decision and should be named once:

| Utility | Replaces |
| --- | --- |
| `eyebrow` | The section-label style, which was the same four classes copied across six files. |
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

The topic page is four bands down a scrolling page, not a locked full-height
split with every control in one rail:

1. Topic header: what this topic answers and returns.
2. Scope and Model side by side across the full width.
3. Select areas: the three input methods as equal panels in a row, then the map
   beside the running list.
4. A sticky action bar with the request receipt and the run button.

The split follows how the page is used. Analysis type and model are chosen once
and then ignored, so they get a wide band and get out of the way; area selection
is iterative, so the tall space is reserved for the map. The earlier build put
all eight controls in one 380px column, which made the interactive part the most
cramped thing on the page.

`RunAction` and `RequestResult` are separate components because the button
belongs in the sticky bar and the payload belongs in the page. One component
rendered in both places would mean two buttons and two copies of every id, which
is exactly the strict-mode failure the eval caught.

### The map takes its colour from the theme

Leaflet paints SVG through JS options, not class names, so it needs a real
colour string and cannot take a Tailwind utility. `AoiMap.tsx` therefore reads
`--color-accent` off the document with `getComputedStyle` rather than carrying
its own hex values. Four hardcoded teals used to live there, close to the accent
but not equal to it, which made the "no second palette" claim in this file false.

The read happens once per mount, memoised, because computing a style forces a
recalculation and a comparison can hold twelve areas.

## Accessibility commitments

These are asserted by `evals/journey.spec.ts`, so breaking one fails the eval
rather than quietly shipping:

- Every radio group has an accessible name; every radio has a label.
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
