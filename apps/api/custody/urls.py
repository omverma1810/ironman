from django.urls import path
from rest_framework.routers import DefaultRouter

from custody import views

router = DefaultRouter()
router.register("custody/bags", views.BagViewSet, basename="bag")
router.register("custody/garment-lines", views.GarmentLineViewSet, basename="garment-line")
router.register("custody/qc-checks", views.QcCheckViewSet, basename="qc-check")

urlpatterns = [
    path("orders/<uuid:order_id>/bags", views.CreateBagForOrderView.as_view(), name="order-bags"),
    path("custody/scan", views.ScanView.as_view(), name="custody-scan"),
] + router.urls
