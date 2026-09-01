from django.urls import path
from rest_framework.routers import DefaultRouter

from territory import views

router = DefaultRouter()
router.register("territory/hubs", views.HubViewSet, basename="hub")
router.register("territory/clusters", views.ClusterViewSet, basename="cluster")
router.register("territory/apartments-admin", views.ApartmentViewSet, basename="apartment-admin")
router.register(
    "territory/apartment-contacts", views.ApartmentContactViewSet, basename="apartment-contact"
)
router.register(
    "territory/capacity-admin", views.RouteDayCapacityViewSet, basename="capacity-admin"
)

urlpatterns = [
    path("territory/serviceability", views.ServiceabilityView.as_view(), name="serviceability"),
    path("territory/apartments", views.ApartmentSearchView.as_view(), name="apartment-search"),
    path("territory/capacity", views.CapacityView.as_view(), name="capacity"),
] + router.urls
