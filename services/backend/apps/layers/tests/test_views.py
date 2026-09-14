"""The layer API, with GeoServer stubbed.

These are the guarantees the map depends on, and every one of them is a thing
that fails silently in production if it regresses: a tile endpoint that forwards
an arbitrary layer name, a proxy that passes a ServiceException through as an
image, a catalogue that reports stale data as current.

GeoServer is replaced by a stub rather than recorded at the HTTP layer. The
parsers already have the real documents (test_geoserver.py); what these need to
vary is behaviour — refuse, return XML, go away mid-session — which a fixture
cannot express.
"""

from __future__ import annotations

from unittest import mock

from django.test import SimpleTestCase, override_settings

from apps.layers import catalog
from apps.layers.geoserver import BoundingBox, GeoServerError, Layer

SLOPE = Layer(
    name="Hazards_Dashboard:TanaRiver_Slope",
    title="TR_Slope",
    workspace="Hazards_Dashboard",
    crs=frozenset({"EPSG:3857", "EPSG:4326", "EPSG:32637"}),
    bbox=BoundingBox(38.4332, -3.0731, 40.7316, -0.0154),
    styles=("raster",),
)
COUNTIES = Layer(
    name="Hazards_Dashboard:Kenya_Counties",
    title="Kenya_Counties",
    workspace="Hazards_Dashboard",
    crs=frozenset({"EPSG:3857", "EPSG:4326"}),
    styles=("polygon",),
    queryable=True,
    vector=True,
)


class FakeUpstream:
    """Stands in for a `requests.Response` from GeoServer."""

    def __init__(self, *, content: bytes = b"", content_type: str = "image/png"):
        self.headers = {"Content-Type": content_type}
        self._content = content

    @property
    def text(self) -> str:
        return self._content.decode("utf-8", "replace")

    def iter_content(self, chunk_size: int = 1024):
        yield self._content


def fake_client(**overrides):
    """A GeoServerClient stub whose methods can each be overridden."""
    client = mock.MagicMock()
    client.layers.return_value = [SLOPE, COUNTIES]
    client.get_map.return_value = FakeUpstream(content=b"\x89PNG-tile")
    client.legend.return_value = FakeUpstream(content=b"\x89PNG-legend")
    client.probe.return_value = {
        "endpoint": "http://stub:8080/geoserver",
        "reachable": True,
        "detail": None,
        "layerCount": 2,
        "elapsedMs": 1,
    }
    for key, value in overrides.items():
        getattr(client, key).side_effect = None
        if isinstance(value, Exception):
            getattr(client, key).side_effect = value
        else:
            getattr(client, key).return_value = value
    return client


class LayerApiTests(SimpleTestCase):
    def setUp(self) -> None:
        catalog.invalidate()
        self.addCleanup(catalog.invalidate)

    def _patch(self, client):
        patcher = mock.patch(
            "apps.layers.catalog.GeoServerClient", return_value=client
        )
        patcher.start()
        self.addCleanup(patcher.stop)
        patcher2 = mock.patch(
            "apps.layers.views.GeoServerClient", return_value=client
        )
        patcher2.start()
        self.addCleanup(patcher2.stop)
        return client

    # ------------------------------------------------------------- catalogue

    def test_lists_layers(self) -> None:
        self._patch(fake_client())
        body = self.client.get("/api/v1/layers").json()
        self.assertEqual(body["count"], 2)
        self.assertEqual(
            [l["id"] for l in body["layers"]],
            [SLOPE.name, COUNTIES.name],
        )
        self.assertFalse(body["stale"])

    def test_filters_by_workspace_and_kind(self) -> None:
        self._patch(fake_client())
        vectors = self.client.get("/api/v1/layers?kind=vector").json()
        self.assertEqual([l["id"] for l in vectors["layers"]], [COUNTIES.name])
        rasters = self.client.get("/api/v1/layers?kind=raster").json()
        self.assertEqual([l["id"] for l in rasters["layers"]], [SLOPE.name])
        none = self.client.get("/api/v1/layers?workspace=nope").json()
        self.assertEqual(none["count"], 0)

    def test_503_when_geoserver_is_down_and_nothing_is_cached(self) -> None:
        """An empty catalogue would read as "this server publishes nothing"."""
        self._patch(fake_client(layers=GeoServerError("connection refused")))
        response = self.client.get("/api/v1/layers")
        self.assertEqual(response.status_code, 503)
        self.assertIn("connection refused", response.json()["detail"])

    def test_serves_a_stale_catalogue_and_says_so(self) -> None:
        """A map that keeps drawing beats a correct refusal, if it admits it."""
        client = self._patch(fake_client())
        self.assertEqual(self.client.get("/api/v1/layers").json()["count"], 2)

        client.layers.side_effect = GeoServerError("gone away")
        with override_settings(
            GEOSERVER={**self.settings_geoserver(), "capabilities_ttl": 0}
        ):
            body = self.client.get("/api/v1/layers").json()
        self.assertEqual(body["count"], 2)
        self.assertTrue(body["stale"])
        self.assertIn("gone away", body["staleReason"])

    def settings_geoserver(self) -> dict:
        from django.conf import settings

        return dict(settings.GEOSERVER)

    # ---------------------------------------------------------------- detail

    def test_detail_404_suggests_the_qualified_name(self) -> None:
        # The usual mistake is dropping the workspace prefix, and a bare 404
        # sends the caller off to read capabilities by hand.
        self._patch(fake_client())
        response = self.client.get("/api/v1/layers/TanaRiver_Slope")
        self.assertEqual(response.status_code, 404)
        self.assertIn(SLOPE.name, response.json()["didYouMean"])

    def test_detail_reports_a_missing_coverage_without_failing(self) -> None:
        # Published over WMS but not WCS is a normal state, not an error.
        client = self._patch(fake_client())
        client.describe_coverage.side_effect = GeoServerError("No such coverage")
        body = self.client.get(f"/api/v1/layers/{SLOPE.name}").json()
        self.assertIsNone(body["coverage"])
        self.assertIn("No such coverage", body["coverageDetail"])

    # ----------------------------------------------------------------- tiles

    def test_proxies_a_tile(self) -> None:
        client = self._patch(fake_client())
        response = self.client.get(
            f"/api/v1/tiles/{SLOPE.name}?BBOX=1,2,3,4&WIDTH=256&HEIGHT=256"
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(b"".join(response.streaming_content), b"\x89PNG-tile")
        params = client.get_map.call_args[0][0]
        self.assertEqual(params["LAYERS"], SLOPE.name)
        self.assertEqual(params["REQUEST"], "GetMap")

    def test_refuses_a_layer_not_in_the_catalogue(self) -> None:
        """The security boundary: a caller may only address published layers.

        Without the allow-list this endpoint is an open proxy into an internal
        GeoServer, reachable by anyone who can reach this service.
        """
        client = self._patch(fake_client())
        response = self.client.get("/api/v1/tiles/secret:payroll?BBOX=1,2,3,4")
        self.assertEqual(response.status_code, 404)
        client.get_map.assert_not_called()

    def test_drops_parameters_that_are_not_on_the_allow_list(self) -> None:
        # Vendor parameters are the reason this is an allow-list and not a
        # block-list: some of them make GeoServer read a local file.
        client = self._patch(fake_client())
        self.client.get(
            f"/api/v1/tiles/{SLOPE.name}?BBOX=1,2,3,4&sldBody=<evil/>&CQL_FILTER=1%3D1"
        )
        params = client.get_map.call_args[0][0]
        self.assertNotIn("sldBody", params)
        self.assertNotIn("CQL_FILTER", params)

    def test_normalises_leaflet_srs_to_wms_130_crs(self) -> None:
        # Leaflet's WMS layer sends SRS (a 1.1.1 spelling). Accepting it is what
        # makes this a drop-in endpoint for an unmodified L.tileLayer.wms.
        client = self._patch(fake_client())
        self.client.get(f"/api/v1/tiles/{SLOPE.name}?BBOX=1,2,3,4&SRS=EPSG:3857")
        params = client.get_map.call_args[0][0]
        self.assertEqual(params["CRS"], "EPSG:3857")
        self.assertNotIn("SRS", params)

    def test_requires_a_bbox(self) -> None:
        self._patch(fake_client())
        self.assertEqual(
            self.client.get(f"/api/v1/tiles/{SLOPE.name}").status_code, 400
        )

    def test_refuses_an_unsupported_format(self) -> None:
        self._patch(fake_client())
        response = self.client.get(
            f"/api/v1/tiles/{SLOPE.name}?BBOX=1,2,3,4&FORMAT=text/html"
        )
        self.assertEqual(response.status_code, 400)

    def test_refuses_an_enormous_tile(self) -> None:
        """One request for 30000x30000 asks GeoServer for about 3.6GB."""
        self._patch(fake_client())
        response = self.client.get(
            f"/api/v1/tiles/{SLOPE.name}?BBOX=1,2,3,4&WIDTH=30000&HEIGHT=30000"
        )
        self.assertEqual(response.status_code, 400)

    def test_turns_a_service_exception_into_an_error_not_an_image(self) -> None:
        """GeoServer answers errors with a 200 and an XML body.

        Passed through, that renders as a broken image in the map and the real
        message is never seen by anyone.
        """
        client = self._patch(fake_client())
        client.get_map.return_value = FakeUpstream(
            content=b"<ServiceExceptionReport>bad style</ServiceExceptionReport>",
            content_type="application/vnd.ogc.se_xml",
        )
        response = self.client.get(f"/api/v1/tiles/{SLOPE.name}?BBOX=1,2,3,4")
        self.assertEqual(response.status_code, 502)
        self.assertIn("bad style", response.json()["detail"])

    def test_sets_a_cache_header(self) -> None:
        self._patch(fake_client())
        response = self.client.get(f"/api/v1/tiles/{SLOPE.name}?BBOX=1,2,3,4")
        self.assertIn("max-age", response["Cache-Control"])

    # ---------------------------------------------------------------- health

    def test_health_reports_geoserver_separately(self) -> None:
        # The two fail apart and the app shows a different thing for each.
        self._patch(fake_client())
        body = self.client.get("/api/v1/health").json()
        self.assertEqual(body["status"], "ok")
        self.assertTrue(body["geoserver"]["reachable"])

    def test_health_is_degraded_not_dead_when_geoserver_is_down(self) -> None:
        client = self._patch(fake_client())
        client.probe.return_value = {
            "endpoint": "http://stub:8080/geoserver",
            "reachable": False,
            "detail": "connection refused",
            "layerCount": 0,
            "elapsedMs": 3,
        }
        body = self.client.get("/api/v1/health").json()
        self.assertEqual(body["status"], "degraded")


class CorsTests(SimpleTestCase):
    def setUp(self) -> None:
        catalog.invalidate()
        self.addCleanup(catalog.invalidate)

    def test_allows_a_configured_origin(self) -> None:
        with mock.patch(
            "apps.layers.views.GeoServerClient", return_value=fake_client()
        ):
            response = self.client.get(
                "/api/v1/health", headers={"Origin": "http://localhost:3000"}
            )
        self.assertEqual(
            response["Access-Control-Allow-Origin"], "http://localhost:3000"
        )
        # Without Vary, a cache serves one origin's response to another and the
        # browser fails with an error naming the wrong URL.
        self.assertEqual(response["Vary"], "Origin")

    def test_does_not_allow_an_unknown_origin(self) -> None:
        with mock.patch(
            "apps.layers.views.GeoServerClient", return_value=fake_client()
        ):
            response = self.client.get(
                "/api/v1/health", headers={"Origin": "https://evil.example"}
            )
        self.assertNotIn("Access-Control-Allow-Origin", response)
