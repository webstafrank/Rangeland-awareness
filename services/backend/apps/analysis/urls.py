"""Analysis routes."""

from django.urls import path

from apps.analysis import views

urlpatterns = [
    path("topics/<str:topic>/criteria", views.topic_criteria, name="topic-criteria"),
    path("weights/derive", views.derive_weights, name="derive-weights"),
]
