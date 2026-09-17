"""Which published layer supplies which criterion.

`contracts/criteria.json` describes a criterion's source as a HINT — "DEM",
"river network", "ESA WorldCover 2021" — and deliberately not as a layer name.
That is correct: the science is the same wherever it runs, and the layer names
belong to a particular GeoServer. This module is where the two are joined, and
it is the only place in the service that knows both vocabularies.

The binding is configuration, never inference. Matching a hint against layer
names with a fuzzy rule would pick `TanaRiver_Flood_Susceptability_Map` — a
*previous output* — for a criterion expecting an input, and the run would
compute a flood map from a flood map and look entirely plausible.

## What this deployment actually publishes

Checked against `192.168.0.40:8080/geoserver` on 2026-09-14:

| criterion | layer | note |
| --- | --- | --- |
| `slope` | `Hazards_Dashboard:TanaRiver_Slope` | already degrees; not derived here |
| `rainfall` | `Hazards_Dashboard:TanaRiver_Rainfall` | |
| `landcover` | `Hazards_Dashboard:TanaRiver_LULC` | |
| `dist_to_river` | `Hazards_Dashboard:TR_Rivers` | vector, rasterised then proximity |
| `elevation` | — | **no DEM is published** |

Two consequences worth stating plainly rather than discovering mid-run.

**There is no DEM on this server.** `elevation` therefore cannot be computed
here, and a run including it is refused at creation with that sentence rather
than failing four minutes into a fetch. Publishing a DEM and adding one line
below is all it takes.

**`slope` is published ready-made, so it is not derived.** The criteria artifact
calls slope a `derived` criterion produced from a DEM by gradient magnitude,
which is what the notebook did. This deployment publishes the result of that
step instead. Taking the published raster is both faster and closer to the
analyst's intent — it is the same surface they already look at — but it means
the `derive` stage does no work for this topic, and `BOUND_AS_LAYER` records
that so the stage plan can say `skipped` rather than pretending.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass

from django.conf import settings


@dataclass(frozen=True)
class Binding:
    """How one criterion is obtained from this GeoServer."""

    criterion: str
    layer: str
    #: Vector layers are rasterised before use; rasters are warped directly.
    vector: bool = False
    #: True when a `derived` or `distance` criterion is published ready-made,
    #: so the pipeline reads it instead of computing it.
    precomputed: bool = False
    note: str = ""


#: The default binding for the KSA deployment. Override with
#: `CRITERION_LAYERS` as JSON, so a different GeoServer is an environment
#: change and never an edit.
DEFAULT_BINDINGS: dict[str, Binding] = {
    "slope": Binding(
        criterion="slope",
        layer="Hazards_Dashboard:TanaRiver_Slope",
        precomputed=True,
        note="Published in degrees; the derive stage is skipped.",
    ),
    "rainfall": Binding(
        criterion="rainfall",
        layer="Hazards_Dashboard:TanaRiver_Rainfall",
    ),
    "landcover": Binding(
        criterion="landcover",
        layer="Hazards_Dashboard:TanaRiver_LULC",
    ),
    "dist_to_river": Binding(
        criterion="dist_to_river",
        layer="Hazards_Dashboard:TR_Rivers",
        vector=True,
        note="Rasterised to the run grid, then a Euclidean distance transform.",
    ),
}


def bindings() -> dict[str, Binding]:
    """The active binding, from the environment or the default."""
    raw = os.environ.get("CRITERION_LAYERS")
    if not raw:
        return dict(DEFAULT_BINDINGS)

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"CRITERION_LAYERS is not valid JSON: {exc}") from exc

    resolved: dict[str, Binding] = {}
    for criterion, entry in parsed.items():
        if isinstance(entry, str):
            resolved[criterion] = Binding(criterion=criterion, layer=entry)
        else:
            resolved[criterion] = Binding(
                criterion=criterion,
                layer=entry["layer"],
                vector=bool(entry.get("vector", False)),
                precomputed=bool(entry.get("precomputed", False)),
                note=entry.get("note", ""),
            )
    return resolved


def binding_for(criterion: str) -> Binding | None:
    return bindings().get(criterion)


def unbound(criterion_ids: list[str]) -> list[str]:
    """Which of these criteria have no layer on this deployment."""
    active = bindings()
    return [c for c in criterion_ids if c not in active]
