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
| `TopicWorkbench.tsx` | The reducer, the layout, URL sync. |
| `RadioCards.tsx` | A labelled `role="radiogroup"` of native radios. |
| `CoordinateEntry.tsx` | The keyboard path to an area: type or paste a coordinate. |
| `ShapefileUpload.tsx` | File picking, drag and drop, and every upload failure message. |
| `SelectedAreas.tsx` | The running list, each row removable and clickable to re-centre. |
| `SelectionNotice.tsx` | The banner for a selection change, with the undo. |
| `RequestReceipt.tsx` | One line restating the whole request. |
| `RunPanel.tsx` | The run button, its blocking reason, and the emitted payload. |
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

### Units

`svh`, not `dvh` or `vh`, for every mobile height. On iOS the URL bar collapses
as the page scrolls; `dvh` changes with it and resizes the map container
mid-gesture, so Leaflet needs an `invalidateSize` and a half-drawn polygon's
vertices shift under the finger. `svh` is the small stable viewport and holds
one height for the session.

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
