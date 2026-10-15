"""Result maps, tiles and raster downloads (`contracts/prediction.md`).

Every raster here is a real GeoTIFF written with GDAL in EPSG:32637 into a
temporary WORKSPACE_DIR, with values chosen so the expected colour of every
pixel can be worked out by hand. The tile tests decode the PNG the endpoint
returns and check colours at positions computed independently with OSR, which
is the proof that a tile is georeferenced and not merely coloured: a tile that
is shifted, flipped or in the wrong CRS fails on position, not on colour.

Offline and fast: no GeoServer, no network, a few 5x5 rasters.
"""

from __future__ import annotations

import os
import tempfile
import uuid
from pathlib import Path

import numpy as np
from django.test import TestCase, override_settings
from osgeo import gdal, osr

from apps.analysis import maps
from apps.analysis.models import Run

gdal.UseExceptions()

UTM37N = 32637
#: Upper-left corner of the test grid: about 39.0E, 0.9S, near Garissa, in the
#: zone the pipeline actually uses for Kenya. Southern latitudes in a northern
#: UTM zone have negative northings.
ORIGIN_X, ORIGIN_Y = 500_000.0, -100_000.0
PIXEL = 2_000.0
SIZE = 5
NODATA = -9999.0

#: Class values on the 5x5 grid: a diagonal pattern so neighbouring pixels
#: always differ and a one-pixel shift anywhere changes the expected colour.
#: The centre pixel is nodata.
CLASS_GRID = np.array([[(r + c) % 5 + 1 for c in range(SIZE)] for r in range(SIZE)], dtype=np.float32)
CLASS_GRID[2, 2] = NODATA


def write_tif(path: Path, array: np.ndarray) -> None:
    driver = gdal.GetDriverByName("GTiff")
    ds = driver.Create(str(path), array.shape[1], array.shape[0], 1, gdal.GDT_Float32)
    ds.SetGeoTransform((ORIGIN_X, PIXEL, 0.0, ORIGIN_Y, 0.0, -PIXEL))
    srs = osr.SpatialReference()
    srs.ImportFromEPSG(UTM37N)
    ds.SetProjection(srs.ExportToWkt())
    band = ds.GetRasterBand(1)
    band.SetNoDataValue(NODATA)
    band.WriteArray(array)
    ds = None


def utm_to_3857(x: float, y: float) -> tuple[float, float]:
    src, dst = osr.SpatialReference(), osr.SpatialReference()
    src.ImportFromEPSG(UTM37N)
    dst.ImportFromEPSG(3857)
    for s in (src, dst):
        s.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    px, py, _ = osr.CoordinateTransformation(src, dst).TransformPoint(x, y)
    return px, py


def pixel_centre(row: int, col: int) -> tuple[float, float]:
    return ORIGIN_X + (col + 0.5) * PIXEL, ORIGIN_Y - (row + 0.5) * PIXEL


def grid_bbox_3857(margin: float = 3_000.0) -> tuple[float, float, float, float]:
    corners = [
        utm_to_3857(ORIGIN_X + dx * PIXEL * SIZE, ORIGIN_Y - dy * PIXEL * SIZE)
        for dx in (0, 1)
        for dy in (0, 1)
    ]
    xs, ys = [c[0] for c in corners], [c[1] for c in corners]
    return min(xs) - margin, min(ys) - margin, max(xs) + margin, max(ys) + margin


def decode_png(data: bytes) -> np.ndarray:
    """(height, width, 4) uint8 from PNG bytes, via GDAL like the encoder."""
    self_name = f"/vsimem/test-{uuid.uuid4().hex}.png"
    gdal.FileFromMemBuffer(self_name, data)
    try:
        ds = gdal.Open(self_name)
        array = np.dstack([ds.GetRasterBand(i + 1).ReadAsArray() for i in range(ds.RasterCount)])
        ds = None
    finally:
        gdal.Unlink(self_name)
    return array


def rgb(color: str) -> list[int]:
    return [int(color[i : i + 2], 16) for i in (1, 3, 5)]


def bbox_param(bbox: tuple[float, float, float, float]) -> str:
    return ",".join(repr(v) for v in bbox)


OVERLAY_CLASSES = [
    {"class": i + 1, "label": label, "pixels": 1, "areaKm2": 4.0, "share": 0.2}
    for i, label in enumerate(["Very low", "Low", "Moderate", "High", "Very high"])
]


class MapTestCase(TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        self.workspaces = self.root / "workspaces"
        self.workspaces.mkdir()
        override = override_settings(WORKSPACE_DIR=self.workspaces)
        override.enable()
        self.addCleanup(override.disable)
        self.addCleanup(self._tmp.cleanup)

    def make_run(
        self,
        result: dict,
        *,
        run_id: str = "r_000000000001",
        status: str = Run.Status.SUCCEEDED,
        store_workspace: bool = True,
        files: dict[str, np.ndarray] | None = None,
    ) -> Run:
        workspace = self.workspaces / run_id
        workspace.mkdir(exist_ok=True)
        for filename, array in (files or {}).items():
            write_tif(workspace / filename, array)
        return Run.objects.create(
            run_id=run_id,
            topic="flood-risk",
            config={"topic": "flood-risk"},
            status=status,
            result=result,
            workspace=str(workspace) if store_workspace else "",
        )

    def prediction_run(self, **kwargs) -> Run:
        probability = np.full((SIZE, SIZE), 0.5, dtype=np.float32)
        probability[0, 0] = 0.0
        probability[4, 4] = 1.0
        probability[2, 2] = NODATA
        return self.make_run(
            {
                "kind": "prediction",
                "classes": OVERLAY_CLASSES,
                "rasters": {
                    "probability": "probability.tif",
                    "classes": "classes.tif",
                    "disagreement": "disagreement.tif",
                },
            },
            files={
                "probability.tif": probability,
                "classes.tif": CLASS_GRID,
                "disagreement.tif": np.full((SIZE, SIZE), 0.25, dtype=np.float32),
            },
            **kwargs,
        )

    def tile(self, run_id: str, map_id: str, bbox, width: int = 256, height: int = 256):
        return self.client.get(
            f"/api/v1/runs/{run_id}/tiles/{map_id}",
            {"BBOX": bbox_param(bbox), "WIDTH": width, "HEIGHT": height},
        )


class MapsListTests(MapTestCase):
    def test_a_prediction_result_lists_all_three_maps_with_contract_legends(self) -> None:
        run = self.prediction_run()
        body = self.client.get(f"/api/v1/runs/{run.run_id}/result").json()
        self.assertEqual(body["kind"], "prediction")
        self.assertEqual([m["id"] for m in body["maps"]], ["probability", "classes", "disagreement"])

        probability = body["maps"][0]
        self.assertEqual(
            probability["tiles"],
            f"/api/v1/runs/{run.run_id}/tiles/probability?BBOX={{bbox-epsg-3857}}&WIDTH=256&HEIGHT=256",
        )
        self.assertEqual(probability["download"], f"/api/v1/runs/{run.run_id}/rasters/probability.tif")
        # The stops are the contract's, character for character.
        self.assertEqual(
            probability["legend"],
            {
                "type": "continuous",
                "min": 0,
                "max": 1,
                "unit": "probability",
                "stops": [
                    [0.0, "#2c7bb6"], [0.25, "#abd9e9"], [0.5, "#ffffbf"],
                    [0.75, "#fdae61"], [1.0, "#d7191c"],
                ],
            },
        )
        disagreement = body["maps"][2]["legend"]
        self.assertEqual((disagreement["type"], disagreement["min"], disagreement["max"]), ("continuous", 0, 1))

    def test_an_overlay_result_draws_only_its_classes(self) -> None:
        """The overlay also stores a continuous `index`. It is downloadable but
        has no agreed legend, so it is not offered as a map."""
        run = self.make_run(
            {
                "kind": "overlay",
                "classes": OVERLAY_CLASSES,
                "rasters": {"index": "index.tif", "classes": "classes.tif"},
            },
            files={"classes.tif": CLASS_GRID, "index.tif": CLASS_GRID},
        )
        body = self.client.get(f"/api/v1/runs/{run.run_id}/result").json()
        self.assertEqual([m["id"] for m in body["maps"]], ["classes"])
        legend = body["maps"][0]["legend"]
        self.assertEqual(legend["type"], "classes")
        self.assertEqual(
            [(i["value"], i["label"]) for i in legend["items"]],
            [(1, "Very low"), (2, "Low"), (3, "Moderate"), (4, "High"), (5, "Very high")],
        )
        # The classes ramp is the probability ramp, so a colour means the same
        # thing on both maps.
        self.assertEqual([i["color"] for i in legend["items"]], [c for _, c in maps.PROBABILITY_STOPS])

    def test_class_labels_come_from_the_results_own_table_by_class_number(self) -> None:
        classes = [{"class": 5, "label": "Extreme"}, {"class": 1, "label": "Minimal"}]
        run = self.make_run({"classes": classes, "rasters": {"classes": "classes.tif"}})
        items = self.client.get(f"/api/v1/runs/{run.run_id}/result").json()["maps"][0]["legend"]["items"]
        self.assertEqual([i["label"] for i in items], ["Minimal", "Low", "Moderate", "High", "Extreme"])

    def test_a_legacy_result_is_an_overlay_and_shows_file_names_not_paths(self) -> None:
        run = self.make_run(
            {
                "classes": OVERLAY_CLASSES,
                "rasters": {
                    "index": "/srv/old-host/rangeland-workspace/r_000000000001/index.tif",
                    "classes": "/srv/old-host/rangeland-workspace/r_000000000001/classes.tif",
                },
            }
        )
        body = self.client.get(f"/api/v1/runs/{run.run_id}/result").json()
        self.assertEqual(body["kind"], "overlay")
        self.assertEqual(body["rasters"], {"index": "index.tif", "classes": "classes.tif"})
        self.assertEqual([m["id"] for m in body["maps"]], ["classes"])

    def test_a_result_with_no_rasters_has_no_maps(self) -> None:
        run = self.make_run({"classes": []})
        body = self.client.get(f"/api/v1/runs/{run.run_id}/result").json()
        self.assertEqual(body["maps"], [])
        self.assertEqual(body["rasters"], {})


class TileTests(MapTestCase):
    def test_every_pixel_lands_where_osr_says_with_its_class_colour(self) -> None:
        """The georeferencing proof.

        Each of the 25 source pixel centres is projected to EPSG:3857 with OSR,
        independently of the endpoint, and mapped to a tile pixel. That tile
        pixel must carry the source pixel's class colour; the nodata centre and
        the margin outside the raster must be transparent.
        """
        run = self.prediction_run()
        bbox = grid_bbox_3857()
        width = height = 256
        response = self.tile(run.run_id, "classes", bbox, width, height)
        self.assertEqual(response.status_code, 200, response.content[:300])
        self.assertEqual(response["Content-Type"], "image/png")
        self.assertEqual(response["Cache-Control"], "public, max-age=86400")

        image = decode_png(response.content)
        self.assertEqual(image.shape, (height, width, 4))
        minx, miny, maxx, maxy = bbox
        for row in range(SIZE):
            for col in range(SIZE):
                x, y = utm_to_3857(*pixel_centre(row, col))
                tc = int((x - minx) / (maxx - minx) * width)
                tr = int((maxy - y) / (maxy - miny) * height)
                pixel = image[tr, tc]
                value = CLASS_GRID[row, col]
                if value == NODATA:
                    self.assertEqual(pixel[3], 0, f"nodata pixel ({row},{col}) is drawn")
                else:
                    expected = rgb(maps.CLASS_COLORS[int(value) - 1]) + [255]
                    self.assertEqual(pixel.tolist(), expected, f"source pixel ({row},{col}) at tile ({tr},{tc})")

        # The margin is outside the raster: transparent, not black.
        self.assertEqual(image[0, 0, 3], 0)
        self.assertEqual(image[-1, -1, 3], 0)

    def test_probability_is_coloured_by_the_ramp_and_nodata_is_transparent(self) -> None:
        run = self.prediction_run()
        # A small box well inside pixel (1, 3), which holds 0.5 and is
        # surrounded by 0.5, so bilinear gives exactly 0.5 there.
        x, y = utm_to_3857(*pixel_centre(1, 3))
        response = self.tile(run.run_id, "probability", (x - 200, y - 200, x + 200, y + 200), 8, 8)
        self.assertEqual(response.status_code, 200)
        image = decode_png(response.content)
        self.assertTrue((image[..., :3] == rgb("#ffffbf")).all())
        self.assertTrue((image[..., 3] == 255).all())

        # Pixel (0, 0) is 0.0, next to 0.5s. A 1x1 tile centred on its
        # projected centre samples exactly there, where bilinear gives the
        # pixel value itself: the ramp's first stop, blue. (A tile pixel even
        # 25 m off-centre blends in a little of the 0.5 neighbour.)
        x, y = utm_to_3857(*pixel_centre(0, 0))
        image = decode_png(self.tile(run.run_id, "probability", (x - 10, y - 10, x + 10, y + 10), 1, 1).content)
        self.assertEqual(image[0, 0].tolist(), rgb("#2c7bb6") + [255])

        # The nodata centre stays transparent under bilinear: the warper does
        # not blend -9999 into a colour.
        x, y = utm_to_3857(*pixel_centre(2, 2))
        image = decode_png(self.tile(run.run_id, "probability", (x - 100, y - 100, x + 100, y + 100), 4, 4).content)
        self.assertTrue((image[..., 3] == 0).all())

    def test_a_tile_entirely_outside_the_raster_is_fully_transparent(self) -> None:
        run = self.prediction_run()
        response = self.tile(run.run_id, "disagreement", (0.0, 0.0, 1000.0, 1000.0), 16, 16)
        self.assertEqual(response.status_code, 200)
        self.assertTrue((decode_png(response.content)[..., 3] == 0).all())

    def test_a_legacy_absolute_path_is_found_in_the_workspace(self) -> None:
        """An old overlay stored the path on the machine that ran it. Only the
        basename is used, looked for in this run's workspace, which is also
        derived from WORKSPACE_DIR when the run row has none."""
        run = self.make_run(
            {"rasters": {"classes": "/somewhere/else/entirely/classes.tif"}},
            store_workspace=False,
            files={"classes.tif": CLASS_GRID},
        )
        x, y = utm_to_3857(*pixel_centre(0, 0))
        response = self.tile(run.run_id, "classes", (x - 100, y - 100, x + 100, y + 100), 4, 4)
        self.assertEqual(response.status_code, 200, response.content[:300])
        self.assertEqual(decode_png(response.content)[2, 2].tolist(), rgb(maps.CLASS_COLORS[0]) + [255])

    def test_status_codes(self) -> None:
        run = self.prediction_run()
        good = grid_bbox_3857()
        self.assertEqual(self.tile("r_nope", "classes", good).status_code, 404)
        self.assertEqual(self.tile(run.run_id, "index", good).status_code, 404)
        self.assertEqual(self.tile(run.run_id, "elevation", good).status_code, 404)

        queued = self.make_run({"rasters": {"classes": "classes.tif"}}, run_id="r_queued000001", status=Run.Status.RUNNING)
        response = self.tile(queued.run_id, "classes", good)
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["runStatus"], "running")

        url = f"/api/v1/runs/{run.run_id}/tiles/classes"
        for params in (
            {},
            {"BBOX": "1,2,3"},
            {"BBOX": "a,b,c,d"},
            {"BBOX": "nan,0,1,1"},
            {"BBOX": "0,0,inf,1"},
            {"BBOX": "10,0,5,1"},
            {"BBOX": "0,0,0,1"},
            {"BBOX": "0,0,1,1", "WIDTH": "0"},
            {"BBOX": "0,0,1,1", "HEIGHT": "1025"},
            {"BBOX": "0,0,1,1", "WIDTH": "big"},
        ):
            self.assertEqual(self.client.get(url, params).status_code, 400, params)
        self.assertEqual(self.client.get(url, {"bbox": "0,0,1,1", "width": "1024", "height": "1"}).status_code, 200)

    def test_a_listed_raster_missing_from_disk_is_404(self) -> None:
        run = self.make_run({"rasters": {"classes": "classes.tif"}})
        self.assertEqual(self.tile(run.run_id, "classes", grid_bbox_3857()).status_code, 404)


class DownloadTests(MapTestCase):
    def test_streams_the_geotiff_as_an_attachment(self) -> None:
        run = self.prediction_run()
        response = self.client.get(f"/api/v1/runs/{run.run_id}/rasters/probability.tif")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "image/tiff")
        self.assertEqual(
            response["Content-Disposition"], f'attachment; filename="{run.run_id}-probability.tif"'
        )
        body = b"".join(response.streaming_content)
        on_disk = (self.workspaces / run.run_id / "probability.tif").read_bytes()
        self.assertEqual(body, on_disk)

    def test_a_legacy_overlay_index_is_downloadable_by_basename(self) -> None:
        run = self.make_run(
            {"rasters": {"index": "/old/host/r_000000000001/index.tif"}},
            store_workspace=False,
            files={"index.tif": CLASS_GRID},
        )
        response = self.client.get(f"/api/v1/runs/{run.run_id}/rasters/index.tif")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Disposition"], f'attachment; filename="{run.run_id}-index.tif"')
        response.close()

    def test_status_codes(self) -> None:
        run = self.prediction_run()
        self.assertEqual(self.client.get("/api/v1/runs/r_nope/rasters/classes.tif").status_code, 404)
        self.assertEqual(self.client.get(f"/api/v1/runs/{run.run_id}/rasters/index.tif").status_code, 404)
        queued = self.make_run({"rasters": {"classes": "classes.tif"}}, run_id="r_queued000001", status=Run.Status.QUEUED)
        self.assertEqual(self.client.get(f"/api/v1/runs/{queued.run_id}/rasters/classes.tif").status_code, 409)

    def test_traversal_is_refused(self) -> None:
        """Every way out of the workspace answers 404.

        The secret sits next to the workspace directory, one `..` away, so a
        resolver that honoured any of these would find it.
        """
        secret = self.workspaces / "secret.tif"
        write_tif(secret, CLASS_GRID)
        outside = self.root / "outside.tif"
        write_tif(outside, CLASS_GRID)

        run = self.make_run(
            {
                "rasters": {
                    "classes": "classes.tif",
                    "dotdot": "../secret.tif",
                    "absolute": str(outside),
                    "passwd": "/etc/passwd",
                    "link": "link.tif",
                    "parent": "..",
                },
            },
            files={"classes.tif": CLASS_GRID},
        )
        workspace = self.workspaces / run.run_id
        os.symlink(outside, workspace / "link.tif")

        base = f"/api/v1/runs/{run.run_id}/rasters"
        for path in (
            f"{base}/../secret.tif",
            f"{base}/..%2Fsecret.tif",
            f"{base}/%2e%2e%2fsecret.tif",
            f"{base}/%2Fetc%2Fpasswd.tif",
            f"{base}/secret.tif",
            f"{base}/dotdot.tif",
            f"{base}/absolute.tif",
            f"{base}/passwd.tif",
            f"{base}/link.tif",
            f"{base}/parent.tif",
        ):
            response = self.client.get(path)
            self.assertEqual(response.status_code, 404, path)

        # The legitimate name on the same run still works, so the 404s above
        # are the resolver refusing, not the run being unreadable.
        self.assertEqual(self.client.get(f"{base}/classes.tif").status_code, 200)

    def test_a_symlink_inside_the_workspace_is_still_served(self) -> None:
        """Containment is checked on the resolved path, so a link that stays in
        the workspace is fine. Refusing every link would be a stricter rule
        than the threat needs."""
        run = self.make_run({"rasters": {"alias": "alias.tif"}}, files={"real.tif": CLASS_GRID})
        workspace = self.workspaces / run.run_id
        os.symlink(workspace / "real.tif", workspace / "alias.tif")
        response = self.client.get(f"/api/v1/runs/{run.run_id}/rasters/alias.tif")
        self.assertEqual(response.status_code, 200)
        response.close()


class ColorizeTests(TestCase):
    def test_out_of_range_and_unknown_classes_are_transparent_not_clamped(self) -> None:
        spec = maps.map_specs({"rasters": {"probability": "p.tif", "classes": "c.tif"}})
        probability, classes = spec[0], spec[1]
        rgba = maps.colorize(np.array([[np.nan, -0.5, 1.5, 0.75]]), probability)
        self.assertEqual(rgba[0, :, 3].tolist(), [0, 0, 0, 255])
        self.assertEqual(rgba[0, 3, :3].tolist(), rgb("#fdae61"))
        rgba = maps.colorize(np.array([[0.0, 6.0, np.nan, 3.0]]), classes)
        self.assertEqual(rgba[0, :, 3].tolist(), [0, 0, 0, 255])
        self.assertEqual(rgba[0, 3, :3].tolist(), rgb(maps.CLASS_COLORS[2]))


# ------------------------------------------------- round-2 hardening (critic)


def write_any(path: Path, array: np.ndarray, *, epsg: int | None, dtype=gdal.GDT_Float32,
              nodata: float | None = NODATA, transform=None) -> None:
    """A GeoTIFF in any CRS (or none), dtype and nodata, for the edge cases the
    pipeline can produce: Byte classes with nodata 0, NaN-nodata floats."""
    ds = gdal.GetDriverByName("GTiff").Create(str(path), array.shape[1], array.shape[0], 1, dtype)
    if transform is not None:
        ds.SetGeoTransform(transform)
    if epsg is not None:
        srs = osr.SpatialReference()
        srs.ImportFromEPSG(epsg)
        ds.SetProjection(srs.ExportToWkt())
    band = ds.GetRasterBand(1)
    if nodata is not None:
        band.SetNoDataValue(nodata)
    band.WriteArray(array)
    ds = None


def to_3857(epsg: int, x: float, y: float) -> tuple[float, float]:
    src, dst = osr.SpatialReference(), osr.SpatialReference()
    src.ImportFromEPSG(epsg)
    dst.ImportFromEPSG(3857)
    for s in (src, dst):
        s.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    px, py, _ = osr.CoordinateTransformation(src, dst).TransformPoint(x, y)
    return px, py


class RasterVariantTests(MapTestCase):
    """Rasters in other CRSs and encodings land and colour correctly."""

    def class_run(self, filename: str) -> Run:
        return self.make_run({"kind": "prediction", "rasters": {"classes": filename}})

    def assert_centre_colour(self, run: Run, epsg: int, x: float, y: float, expected: list[int]) -> None:
        cx, cy = to_3857(epsg, x, y)
        half = 50.0
        response = self.tile(run.run_id, "classes", (cx - half, cy - half, cx + half, cy + half), 8, 8)
        self.assertEqual(response.status_code, 200, response.content[:200])
        pixel = decode_png(response.content)[4, 4]
        self.assertEqual(pixel[3], 255)
        self.assertEqual(list(pixel[:3]), expected)

    def test_a_geographic_raster_lands_on_its_pixels(self) -> None:
        run = self.class_run("classes.tif")
        grid = np.array([[1, 5], [3, 2]], dtype=np.float32)
        write_any(self.workspaces / run.run_id / "classes.tif", grid, epsg=4326,
                  transform=(39.0, 0.01, 0, -1.0, 0, -0.01))
        colours = maps.CLASS_COLORS
        self.assert_centre_colour(run, 4326, 39.005, -1.005, rgb(colours[0]))
        self.assert_centre_colour(run, 4326, 39.015, -1.005, rgb(colours[4]))
        self.assert_centre_colour(run, 4326, 39.005, -1.015, rgb(colours[2]))

    def test_a_zone_36_raster_lands_on_its_pixels(self) -> None:
        run = self.class_run("classes.tif")
        grid = np.array([[2, 4]], dtype=np.float32)
        write_any(self.workspaces / run.run_id / "classes.tif", grid, epsg=32636,
                  transform=(800_000.0, 1000.0, 0, -100_000.0, 0, -1000.0))
        self.assert_centre_colour(run, 32636, 800_500.0, -100_500.0, rgb(maps.CLASS_COLORS[1]))
        self.assert_centre_colour(run, 32636, 801_500.0, -100_500.0, rgb(maps.CLASS_COLORS[3]))

    def test_byte_classes_with_nodata_zero_are_transparent_there(self) -> None:
        # What the prediction pipeline writes (statistics.CLASS_NODATA = 0).
        run = self.class_run("classes.tif")
        grid = np.array([[0, 3]], dtype=np.uint8)
        write_any(self.workspaces / run.run_id / "classes.tif", grid, epsg=UTM37N,
                  dtype=gdal.GDT_Byte, nodata=0,
                  transform=(ORIGIN_X, 1000.0, 0, ORIGIN_Y, 0, -1000.0))
        cx, cy = utm_to_3857(ORIGIN_X + 500, ORIGIN_Y - 500)
        tile = decode_png(self.tile(run.run_id, "classes", (cx - 50, cy - 50, cx + 50, cy + 50), 8, 8).content)
        self.assertEqual(tile[4, 4, 3], 0, "class 0 is nodata, not a colour")
        self.assert_centre_colour(run, UTM37N, ORIGIN_X + 1500, ORIGIN_Y - 500, rgb(maps.CLASS_COLORS[2]))

    def test_nan_nodata_never_bleeds_into_a_bilinear_neighbour(self) -> None:
        run = self.make_run({"kind": "prediction", "rasters": {"probability": "probability.tif"}})
        grid = np.full((5, 5), 0.0, dtype=np.float32)
        grid[2, 2] = np.nan
        write_any(self.workspaces / run.run_id / "probability.tif", grid, epsg=UTM37N, nodata=None,
                  transform=(ORIGIN_X, PIXEL, 0, ORIGIN_Y, 0, -PIXEL))
        body = self.tile(run.run_id, "probability", grid_bbox_3857(0.0), 64, 64).content
        alpha = decode_png(body)[..., 3]
        transparent = int((alpha == 0).sum())
        # One 2 km pixel of 10 km is 1/25 of the tile. Smeared by bilinear it
        # would be about four times that; allow the edges a little slack.
        self.assertGreater(transparent, 0)
        self.assertLess(transparent, 64 * 64 / 25 * 2)


class BrokenRasterTests(MapTestCase):
    def test_a_corrupt_raster_is_a_json_500_without_a_path(self) -> None:
        run = self.make_run({"kind": "prediction", "rasters": {"probability": "probability.tif"}})
        (self.workspaces / run.run_id / "probability.tif").write_bytes(b"II*\x00 not really a tiff")
        response = self.tile(run.run_id, "probability", grid_bbox_3857())
        self.assertEqual(response.status_code, 500)
        self.assertEqual(response["Content-Type"], "application/json")
        self.assertNotIn(str(self.workspaces), response.content.decode())

    def test_a_raster_with_no_crs_is_refused_not_drawn_empty(self) -> None:
        run = self.make_run({"kind": "prediction", "rasters": {"probability": "probability.tif"}})
        write_any(self.workspaces / run.run_id / "probability.tif",
                  np.full((5, 5), 0.5, np.float32), epsg=None)
        response = self.tile(run.run_id, "probability", grid_bbox_3857())
        self.assertEqual(response.status_code, 500)
        self.assertIn("coordinate system", response.json()["error"])

    def test_malformed_raster_entries_offer_neither_a_map_nor_a_download(self) -> None:
        for rasters in ({"classes": 5}, None, {"classes": ""}, {"classes": ".."}):
            run = self.make_run({"kind": "overlay", "rasters": rasters}, run_id=f"r_{uuid.uuid4().hex[:12]}")
            body = self.client.get(f"/api/v1/runs/{run.run_id}/result").json()
            self.assertEqual(body["maps"], [], rasters)
            self.assertEqual(body["rasters"], {}, rasters)


class TileRequestTests(MapTestCase):
    def test_strict_parsing(self) -> None:
        run = self.prediction_run()
        url = f"/api/v1/runs/{run.run_id}/tiles/probability"
        good = bbox_param(grid_bbox_3857())
        bad = [
            {"BBOX": "-1e300,-1,1e300,1"},
            {"BBOX": "0,0,30000000,1"},
            {"BBOX": "0,0,nan,1"},
            {"BBOX": "1,2,3"},
            {"BBOX": good, "WIDTH": ""},
            {"BBOX": good, "WIDTH": "+256"},
            {"BBOX": good, "WIDTH": "1_000"},
            {"BBOX": good, "WIDTH": "٢٥٦"},  # Arabic-Indic 256
            {"BBOX": good, "WIDTH": "1025"},
            {"BBOX": good, "WIDTH": "0"},
        ]
        for params in bad:
            self.assertEqual(self.client.get(url, params).status_code, 400, params)
        self.assertEqual(self.client.get(url, {"bbox": good, "width": "64", "height": "64"}).status_code, 200)

    def test_head_works_for_caches(self) -> None:
        run = self.prediction_run()
        tile = self.client.head(f"/api/v1/runs/{run.run_id}/tiles/probability", {"BBOX": bbox_param(grid_bbox_3857())})
        self.assertEqual(tile.status_code, 200)
        download = self.client.head(f"/api/v1/runs/{run.run_id}/rasters/probability.tif")
        self.assertEqual(download.status_code, 200)

    def test_a_failed_runs_409_names_the_error_everywhere(self) -> None:
        run = self.make_run({}, status=Run.Status.FAILED)
        Run.objects.filter(pk=run.run_id).update(error={"stage": "fetch", "message": "gone"})
        for url in (f"/api/v1/runs/{run.run_id}/result",
                    f"/api/v1/runs/{run.run_id}/tiles/probability?BBOX=0,0,1,1",
                    f"/api/v1/runs/{run.run_id}/rasters/probability.tif"):
            response = self.client.get(url)
            self.assertEqual(response.status_code, 409, url)
            self.assertEqual(response.json()["runError"], {"stage": "fetch", "message": "gone"}, url)


class OverviewTests(MapTestCase):
    def test_overviews_are_built_once_beside_the_raster_with_the_right_resampling(self) -> None:
        path = self.root / "big.tif"
        write_any(path, np.ones((1200, 2100), np.float32), epsg=UTM37N,
                  transform=(ORIGIN_X, 30.0, 0, ORIGIN_Y, 0, -30.0))
        self.assertTrue(maps.build_overviews(path, "classes"))
        self.assertTrue(Path(f"{path}.ovr").exists())
        ds = gdal.Open(str(path))
        self.assertEqual(ds.GetRasterBand(1).GetOverviewCount(), len(maps.overview_levels(2100, 1200)))
        ds = None
        stamp = os.stat(f"{path}.ovr").st_mtime_ns
        self.assertTrue(maps.build_overviews(path, "classes"))
        self.assertEqual(os.stat(f"{path}.ovr").st_mtime_ns, stamp, "built once")
        self.assertEqual(sorted(p.name for p in self.root.iterdir() if p.name.startswith(".big")),
                         [".big.tif.ovr.lock"], "no temporary files left behind")

    def test_a_small_raster_needs_none(self) -> None:
        self.assertEqual(maps.overview_levels(1024, 900), [])
        self.assertEqual(maps.overview_levels(9000, 11000), [2, 4, 8, 16, 32, 64])
        self.assertEqual(maps.overview_resampling("classes"), "NEAREST")
        self.assertEqual(maps.overview_resampling("continuous"), "AVERAGE")

    def test_a_failed_overview_build_never_fails_the_caller(self) -> None:
        maps.build_overviews_quietly(self.root / "missing.tif", "classes")
