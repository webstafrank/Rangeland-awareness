"""Validate a run configuration before anything expensive happens.

Every problem is collected, not the first one. A run is a form with eight fields
and a map selection; revealing one problem per submit makes the analyst click,
read, fix and click again, and there is no reason for it — the checks are
independent and all of them are cheap.

This runs before a single byte is fetched from GeoServer. A run that cannot
succeed must be refused in milliseconds with a reason, not discovered four
minutes into a raster fetch.
"""

from __future__ import annotations

from typing import Any

from apps.analysis.bindings import unbound
from apps.analysis.domain import criteria

#: A projected CRS in metres is required, and this is not a style preference.
#: The pipeline computes a Euclidean distance transform; in a geographic CRS
#: that distance is in degrees, where one unit is 111km at the equator and 0km
#: at the pole. The resulting "distance to river" raster is meaningless and
#: looks entirely normal.
GEOGRAPHIC_CRS_SUFFIXES = ("4326", "4258", "4269", "4267")

MIN_RESOLUTION_M = 10
MAX_RESOLUTION_M = 1000
MAX_AREAS = 12
MIN_WINDOW_DAYS = 30
MAX_WINDOW_DAYS = 3660


class ConfigErrors(dict):
    """Field name -> list of messages. A dict so it serialises as-is."""

    def add(self, field: str, message: str) -> None:
        self.setdefault(field, []).append(message)


def validate_run_config(body: dict[str, Any]) -> tuple[dict[str, Any], ConfigErrors]:
    """Check a run configuration and return it normalised, plus every problem.

    Returns the normalised config even when there are errors, because the caller
    echoes nothing back on failure and the normalised form is only used when the
    errors are empty. Splitting into two functions would mean walking the same
    structure twice.
    """
    errors = ConfigErrors()
    config: dict[str, Any] = {}

    # ------------------------------------------------------------------ topic
    topic = body.get("topic")
    method = None
    if not isinstance(topic, str) or not topic:
        errors.add("topic", "A topic is required.")
    else:
        try:
            method = criteria.method_for(topic)
        except KeyError:
            errors.add("topic", f'Unknown topic "{topic}".')
        else:
            if method.kind != "weighted-overlay":
                # Not a 400 in spirit — the topic exists — but it cannot run
                # this pipeline, and saying so beats a confusing failure later.
                errors.add(
                    "topic",
                    f'"{topic}" runs a model, not a weighted overlay. '
                    "No model backend is connected yet.",
                )
            config["topic"] = topic

    # ------------------------------------------------------------------ areas
    areas = body.get("areas")
    if not isinstance(areas, list) or not areas:
        errors.add("areas", "At least one area of interest is required.")
    elif len(areas) > MAX_AREAS:
        errors.add("areas", f"At most {MAX_AREAS} areas. {len(areas)} given.")
    else:
        for index, area in enumerate(areas):
            problem = _geometry_problem(area)
            if problem:
                errors.add("areas", f"Area {index + 1}: {problem}")
        config["areas"] = areas

    # ---------------------------------------------------------------- weights
    weights = body.get("weights")
    if not isinstance(weights, dict) or not weights:
        errors.add("weights", "Weights are required, one per criterion.")
    elif method is not None and method.kind == "weighted-overlay":
        expected = {c.id for c in method.criteria}
        given = set(weights)

        # A SUBSET of the topic's criteria is allowed, and this is a deliberate
        # relaxation of the original contract's "one key per criterion".
        #
        # Two reasons, one principled and one concrete. Choosing which criteria
        # enter the overlay is part of the method — an analyst who has no
        # confidence in a layer drops it rather than weighting it near zero.
        # And on this deployment it is the difference between a service that
        # runs and one that cannot: no DEM is published, so `elevation` can
        # never be supplied, and demanding all five criteria would make every
        # flood-risk run impossible.
        #
        # What is still refused: a name that is not a criterion of this topic,
        # and fewer than two criteria, because a weighted overlay of one layer
        # is that layer.
        for name in sorted(given - expected):
            errors.add("weights", f'"{name}" is not a criterion of this topic.')
        if len(given & expected) < 2:
            errors.add(
                "weights",
                "At least two criteria are needed for a weighted overlay; "
                f"{len(given & expected)} given.",
            )

        numeric: dict[str, float] = {}
        for name, value in weights.items():
            try:
                numeric[name] = float(value)
            except (TypeError, ValueError):
                errors.add("weights", f'Weight for "{name}" is not a number.')
                continue
            if numeric[name] <= 0:
                # A zero weight is a criterion the analyst did not want, and
                # dropping it from the list says so. Keeping it at zero makes
                # the pipeline fetch and warp a raster that cannot affect the
                # answer, which is minutes of work for nothing.
                errors.add(
                    "weights",
                    f'Weight for "{name}" is {numeric[name]}; remove the '
                    "criterion instead of weighting it zero.",
                )

        total = sum(numeric.values())
        if numeric and abs(total - 1.0) > 1e-6:
            errors.add("weights", f"Weights sum to {total:.4f}, not 1.0.")

        # No layer on this deployment supplies this criterion. Refused at
        # creation with the reason, rather than four minutes into a fetch that
        # was never going to find anything. See bindings.py: this server
        # publishes no DEM, so `elevation` cannot be computed here.
        for name in sorted(unbound(sorted(given & expected))):
            errors.add(
                "weights",
                f'No layer on this GeoServer supplies "{name}". Publish one '
                "and add it to CRITERION_LAYERS, or remove the criterion.",
            )

        unfilled = sorted(
            c.id for c in method.criteria if c.id in given and not c.is_filled
        )
        for name in unfilled:
            # Refused at creation rather than producing an empty map. The class
            # table for this criterion ships empty because its codes belong to
            # a layer this deployment has not published.
            errors.add(
                "weights",
                f'The class table for "{name}" is empty, so it cannot be '
                "computed. Remove it from the run or fill the table.",
            )

        config["weights"] = numeric

    # --------------------------------------------------------------- targetCrs
    target_crs = body.get("targetCrs", "EPSG:32637")
    if not isinstance(target_crs, str) or not target_crs.upper().startswith("EPSG:"):
        errors.add("targetCrs", 'A CRS like "EPSG:32637" is required.')
    elif target_crs.endswith(GEOGRAPHIC_CRS_SUFFIXES):
        errors.add(
            "targetCrs",
            f"{target_crs} is geographic, so distances would be computed in "
            "degrees. Use a projected CRS in metres (EPSG:32637 covers the "
            "Tana River basin).",
        )
    else:
        config["targetCrs"] = target_crs.upper()

    # -------------------------------------------------------------- resolution
    resolution = body.get("resolution", 30)
    try:
        resolution = float(resolution)
    except (TypeError, ValueError):
        errors.add("resolution", "Resolution must be a number of metres.")
    else:
        if not MIN_RESOLUTION_M <= resolution <= MAX_RESOLUTION_M:
            errors.add(
                "resolution",
                f"Resolution must be between {MIN_RESOLUTION_M} and "
                f"{MAX_RESOLUTION_M} metres. {resolution:g} given.",
            )
        else:
            config["resolution"] = resolution

    # -------------------------------------------------------------- dateWindow
    window = body.get("dateWindow")
    if window is not None:
        problem = _date_window_problem(window)
        if problem:
            errors.add("dateWindow", problem)
        else:
            config["dateWindow"] = window

    config["publishLayers"] = bool(body.get("publishLayers", False))
    return config, errors


def _geometry_problem(area: Any) -> str | None:
    """Why this area cannot be used, or None.

    Deliberately shallow. The geometry is handed to GDAL, which is a far better
    validator than anything written here, so this checks only the things whose
    failure downstream would be cryptic: the wrong shape entirely, a missing
    geometry, or a non-polygon.
    """
    if not isinstance(area, dict):
        return "not a GeoJSON object."

    geometry = area.get("geometry") if area.get("type") == "Feature" else area
    if not isinstance(geometry, dict):
        return "has no geometry."

    kind = geometry.get("type")
    if kind not in ("Polygon", "MultiPolygon"):
        # A point has no area to clip to and a line has no interior. Both would
        # produce an empty raster rather than an error, several minutes later.
        return f"is a {kind or 'shape with no type'}; polygons only."

    coordinates = geometry.get("coordinates")
    if not isinstance(coordinates, list) or not coordinates:
        return "has empty coordinates."
    return None


def _date_window_problem(window: Any) -> str | None:
    from datetime import date

    if not isinstance(window, dict):
        return "must be an object with start and end."

    try:
        start = date.fromisoformat(str(window.get("start")))
        end = date.fromisoformat(str(window.get("end")))
    except ValueError:
        return "start and end must be ISO dates (YYYY-MM-DD)."

    if start > end:
        return f"starts ({start}) after it ends ({end})."

    span = (end - start).days
    if span < MIN_WINDOW_DAYS:
        return f"covers {span} days; at least {MIN_WINDOW_DAYS} are needed."
    if span > MAX_WINDOW_DAYS:
        return f"covers {span} days; at most {MAX_WINDOW_DAYS} are allowed."
    return None
