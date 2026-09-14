"""The GeoServer client. The only module in this service that speaks OGC.

Everything above this file works in Python objects; everything below it is XML
over HTTP. That boundary is the point: a change to how GeoServer answers is a
change to this file and to nothing else, and a test can hand the layer above a
recorded document rather than a running server.

Three protocols, three jobs, and they are not interchangeable:

    WMS   pictures.  Tiles for the map and legend graphics. Rendered by
                     GeoServer, drawn by the browser, never read as data.
    WCS   rasters.   The actual pixel values for a coverage, as a GeoTIFF, so
                     the pipeline can do arithmetic on them.
    WFS   features.  Vector geometry as GeoJSON: county boundaries, rivers.

Asking WMS for data is the classic mistake here. A GetMap response is a picture
of a raster after a colour ramp has been applied, so its pixels are display
values. Reading slope out of a PNG gives you the style, not the gradient.

Measured against the live server on 2026-09-14, because these numbers shaped
the timeouts and the caching above:

    WMS  GetCapabilities      200, 258KB, ~1s        39 named layers
    WFS  GetCapabilities      200,  97KB, ~2s         4 feature types
    WCS  GetCapabilities      did not finish in 45s
    WCS  DescribeCoverage     200, 3.5KB, 0.4s

That third line is why nothing here calls WCS GetCapabilities. Coverages are
described one at a time, which is fast and is all the pipeline needs.
"""

from __future__ import annotations

import logging
import time
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from typing import Any, Iterator
from urllib.parse import urlencode

import requests
from django.conf import settings

log = logging.getLogger(__name__)

# OGC namespaces, as they appear in the documents this parses. Declared rather
# than stripped: two different elements are called `Name` in WMS capabilities
# and only the namespace tells them apart.
NS = {
    "wms": "http://www.opengis.net/wms",
    "ows": "http://www.opengis.net/ows/2.0",
    "wcs": "http://www.opengis.net/wcs/2.0",
    "gml": "http://www.opengis.net/gml/3.2",
    "swe": "http://www.opengis.net/swe/2.0",
    "xlink": "http://www.w3.org/1999/xlink",
}


class GeoServerError(RuntimeError):
    """GeoServer could not be reached, or answered something unusable.

    One exception type on purpose. The caller's question is never "was it a
    socket timeout or a ServiceException" — it is "can I compute right now",
    and the message carries the detail for the human.
    """


@dataclass(frozen=True)
class BoundingBox:
    """A geographic extent in WGS84, west/south/east/north."""

    west: float
    south: float
    east: float
    north: float

    def as_list(self) -> list[float]:
        return [self.west, self.south, self.east, self.north]


#: The CRSs a browser map can actually request, in the order a client should
#: prefer them.
#:
#: This list exists because of a measured surprise: GeoServer declares its whole
#: EPSG database on the root layer — 7957 codes — and WMS inheritance means
#: every child layer supports all of them. Emitting that verbatim would put
#: roughly 180,000 strings in a catalogue response whose consumer needs to know
#: exactly one thing: "can I ask for Web Mercator". So the full set is kept for
#: `supports()` and the JSON carries the intersection with this list plus a
#: count of the rest.
WEB_CRS: tuple[str, ...] = ("EPSG:3857", "EPSG:4326", "CRS:84", "EPSG:900913")


@dataclass(frozen=True)
class Layer:
    """One published layer, as the catalogue sees it.

    `name` is the qualified GeoServer name ("Hazards_Dashboard:TanaRiver_Slope")
    and is the identifier everywhere: it is what GetMap wants, what the app
    stores, and what a run configuration names. `title` is for humans and may
    change without breaking anything.
    """

    name: str
    title: str
    abstract: str = ""
    workspace: str = ""
    #: Every CRS the layer advertises, including inherited ones. A frozenset
    #: because the only question ever asked of it is membership, and because
    #: this is ~8000 entries per layer on a real GeoServer.
    crs: frozenset[str] = frozenset()
    bbox: BoundingBox | None = None
    styles: tuple[str, ...] = ()
    queryable: bool = False
    #: True when the layer is also published as a WFS feature type, which is
    #: how the catalogue reports "this is vector" without a second request.
    vector: bool = False

    @property
    def default_style(self) -> str | None:
        return self.styles[0] if self.styles else None

    def supports(self, crs: str) -> bool:
        return crs.upper() in {c.upper() for c in self.crs}

    def as_json(self) -> dict[str, Any]:
        web = [c for c in WEB_CRS if self.supports(c)]
        return {
            "id": self.name,
            "name": self.name,
            "title": self.title,
            "abstract": self.abstract,
            "workspace": self.workspace,
            # What a map client can ask for, not what the server can recite.
            "crs": web,
            "crsCount": len(self.crs),
            "bbox": self.bbox.as_list() if self.bbox else None,
            "styles": list(self.styles),
            "queryable": self.queryable,
            "kind": "vector" if self.vector else "raster",
        }


@dataclass(frozen=True)
class CoverageGrid:
    """What DescribeCoverage says about a raster, before any of it is fetched.

    The pipeline reads this to decide the reference grid: a run is computed at
    one CRS and one resolution, and every criterion is warped onto it. Knowing
    the native grid first means the warp is one operation rather than a guess
    followed by a correction.
    """

    coverage_id: str
    crs: str
    #: Pixel counts, (width, height), from the GML grid envelope.
    size: tuple[int, int]
    #: Native extent in the coverage's own CRS, (minx, miny, maxx, maxy).
    extent: tuple[float, float, float, float]
    bands: tuple[str, ...] = ()

    @property
    def resolution(self) -> tuple[float, float]:
        """Metres (or degrees) per pixel, derived rather than advertised.

        GeoServer does publish an offset vector, but it is signed and axis
        ordered, and getting that wrong silently flips a raster. Extent over
        pixel count cannot be flipped.
        """
        width, height = self.size
        minx, miny, maxx, maxy = self.extent
        return ((maxx - minx) / width, (maxy - miny) / height)


class GeoServerClient:
    """Talks to one GeoServer.

    Constructed per use rather than as a module singleton, so a test points one
    at a fixture and the live one is untouched. The capabilities cache is on the
    instance for the same reason; the shared, TTL'd cache the views use lives in
    `catalog.py`, which is where "how often do we re-read" belongs.
    """

    def __init__(
        self,
        url: str | None = None,
        user: str | None = None,
        password: str | None = None,
        timeout: float | None = None,
        session: requests.Session | None = None,
    ) -> None:
        conf = settings.GEOSERVER
        self.url = (url or conf["url"]).rstrip("/")
        self.user = user if user is not None else conf["user"]
        self.password = password if password is not None else conf["password"]
        self.timeout = timeout if timeout is not None else conf["timeout"]
        self.coverage_timeout = conf["coverage_timeout"]
        self._session = session or requests.Session()

    # ------------------------------------------------------------------ http

    @property
    def _auth(self) -> tuple[str, str] | None:
        return (self.user, self.password) if self.user and self.password else None

    def _get(
        self,
        service_path: str,
        params: dict[str, Any],
        *,
        timeout: float | None = None,
        stream: bool = False,
    ) -> requests.Response:
        url = f"{self.url}/{service_path.lstrip('/')}"
        try:
            response = self._session.get(
                url,
                params=params,
                auth=self._auth,
                timeout=timeout or self.timeout,
                stream=stream,
            )
        except requests.RequestException as exc:
            raise GeoServerError(f"{url} is unreachable: {exc}") from exc

        if response.status_code >= 400:
            raise GeoServerError(
                f"{url} answered {response.status_code}: "
                f"{response.text[:200] if not stream else ''}"
            )
        return response

    # ---------------------------------------------------------------- health

    def probe(self) -> dict[str, Any]:
        """Is GeoServer answering, and how fast.

        Deliberately a WMS GetCapabilities rather than a HEAD on the home page:
        a GeoServer whose web UI is up but whose WMS is broken is down as far as
        this service is concerned, and the distinction is invisible to a HEAD.
        """
        started = time.monotonic()
        try:
            layers = self.layers()
        except GeoServerError as exc:
            return {
                "endpoint": self.url,
                "reachable": False,
                "detail": str(exc),
                "layerCount": 0,
                "elapsedMs": round((time.monotonic() - started) * 1000),
            }
        return {
            "endpoint": self.url,
            "reachable": True,
            "detail": None,
            "layerCount": len(layers),
            "elapsedMs": round((time.monotonic() - started) * 1000),
        }

    # ------------------------------------------------------------------- wms

    def capabilities_xml(self) -> bytes:
        """The raw WMS capabilities document."""
        return self._get(
            "wms",
            {
                "SERVICE": "WMS",
                "REQUEST": "GetCapabilities",
                "VERSION": "1.3.0",
            },
        ).content

    def layers(self) -> list[Layer]:
        """Every published layer, parsed from capabilities.

        The vector flag comes from a second document (WFS capabilities), and a
        failure to read it is not fatal: a catalogue that says "raster" about a
        vector layer still draws correctly, because the map only ever asks WMS
        for a picture. So the WFS read is best-effort and its failure is logged,
        not raised.
        """
        layers = parse_wms_capabilities(self.capabilities_xml())
        try:
            vector_names = self.feature_type_names()
        except GeoServerError as exc:
            log.warning("WFS capabilities unavailable, kind will read raster: %s", exc)
            return layers
        return [
            Layer(**{**layer.__dict__, "vector": layer.name in vector_names})
            for layer in layers
        ]

    def map_url(self, params: dict[str, Any]) -> str:
        """The upstream GetMap URL, for logging and for tests to assert on."""
        return f"{self.url}/wms?{urlencode(params)}"

    def get_map(self, params: dict[str, Any]) -> requests.Response:
        """A rendered tile, streamed.

        Streamed rather than buffered because this sits on the path of every
        tile the map draws; holding a PNG in memory per request to hand it
        straight to a socket is pure overhead at the one place that is hot.
        """
        return self._get("wms", params, stream=True)

    def legend(self, layer: str, style: str | None = None) -> requests.Response:
        params = {
            "SERVICE": "WMS",
            "VERSION": "1.3.0",
            "REQUEST": "GetLegendGraphic",
            "FORMAT": "image/png",
            "LAYER": layer,
            "TRANSPARENT": "true",
        }
        if style:
            params["STYLE"] = style
        return self._get("wms", params, stream=True)

    # ------------------------------------------------------------------- wfs

    def feature_type_names(self) -> set[str]:
        """Qualified names of everything published as a WFS feature type."""
        xml = self._get(
            "wfs",
            {"SERVICE": "WFS", "REQUEST": "GetCapabilities", "VERSION": "2.0.0"},
        ).content
        return parse_wfs_feature_types(xml)

    def get_feature_geojson(
        self,
        type_name: str,
        *,
        bbox: BoundingBox | None = None,
        count: int | None = None,
        srs: str = "EPSG:4326",
    ) -> dict[str, Any]:
        """Vector features as GeoJSON.

        `outputFormat=application/json` is GeoServer's GeoJSON writer. It is
        asked for by name rather than negotiated, because the default is GML and
        parsing GML to get at a polygon this service will hand straight to GDAL
        would be work with no reader.
        """
        params: dict[str, Any] = {
            "SERVICE": "WFS",
            "VERSION": "2.0.0",
            "REQUEST": "GetFeature",
            "typeNames": type_name,
            "outputFormat": "application/json",
            "srsName": srs,
        }
        if bbox is not None:
            params["bbox"] = ",".join(str(v) for v in bbox.as_list()) + f",{srs}"
        if count is not None:
            params["count"] = count

        response = self._get("wfs", params)
        try:
            return response.json()
        except ValueError as exc:
            raise GeoServerError(
                f"WFS returned non-JSON for {type_name}: {response.text[:200]}"
            ) from exc

    # ------------------------------------------------------------------- wcs

    @staticmethod
    def coverage_id(layer_name: str) -> str:
        """GeoServer's WCS 2.0 spelling of a layer name.

        WCS 2.0 coverage ids cannot contain a colon, so GeoServer substitutes a
        double underscore for the workspace separator. This is not documented
        anywhere prominent and is the single most common reason a DescribeCoverage
        returns "No such coverage" for a layer that plainly exists.
        """
        return layer_name.replace(":", "__")

    def describe_coverage(self, layer_name: str) -> CoverageGrid:
        xml = self._get(
            "wcs",
            {
                "SERVICE": "WCS",
                "VERSION": "2.0.1",
                "REQUEST": "DescribeCoverage",
                "CoverageId": self.coverage_id(layer_name),
            },
        ).content
        return parse_describe_coverage(xml, self.coverage_id(layer_name))

    def get_coverage(
        self,
        layer_name: str,
        *,
        subset: tuple[float, float, float, float] | None = None,
        subset_crs: str | None = None,
    ) -> bytes:
        """A coverage as GeoTIFF bytes, optionally windowed.

        The subset is expressed on the coverage's own axes. Their names are read
        from DescribeCoverage rather than assumed to be E/N: a geographic
        coverage calls them Long/Lat, and a subset naming the wrong axis is
        rejected by GeoServer with a message that does not say which axis it
        wanted.
        """
        params: dict[str, Any] = {
            "SERVICE": "WCS",
            "VERSION": "2.0.1",
            "REQUEST": "GetCoverage",
            "CoverageId": self.coverage_id(layer_name),
            "format": "image/tiff",
        }
        if subset is not None:
            grid = self.describe_coverage(layer_name)
            axes = _axis_labels(grid)
            minx, miny, maxx, maxy = subset
            params["subset"] = [
                f"{axes[0]}({minx},{maxx})",
                f"{axes[1]}({miny},{maxy})",
            ]
            if subset_crs:
                params["subsettingCRS"] = subset_crs

        response = self._get("wcs", params, timeout=self.coverage_timeout)
        content_type = response.headers.get("Content-Type", "")
        if "xml" in content_type:
            raise GeoServerError(
                f"WCS refused {layer_name}: {response.text[:300]}"
            )
        return response.content


def _axis_labels(grid: CoverageGrid) -> tuple[str, str]:
    """Axis names for a subset request, x first.

    Projected CRSs use E/N and geographic ones Long/Lat. Defaulting to E/N is
    right for this deployment (every raster on it is EPSG:32637) and wrong in
    general, which is why the CRS decides rather than the default.
    """
    return ("Long", "Lat") if _is_geographic(grid.crs) else ("E", "N")


def _is_geographic(crs: str) -> bool:
    return crs.endswith(("4326", "4258", "4269"))


# --------------------------------------------------------------------- parsing
#
# Parsers are module functions taking bytes, not methods. That is what lets the
# tests run the real documents captured from the live server through them with
# no server, no client and no network.


def parse_wms_capabilities(xml: bytes) -> list[Layer]:
    """Every named layer in a WMS 1.3.0 capabilities document.

    Only layers with a `<Name>` are returned. WMS nests layers for grouping and
    an unnamed parent is a folder, not something that can be requested: including
    them would put entries in the catalogue that render as an exception.

    CRS and bounding box are inherited down the tree, which the spec requires
    and which matters here: GeoServer declares the supported CRS list once on
    the root layer and not on each child, so a parser that reads only the
    element's own children reports every layer as supporting nothing.
    """
    try:
        root = ET.fromstring(xml)
    except ET.ParseError as exc:
        raise GeoServerError(f"WMS capabilities is not valid XML: {exc}") from exc

    capability = root.find("wms:Capability", NS)
    if capability is None:
        # A ServiceException document parses fine and has no Capability. Saying
        # so beats returning an empty catalogue that looks like an empty server.
        detail = "".join(root.itertext()).strip()[:200]
        raise GeoServerError(f"WMS capabilities has no Capability element: {detail}")

    layers: list[Layer] = []
    for node, inherited in _walk_layers(capability):
        name = node.findtext("wms:Name", namespaces=NS)
        if not name:
            continue
        layers.append(
            Layer(
                name=name,
                title=node.findtext("wms:Title", default=name, namespaces=NS) or name,
                abstract=node.findtext("wms:Abstract", default="", namespaces=NS) or "",
                workspace=name.split(":")[0] if ":" in name else "",
                crs=frozenset(inherited["crs"]),
                bbox=inherited["bbox"],
                styles=tuple(
                    s
                    for s in (
                        style.findtext("wms:Name", namespaces=NS)
                        for style in node.findall("wms:Style", NS)
                    )
                    if s
                ),
                queryable=node.get("queryable") == "1",
            )
        )
    return layers


def _walk_layers(
    parent: ET.Element,
    inherited: dict[str, Any] | None = None,
) -> Iterator[tuple[ET.Element, dict[str, Any]]]:
    """Depth-first over nested `<Layer>` elements, carrying inheritance down."""
    state = inherited or {"crs": frozenset(), "bbox": None}
    for node in parent.findall("wms:Layer", NS):
        own = {c.text.strip() for c in node.findall("wms:CRS", NS) if c.text}
        # A set union, not a list append. The root layer declares ~8000 codes
        # and every descendant inherits them, so the list version was quadratic
        # in the number of layers and rebuilt an 8000-element list per node.
        crs = state["crs"] | own if own else state["crs"]

        bbox = state["bbox"]
        geographic = node.find("wms:EX_GeographicBoundingBox", NS)
        if geographic is not None:
            try:
                bbox = BoundingBox(
                    west=float(geographic.findtext("wms:westBoundLongitude", namespaces=NS) or 0),
                    south=float(geographic.findtext("wms:southBoundLatitude", namespaces=NS) or 0),
                    east=float(geographic.findtext("wms:eastBoundLongitude", namespaces=NS) or 0),
                    north=float(geographic.findtext("wms:northBoundLatitude", namespaces=NS) or 0),
                )
            except (TypeError, ValueError):
                bbox = state["bbox"]

        child_state = {"crs": crs, "bbox": bbox}
        yield node, child_state
        yield from _walk_layers(node, child_state)


def parse_wfs_feature_types(xml: bytes) -> set[str]:
    """Qualified names from a WFS 2.0 capabilities document."""
    try:
        root = ET.fromstring(xml)
    except ET.ParseError as exc:
        raise GeoServerError(f"WFS capabilities is not valid XML: {exc}") from exc

    names: set[str] = set()
    for element in root.iter():
        if element.tag.endswith("}FeatureType") or element.tag == "FeatureType":
            for child in element:
                if child.tag.endswith("}Name") or child.tag == "Name":
                    if child.text:
                        names.add(child.text.strip())
    return names


def parse_describe_coverage(xml: bytes, coverage_id: str) -> CoverageGrid:
    """The grid of one coverage: CRS, pixel size, extent, band names.

    The envelope is read from `gml:Envelope` and the pixel counts from
    `gml:GridEnvelope`, whose `high` is INCLUSIVE — a 0..8513 range is 8514
    pixels. Off by one here is off by one pixel in every warp that follows.
    """
    try:
        root = ET.fromstring(xml)
    except ET.ParseError as exc:
        raise GeoServerError(f"DescribeCoverage is not valid XML: {exc}") from exc

    envelope = _find_local(root, "Envelope")
    if envelope is None:
        detail = "".join(root.itertext()).strip()[:200]
        raise GeoServerError(f"No coverage description for {coverage_id}: {detail}")

    srs = envelope.get("srsName", "")
    crs = _epsg_from_srs_name(srs)

    lower = _find_local(envelope, "lowerCorner")
    upper = _find_local(envelope, "upperCorner")
    if lower is None or upper is None or not lower.text or not upper.text:
        raise GeoServerError(f"{coverage_id} has no envelope corners")
    minx, miny = (float(v) for v in lower.text.split()[:2])
    maxx, maxy = (float(v) for v in upper.text.split()[:2])

    grid_low = _find_local(root, "low")
    grid_high = _find_local(root, "high")
    if grid_low is None or grid_high is None or not grid_low.text or not grid_high.text:
        raise GeoServerError(f"{coverage_id} has no grid envelope")
    low = [int(v) for v in grid_low.text.split()[:2]]
    high = [int(v) for v in grid_high.text.split()[:2]]
    # +1 because GridEnvelope/high is the last index, not the count.
    size = (high[0] - low[0] + 1, high[1] - low[1] + 1)

    bands = tuple(
        field_node.get("name", "")
        for field_node in root.iter()
        if field_node.tag.endswith("}field") and field_node.get("name")
    )

    return CoverageGrid(
        coverage_id=coverage_id,
        crs=crs,
        size=size,
        extent=(minx, miny, maxx, maxy),
        bands=bands,
    )


def _find_local(root: ET.Element, local_name: str) -> ET.Element | None:
    """First descendant whose tag is `local_name`, whatever its namespace.

    DescribeCoverage mixes gml 3.2, gmlcov, swe and wcs namespaces, and GeoServer
    has changed which one an element sits in between releases. Matching on the
    local name is what keeps this parser working across those.
    """
    for element in root.iter():
        tag = element.tag
        if tag == local_name or tag.endswith("}" + local_name):
            return element
    return None


def _epsg_from_srs_name(srs_name: str) -> str:
    """`http://www.opengis.net/def/crs/EPSG/0/32637` -> `EPSG:32637`.

    Both the URI and the short form appear in the wild, sometimes in the same
    document, so both are accepted and one form comes out.
    """
    if not srs_name:
        return ""
    if srs_name.upper().startswith("EPSG:"):
        return srs_name.upper()
    parts = [p for p in srs_name.split("/") if p]
    if parts and parts[-1].isdigit():
        return f"EPSG:{parts[-1]}"
    return srs_name
