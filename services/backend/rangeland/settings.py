"""Settings for the Rangeland Awareness backend.

Everything environment-dependent is read from the environment with a working
default, so a fresh clone runs with no configuration and a deployment is an
environment change rather than an edit. Nothing here falls back silently: the
GeoServer endpoint in use is reported by `/api/v1/health`, so a misconfigured
deployment says so instead of drawing an empty map.
"""

from __future__ import annotations

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

# The repository root, two levels up from services/backend. The shared contract
# artifacts (criteria.json, ahp-fixtures.json) live there and are read, never
# copied: a second copy is a copy that drifts.
REPO_ROOT = BASE_DIR.parent.parent
CONTRACTS_DIR = Path(os.environ.get("CONTRACTS_DIR", REPO_ROOT / "contracts"))

# ---------------------------------------------------------------- core Django

# Development default. A deployment must set DJANGO_SECRET_KEY; the value below
# is obviously not a secret, which is the point — a placeholder that looks like
# a real key is how an insecure default reaches production unnoticed.
SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "dev-only-not-a-secret")

DEBUG = os.environ.get("DJANGO_DEBUG", "1") == "1"

ALLOWED_HOSTS = [
    h for h in os.environ.get("DJANGO_ALLOWED_HOSTS", "*").split(",") if h
]

INSTALLED_APPS = [
    # django.contrib.admin and auth are deliberately absent. This service has no
    # users and no sessions: it answers an internal app over JSON. Adding them
    # would mean migrations, a login surface and a CSRF story for endpoints that
    # have none of those concerns. When accounts arrive they arrive as a
    # decision, not as a default that was never questioned.
    "django.contrib.contenttypes",
    "django.contrib.staticfiles",
    "apps.layers",
    "apps.analysis",
]

MIDDLEWARE = [
    "django.middleware.common.CommonMiddleware",
    "apps.layers.middleware.CorsMiddleware",
]

ROOT_URLCONF = "rangeland.urls"
WSGI_APPLICATION = "rangeland.wsgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {"context_processors": []},
    }
]

# ------------------------------------------------------------------- database

# SQLite by default so the service runs with no setup at all. Postgres is one
# environment variable away, and the models use no SQLite-specific field, so the
# switch is a migration run rather than a rewrite.
#
# PostGIS is NOT used and no model has a geometry column. Areas of interest
# arrive as GeoJSON, are read once by GDAL, and are never queried spatially —
# storing them as JSON text is what they are. The day a query needs
# "which runs intersect this county", that is the day for GeoDjango, and it
# will be visible as a migration rather than as an assumption baked in now.
if os.environ.get("DATABASE_URL", "").startswith("postgres"):
    from urllib.parse import urlparse

    _url = urlparse(os.environ["DATABASE_URL"])
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": _url.path.lstrip("/"),
            "USER": _url.username or "",
            "PASSWORD": _url.password or "",
            "HOST": _url.hostname or "",
            "PORT": str(_url.port or ""),
        }
    }
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": os.environ.get("SQLITE_PATH", str(BASE_DIR / "db.sqlite3")),
        }
    }

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# --------------------------------------------------------------- the GeoServer

# The one place the upstream is named. `/api/v1/health` reports this value back,
# so "which server is this pointing at" is answerable from the app rather than
# by reading a file on a host.
GEOSERVER = {
    "url": os.environ.get(
        "GEOSERVER_URL", "http://192.168.0.40:8080/geoserver"
    ).rstrip("/"),
    "user": os.environ.get("GEOSERVER_USER") or None,
    "password": os.environ.get("GEOSERVER_PASSWORD") or None,
    # GetCapabilities is a 258KB document that changes when someone publishes a
    # layer, which is rarely. Re-fetching it per request would put a quarter of
    # a megabyte of XML parsing in front of every map load.
    "capabilities_ttl": int(os.environ.get("GEOSERVER_CAPABILITIES_TTL", "300")),
    # Measured against the live server: WMS GetCapabilities answers in about a
    # second, DescribeCoverage in 0.4s, but WCS GetCapabilities did not finish
    # inside 45s. Nothing in this service calls WCS GetCapabilities for that
    # reason; coverages are described individually.
    "timeout": float(os.environ.get("GEOSERVER_TIMEOUT", "30")),
    # A coverage fetch is a whole GeoTIFF and is measured in tens of seconds.
    "coverage_timeout": float(os.environ.get("GEOSERVER_COVERAGE_TIMEOUT", "300")),
}

# Where fetched coverages and computed results are written. Outside the source
# tree by default: these are hundreds of megabytes of GeoTIFF and must never be
# a candidate for `git add`.
WORKSPACE_DIR = Path(
    os.environ.get("RANGELAND_WORKSPACE", "/tmp/rangeland-workspace")
)

# ------------------------------------------------------------------- browser

# The app's origins. A tile proxy that no browser may call is a proxy that does
# nothing, and `*` with credentials is refused by browsers anyway, so this is an
# explicit list rather than a wildcard.
CORS_ALLOWED_ORIGINS = [
    o
    for o in os.environ.get(
        "CORS_ALLOWED_ORIGINS",
        "http://localhost:3000,http://127.0.0.1:3000,http://localhost:3628,http://127.0.0.1:3628",
    ).split(",")
    if o
]

STATIC_URL = "static/"
USE_TZ = True
TIME_ZONE = "Africa/Nairobi"

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "root": {"handlers": ["console"], "level": os.environ.get("LOG_LEVEL", "INFO")},
}
