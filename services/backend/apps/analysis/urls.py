"""Analysis routes."""

from django.urls import path

from apps.analysis import views

urlpatterns = [
    path("topics/<str:topic>/criteria", views.topic_criteria, name="topic-criteria"),
    path("weights/derive", views.derive_weights, name="derive-weights"),
    path("runs", views.create_run, name="create-run"),
    path("runs/<str:run_id>", views.run_status, name="run-status"),
    path("runs/<str:run_id>/result", views.run_result, name="run-result"),
]
