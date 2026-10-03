from django.urls import path

from privacy import views

urlpatterns = [
    path("me/deletion", views.DeletionCheckView.as_view(), name="me-deletion"),
    path("me/export", views.DataExportView.as_view(), name="me-export"),
    path("privacy/restore", views.RestoreAccountView.as_view(), name="privacy-restore"),
    path("internal/maintenance", views.MaintenanceView.as_view(), name="internal-maintenance"),
]
