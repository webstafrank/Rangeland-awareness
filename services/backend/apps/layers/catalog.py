"""The layer catalogue, cached.

`GeoServerClient.layers()` is two HTTP requests and 355KB of XML. The map asks
"what layers are there" on every page load, and a run asks once per criterion.
Doing the fetch each time would put a third of a megabyte of parsing in front of
every map load for a document that changes when somebody publishes a layer,
which is to say almost never.

So this module owns one question: how stale may the catalogue be. The answer is
`GEOSERVER["capabilities_ttl"]`, five minutes by default, and it is a module
cache rather than Django's cache framework because the value is a list of
dataclasses rather than something that wants pickling, and because a second
process holding its own copy for five minutes is not a problem worth a Redis.

The failure behaviour is the interesting half. When GeoServer goes away and a
cached catalogue exists, the stale one is served and the staleness is reported,
because a map that keeps drawing is worth more than a correct refusal. When
nothing is cached, the error propagates: an empty catalogue would be
indistinguishable from a GeoServer with no layers on it.
"""

from __future__ import annotations

import logging
import threading
import time
from dataclasses import dataclass

from django.conf import settings

from apps.layers.geoserver import GeoServerClient, GeoServerError, Layer

log = logging.getLogger(__name__)


@dataclass
class CatalogSnapshot:
    """The catalogue plus how much to trust it."""

    layers: list[Layer]
    fetched_at: float
    #: Set when this was served from cache after a failed refresh, so the view
    #: can say so rather than presenting old data as current.
    stale: bool = False
    stale_reason: str | None = None

    @property
    def age_seconds(self) -> float:
        return time.monotonic() - self.fetched_at

    def by_name(self, name: str) -> Layer | None:
        for layer in self.layers:
            if layer.name == name:
                return layer
        return None


_lock = threading.Lock()
_snapshot: CatalogSnapshot | None = None


def get_catalog(
    *, force: bool = False, client: GeoServerClient | None = None
) -> CatalogSnapshot:
    """The catalogue, fetching only when the cache has expired.

    The lock makes a cold start under concurrent requests fetch once rather than
    once per request. It is held across the fetch deliberately: a few seconds of
    contention on the first request is better than five browsers each pulling
    355KB of XML at the same moment.
    """
    global _snapshot

    ttl = settings.GEOSERVER["capabilities_ttl"]
    with _lock:
        current = _snapshot
        if not force and current is not None and current.age_seconds < ttl:
            return current

        try:
            layers = (client or GeoServerClient()).layers()
        except GeoServerError as exc:
            if current is None:
                # Nothing to fall back to. Refusing is correct: an empty list
                # here would render as "this GeoServer publishes nothing".
                raise
            log.warning("catalogue refresh failed, serving stale: %s", exc)
            current.stale = True
            current.stale_reason = str(exc)
            return current

        _snapshot = CatalogSnapshot(layers=layers, fetched_at=time.monotonic())
        return _snapshot


def invalidate() -> None:
    """Drop the cache. For tests, and for the refresh endpoint."""
    global _snapshot
    with _lock:
        _snapshot = None
