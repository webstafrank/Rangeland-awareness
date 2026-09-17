"""Hit the real GeoServer and report what is actually there.

Separate from the test suite on purpose. The suite runs against recorded
documents so it is deterministic and works offline; this command is the
opposite, and it is the thing to run when someone says "the map is empty".

    python3 manage.py check_geoserver
    python3 manage.py check_geoserver --layer Hazards_Dashboard:TanaRiver_Slope

It answers, in order, the questions a deployment actually fails on: is the host
reachable, does WMS answer, does WFS answer, and for a raster, does WCS describe
a grid the pipeline can compute on.
"""

from __future__ import annotations

import time

from django.core.management.base import BaseCommand
from django.conf import settings

from apps.layers.geoserver import GeoServerClient, GeoServerError


class Command(BaseCommand):
    help = "Check the configured GeoServer and print its catalogue."

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            "--layer",
            help="Describe one layer in detail, including its WCS grid.",
        )
        parser.add_argument(
            "--workspace", help="Only list layers in this workspace."
        )

    def handle(self, *args, **options) -> None:
        client = GeoServerClient()
        self.stdout.write(f"endpoint  {client.url}")
        self.stdout.write(f"auth      {'yes' if client.user else 'anonymous'}")

        started = time.monotonic()
        try:
            layers = client.layers()
        except GeoServerError as exc:
            # Not a traceback. The reader of this message is diagnosing a
            # network or a configuration, and a stack trace buries the one line
            # that matters.
            self.stderr.write(self.style.ERROR(f"\nUNREACHABLE: {exc}"))
            self.stderr.write(
                "\nCheck GEOSERVER_URL, then that the host is on this network."
            )
            raise SystemExit(1)

        elapsed = (time.monotonic() - started) * 1000
        self.stdout.write(f"catalogue {len(layers)} layers in {elapsed:.0f}ms\n")

        if options["workspace"]:
            layers = [l for l in layers if l.workspace == options["workspace"]]

        workspaces: dict[str, list] = {}
        for layer in layers:
            workspaces.setdefault(layer.workspace or "(none)", []).append(layer)

        for workspace, items in sorted(workspaces.items()):
            self.stdout.write(self.style.MIGRATE_HEADING(f"\n{workspace}"))
            for layer in sorted(items, key=lambda l: l.name):
                kind = "vector" if layer.vector else "raster"
                self.stdout.write(
                    f"  {kind:6}  {layer.name:46}  {layer.title[:28]}"
                )

        target = options["layer"]
        if not target:
            self.stdout.write(
                "\nPass --layer <name> to describe one, including its WCS grid."
            )
            return

        self.stdout.write(self.style.MIGRATE_HEADING(f"\n{target}"))
        match = next((l for l in layers if l.name == target), None)
        if match is None:
            self.stderr.write(self.style.ERROR("  not in the catalogue"))
            near = [l.name for l in layers if target.split(":")[-1] in l.name]
            if near:
                self.stderr.write(f"  did you mean: {', '.join(near[:5])}")
            raise SystemExit(1)

        self.stdout.write(f"  styles     {', '.join(match.styles) or '(none)'}")
        self.stdout.write(f"  queryable  {match.queryable}")
        self.stdout.write(f"  crs        {len(match.crs)} declared")
        if match.bbox:
            self.stdout.write(
                "  bbox       "
                + ", ".join(f"{v:.4f}" for v in match.bbox.as_list())
            )

        if match.vector:
            self.stdout.write("  wcs        n/a (vector; read over WFS)")
            return

        try:
            grid = client.describe_coverage(match.name)
        except GeoServerError as exc:
            # Published over WMS but not WCS is a normal state, and it is
            # precisely what stops the pipeline computing on this layer, so it
            # is reported as a fact rather than swallowed.
            self.stdout.write(self.style.WARNING(f"  wcs        unavailable: {exc}"))
            return

        x_res, y_res = grid.resolution
        self.stdout.write(f"  wcs crs    {grid.crs}")
        self.stdout.write(f"  wcs size   {grid.size[0]} x {grid.size[1]} px")
        self.stdout.write(f"  wcs res    {x_res:.4f} x {y_res:.4f} per px")
        self.stdout.write(f"  wcs bands  {', '.join(grid.bands) or '(unnamed)'}")

        if grid.crs.endswith(("4326", "4258", "4269")):
            self.stdout.write(
                self.style.WARNING(
                    "  NOTE       geographic CRS: a distance transform on this "
                    "would be computed in degrees."
                )
            )
