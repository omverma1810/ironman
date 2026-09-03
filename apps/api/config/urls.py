import re

from django.conf import settings
from django.contrib import admin
from django.urls import include, path, re_path
from django.views.static import serve as serve_static
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

api_v1_patterns = [
    path("", include("identity.urls")),
    path("", include("platform_core.urls")),
    path("", include("territory.urls")),
    path("", include("catalog.urls")),
    path("", include("customers.urls")),
    path("", include("ordering.urls")),
    path("", include("custody.urls")),
    path("", include("fulfilment.urls")),
    path("", include("supplies.urls")),
    path("", include("billing.urls")),
    path("schema/", SpectacularAPIView.as_view(), name="schema"),
    path("docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="docs"),
]

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/", include(api_v1_patterns)),
]

# `django.conf.urls.static.static()` no-ops unless `DEBUG=True`, but
# `config.settings.test` deliberately runs with `DEBUG=False` for a
# realistic CI environment while still using local-disk storage (no
# MinIO/S3 in CI) — so the actual condition that matters is "are we
# serving from local disk at all", not debug mode. Built by hand rather
# than via `static()` for that reason. Real S3-backed deployments never
# hit this: `FileField.url` there is already an absolute S3 URL, which
# this app never routes.
if settings.STORAGES["default"]["BACKEND"] == "django.core.files.storage.FileSystemStorage":
    urlpatterns += [
        re_path(
            r"^%s(?P<path>.*)$" % re.escape(settings.MEDIA_URL.lstrip("/")),
            serve_static,
            kwargs={"document_root": settings.MEDIA_ROOT},
        )
    ]
