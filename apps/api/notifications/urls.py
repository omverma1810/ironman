from django.urls import path
from rest_framework.routers import DefaultRouter

from notifications import views

router = DefaultRouter()
router.register("notifications/log", views.NotificationLogViewSet, basename="notification-log")

urlpatterns = [
    path(
        "notifications/preferences",
        views.NotificationPreferenceView.as_view(),
        name="notification-preferences",
    ),
    path("notifications/test", views.NotificationTestView.as_view(), name="notification-test"),
] + router.urls
