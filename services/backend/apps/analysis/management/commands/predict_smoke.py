"""Run one small, real prediction against GeoServer and GIBS, and print it.

The test suite runs every topic end to end on synthetic layers, offline and in
seconds. This is the opposite and the complement: the live services, real
pixels, real minutes. Run it after touching anything in `prediction/` or
`satellite/`, and when someone asks whether the numbers are real:

    python3 manage.py predict_smoke --topic drought-monitoring --model combined
    python3 manage.py predict_smoke --topic flood-risk --model xgboost \\
        --bbox 39.9,-1.6,40.1,-1.4 --resolution 250

The configuration goes through the same `validate_run_config` as
`POST /api/v1/runs`, so a refusal here is the refusal the app would get, and the
pipeline is the one the worker runs. Nothing is written to the database; the
rasters land in ``WORKSPACE_DIR/smoke-<runId>``. GIBS PNGs are cached under
``WORKSPACE_DIR/gibs-cache``, so a second run over the same box is much faster.
"""

from __future__ import annotations

import json
import time

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from apps.analysis.models import config_hash
from apps.analysis.validation import validate_run_config


class Command(BaseCommand):
    help = "Run one small live prediction (GeoServer + GIBS) and print its summary."

    def add_arguments(self, parser) -> None:
        parser.add_argument("--topic", default="drought-monitoring")
        parser.add_argument("--model", default="combined")
        parser.add_argument(
            "--bbox", default="39.9,-1.6,40.1,-1.4",
            help="minlon,minlat,maxlon,maxlat (WGS84). Default: a ~22 km Tana River box.",
        )
        parser.add_argument("--resolution", type=float, default=250)
        parser.add_argument("--crs", default="EPSG:32637")
        parser.add_argument("--as-of", dest="as_of", default=None)
        parser.add_argument("--name", default="Tana River smoke box")
        parser.add_argument("--json", action="store_true", help="Print the whole result as JSON.")

    def handle(self, *args, **options) -> None:
        from apps.analysis.prediction.pipeline import run_prediction

        try:
            minx, miny, maxx, maxy = (float(v) for v in options["bbox"].split(","))
        except ValueError as exc:
            raise CommandError("--bbox is minlon,minlat,maxlon,maxlat") from exc
        body = {
            "topic": options["topic"],
            "model": options["model"],
            "areas": [
                {
                    "type": "Feature",
                    "properties": {"name": options["name"]},
                    "geometry": {
                        "type": "Polygon",
                        "coordinates": [[[minx, miny], [maxx, miny], [maxx, maxy],
                                         [minx, maxy], [minx, miny]]],
                    },
                }
            ],
            "targetCrs": options["crs"],
            "resolution": options["resolution"],
        }
        if options["as_of"]:
            body["asOf"] = options["as_of"]

        config, errors = validate_run_config(body)
        if errors:
            raise CommandError(f"refused, as the API would: {json.dumps(dict(errors))}")

        run_id = config_hash(config)
        workspace = settings.WORKSPACE_DIR / f"smoke-{run_id}"
        workspace.mkdir(parents=True, exist_ok=True)
        self.stdout.write(f"run        {run_id}  ({config['topic']}, {config['model']}, asOf {config['asOf']})")
        self.stdout.write(f"workspace  {workspace}")

        started = time.monotonic()
        clocks: dict[str, float] = {}

        def report(stage, state, detail=None) -> None:
            now = time.monotonic()
            if str(state) == "running":
                # Kept from the first report: a running stage reports again to
                # update its detail ("120/400 GIBS snapshots").
                clocks.setdefault(stage, now)
                return
            took = now - clocks.get(stage, now)
            self.stdout.write(f"  {stage:10} {str(state):8} {took:6.1f}s  {detail or ''}")

        try:
            result = run_prediction(config=config, workspace=workspace, report=report)
        except Exception as exc:  # noqa: BLE001 - the message is the output
            raise CommandError(f"FAILED after {time.monotonic() - started:.0f}s: {exc}") from exc

        self.stdout.write(f"total      {time.monotonic() - started:.1f}s\n")
        if options["json"]:
            self.stdout.write(json.dumps(result, indent=2))
            return

        s = result["summary"]
        self.stdout.write(self.style.MIGRATE_HEADING(result["indicator"]["label"]))
        self.stdout.write(f"  target     {result['target']['definition']}")
        self.stdout.write(f"  grid       {result['grid']}  validPixels {result['validPixels']}")
        self.stdout.write(
            f"  summary    mean {s['meanProbability']}  median {s['medianProbability']}  "
            f"p10 {s['p10']}  p90 {s['p90']}  at risk {s['shareAtRisk']:.1%} "
            f"({s['areaAtRiskKm2']} km2)"
        )
        self.stdout.write(
            "  classes    "
            + "  ".join(f"{c['label']} {c['share']:.1%}" for c in result["classes"])
        )
        m = result["metrics"]
        self.stdout.write(
            f"  validation {m['validation']}  train {m['trainSamples']}  test "
            f"{m['testSamples']}  positive {m['positiveShare']:.1%}"
        )
        self.stdout.write(f"             {m['validationDetail']}")
        for name, scores in m["members"].items():
            self.stdout.write(
                f"  {name:13} auc {scores['auc']}  acc {scores['accuracy']}  "
                f"f1 {scores['f1']}  brier {scores['brier']}"
            )
        top = list(result["importance"].items())[:6]
        self.stdout.write("  importance " + ", ".join(f"{k} {v:.2f}" for k, v in top))
        if result["agreement"]:
            self.stdout.write(f"  agreement  {result['agreement']}")
        for feature in result["features"]:
            self.stdout.write(
                f"  feature    {feature['id']:22} {feature['source']:9} "
                f"{feature['layer'] or '':48} {feature['time'] or ''}"
            )
        for warning in result["warnings"]:
            self.stdout.write(self.style.WARNING(f"  warning    {warning}"))
        self.stdout.write(f"  rasters    {result['rasters']}")
