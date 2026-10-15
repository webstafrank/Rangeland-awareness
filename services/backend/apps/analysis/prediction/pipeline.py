"""A prediction run, stage by stage.

    resolve      the run grid (and, for forecasts, a ~1 km history grid)
    fetch        GeoServer criterion layers, and the flood labels
    satellite    GIBS months: one snapshot for flood, ~99 months for forecasts
    features     coverage checks; drop what does not cover the areas
    labels       the target, per recipes.py and labels.py
    train        the final members, on every sample
    validate     held out: spatial blocks (flood) or the last year (forecasts)
    predict      probability on the run grid, chunked; classes; disagreement
    statistics   the contract's numbers (statistics.py)
    publish      skipped, for the overlay's reason: no GeoServer write access

## Two grids for a forecast, and why

Satellite inputs are 1 km (NDVI) to 50 km (MERRA-2). An eight-year monthly
history at the run's 250 m would be 16 times the pixels for no extra
information, and at the contract's 20M-pixel ceiling it would not fit in memory
at all (99 months x 4 layers x 80 MB). So the time series, the climatology, the
labels and the training samples live on a coarser HISTORY grid with the same
origin and CRS (about 1 km, capped at `MAX_HISTORY_PIXELS`). Only the handful
of rasters for the prediction month are carried onto the run grid, by bilinear
resampling, and combined there with the GeoServer layers at full run
resolution. The label itself is a 1 km NDVI quantity, so training at 1 km is
training at the resolution the target actually has.

Flood needs no history: one snapshot of each satellite layer at ``asOf`` and
everything at run resolution.

## Where flood trains when the areas have no labels

The hotspot labels cover Tana River county only. When less than half of the
run's areas carry labels, the model is trained on the labelled extent instead
(at a resolution capped to `MAX_TRAINING_PIXELS`) and then predicts the areas,
and `warnings` says plainly that this is extrapolation.
"""

from __future__ import annotations

import logging
import math
import shutil
from datetime import date
from pathlib import Path
from typing import Any, Callable

import numpy as np
from osgeo import gdal

from apps.analysis import maps
from apps.analysis.bindings import binding_for
from apps.analysis.jobs.stages import StageState
from apps.analysis.pipeline import raster
from apps.analysis.pipeline.overlay import PipelineError, _merge_areas
from apps.analysis.prediction import features as feat
from apps.analysis.prediction import labels as lab
from apps.analysis.prediction import models as mdl
from apps.analysis.prediction import statistics as stats
from apps.analysis.prediction.recipes import (
    FLOOD_LABEL_LAYER,
    HOTSPOT_THRESHOLD,
    MODEL_LABELS,
    MODEL_MEMBERS,
    STATIC_FEATURES,
    Recipe,
    recipe_for,
    target_definition,
)
from apps.analysis.prediction.sources import LiveSources, SourceError, Sources
from apps.analysis.satellite import catalog
from apps.analysis.satellite.gibs import latest_on_or_before

log = logging.getLogger(__name__)

Report = Callable[[str, StageState, str | None], None]

MAX_PIXELS = 20_000_000
MAX_HISTORY_PIXELS = 150_000
MAX_TRAINING_PIXELS = 1_000_000
HISTORY_TARGET_M = 1_000.0
#: Target months of history. Eight years: enough Junes at every pixel for a
#: 20th percentile to mean something after the last year is held out (seven),
#: and ~400 GIBS requests on a cold cache, about a minute.
HISTORY_MONTHS = 96
HOLDOUT_MONTHS = 12
#: A pixel is predicted only where at least this share of its inputs exist.
MIN_INPUT_SHARE = 0.5
TEMPORAL_LAYERS = ("ndvi", "precipitation", "soil_moisture", "lst")


def run_prediction(
    *,
    config: dict[str, Any],
    workspace: Path,
    report: Report,
    sources: Sources | None = None,
) -> dict[str, Any]:
    recipe = recipe_for(config["topic"])
    if recipe is None:
        raise PipelineError(f'No prediction recipe for "{config["topic"]}".')
    run = _Run(config=config, workspace=workspace, report=report,
               sources=sources or LiveSources(), recipe=recipe)
    try:
        return run.execute()
    except SourceError as exc:
        raise PipelineError(str(exc)) from exc


class _Run:
    """One execution. A class only so the stages can share their state without
    a twelve-argument function signature each; nothing outlives `execute`."""

    def __init__(self, *, config, workspace: Path, report: Report, sources: Sources,
                 recipe: Recipe) -> None:
        self.config = config
        self.workspace = workspace
        self.report = report
        self.sources = sources
        self.recipe = recipe
        self.model_id: str = config["model"]
        self.members = MODEL_MEMBERS[self.model_id]
        self.as_of = date.fromisoformat(config["asOf"])
        self.resolution = float(config.get("resolution", 250))
        self.crs = config.get("targetCrs", "EPSG:32637")
        self.warnings: list[str] = []
        #: Run-grid pixels the topic's land-cover mask allows; None = no mask.
        self.mask_run: np.ndarray | None = None
        self.scratch = workspace / "scratch"
        self.scratch.mkdir(parents=True, exist_ok=True)

    # ================================================================ driver

    def execute(self) -> dict[str, Any]:
        self._resolve()
        if self.recipe.kind == "spatial":
            trained = self._spatial()
        else:
            trained = self._forecast()
        result = self._predict_and_summarise(trained)
        shutil.rmtree(self.scratch, ignore_errors=True)
        return result

    # =============================================================== resolve

    def _resolve(self) -> None:
        self.report("resolve", StageState.RUNNING, None)
        areas = self.config["areas"]
        self.geometry = _merge_areas(areas)
        self.grid = raster.reference_grid(self.geometry, self.crs, self.resolution)
        pixels = self.grid.width * self.grid.height
        if pixels > MAX_PIXELS:
            # Validation refuses this before the run exists; re-checked here
            # because a grid is the one thing validation could not see snapped.
            raise PipelineError(
                f"{pixels:,} pixels at {self.resolution:g} m is over the "
                f"{MAX_PIXELS:,} limit for a prediction run."
            )
        self.inside = feat.area_mask(self.geometry, self.grid, self.workspace / "areas.tif")
        self.area_masks = []
        for index, area in enumerate(areas):
            geometry = area.get("geometry") if area.get("type") == "Feature" else area
            self.area_masks.append(
                feat.area_mask(geometry, self.grid, self.scratch / f"area{index}.tif")
            )
        self.area_names = stats.area_names(areas)

        detail = f"{self.grid.width}x{self.grid.height} px at {self.resolution:g} m"
        if self.recipe.kind == "forecast":
            factor = max(1, int(round(HISTORY_TARGET_M / self.resolution)))
            history = feat.coarser_grid(self.grid, factor)
            while history.width * history.height > MAX_HISTORY_PIXELS:
                factor *= 2
                history = feat.coarser_grid(self.grid, factor)
            self.history = history
            self.history_inside = feat.area_mask(
                self.geometry, history, self.scratch / "areas.history.tif"
            )
            detail += f"; history grid {history.width}x{history.height} at {history.pixel_size:g} m"
        self.report("resolve", StageState.DONE, detail)

    # ============================================================ flood path

    def _spatial(self) -> "_Trained":
        recipe = self.recipe
        # ------------------------------------------------------------- fetch
        self.report("fetch", StageState.RUNNING, None)
        label_index = self._flood_labels(self.grid, self.inside, self.geometry, "run")
        labelled_share = feat.coverage(label_index, self.inside)

        if labelled_share >= 0.5:
            train_grid, train_inside, train_geometry = self.grid, self.inside, self.geometry
            train_labels = label_index
            if labelled_share < 0.999:
                self.warnings.append(
                    f"{(1 - labelled_share):.0%} of the areas lie outside the labelled "
                    "extent (Tana River county); predictions there are extrapolated "
                    "from what the model learned inside it."
                )
        else:
            extent = self.sources.raster_extent(FLOOD_LABEL_LAYER)
            if extent is None:
                raise PipelineError(f'"{FLOOD_LABEL_LAYER}" reports no extent to train on.')
            train_geometry = _box(extent)
            res = self.resolution
            probe = raster.reference_grid(train_geometry, self.crs, res)
            while probe.width * probe.height > MAX_TRAINING_PIXELS:
                res *= 2
                probe = raster.reference_grid(train_geometry, self.crs, res)
            train_grid = probe
            train_inside = feat.area_mask(train_geometry, train_grid, self.scratch / "train.tif")
            train_labels = self._flood_labels(train_grid, train_inside, train_geometry, "train")
            self.warnings.append(
                f"{'All' if labelled_share == 0 else f'{1 - labelled_share:.0%} of'} the "
                "areas lie outside the labelled extent (Tana River county). The model "
                f"was trained on that county at {res:g} m and is extrapolating here."
            )
        grids = {"run": (self.grid, self.inside, self.geometry)}
        if train_grid is not self.grid:
            grids["train"] = (train_grid, train_inside, train_geometry)
        train_name = "train" if "train" in grids else "run"

        static = self._static_features(grids)
        self.report("fetch", StageState.DONE, f"{len(static)} GeoServer layers")

        # --------------------------------------------------------- satellite
        self.report("satellite", StageState.RUNNING, None)
        satellite = self._snapshot_features(grids, recipe.satellite)
        self.report("satellite", StageState.DONE, f"{len(satellite)} GIBS layers")

        # ---------------------------------------------------------- features
        self.report("features", StageState.RUNNING, None)
        kept = self._check_coverage(static + satellite, grids)
        self.report("features", StageState.DONE, f"{len(kept)} features kept")

        # ------------------------------------------------------------ labels
        self.report("labels", StageState.RUNNING, None)
        y_grid = np.where(
            np.isfinite(train_labels), (train_labels >= HOTSPOT_THRESHOLD).astype(np.float32), np.nan
        )
        labelled = train_inside & np.isfinite(y_grid)
        flat = np.flatnonzero(labelled.ravel())
        if flat.size == 0:
            raise PipelineError("No labelled pixel to train on.")
        chosen = flat[mdl.uniform_subsample(flat.size, mdl.MAX_TRAIN)]
        y = y_grid.ravel()[chosen].astype(np.int64)
        values = self._gather(kept, train_name, chosen)
        self._categorical_codes(kept, values)
        X = feat.matrix(kept, values)
        rows, cols = np.divmod(chosen, train_grid.width)
        self.positive_share = float(y_grid[labelled].mean())
        self.report(
            "labels", StageState.DONE,
            f"{int(y.sum())} hotspot / {y.size} sampled pixels",
        )
        self._warn_positives(int(y.sum()))

        # ------------------------------------------------------------- train
        self.report("train", StageState.RUNNING, None)
        final = [mdl.fit(name, X, y) for name in self.members]
        self.report("train", StageState.DONE, f"{len(final)} model(s) on {y.size} samples")

        # ---------------------------------------------------------- validate
        self.report("validate", StageState.RUNNING, None)
        block_px = max(4, int(round(mdl.BLOCK_M / train_grid.pixel_size)))
        blocks = mdl.spatial_blocks(rows, cols, block_px)
        try:
            folds = mdl.block_folds(blocks)
        except ValueError as exc:
            raise PipelineError(
                f"The labelled area is too small to validate: {exc}. Use a larger area."
            ) from exc
        k = int(folds.max()) + 1
        oof = {name: np.full(y.size, np.nan, np.float32) for name in self.members}
        train_sizes = []
        for fold in range(k):
            test = folds == fold
            train = ~test
            if len(np.unique(y[train])) < 2:
                continue
            train_sizes.append(int(train.sum()))
            for name in self.members:
                member = mdl.fit(name, X[train], y[train])
                oof[name][test] = mdl.predict(member, X[test])
        scored = np.all([np.isfinite(v) for v in oof.values()], axis=0)
        metrics = self._member_metrics(y[scored], {n: v[scored] for n, v in oof.items()})
        self.report("validate", StageState.DONE, f"{k}-fold spatial block CV")

        detail = (
            f"{k}-fold spatial block cross-validation over "
            f"{np.unique(blocks).size} blocks of {block_px * train_grid.pixel_size / 1000:g} km; "
            "every pixel is scored by a model that never saw any pixel of its block. "
            "Final models refit on all samples."
        )
        self.warnings.append(
            "The flood labels are the published Tana River hotspot map, itself a "
            "weighted overlay of slope, rainfall, land cover, river distance and "
            "elevation. The model learns to reproduce that map from the layers "
            "available here; it has not seen observed floods."
        )
        return _Trained(
            members=final,
            features=kept,
            metrics={
                "validation": "spatial-block-cv",
                "validationDetail": detail,
                "trainSamples": int(round(np.mean(train_sizes))) if train_sizes else 0,
                "testSamples": int(scored.sum()),
                "positiveShare": round(self.positive_share, 6),
                "folds": k,
                "members": metrics,
            },
            definition=target_definition(recipe),
            label_source=f"geoserver:{FLOOD_LABEL_LAYER}",
            valid_rule="inputs",
        )

    def _flood_labels(self, grid, inside, geometry, tag) -> np.ndarray:
        source = self.sources.raster(
            FLOOD_LABEL_LAYER, grid, self.scratch / f"labels.{tag}.source.tif"
        )
        if source is None:
            return np.full(grid.shape, np.nan, np.float32)
        out = self.scratch / f"labels.{tag}.tif"
        raster.warp_to_grid(
            str(source), str(out), grid,
            # The index averaged over each grid cell, then thresholded: a 250 m
            # cell is a hotspot when its mean index is, not when one 30 m pixel
            # in it happens to be.
            resample="average",
            clip_geojson=geometry,
            src_nodata=feat.source_nodata(source),
            dtype=gdal.GDT_Float32,
        )
        return feat.read(out)

    # ========================================================= forecast path

    def _forecast(self) -> "_Trained":
        recipe = self.recipe
        grids = {
            "run": (self.grid, self.inside, self.geometry),
            "history": (self.history, self.history_inside, self.geometry),
        }
        # ------------------------------------------------------------- fetch
        self.report("fetch", StageState.RUNNING, None)
        static = self._static_features(grids)
        self.report("fetch", StageState.DONE, f"{len(static)} GeoServer layers")

        # --------------------------------------------------------- satellite
        self.report("satellite", StageState.RUNNING, None)
        ndvi_times = self.sources.satellite_times(catalog.NDVI)
        feature_month = latest_on_or_before(ndvi_times, self.as_of)
        if feature_month is None:
            raise PipelineError(f"GIBS has no NDVI month on or before {self.as_of}.")
        first = max(lab.add_months(feature_month, -(HISTORY_MONTHS + 2)), ndvi_times[0])
        months = lab.month_range(first, feature_month)
        self.months = months

        bbox = feat.wgs84_box(self.history, margin_deg=0.05)
        times = {
            layer_id: self.sources.satellite_times(catalog.ALL[layer_id])
            for layer_id in TEMPORAL_LAYERS
            if layer_id in recipe.satellite
        }
        requests = []
        for layer_id, available in times.items():
            have = set(available)
            requests += [(catalog.ALL[layer_id], m) for m in months if m in have]
        igbp_year = latest_on_or_before(self.sources.satellite_times(catalog.IGBP), feature_month)
        if igbp_year is not None:
            requests.append((catalog.IGBP, igbp_year))
        snapshots = feat.fetch_snapshots(self.sources, requests, bbox)

        stacks: dict[str, np.ndarray] = {}
        unknown = 0
        decoded = 0
        for layer_id in times:
            stack = np.full((len(months),) + self.history.shape, np.nan, np.float32)
            for index, month in enumerate(months):
                snap = snapshots.get((layer_id, month))
                if snap is None or snap.empty:
                    continue
                unknown += snap.unknown_colours
                decoded += snap.values.size
                stack[index] = feat.snapshot_on_grid(snap, self.history, self.geometry, self.scratch)
            stacks[layer_id] = stack
        if decoded and unknown / decoded > 0.001:
            self.warnings.append(
                f"{unknown / decoded:.2%} of GIBS pixels had colours outside their "
                "colormap and were treated as missing; the images may have been resampled."
            )
        igbp = {}
        if igbp_year is not None and not snapshots[("igbp", igbp_year)].empty:
            snap = snapshots[("igbp", igbp_year)]
            igbp["history"] = feat.snapshot_on_grid(snap, self.history, self.geometry, self.scratch)
            igbp["run"] = feat.snapshot_on_grid(snap, self.grid, self.geometry, self.scratch)
        self.report(
            "satellite", StageState.DONE,
            f"{len(snapshots)} GIBS snapshots, {months[0]:%Y-%m}..{months[-1]:%Y-%m}",
        )

        # ---------------------------------------------------------- features
        self.report("features", StageState.RUNNING, None)
        # Which month each temporal layer is read from at prediction time.
        source_index: dict[str, int] = {}
        temporal_layers = []
        for layer_id, stack in stacks.items():
            latest = latest_on_or_before(times[layer_id], feature_month)
            if latest is None or latest < months[0]:
                self.warnings.append(
                    f"{catalog.ALL[layer_id].label} has no month on or before "
                    f"{feature_month}; it was dropped."
                )
                continue
            j = months.index(latest)
            cov = feat.coverage(stack[j], self.history_inside)
            if cov < feat.MIN_COVERAGE:
                self.warnings.append(
                    f"{catalog.ALL[layer_id].label} ({catalog.ALL[layer_id].gibs_layer}) "
                    f"covers {cov:.0%} of the areas for {latest}; it was dropped."
                )
                continue
            if latest < feature_month:
                gap = (feature_month.year - latest.year) * 12 + feature_month.month - latest.month
                self.warnings.append(
                    f"{catalog.ALL[layer_id].label} is from {latest}, {gap} month(s) before "
                    f"the feature month {feature_month}: {catalog.ALL[layer_id].gibs_layer} "
                    "has not published newer. The model was trained on same-month values."
                )
            source_index[layer_id] = j
            temporal_layers.append(layer_id)
        if "ndvi" not in temporal_layers:
            # Not a feature that can be dropped: NDVI is where the labels and
            # the prediction month both come from.
            raise PipelineError(
                f"GIBS NDVI does not cover the selected areas for {feature_month}; "
                "there is nothing to forecast from."
            )
        stacks = {k: v for k, v in stacks.items() if k in temporal_layers}

        mask_history = self.history_inside.copy()
        mask_run = self.inside.copy()
        if recipe.mask_codes is not None:
            if not igbp:
                raise PipelineError("MODIS land cover is unavailable, so the mask cannot be built.")
            mask_history &= np.isin(igbp["history"], recipe.mask_codes)
            mask_run &= np.isin(igbp["run"], recipe.mask_codes)
            if not mask_history.any() or not mask_run.any():
                raise PipelineError(
                    f"The selected areas contain no {recipe.mask_label} pixels "
                    f"(MODIS IGBP {igbp_year:%Y}); this topic predicts only there."
                )
            share = float(mask_run.sum()) / max(1, int(self.inside.sum()))
            if share < 0.999:
                self.warnings.append(
                    f"Only {share:.0%} of the area is {recipe.mask_label.split(' (')[0]} "
                    f"(MODIS IGBP {igbp_year:%Y}); the rest is not predicted."
                )

        static_kept = self._check_coverage(static, grids)
        igbp_feature = None
        if igbp:
            igbp_feature = feat.Feature(
                id="igbp_landcover", label=catalog.IGBP.label, source="gibs",
                layer=catalog.IGBP.gibs_layer, time=igbp_year.isoformat(),
                unit=catalog.IGBP.unit, categorical=True,
            )
            for name, values in igbp.items():
                igbp_feature.paths[name] = feat.write_float(
                    values, grids[name][0], self.workspace / f"igbp_landcover.{name}.tif"
                )
        precision = {k: catalog.ALL[k].precision for k in stacks}
        precip_3m = lab.trailing_mean(stacks["precipitation"], 3) if "precipitation" in stacks else None
        temporal_specs = [
            spec for spec in lab.TEMPORAL_FEATURES
            if spec[3] in stacks and not (spec[0] == "precip_3m_anomaly" and precip_3m is None)
        ]
        self.report(
            "features", StageState.DONE,
            f"{len(temporal_specs)} temporal + {len(static_kept) + (1 if igbp_feature else 0)} static",
        )

        # ------------------------------------------------------------ labels
        self.report("labels", StageState.RUNNING, None)
        n = len(months)
        rule = lab.LABEL_RULES[recipe.label_rule]
        holdout_start = n - HOLDOUT_MONTHS  # first held-out TARGET month index
        use_validation = np.arange(n) < holdout_start
        base_validation = lab.baselines(stacks, precision, months, use_validation, precip_3m)
        base_final = lab.baselines(stacks, precision, months, np.ones(n, bool), precip_3m)

        static_features = static_kept + ([igbp_feature] if igbp_feature else [])
        static_values = {f.id: feat.read(f.paths["history"]).ravel() for f in static_features}
        candidate = mask_history.ravel()

        def samples(base: lab.Baselines, feature_months: range):
            """(t, flat pixel, label) for every labelled pixel-month."""
            t_list, p_list, y_list = [], [], []
            for t in feature_months:
                y_t = rule(stacks["ndvi"], months, t, base.by_layer["ndvi"]).ravel()
                ok = np.flatnonzero(candidate & np.isfinite(y_t))
                t_list.append(np.full(ok.size, t, np.int64))
                p_list.append(ok)
                y_list.append(y_t[ok].astype(np.int64))
            if not t_list:
                return (np.empty(0, np.int64),) * 3
            return np.concatenate(t_list), np.concatenate(p_list), np.concatenate(y_list)

        def table(base: lab.Baselines, t_idx: np.ndarray, p_idx: np.ndarray):
            """Feature values for chosen (t, pixel) pairs, computed month by month."""
            columns: dict[str, np.ndarray] = {
                spec[0]: np.full(t_idx.size, np.nan, np.float32) for spec in temporal_specs
            }
            for t in np.unique(t_idx):
                rows = np.flatnonzero(t_idx == t)
                computed = lab.forecast_features(stacks, months, int(t), base, precip_3m)
                for spec in temporal_specs:
                    columns[spec[0]][rows] = computed[spec[0]].ravel()[p_idx[rows]]
            for f in static_features:
                columns[f.id] = static_values[f.id][p_idx]
            return columns

        # Feature months whose target is a held-out month vs. not.
        val_train = samples(base_validation, range(1, holdout_start - 1))
        val_test = samples(base_validation, range(holdout_start - 1, n - 1))
        fin = samples(base_final, range(1, n - 1))
        if val_train[0].size == 0 or val_test[0].size == 0:
            raise PipelineError("Too few labelled months to train and hold out a year.")
        self.report(
            "labels", StageState.DONE,
            f"{fin[0].size} labelled pixel-months, {fin[2].mean():.0%} positive",
        )

        # All model inputs, in column order.
        temporal_features = []
        for feature_id, label, unit, layer_id in temporal_specs:
            j = source_index[layer_id]
            temporal_features.append(
                feat.Feature(
                    id=feature_id, label=label, source="gibs",
                    layer=catalog.ALL[layer_id].gibs_layer, time=months[j].isoformat(), unit=unit,
                )
            )
        kept = temporal_features + static_features

        # ------------------------------------------------------------- train
        self.report("train", StageState.RUNNING, None)
        pick = mdl.uniform_subsample(fin[0].size, mdl.MAX_TRAIN)
        final_values = table(base_final, fin[0][pick], fin[1][pick])
        self._categorical_codes(kept, final_values)
        X = feat.matrix(kept, final_values)
        y = fin[2][pick]
        self.positive_share = float(fin[2].mean())
        self._warn_positives(int(y.sum()))
        final = [mdl.fit(name, X, y) for name in self.members]
        self.report("train", StageState.DONE, f"{len(final)} model(s) on {y.size} samples")

        # ---------------------------------------------------------- validate
        self.report("validate", StageState.RUNNING, None)
        pick_train = mdl.uniform_subsample(val_train[0].size, mdl.MAX_TRAIN)
        pick_test = mdl.uniform_subsample(val_test[0].size, mdl.MAX_TEST, seed=mdl.SEED + 1)
        X_train = feat.matrix(kept, table(base_validation, val_train[0][pick_train], val_train[1][pick_train]))
        y_train = val_train[2][pick_train]
        X_test = feat.matrix(kept, table(base_validation, val_test[0][pick_test], val_test[1][pick_test]))
        y_test = val_test[2][pick_test]
        scores = {}
        for name in self.members:
            member = mdl.fit(name, X_train, y_train)
            scores[name] = mdl.predict(member, X_test)
        metrics = self._member_metrics(y_test, scores)
        self.report("validate", StageState.DONE, f"held out {HOLDOUT_MONTHS} months")

        first_train = months[2]
        last_train = months[holdout_start - 1]
        detail = (
            f"Trained on target months {first_train:%Y-%m}..{last_train:%Y-%m}, scored on the "
            f"held-out target months {months[holdout_start]:%Y-%m}..{months[-1]:%Y-%m}, with "
            "every baseline (percentiles, anomalies) computed from the training months only. "
            "Final models refit on all months."
        )

        # Prediction-month features onto the run grid.
        computed = lab.forecast_features(
            stacks, months, n - 1, base_final, precip_3m, source_index=source_index
        )
        for feature in temporal_features:
            history_path = feat.write_float(
                computed[feature.id], self.history, self.scratch / f"{feature.id}.history.tif"
            )
            run_path = self.workspace / f"{feature.id}.run.tif"
            raster.warp_to_grid(
                str(history_path), str(run_path), self.grid, resample="bilinear",
                clip_geojson=self.geometry, dtype=gdal.GDT_Float32,
            )
            feature.paths["run"] = run_path
        self.mask_run = mask_run

        years = [m.year for m in months]
        return _Trained(
            members=final,
            features=kept,
            metrics={
                "validation": "temporal-holdout",
                "validationDetail": detail,
                "trainSamples": int(y_train.size),
                "testSamples": int(y_test.size),
                "positiveShare": round(float(val_train[2].mean()), 6),
                "members": metrics,
            },
            definition=target_definition(recipe, first_year=min(years), last_year=max(years)),
            label_source=f"gibs:{catalog.NDVI.gibs_layer}",
            valid_rule="primary",
            primary="ndvi",
            feature_month=feature_month,
        )

    # ============================================================== helpers

    def _static_features(self, grids) -> list[feat.Feature]:
        out = []
        for spec in STATIC_FEATURES:
            bound = binding_for(spec.id)
            paths = {}
            for name, (grid, _, geometry) in grids.items():
                path = feat.static_feature(self.sources, spec, grid, geometry, self.workspace, name)
                if path is None:
                    break
                paths[name] = path
            if len(paths) != len(grids):
                self.warnings.append(
                    f'{spec.label} ({bound.layer if bound else "no layer bound"}) does not '
                    "cover the areas; it was dropped."
                )
                continue
            out.append(
                feat.Feature(
                    id=spec.id, label=spec.label, source="geoserver",
                    layer=bound.layer if bound else None, time=None, unit=spec.unit,
                    categorical=spec.categorical, paths=paths,
                )
            )
        return out

    def _snapshot_features(self, grids, layer_ids) -> list[feat.Feature]:
        """One snapshot per satellite layer at the latest time <= asOf."""
        boxes = [feat.wgs84_box(g, margin_deg=0.05) for g, _, _ in grids.values()]
        bbox = (min(b[0] for b in boxes), min(b[1] for b in boxes),
                max(b[2] for b in boxes), max(b[3] for b in boxes))
        requests = []
        for layer_id in layer_ids:
            layer = catalog.ALL[layer_id]
            when = latest_on_or_before(self.sources.satellite_times(layer), self.as_of)
            if when is None:
                self.warnings.append(f"{layer.label} has no time on or before {self.as_of}; it was dropped.")
                continue
            requests.append((layer, when))
        snapshots = feat.fetch_snapshots(self.sources, requests, bbox)
        unknown = sum(s.unknown_colours for s in snapshots.values())
        decoded = sum(s.values.size for s in snapshots.values())
        if decoded and unknown / decoded > 0.001:
            self.warnings.append(
                f"{unknown / decoded:.2%} of GIBS pixels had colours outside their "
                "colormap and were treated as missing; the images may have been resampled."
            )
        out = []
        for layer, when in requests:
            snap = snapshots[(layer.id, when)]
            if snap.empty:
                self.warnings.append(
                    f"{layer.label} ({layer.gibs_layer}) has no value over the areas for "
                    f"{when}; it was dropped."
                )
                continue
            feature = feat.Feature(
                id="igbp_landcover" if layer.id == "igbp" else layer.id,
                label=layer.label, source="gibs", layer=layer.gibs_layer,
                time=when.isoformat(), unit=layer.unit, categorical=layer.categorical,
            )
            for name, (grid, _, geometry) in grids.items():
                values = feat.snapshot_on_grid(snap, grid, geometry, self.scratch)
                feature.paths[name] = feat.write_float(
                    values, grid, self.workspace / f"{feature.id}.{name}.tif"
                )
            out.append(feature)
        return out

    def _check_coverage(self, candidates, grids) -> list[feat.Feature]:
        kept = []
        for feature in candidates:
            worst = 1.0
            for name, (_, inside, _) in grids.items():
                worst = min(worst, feat.coverage(feat.read(feature.paths[name]), inside))
            if worst < feat.MIN_COVERAGE:
                self.warnings.append(
                    f"{feature.label} ({feature.layer}) covers {worst:.0%} of the areas; "
                    "it was dropped."
                )
                continue
            if worst < 0.95:
                self.warnings.append(
                    f"{feature.label} covers {worst:.0%} of the areas; elsewhere the "
                    "models predict without it."
                )
            kept.append(feature)
        return kept

    def _gather(self, features, grid_name, flat_index) -> dict[str, np.ndarray]:
        return {f.id: feat.read(f.paths[grid_name]).ravel()[flat_index] for f in features}

    @staticmethod
    def _categorical_codes(features, values) -> None:
        for feature in features:
            if feature.categorical:
                feature.codes = feat.observed_codes(values[feature.id])

    def _warn_positives(self, positives: int) -> None:
        if positives < mdl.MIN_POSITIVES:
            self.warnings.append(
                f"Only {positives} positive training samples (fewer than "
                f"{mdl.MIN_POSITIVES}); the models have little to learn the "
                "positive class from."
            )

    def _member_metrics(self, y, scores) -> dict[str, dict]:
        out = {name: mdl.metrics(y, p) for name, p in scores.items()}
        if self.model_id == "combined":
            out["combined"] = mdl.metrics(y, np.mean([scores[m] for m in self.members], axis=0))
        if any(m["auc"] is None for m in out.values()):
            self.warnings.append(
                "The held-out labels are all one class, so AUC cannot be computed."
            )
        return out

    # ============================================================== predict

    def _predict_and_summarise(self, trained: "_Trained") -> dict[str, Any]:
        self.report("predict", StageState.RUNNING, None)
        grid = self.grid
        columns, groups = feat.column_groups(trained.features)
        probability = np.full(grid.shape, np.nan, np.float32)
        per_member = {m.name: np.full(grid.shape, np.nan, np.float32) for m in trained.members}
        base_valid = self.inside if self.mask_run is None else self.inside & self.mask_run

        for first in range(0, grid.height, feat.CHUNK_ROWS):
            count = min(feat.CHUNK_ROWS, grid.height - first)
            chunk_valid = base_valid[first:first + count]
            if not chunk_valid.any():
                continue
            values = {
                f.id: feat.read_rows(f.paths["run"], first, count).ravel()
                for f in trained.features
            }
            X = feat.matrix(trained.features, values)
            present = np.isfinite(
                np.column_stack([values[f.id] for f in trained.features])
            ).mean(axis=1)
            ok = chunk_valid.ravel() & (present >= MIN_INPUT_SHARE)
            if trained.valid_rule == "primary":
                ok &= np.isfinite(values[trained.primary])
            if not ok.any():
                continue
            outputs = [mdl.predict(member, X[ok]) for member in trained.members]
            for member, output in zip(trained.members, outputs):
                block = per_member[member.name][first:first + count].ravel()
                block[ok] = output
                per_member[member.name][first:first + count] = block.reshape(count, grid.width)
            block = probability[first:first + count].ravel()
            block[ok] = np.mean(outputs, axis=0)
            probability[first:first + count] = block.reshape(count, grid.width)

        valid = np.isfinite(probability)
        if not valid.any():
            raise PipelineError("No pixel in the areas has enough inputs to predict.")
        rasters = {"probability": "probability.tif", "classes": "classes.tif"}
        raster.write_array(probability, grid, str(self.workspace / rasters["probability"]))
        raster.write_array(
            stats.classify(probability), grid, str(self.workspace / rasters["classes"]),
            nodata=stats.CLASS_NODATA,
        )
        agreement = None
        if self.model_id == "combined":
            difference = np.abs(per_member["random-forest"] - per_member["xgboost"])
            rasters["disagreement"] = "disagreement.tif"
            raster.write_array(difference, grid, str(self.workspace / rasters["disagreement"]))
            agreement = {"meanAbsDifference": round(float(difference[valid].mean()), 6)}
            # Each member's own probability, so the analyst can see where the
            # two models part ways rather than only by how much.
            for member in ("random-forest", "xgboost"):
                rasters[f"probability-{member}"] = f"probability-{member}.tif"
                raster.write_array(
                    per_member[member], grid, str(self.workspace / rasters[f"probability-{member}"])
                )
        for name, filename in rasters.items():
            # Now rather than on the first tile request: the analyst opens the
            # map seconds after this, and a zoomed-out tile without overviews
            # reads every pixel of the raster (maps.py module docstring).
            maps.build_overviews_quietly(
                self.workspace / filename, "classes" if name == "classes" else "continuous"
            )
        self.report("predict", StageState.DONE, f"{int(valid.sum())} pixels")

        # ------------------------------------------------------ statistics
        self.report("statistics", StageState.RUNNING, None)
        importance = mdl.merged_importance(
            [mdl.importance(m, columns, groups) for m in trained.members]
        )
        bbox = raster.transform_bounds(grid.bounds, grid.crs, "EPSG:4326")
        recipe = self.recipe
        result = {
            "kind": "prediction",
            "indicator": {"id": recipe.indicator_id, "label": recipe.indicator_label},
            "model": {
                "id": self.model_id,
                "label": MODEL_LABELS[self.model_id],
                "members": list(self.members),
            },
            "target": {
                "id": recipe.target_id,
                "label": recipe.target_label,
                "definition": trained.definition,
                "labelSource": trained.label_source,
                "horizon": recipe.horizon,
            },
            "asOf": self.as_of.isoformat(),
            "summary": stats.summary(probability, valid, grid.pixel_size),
            "histogram": stats.histogram(probability, valid),
            "classes": stats.classes(probability, valid, grid.pixel_size),
            "areas": stats.area_rows(probability, valid, self.area_masks, self.area_names, grid.pixel_size),
            "metrics": trained.metrics,
            "importance": importance,
            "agreement": agreement,
            "features": [f.as_json() for f in trained.features],
            "warnings": self.warnings,
            "bbox": [round(v, 6) for v in bbox],
            "grid": {
                "crs": grid.crs,
                "resolution": grid.pixel_size,
                "width": grid.width,
                "height": grid.height,
            },
            "validPixels": int(valid.sum()),
            "rasters": rasters,
            "layers": [],
        }
        if trained.feature_month is not None:
            result["featureMonth"] = trained.feature_month.isoformat()
        self.report("statistics", StageState.DONE, None)
        self.report("publish", StageState.SKIPPED, "no GeoServer write credentials")
        return result


class _Trained:
    def __init__(self, *, members, features, metrics, definition, label_source,
                 valid_rule, primary=None, feature_month=None) -> None:
        self.members = members
        self.features = features
        self.metrics = metrics
        self.definition = definition
        self.label_source = label_source
        self.valid_rule = valid_rule
        self.primary = primary
        self.feature_month = feature_month


def _box(bbox) -> dict[str, Any]:
    minx, miny, maxx, maxy = bbox
    return {
        "type": "Polygon",
        "coordinates": [[[minx, miny], [maxx, miny], [maxx, maxy], [minx, maxy], [minx, miny]]],
    }
