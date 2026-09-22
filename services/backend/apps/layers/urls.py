"""Layer routes.

Layer ids carry a colon ("Hazards_Dashboard:TanaRiver_Slope"), which is legal in
a path segment per RFC 3986 but which Django's `<str:...>` converter will not
match across a workspace prefix. The explicit converter below accepts everything
a GeoServer name can contain and nothing else, so a client never has to
URL-encode a layer id and a copied id from the catalogue works in a browser bar.
"""

from django.urls import path, register_converter

from apps.layers import views


class LayerIdConverter:
    # Word characters, colon, dot and dash: the set GeoServer allows in a
    # workspace:name pair. Deliberately excludes "/" so a name can never eat the
    # following path segment and turn /layers/x/legend into a layer "x/legend".
    regex = r"[\w.:-]+"

    def to_python(self, value: str) -> str:
        return value

    def to_url(self, value: str) -> str:
        return value


register_converter(LayerIdConverter, "layerid")

urlpatterns = [
    path("health", views.health, name="health"),
    path("layers", views.layer_list, name="layer-list"),
    # Before the detail route, or "refresh" is read as a layer id.
    path("layers/refresh", views.refresh, name="layer-refresh"),
    path("layers/<layerid:layer_id>", views.layer_detail, name="layer-detail"),
    path("layers/<layerid:layer_id>/legend", views.legend, name="layer-legend"),
    path("tiles/<layerid:layer_id>", views.tile, name="layer-tile"),
]
