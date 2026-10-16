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

from datetime import UTC, date, datetime
from typing import Any

from apps.analysis.bindings import unbound
from apps.analysis.domain import criteria
from apps.analysis.prediction.recipes import MODEL_MEMBERS, recipe_for

#: A projected CRS in metres is required, and this is not a style preference.
#: The pipeline computes a Euclidean distance transform; in a geographic CRS
#: that distance is in degrees, where one unit is 111km at the equator and 0km
#: at the pole. The resulting "distance to river" raster is meaningless and
#: looks entirely normal.
GEOGRAPHIC_CRS_SUFFIXES = ("4326", "4258", "4269", "4267")

MIN_RESOLUTION_M = 10
MAX_RESOLUTION_M = 1000
#: What a run gets when the request names no resolution. An overlay keeps the
#: 30 m of its criterion layers. A prediction gets 250 m: its satellite inputs
#: are ~1 km, so 30 m is ~69x the pixels (and the prediction time) for no extra
#: information, and a county at 30 m is over `MAX_PREDICTION_PIXELS` anyway.
DEFAULT_RESOLUTION_M = 30
DEFAULT_PREDICTION_RESOLUTION_M = 250
MAX_AREAS = 12
MIN_WINDOW_DAYS = 30
MAX_WINDOW_DAYS = 3660

#: The contract's ceiling for a prediction grid. At 20M pixels one float32
#: layer is 80 MB, and a prediction holds a dozen feature layers on disk and a
#: chunk of each in memory beside two fitted ensembles; past this a 7 GB
#: machine swaps. Refused at validation with the number, not discovered as an
#: out-of-memory kill.
MAX_PREDICTION_PIXELS = 20_000_000
#: The earliest month a prediction can describe: MODIS NDVI starts in 2000-03,
#: and a forecast needs eight years of history before its feature month.
MIN_AS_OF = date(2008, 6, 1)


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
            # `method_for` answers "model" for any topic the criteria artifact
            # does not list, including a typo. A model topic is only real if a
            # prediction recipe exists for it.
            if method.kind == "model" and recipe_for(topic) is None:
                errors.add("topic", f'Unknown topic "{topic}".')
                method = None
            else:
                config["topic"] = topic

    # ------------------------------------------------------------------ model
    #
    # Whether this is a prediction run is decided by `model`, and only by it.
    # The criteria artifact stays the source of truth for which topics MUST
    # run a model (method kind "model"); flood-risk is an overlay topic that
    # MAY, because a recipe exists for it. Without `model`, flood-risk is the
    # weighted overlay exactly as before, down to the run id: nothing below
    # adds a field to an overlay config.
    model = body.get("model")
    prediction = False
    if model is not None:
        if not isinstance(model, str) or model not in MODEL_MEMBERS:
            errors.add(
                "model",
                f'Unknown model {model!r}; use one of {", ".join(sorted(MODEL_MEMBERS))}.',
            )
        elif isinstance(topic, str) and recipe_for(topic) is None and method is not None:
            errors.add(
                "model",
                f'"{topic}" has no model; it runs a weighted overlay. Remove "model".',
            )
        else:
            prediction = True
            config["model"] = model
    elif method is not None and method.kind == "model":
        errors.add(
            "model",
            f'"{topic}" runs a model, so "model" is required: one of '
            f'{", ".join(sorted(MODEL_MEMBERS))}.',
        )
    # A model topic is a prediction run even when `model` is missing or bad,
    # so its other fields are checked by the prediction rules (no weights)
    # rather than reported as "weights are required" on top of the real error.
    prediction = prediction or (method is not None and method.kind == "model")

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
    if prediction:
        if weights is not None:
            # Refused rather than ignored: a model learns its own weights, and
            # silently dropping a field the analyst set would let them believe
            # their weights shaped the map.
            errors.add(
                "weights",
                "A prediction run learns its own weights; remove \"weights\" "
                "(or remove \"model\" for a weighted overlay).",
            )
    elif not isinstance(weights, dict) or not weights:
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
    resolution = body.get(
        "resolution", DEFAULT_PREDICTION_RESOLUTION_M if prediction else DEFAULT_RESOLUTION_M
    )
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

    # ------------------------------------------------------------------- asOf
    as_of_raw = body.get("asOf")
    as_of: date | None = None
    if as_of_raw is not None:
        try:
            as_of = date.fromisoformat(str(as_of_raw)[:10])
        except ValueError:
            errors.add("asOf", "asOf must be an ISO date (YYYY-MM-DD).")
    if prediction:
        today = datetime.now(UTC).date()
        if as_of is None and "asOf" not in errors:
            as_of = default_as_of(today)
        if as_of is not None:
            # The month the features describe, so the day is dropped: 2026-08-17
            # and 2026-08-01 are the same run and must hash the same.
            as_of = as_of.replace(day=1)
            if as_of < MIN_AS_OF:
                errors.add(
                    "asOf",
                    f"asOf {as_of} is too early; a forecast needs eight years of "
                    f"satellite history before it. The earliest is {MIN_AS_OF}.",
                )
            elif as_of > today.replace(day=1):
                errors.add("asOf", f"asOf {as_of} is in the future.")
            else:
                # Written into the stored config BEFORE hashing, so a run posted
                # without asOf in October and one posting the resolved month
                # explicitly are the same run with the same id.
                config["asOf"] = as_of.isoformat()
    # On an overlay run asOf is accepted and not stored. Nothing in the overlay
    # reads it, and storing it would change the run id of a configuration that
    # computes exactly what it computed before.

    # ------------------------------------------------------------ grid size
    if (
        prediction
        and not errors.get("areas")
        and "targetCrs" in config
        and "resolution" in config
    ):
        problem = _prediction_grid_problem(
            config["areas"], config["targetCrs"], config["resolution"]
        )
        if problem:
            errors.add("resolution", problem)

    config["publishLayers"] = bool(body.get("publishLayers", False))
    return config, errors


def default_as_of(today: date) -> date:
    """The first day of the month two calendar months before ``today``.

    The latest month every monthly GIBS layer used here has published (MODIS
    NDVI and LST lag about a month; MERRA-2 a little more).
    """
    total = today.year * 12 + (today.month - 1) - 2
    return date(total // 12, total % 12 + 1, 1)


def _prediction_grid_problem(areas: list, crs: str, resolution: float) -> str | None:
    """Over `MAX_PREDICTION_PIXELS`? Then say so, and name a resolution that fits.

    The grid is the real snapped grid from `raster.reference_grid`, the same
    call the run makes, so the count cannot disagree with what would run.
    Imported here rather than at module top: GDAL is a large native import and
    validation of an overlay run does not need it.
    """
    import math

    from apps.analysis.pipeline import raster
    from apps.analysis.pipeline.overlay import PipelineError, _merge_areas

    try:
        grid = raster.reference_grid(_merge_areas(areas), crs, resolution)
    except (raster.RasterError, PipelineError):
        # Not this check's to report: an unusable geometry or CRS fails the run
        # with GDAL's own message, which is better than a guess here.
        return None
    pixels = grid.width * grid.height
    if pixels <= MAX_PREDICTION_PIXELS:
        return None
    fits = resolution * math.sqrt(pixels / MAX_PREDICTION_PIXELS)
    # Rounded up to a tidy number, then nudged until the snapped grid fits.
    suggestion = math.ceil(fits / 10) * 10
    while suggestion <= MAX_RESOLUTION_M:
        probe = raster.reference_grid(_merge_areas(areas), crs, suggestion)
        if probe.width * probe.height <= MAX_PREDICTION_PIXELS:
            break
        suggestion += 10
    return (
        f"The areas are {pixels:,} pixels at {resolution:g} m, over the "
        f"{MAX_PREDICTION_PIXELS:,} limit for a prediction run. "
        f"{suggestion:g} m fits; the app sends 250 m for predictions."
    )


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
