from django.urls import path

from platform_core import views

urlpatterns = [
    path("healthz", views.HealthzView.as_view(), name="healthz"),
    path("readyz", views.ReadyzView.as_view(), name="readyz"),
    path("platform/config", views.PlatformConfigView.as_view(), name="platform-config"),
]
