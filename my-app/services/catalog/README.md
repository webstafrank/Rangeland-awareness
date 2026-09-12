# services/catalog

The study catalogue. It answers three questions and nothing else:

1. What can this app study? (four topics)
2. What number does each topic report, and how is that number read? (one
   indicator per topic, with its bands, units and precision)
3. Which models can compute it? (two, both available to every topic)

Stateless, no I/O, no dependency on any other service. Every page and every
other service can import it without creating a cycle.

- **Contract:** `contracts/catalog.ts`, `CatalogService`.
- **Contract version:** 1. The gate tests pin this number, so a bump on the
  contract side fails here until someone looks at the catalogue.

## Public surface

```ts
import { catalog } from "@/services/catalog";

catalog.listTopics();                       // readonly TopicSpec[]
catalog.getTopic("drought");                // TopicSpec, throws on unknown id
catalog.findTopic(params.topic);            // TopicSpec | undefined
catalog.listModels();                       // readonly ModelSpec[]
catalog.getModel("xgboost");                // ModelSpec, throws on unknown id
catalog.findModel(searchParams.model);      // ModelSpec | undefined
catalog.classify(indicator, 27.4);          // IndicatorBand
catalog.formatValue(indicator, 1340);       // "1 340 kg DM/ha"
```

Named exports beside `catalog`, for the caller that needs one spec at module
scope (a static route param list, a test fixture):

`TOPICS`, `FLOOD_RISK`, `DROUGHT`, `FOOD_SECURITY`, `RANGELAND_DYNAMICS`,
`MODELS`, `RANDOM_FOREST`, `XGBOOST`, `ALL_MODEL_IDS`,
`CATALOG_CONTRACT_VERSION`, `GROUP_SEPARATOR`, `assertIndicatorInvariants`.

`services/catalog/index.ts` is the whole surface. Importing `./topics`,
`./models` or `./indicators` from outside this directory is a bug: those files
are free to be reorganised, `index.ts` is not.

`catalog` is frozen. It is a singleton every screen shares, so a caller that
replaced `classify` on it would change how every other screen reads its
numbers.

## Behaviour worth knowing before you call it

**Bands are half-open, `[min, max)`.** A value exactly on a boundary belongs to
the band that boundary opens: VCI 20.0 is "Moderate vegetation deficit", not
"Severe". The top band has `max: null`, so it is open-ended.

**`classify` clamps, it does not throw.** A model can return 103 % or
-2 kg DM/ha from an extrapolation. Those get the end band plus the raw number,
which is the honest rendering, rather than a crashed page. Infinities clamp the
same way.

**NaN is rejected.** `classify` and `formatValue` both throw on NaN (and
`formatValue` on infinities). Painting a no-data pixel as "Very low" flood
hazard, or printing "NaN kg DM/ha" into a report, is the one failure mode this
service will not produce quietly. Handle missing values before you get here.

**Formatting is fixed by the indicator, not by the caller.** `precision`
decimals, then the unit after a space, SI style, including for `%` ("12.5 %").
A dimensionless index gets no unit at all ("27.4"). Thousands are grouped with
a plain space ("1 340 kg DM/ha"), hand-rolled rather than via
`toLocaleString`, because the same value is formatted on the server, on the
client and in tests, and those do not share an ICU locale: `toLocaleString`
would return "1,340" or "1.340" depending on where it ran and hydration would
mismatch.

One rough edge, kept because the contract specifies the unit: IPC formats as
`"3 phase"`, which reads awkwardly. Prefer the band label ("Phase 3 Crisis")
wherever a phase is shown as prose.

## How to add a topic

1. Add the id to `TOPIC_IDS` in `contracts/catalog.ts`. That is a contract
   edit, so it belongs in the same commit as everything below.
2. Add a `TopicSpec` to `services/catalog/topics.ts` and put it in `TOPICS`.
   Bands must tile the domain: first `min` equals `domain[0]`, every `max`
   equals the next band's `min`, top band `max: null`.
3. Use only the four severities (`good`, `warning`, `serious`, `critical`).
   There is no fifth colour. Two bands may share a severity, as drought's
   "Normal greenness" and "Above normal greenness" do; the label carries the
   distinction the colour cannot.
4. Fill in `source` with where the class breaks come from. If they are this
   project's convention rather than a published standard, say so in that
   string. The UI shows it.
5. Set `dataStart` to the earliest date **every** driver has coverage, not the
   earliest any one of them does. It is the left bound of the date picker.
6. Run `npx vitest run services/catalog`. The property tests loop over
   `catalog.listTopics()`, so the new topic is checked for band tiling,
   severity validity, boundary classification, clamping and a real ISO
   `dataStart` without any new test being written. Add pinned boundary and
   pinned format strings for the new indicator anyway: the loops prove the
   shape is legal, not that the thresholds are the ones the source publishes.

Adding a topic, a model or a band is backwards compatible. Renaming or removing
an id is a breaking change: bump `CATALOG_CONTRACT_VERSION` and update both
sides in the same commit.

## Tests

```
npx vitest run services/catalog
```

86 gate tests, deterministic, no network, whole file under two seconds. Three
groups:

- Property tests over every topic, so a topic added later is covered without
  editing the test file.
- Pinned boundaries and pinned format strings, because every screen reads these
  exact values and band names.
- Negative tests on `assertIndicatorInvariants` (gap, overlap, closed top band,
  reversed band, bad severity, empty band list). A checker that cannot fail
  would let the property tests pass on a broken catalogue.

## Sources

Where each indicator definition and each class break comes from. Two of the
four have published Kenyan or international breaks and are copied exactly; two
do not, and their breaks are this project's convention and say so in the
`source` string the UI displays.

### VCI-3M (drought): published breaks, copied exactly

Vegetation Condition Index rescales current NDVI against the historical range
for the same pixel and the same season, giving 0 to 100 where low means
vegetation is failing relative to what that place normally manages. Kenya's
National Drought Management Authority (NDMA) reports the 3-month form in its
monthly drought early warning bulletins and county drought alerts, computed
from MODIS/eMODIS NDVI, with vegetation deficit classes at 10, 20, 35 and 50:
extreme (<10), severe (10 to 20), moderate (20 to 35), normal (35 to 50) and
above normal (>50). Those are NDMA's numbers, not ours, and are not ours to
move. `dataStart` is 2001-07-01: MODIS NDVI begins in early 2000 and the
3-month window plus baseline cannot be filled before then.

### IPC phase (food security): published scale, copied exactly

The Integrated Food Security Phase Classification Acute Food Insecurity scale
(IPC Global Partners, Technical Manual v3.1) runs Phase 1 Minimal, Phase 2
Stressed, Phase 3 Crisis, Phase 4 Emergency, Phase 5 Famine. Kenya applies it
through the Kenya Food Security Steering Group short rains and long rains
assessments. The phase is an ordinal class assigned by analyst consensus over
several evidence streams (food consumption, livelihood coping, market prices,
terms of trade, acute malnutrition), which is why this topic predicts the phase
analysts would assign rather than deriving one from a single driver, and why
precision is 0: a phase 2.4 does not exist. `dataStart` is 2009-01-01, Kenya's
first IPC-classified assessments; earlier bulletins used a different, non
comparable severity vocabulary.

### Flood hazard probability: standard framing, project class breaks

The drivers follow the standard flood hazard framing used in Kenya
Meteorological Department flood advisories and ICPAC/IGAD flood hazard
outlooks: rainfall accumulation and anomaly, antecedent soil moisture (the same
storm floods saturated ground and drains off dry ground), river discharge, and
the terrain and land cover that route the water. The output is a probability of
inundation, not a depth or an extent map, because the nationally available
drivers do not support hydraulic depth. The class breaks at 10, 25, 50 and 75 %
are this project's probability classes and are labelled as such in `source`.
`dataStart` is 2001-01-01, bounded by the MODIS-era land cover and soil
moisture drivers rather than by the rainfall record, which reaches further
back.

### Herbaceous biomass: standard estimation method, project class breaks

Standing herbaceous dry matter in kg DM/ha, estimated by regressing seasonal
NDVI integrals against clipped field measurements. This is the approach behind
FAO and ILRI rangeland forage assessments and ICPAC/FAO forage condition
monitoring for the Horn of Africa. Dry matter per hectare rather than an index
because it converts directly into carrying capacity and grazing days, which is
what a county livestock officer needs. The breaks at 300, 700, 1200 and
2000 kg DM/ha are this project's convention for Kenyan ASAL herbaceous
rangeland, calibrated to forage availability rather than to a published
degradation standard, and are labelled as such in `source`.

### Models

Both are tree ensembles, which is what these tabular problems reward: a handful
of gridded covariates with sharp thresholds and no useful linear structure. The
claims in each `strength` string are the ordinary ones: a random forest is
stable on small samples and mixed predictor types and averages away noise;
gradient boosting reaches higher accuracy once the sample is large and picks up
sharp thresholds, at the cost of more tuning. `costWeight` (1 and 1.6) is a
ratio the running screen multiplies its stage durations by, and the only
property that has to hold is that boosting costs more than the forest, since it
fits its trees in sequence where the forest fits them independently.
