"""The URL surface.

Everything is under `/api/v1`. The version is in the path rather than in a
header because the consumer is a browser app: a URL that can be opened, curled
and bookmarked is worth more here than header negotiation, and a breaking change
becomes `/api/v2` served alongside rather than a flag day.
"""

from django.http import JsonResponse
from django.urls import include, path


def index(_request):
    """A root that says what this is, rather than a 404.

    Someone will open the bare host in a browser. Telling them where the API is
    costs four lines and saves the question.
    """
    return JsonResponse(
        {
            "service": "rangeland-backend",
            "docs": "contracts/backend-api.md",
            "api": "/api/v1",
            "health": "/api/v1/health",
        }
    )


urlpatterns = [
    path("", index),
    path("api/v1/", include("apps.layers.urls")),
    path("api/v1/", include("apps.analysis.urls")),
]
