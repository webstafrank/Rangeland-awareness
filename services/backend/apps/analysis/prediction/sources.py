"""Where a prediction run's layers come from.

One small interface, `Sources`, with two implementations: `LiveSources`, which
talks to GeoServer and GIBS, and whatever a test hands in. The pipeline only
ever sees the interface, which is what lets every topic run end to end in the
test suite on synthetic layers, with no network, in seconds.

The interface is deliberately at the level of "a raster covering this grid" and
"one decoded satellite month", not at the level of HTTP. Everything after that
(warping onto the run grid, clipping, coverage checks, one-hot encoding) is the
pipeline's job and runs identically on live and synthetic data, so the tests
exercise the real code path rather than a mock of it.
"""

from __future__ import annotations

import logging
from datetime import date
from pathlib import Path
from typing import Any, Protocol

from django.conf import settings

from apps.analysis.pipeline import raster
from apps.analysis.satellite.catalog import SatelliteLayer
from apps.analysis.satellite.gibs import GibsClient, GibsError, Snapshot
from apps.layers.geoserver import GeoServerClient, GeoServerError

log = logging.getLogger(__name__)


class SourceError(RuntimeError):
    """A source could not be read at all (unreachable, refused). Distinct from
    "has no data here", which every method reports by returning None."""


class Sources(Protocol):
    def satellite_times(self, layer: SatelliteLayer) -> list[date]:
        """Every date the layer is published for, sorted."""

    def satellite(
        self, layer: SatelliteLayer, when: date, bbox: tuple[float, float, float, float]
    ) -> Snapshot:
        """One decoded month (or year) over a lon/lat box."""

    def raster(self, layer: str, grid: raster.Grid, out_path: Path) -> Path | None:
        """A GeoServer raster covering ``grid``, written to ``out_path`` in any
        CRS GDAL can read. None when the layer does not reach the grid."""

    def vector(self, layer: str) -> dict[str, Any] | None:
        """A GeoServer vector layer as a WGS84 GeoJSON FeatureCollection."""

    def raster_extent(self, layer: str) -> tuple[float, float, float, float] | None:
        """The layer's extent as a lon/lat box, or None if it is unknown."""


class LiveSources:
    """GeoServer over WCS/WFS, GIBS over WMTS/WMS, cached under WORKSPACE_DIR."""

    def __init__(
        self,
        geoserver: GeoServerClient | None = None,
        gibs: GibsClient | None = None,
    ) -> None:
        self.geoserver = geoserver or GeoServerClient()
        self.gibs = gibs or GibsClient(Path(settings.WORKSPACE_DIR) / "gibs-cache")

    # ------------------------------------------------------------- GIBS

    def satellite_times(self, layer: SatelliteLayer) -> list[date]:
        try:
            return self.gibs.times(layer)
        except GibsError as exc:
            raise SourceError(str(exc)) from exc

    def satellite(self, layer, when, bbox) -> Snapshot:
        try:
            return self.gibs.snapshot(layer, when, bbox)
        except GibsError as exc:
            raise SourceError(str(exc)) from exc

    # -------------------------------------------------------- GeoServer

    def raster(self, layer: str, grid: raster.Grid, out_path: Path) -> Path | None:
        """Fetch only the window the grid needs, and only at the detail it needs.

        Two reductions, both measured as necessary rather than tidy:

        - **The window**, in the coverage's own CRS (TanaRiver_LULC is EPSG:4326
          while everything else is EPSG:32637; see pipeline/overlay.py `_fetch`).
          Checked against the coverage's extent first, so a run over Garissa
          does not ask GeoServer for a window it does not have.
        - **The detail.** TanaRiver_LULC is 10 m: the whole county is
          25790 x 34149 pixels, 880 MB as bytes. A 250 m prediction needs none of
          that, so the request carries WCS 2.0 ``SCALEFACTOR`` to land at twice
          the run's resolution (the warp then averages, or takes the mode, down
          to the grid). Twice rather than once so the downsample is an average
          of several source pixels, not a single nearest one.
        """
        try:
            described = self.geoserver.describe_coverage(layer)
        except GeoServerError as exc:
            raise SourceError(f'Could not describe "{layer}": {exc}') from exc

        window = raster.transform_bounds(grid.bounds, grid.crs, described.crs)
        extent = described.extent
        clipped = (
            max(window[0], extent[0]),
            max(window[1], extent[1]),
            min(window[2], extent[2]),
            min(window[3], extent[3]),
        )
        if clipped[0] >= clipped[2] or clipped[1] >= clipped[3]:
            return None

        native = min(described.resolution)
        target = grid.pixel_size / 111_320.0 if _is_geographic(described.crs) else grid.pixel_size
        scale = min(1.0, 2.0 * native / target) if target > 0 else 1.0
        try:
            data = self.geoserver.get_coverage(
                layer, subset=clipped, scale_factor=scale if scale < 0.999 else None
            )
        except GeoServerError as exc:
            raise SourceError(f'Could not fetch "{layer}": {exc}') from exc
        out_path.write_bytes(data)
        return out_path

    def vector(self, layer: str) -> dict[str, Any] | None:
        try:
            collection = self.geoserver.get_feature_geojson(layer, srs="EPSG:4326")
        except GeoServerError as exc:
            raise SourceError(f'Could not fetch "{layer}": {exc}') from exc
        features = [f for f in collection.get("features") or [] if f.get("geometry")]
        if not features:
            return None
        return {"type": "FeatureCollection", "features": features}

    def raster_extent(self, layer: str) -> tuple[float, float, float, float] | None:
        try:
            described = self.geoserver.describe_coverage(layer)
        except GeoServerError as exc:
            raise SourceError(f'Could not describe "{layer}": {exc}') from exc
        return raster.transform_bounds(described.extent, described.crs, "EPSG:4326")


def _is_geographic(crs: str) -> bool:
    return crs.endswith(("4326", "4258", "4269", "CRS84"))
