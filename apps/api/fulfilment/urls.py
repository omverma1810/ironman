from django.urls import path
from rest_framework.routers import DefaultRouter

from fulfilment import views

router = DefaultRouter()
router.register("fulfilment/route-days", views.RouteDayViewSet, basename="route-day")
router.register("fulfilment/jobs", views.JobViewSet, basename="job")

urlpatterns = [
    path("fulfilment/proofs", views.ProofCreateView.as_view(), name="fulfilment-proofs"),
    path("fulfilment/sync", views.OfflineSyncView.as_view(), name="fulfilment-sync"),
] + router.urls
