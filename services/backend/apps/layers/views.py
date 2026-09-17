"""The layer endpoints: the catalogue, legends, and the tile proxy.

This is the half of the service the map talks to. It has one rule, and every
decision below follows from it: **the browser never addresses GeoServer.** Not
for tiles, not for legends, not for capabilities. GeoServer is on a private
address that most clients cannot resolve, its credentials must not reach a
browser, and a server in front of it is the only place a tile cache or an
allow-list can live.
"""

from __future__ import annotations

import logging

from django.conf import settings
from django.http import (
    HttpRequest,
    HttpResponse,
    HttpResponseNotAllowed,
    JsonResponse,
    StreamingHttpResponse,
)
from django.views.decorators.http import require_GET

from apps.layers.catalog import get_catalog, invalidate
from apps.layers.geoserver import GeoServerClient, GeoServerError

log = logging.getLogger(__name__)

#: Query parameters this proxy will forward to GeoServer's GetMap.
#:
#: An allow-list, not a block-list, and that is the security boundary of this
#: endpoint. Forwarding the whole query string would let a caller set `LAYERS`
#: to anything the internal server publishes — including workspaces this app
#: does not expose — and, worse, would pass through vendor parameters that can
#: make GeoServer read a local file. Anything not named here is dropped.
TILE_PARAMS = {
    "BBOX",
    "WIDTH",
    "HEIGHT",
    "CRS",
    "SRS",
    "FORMAT",
    "TRANSPARENT",
    "STYLES",
    "TIME",
    "ELEVATION",
    "BGCOLOR",
    "EXCEPTIONS",
}

#: Image formats a caller may ask for. `application/vnd.ogc.se_xml` and friends
#: are excluded: an exception rendered as an image is what the map wants, and a
#: caller asking for an XML exception body is asking for a debugging channel
#: through the proxy.
TILE_FORMATS = {"image/png", "image/png8", "image/jpeg", "image/gif", "image/webp"}

MAX_TILE_DIMENSION = 4096


def _problem(message: str, status: int, **extra) -> JsonResponse:
    """One error shape for the whole service: a message plus context.

    Deliberately not Django's default HTML error page, which a JSON client
    cannot read and which leaks a stack trace when DEBUG is on.
    """
    return JsonResponse({"error": message, **extra}, status=status)


@require_GET
def health(request: HttpRequest) -> JsonResponse:
    """Is the service up, and can it reach GeoServer.

    Reports GeoServer separately from itself, because the two fail apart and the
    app shows a different thing for each: the service being down is "try later",
    GeoServer being down is "the map will not draw and a run cannot start".
    """
    probe = GeoServerClient().probe()
    return JsonResponse(
        {
            "status": "ok" if probe["reachable"] else "degraded",
            "service": "rangeland-backend",
            "version": "1.0.0",
            "geoserver": probe,
        },
        status=200,
    )


@require_GET
def layer_list(request: HttpRequest) -> JsonResponse:
    """The catalogue.

    `?workspace=` and `?kind=` filter it, because the map's layer control shows
    one workspace at a time and the run configuration only ever wants rasters.
    Filtering here rather than in the browser keeps the response small on a
    server that publishes hundreds of layers.
    """
    try:
        snapshot = get_catalog(force=request.GET.get("refresh") == "1")
    except GeoServerError as exc:
        return _problem(
            "GeoServer is unreachable, and no catalogue is cached.",
            status=503,
            detail=str(exc),
            endpoint=settings.GEOSERVER["url"],
        )

    layers = snapshot.layers
    workspace = request.GET.get("workspace")
    if workspace:
        layers = [l for l in layers if l.workspace == workspace]
    kind = request.GET.get("kind")
    if kind in {"raster", "vector"}:
        layers = [l for l in layers if (l.vector is (kind == "vector"))]

    return JsonResponse(
        {
            "endpoint": settings.GEOSERVER["url"],
            "count": len(layers),
            "workspaces": sorted({l.workspace for l in snapshot.layers if l.workspace}),
            # Said out loud rather than implied by an old timestamp: a stale
            # catalogue is being served because a refresh failed, and the app
            # can show that without guessing from `fetchedAgoSeconds`.
            "stale": snapshot.stale,
            "staleReason": snapshot.stale_reason,
            "fetchedAgoSeconds": round(snapshot.age_seconds, 1),
            "layers": [l.as_json() for l in layers],
        }
    )


@require_GET
def layer_detail(request: HttpRequest, layer_id: str) -> JsonResponse:
    try:
        snapshot = get_catalog()
    except GeoServerError as exc:
        return _problem("GeoServer is unreachable.", status=503, detail=str(exc))

    layer = snapshot.by_name(layer_id)
    if layer is None:
        return _problem(
            f'No layer named "{layer_id}".',
            status=404,
            # The near-misses, because the usual cause is a workspace prefix
            # that was dropped or mistyped, and a bare 404 makes the caller
            # go and read capabilities by hand.
            didYouMean=[
                l.name
                for l in snapshot.layers
                if layer_id.split(":")[-1].lower() in l.name.lower()
            ][:5],
        )

    body = layer.as_json()
    # Only on the detail view, never on the list: this is one extra request to
    # GeoServer per call and the list would make it one per layer.
    if not layer.vector:
        try:
            grid = GeoServerClient().describe_coverage(layer.name)
            body["coverage"] = {
                "crs": grid.crs,
                "size": list(grid.size),
                "extent": list(grid.extent),
                "resolution": [round(r, 6) for r in grid.resolution],
                "bands": list(grid.bands),
            }
        except GeoServerError as exc:
            # A layer published over WMS but not WCS is normal, not an error.
            body["coverage"] = None
            body["coverageDetail"] = str(exc)

    return JsonResponse(body)


@require_GET
def tile(request: HttpRequest, layer_id: str) -> HttpResponse:
    """A rendered WMS tile, proxied.

    This is the endpoint the map hits hundreds of times per session, so it does
    the least work it can: validate, forward, stream. No catalogue fetch on the
    hot path beyond the cached lookup, no image decoding, no buffering.
    """
    try:
        snapshot = get_catalog()
    except GeoServerError as exc:
        return _problem("GeoServer is unreachable.", status=503, detail=str(exc))

    # The allow-list check, and the reason the catalogue is consulted at all:
    # a caller may only address layers this service publishes.
    layer = snapshot.by_name(layer_id)
    if layer is None:
        return _problem(f'No layer named "{layer_id}".', status=404)

    fmt = request.GET.get("FORMAT", request.GET.get("format", "image/png"))
    if fmt not in TILE_FORMATS:
        return _problem(
            f'Unsupported tile format "{fmt}".',
            status=400,
            supported=sorted(TILE_FORMATS),
        )

    try:
        width = int(request.GET.get("WIDTH", request.GET.get("width", 256)))
        height = int(request.GET.get("HEIGHT", request.GET.get("height", 256)))
    except ValueError:
        return _problem("WIDTH and HEIGHT must be integers.", status=400)
    if not (0 < width <= MAX_TILE_DIMENSION and 0 < height <= MAX_TILE_DIMENSION):
        # Without this, one request for 30000x30000 asks the internal GeoServer
        # to allocate about 3.6GB. The proxy is the right place to refuse.
        return _problem(
            f"WIDTH and HEIGHT must be between 1 and {MAX_TILE_DIMENSION}.",
            status=400,
        )

    params: dict[str, object] = {
        "SERVICE": "WMS",
        "VERSION": "1.3.0",
        "REQUEST": "GetMap",
        "LAYERS": layer.name,
        "FORMAT": fmt,
        "WIDTH": width,
        "HEIGHT": height,
        "TRANSPARENT": "true",
    }
    for key, value in request.GET.items():
        upper = key.upper()
        if upper in TILE_PARAMS and upper not in {"WIDTH", "HEIGHT", "FORMAT"}:
            params[upper] = value

    # WMS 1.3.0 wants CRS; Leaflet's WMS layer sends SRS (a 1.1.1 spelling).
    # Accepting both and normalising is what makes this a drop-in endpoint for
    # an unmodified L.tileLayer.wms.
    if "SRS" in params and "CRS" not in params:
        params["CRS"] = params.pop("SRS")
    params.setdefault("CRS", "EPSG:3857")

    if "BBOX" not in params:
        return _problem("BBOX is required.", status=400)

    try:
        upstream = GeoServerClient().get_map(params)
    except GeoServerError as exc:
        return _problem("GeoServer refused the tile.", status=502, detail=str(exc))

    content_type = upstream.headers.get("Content-Type", fmt)
    if "xml" in content_type:
        # GeoServer reports errors as a 200 with an XML body. Passed through,
        # that renders as a broken image and the real message is never seen.
        return _problem(
            "GeoServer returned a service exception instead of a tile.",
            status=502,
            detail=upstream.text[:400],
            layer=layer.name,
        )

    response = StreamingHttpResponse(
        upstream.iter_content(chunk_size=64 * 1024),
        content_type=content_type,
    )
    # Tiles for a published layer are immutable for practical purposes; the
    # catalogue TTL is what picks up a republish.
    response["Cache-Control"] = f"public, max-age={settings.GEOSERVER['capabilities_ttl']}"
    return response


@require_GET
def legend(request: HttpRequest, layer_id: str) -> HttpResponse:
    try:
        snapshot = get_catalog()
    except GeoServerError as exc:
        return _problem("GeoServer is unreachable.", status=503, detail=str(exc))

    layer = snapshot.by_name(layer_id)
    if layer is None:
        return _problem(f'No layer named "{layer_id}".', status=404)

    try:
        upstream = GeoServerClient().legend(
            layer.name, request.GET.get("style") or layer.default_style
        )
    except GeoServerError as exc:
        return _problem("GeoServer refused the legend.", status=502, detail=str(exc))

    content_type = upstream.headers.get("Content-Type", "image/png")
    if "xml" in content_type:
        return _problem(
            "No legend is published for this layer.",
            status=404,
            detail=upstream.text[:200],
        )

    response = StreamingHttpResponse(
        upstream.iter_content(chunk_size=32 * 1024), content_type=content_type
    )
    response["Cache-Control"] = "public, max-age=3600"
    return response


def refresh(request: HttpRequest) -> JsonResponse:
    """Drop the catalogue cache, for when a layer was just published."""
    if request.method != "POST":
        return HttpResponseNotAllowed(["POST"])
    invalidate()
    try:
        snapshot = get_catalog(force=True)
    except GeoServerError as exc:
        return _problem("GeoServer is unreachable.", status=503, detail=str(exc))
    return JsonResponse({"refreshed": True, "count": len(snapshot.layers)})
