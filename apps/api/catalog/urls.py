from django.urls import path
from rest_framework.routers import DefaultRouter

from catalog import views

router = DefaultRouter()
router.register("catalog/services", views.ServiceViewSet, basename="service")
router.register("catalog/garment-types", views.GarmentTypeViewSet, basename="garment-type")
router.register("catalog/price-lists", views.PriceListViewSet, basename="price-list")
router.register("catalog/offers", views.OfferViewSet, basename="offer")
router.register("catalog/packages", views.PackageViewSet, basename="package")

urlpatterns = [
    path("catalog/quote", views.QuoteView.as_view(), name="quote"),
] + router.urls
