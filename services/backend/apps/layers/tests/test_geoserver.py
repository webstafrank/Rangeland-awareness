"""The OGC parsers, against documents the real GeoServer actually produced.

The fixtures are not hand-written. They were captured from
`192.168.0.40:8080/geoserver` on 2026-09-14 and committed gzipped, because the
WMS capabilities document is 258KB raw and 26KB compressed, and because a
hand-trimmed version would quietly lose the exact thing these parsers get wrong:
inheritance, namespace drift, and a root layer that declares 7957 CRS codes.

Re-capture them with:

    curl -s "$GEOSERVER/wms?SERVICE=WMS&REQUEST=GetCapabilities&VERSION=1.3.0" \\
      | gzip -9 > apps/layers/tests/fixtures/wms-capabilities.xml.gz

Nothing here touches the network. The live server is exercised by
`manage.py check_geoserver`, which is a separate, explicit act.
"""

from __future__ import annotations

import gzip
from pathlib import Path

from django.test import SimpleTestCase

from apps.layers.geoserver import (
    WEB_CRS,
    BoundingBox,
    GeoServerClient,
    GeoServerError,
    Layer,
    parse_describe_coverage,
    parse_wfs_feature_types,
    parse_wms_capabilities,
)

FIXTURES = Path(__file__).resolve().parent / "fixtures"


def _read(name: str) -> bytes:
    path = FIXTURES / name
    if path.suffix == ".gz":
        with gzip.open(path, "rb") as handle:
            return handle.read()
    return path.read_bytes()


class WmsCapabilitiesTests(SimpleTestCase):
    @classmethod
    def setUpClass(cls) -> None:
        super().setUpClass()
        cls.layers = parse_wms_capabilities(_read("wms-capabilities.xml.gz"))
        cls.by_name = {layer.name: layer for layer in cls.layers}

    def test_parses_every_named_layer(self) -> None:
        # 23, not the 39 a naive grep for <Name> finds: styles carry qualified
        # names too, and counting those would put "TR_Rainfall_Style" in the
        # catalogue as though it were a layer.
        self.assertEqual(len(self.layers), 23)

    def test_skips_unnamed_group_layers(self) -> None:
        # WMS nests layers for grouping and an unnamed parent is a folder, not
        # something GetMap can render. Including one puts an entry in the
        # catalogue that answers every tile request with an exception.
        self.assertTrue(all(layer.name for layer in self.layers))

    def test_qualified_names_and_workspaces(self) -> None:
        layer = self.by_name["Hazards_Dashboard:TanaRiver_Slope"]
        self.assertEqual(layer.workspace, "Hazards_Dashboard")

        # Title is NOT the name, and this deployment proves it: the layer is
        # named TanaRiver_Slope and titled TR_Slope. That is why `name` is the
        # identifier everywhere and `title` is only ever shown to a person — an
        # app keying anything off the title breaks when somebody renames it in
        # the GeoServer UI, which is a thing people do.
        self.assertEqual(layer.title, "TR_Slope")

    def test_inherits_crs_from_the_root_layer(self) -> None:
        """The inheritance rule, which is the whole reason for the tree walk.

        GeoServer declares its CRS list once, on the root layer, and not on each
        child. A parser reading only an element's own children reports every
        layer as supporting nothing, and the map then refuses to request a tile
        in Web Mercator because the catalogue says it is unsupported.
        """
        layer = self.by_name["Hazards_Dashboard:TanaRiver_Slope"]
        self.assertGreater(len(layer.crs), 7000)
        for crs in ("EPSG:3857", "EPSG:4326"):
            self.assertTrue(layer.supports(crs), crs)

    def test_supports_is_case_insensitive(self) -> None:
        layer = self.by_name["Hazards_Dashboard:TanaRiver_Slope"]
        self.assertTrue(layer.supports("epsg:3857"))

    def test_json_emits_only_usable_crs(self) -> None:
        """The 180,000-string problem, asserted.

        Every layer inherits ~8000 CRS codes. Emitting them verbatim across 23
        layers would be a catalogue response of roughly 180,000 strings whose
        consumer needs to know one thing: can I ask for Web Mercator.
        """
        body = self.by_name["Hazards_Dashboard:TanaRiver_Slope"].as_json()
        self.assertEqual(body["crsCount"], 7957)
        self.assertLessEqual(len(body["crs"]), len(WEB_CRS))
        self.assertIn("EPSG:3857", body["crs"])

    def test_reads_the_geographic_bounding_box(self) -> None:
        bbox = self.by_name["Hazards_Dashboard:TanaRiver_Slope"].bbox
        self.assertIsNotNone(bbox)
        assert bbox is not None
        # The Tana River basin: eastern Kenya, straddling the equator's south.
        self.assertAlmostEqual(bbox.west, 38.43, places=1)
        self.assertAlmostEqual(bbox.east, 40.73, places=1)
        self.assertLess(bbox.south, bbox.north)

    def test_reads_styles(self) -> None:
        self.assertEqual(
            self.by_name["Hazards_Dashboard:TanaRiver_Slope"].styles, ("raster",)
        )

    def test_reports_queryable(self) -> None:
        self.assertTrue(self.by_name["Hazards_Dashboard:Kenya_Counties"].queryable)

    def test_refuses_a_service_exception_rather_than_returning_nothing(self) -> None:
        """A ServiceException parses as valid XML and has no Capability element.

        Returning an empty list for it would be indistinguishable from a
        GeoServer that publishes no layers, and the app would show an empty
        catalogue rather than an error.
        """
        body = (
            b'<?xml version="1.0"?><ServiceExceptionReport>'
            b"<ServiceException>Service unavailable</ServiceException>"
            b"</ServiceExceptionReport>"
        )
        with self.assertRaises(GeoServerError) as caught:
            parse_wms_capabilities(body)
        self.assertIn("Service unavailable", str(caught.exception))

    def test_refuses_non_xml(self) -> None:
        with self.assertRaises(GeoServerError):
            parse_wms_capabilities(b"<html>502 Bad Gateway</html>not xml")


class WfsCapabilitiesTests(SimpleTestCase):
    def test_reads_the_feature_types(self) -> None:
        names = parse_wfs_feature_types(_read("wfs-capabilities.xml.gz"))
        self.assertEqual(
            names,
            {
                "Hazards_Dashboard:Kenya_Counties",
                "Hazards_Dashboard:TR_Rivers",
                "Kenya_SubCounties:ke_subcounty",
                "TR_Towns:TR_Towns",
            },
        )

    def test_a_wfs_name_marks_a_layer_vector(self) -> None:
        # The catalogue reports kind without a second request per layer, by
        # intersecting the WMS layer list with the WFS type list.
        layers = parse_wms_capabilities(_read("wms-capabilities.xml.gz"))
        vector_names = parse_wfs_feature_types(_read("wfs-capabilities.xml.gz"))
        counties = next(
            l for l in layers if l.name == "Hazards_Dashboard:Kenya_Counties"
        )
        slope = next(
            l for l in layers if l.name == "Hazards_Dashboard:TanaRiver_Slope"
        )
        self.assertIn(counties.name, vector_names)
        self.assertNotIn(slope.name, vector_names)


class DescribeCoverageTests(SimpleTestCase):
    @classmethod
    def setUpClass(cls) -> None:
        super().setUpClass()
        cls.grid = parse_describe_coverage(
            _read("describe-coverage-slope.xml"),
            "Hazards_Dashboard__TanaRiver_Slope",
        )

    def test_reads_a_projected_crs_from_the_uri_form(self) -> None:
        # GeoServer writes `http://www.opengis.net/def/crs/EPSG/0/32637`, not
        # `EPSG:32637`, and the pipeline needs the short form for GDAL.
        self.assertEqual(self.grid.crs, "EPSG:32637")

    def test_grid_high_is_inclusive(self) -> None:
        """The off-by-one that would shift every warp by a pixel.

        `gml:GridEnvelope/high` is the last index, not the count, so a 0..8513
        range is 8514 pixels. Getting this wrong is invisible until two rasters
        computed from different criteria fail to line up.
        """
        self.assertEqual(self.grid.size, (8514, 11266))

    def test_derives_a_30m_resolution(self) -> None:
        # Derived from extent over pixel count rather than read from the offset
        # vector, which is signed and axis-ordered and silently flips a raster
        # when misread. 30m is what this deployment publishes.
        x_res, y_res = self.grid.resolution
        self.assertAlmostEqual(x_res, 30.0, places=3)
        self.assertAlmostEqual(y_res, 30.0, places=3)

    def test_reads_the_band_names(self) -> None:
        self.assertEqual(self.grid.bands, ("GRAY_INDEX",))

    def test_refuses_a_coverage_that_does_not_exist(self) -> None:
        body = (
            b'<?xml version="1.0"?><ows:ExceptionReport '
            b'xmlns:ows="http://www.opengis.net/ows/2.0">'
            b'<ows:Exception exceptionCode="NoSuchCoverage">'
            b"<ows:ExceptionText>No such coverage: nope</ows:ExceptionText>"
            b"</ows:Exception></ows:ExceptionReport>"
        )
        with self.assertRaises(GeoServerError) as caught:
            parse_describe_coverage(body, "nope")
        self.assertIn("No such coverage", str(caught.exception))


class CoverageIdTests(SimpleTestCase):
    def test_colon_becomes_a_double_underscore(self) -> None:
        """The undocumented spelling that costs everyone an afternoon.

        WCS 2.0 coverage ids cannot contain a colon, so GeoServer substitutes
        `__` for the workspace separator. Sending the WMS name gets
        "No such coverage" for a layer that plainly exists in capabilities.
        """
        self.assertEqual(
            GeoServerClient.coverage_id("Hazards_Dashboard:TanaRiver_Slope"),
            "Hazards_Dashboard__TanaRiver_Slope",
        )

    def test_an_unqualified_name_is_unchanged(self) -> None:
        self.assertEqual(GeoServerClient.coverage_id("Nairobi"), "Nairobi")


class LayerJsonTests(SimpleTestCase):
    def test_kind_follows_the_vector_flag(self) -> None:
        raster = Layer(name="ws:r", title="r")
        vector = Layer(name="ws:v", title="v", vector=True)
        self.assertEqual(raster.as_json()["kind"], "raster")
        self.assertEqual(vector.as_json()["kind"], "vector")

    def test_bbox_serialises_west_south_east_north(self) -> None:
        layer = Layer(
            name="ws:l", title="l", bbox=BoundingBox(1.0, 2.0, 3.0, 4.0)
        )
        self.assertEqual(layer.as_json()["bbox"], [1.0, 2.0, 3.0, 4.0])

    def test_default_style_is_the_first(self) -> None:
        self.assertEqual(
            Layer(name="ws:l", title="l", styles=("a", "b")).default_style, "a"
        )
        self.assertIsNone(Layer(name="ws:l", title="l").default_style)
