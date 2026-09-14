"""CORS, in about forty lines, because the alternative is a dependency.

`django-cors-headers` is the usual answer and it is a good library. It is not
used here for one reason: `pip install` does not work on this machine (PEP 668
blocks the system interpreter and `python3 -m venv` cannot bootstrap, see the
README). Writing the two headers this service actually needs is smaller than the
workaround would be.

What it does NOT do, deliberately: no credentials, no wildcard origin, no
per-view configuration. This API has no cookies and no sessions, so
`Access-Control-Allow-Credentials` would be a lie, and a wildcard would let any
page on the internet use this server as an open proxy to an internal GeoServer.
The allowed origins are an explicit list in settings.
"""

from __future__ import annotations

from django.conf import settings
from django.http import HttpRequest, HttpResponse


class CorsMiddleware:
    """Adds CORS headers for configured origins, and answers preflights."""

    def __init__(self, get_response) -> None:
        self.get_response = get_response
        self.allowed = set(settings.CORS_ALLOWED_ORIGINS)

    def __call__(self, request: HttpRequest) -> HttpResponse:
        origin = request.headers.get("Origin")

        # A preflight is answered here rather than routed, because the URL it
        # asks about may be a tile endpoint whose view would otherwise do a
        # GeoServer round trip to answer a request that wants only headers.
        if request.method == "OPTIONS" and origin:
            response: HttpResponse = HttpResponse(status=204)
        else:
            response = self.get_response(request)

        if origin and origin in self.allowed:
            response["Access-Control-Allow-Origin"] = origin
            # Vary matters: without it a cache that saw one origin's response
            # serves it to another origin, which then fails in the browser with
            # an error naming the wrong URL entirely.
            response["Vary"] = "Origin"
            response["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
            response["Access-Control-Allow-Headers"] = "Content-Type"
            response["Access-Control-Max-Age"] = "86400"

        return response
