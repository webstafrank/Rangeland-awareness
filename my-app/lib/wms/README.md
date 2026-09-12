# lib/wms

WMS overlays for the results map. Pure logic here; the two Leaflet adapters are
`components/map/WmsLayers.tsx` (the tile layers) and
`components/map/WmsLayerControl.tsx` (toggles, opacity, legend, coverage notice).

Everything in this directory is a pure function over its arguments, so the parts
that are easy to get wrong — extent parsing, coverage, TIME formatting, URL
construction — are gate-tested in node without a browser or a network.

## Pointing this at a KSA GeoServer

This is the reason the module is shaped the way it is. Swapping servers is
configuration plus a registry entry, never a code change.

**1. Set the environment.** In `.env.local`:

```bash
NEXT_PUBLIC_WMS_SOURCE=ksa            # picks the entry in SOURCES
NEXT_PUBLIC_WMS_ENDPOINT=https://geoserver.ksa.go.ke/geoserver/rangeland/wms
```

`NEXT_PUBLIC_WMS_SOURCE` selects an entry from `SOURCES` in `source.ts`;
`NEXT_PUBLIC_WMS_ENDPOINT` overrides that entry's URL. Both are optional and the
app renders with neither set, on the built-in GIBS default. An endpoint that is
not a valid absolute http(s) URL is refused with a stated reason and the built-in
endpoint is kept — a typo degrades to the default rather than to a blank map.
They must be `NEXT_PUBLIC_` prefixed: the layer control is a client component.

**2. Find the real layer names.** Never guess one. Ask the server:

```bash
curl -s "https://geoserver.ksa.go.ke/geoserver/rangeland/wms?SERVICE=WMS&REQUEST=GetCapabilities&VERSION=1.3.0" \
  | grep -o '<Name>[^<]*</Name>' | sort -u
```

**3. Add a registry entry** to `layers.ts`, one per layer, and list it in the
`KSA_GEOSERVER` source's `layers`. The shape is `WmsLayerSpec` in `types.ts`:

```ts
{
  id: "rangeland-condition",              // ours, stable, used in UI state
  layerName: "rangeland:condition_2024",  // theirs, the WMS LAYERS parameter
  title: "Rangeland condition",
  description: "One sentence an analyst reads to know what they are looking at.",
  topics: ["rangeland-dynamics"],         // which topic pages offer it
  attribution: "Kenya Space Agency",
  legendUrl: "...",                       // omit if none is published
  timeDimension: true,
  timeExtent: "2020-01-01/2025-12-01/P1M",   // copy from GetCapabilities
  timeDefault: "2025-12-01",
  verifiedOn: "2026-09-09",
}
```

**4. Re-run the tests.** `npx vitest run lib/wms`. The registry tests assert every
topic still offers at least one layer and that no layer claims a topic that does
not exist, so an entry with a typo in `topics` fails the gate.

## The coverage problem, and why it gets its own module

**An out-of-extent WMS request does not fail. It returns HTTP 200 with an empty
PNG.** Measured against GIBS on 2026-09-09, same bbox over Kenya:

| request | result |
| --- | --- |
| `MODIS_Terra_NDVI_8Day` at `TIME=2024-06-01` | 200, **1364 bytes, blank** |
| `MODIS_Terra_NDVI_8Day` at `TIME=2025-03-01` | 200, 328106 bytes, real |

There is no status code to check and Leaflet's `tileerror` never fires. A layer
whose extent misses the analyst's date window renders as nothing at all, and it
looks like a bug in this app rather than a gap in the archive.

So coverage is answered before the request is made, from data:

- `parseTimeDimension` reads a capabilities `<Dimension name="time">` string,
  including the comma-separated multi-interval form with real gaps in it.
- `coversDate` answers whether an extent contains a day.
- `nearestCoveredDate` gives the closest day it does cover, which is what the UI
  offers the analyst instead of a blank square.
- `resolveLayerTime` combines the run's window with a layer's extent into one of
  a few named outcomes, and `describeLayerTime` turns that into a sentence.

`MODIS_Terra_NDVI_8Day` is the layer to think with: GIBS keeps roughly the last
19 months, so its start date moves **forward** over time. It is the only layer
here whose coverage shrinks from the past.

## Extents are a snapshot, and they go stale

`timeExtent` in the registry is copied from GetCapabilities and stamped with
`verifiedOn`. That is a cache, not the truth. For a rolling archive it drifts out
of date on its own: NDVI's start date advances every day, so an entry verified
today will over-claim coverage in a few months and the app will promise a layer
the server no longer has.

`capabilities.ts` parses a live GetCapabilities document into the same shape, so
the honest arrangement is registry-as-fallback and live-as-authoritative. Wiring
that refresh is not done. Until it is, re-run the verification in step 2 when a
layer starts rendering blank, and update `timeExtent` and `verifiedOn` together.

## Layers currently shipped

All eight verified present in GIBS GetCapabilities on 2026-09-09, and the three
legend URLs verified to return real PNGs on the same day.

| id | WMS layer | resolution |
| --- | --- | --- |
| `ndvi-8day` | `MODIS_Terra_NDVI_8Day` | P1D, rolling ~19 months |
| `evi-16day` | `MODIS_Terra_L3_EVI_16Day` | P16D from 2000 |
| `lst-day-terra` | `MODIS_Terra_L3_Land_Surface_Temp_Monthly_Day` | P1M from 2000-03 |
| `lst-day-aqua` | `MODIS_Aqua_L3_Land_Surface_Temp_Monthly_Day` | P1M from 2002-07 |
| `precipitation` | `IMERG_Precipitation_Rate` | P1D from 2000-06, gapped |
| `flood-2day` | `MODIS_Combined_Flood_2-Day` | P1D, sparse |
| `soil-moisture` | `SMAP_L4_Analyzed_Root_Zone_Soil_Moisture` | P1D from 2015-03 |
| `land-cover` | `MODIS_Combined_L3_IGBP_Land_Cover_Type_Annual` | P1Y, 2001..2024 |

GIBS needs no key and no account. A KSA GeoServer behind authentication would
need more than an endpoint swap: browser tile requests carry no Authorization
header, so it would have to be same-origin, cookie-authenticated, or proxied
through a route handler in this app. None of that is built.
