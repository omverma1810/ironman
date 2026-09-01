from django.urls import path
from rest_framework.routers import DefaultRouter

from ordering import views

router = DefaultRouter()
router.register("orders", views.OrderViewSet, basename="order")
router.register("requotes", views.ReQuoteViewSet, basename="requote")
router.register("order-exceptions", views.OrderExceptionViewSet, basename="order-exception")

urlpatterns = [
    path("orders/counter", views.CounterOrderView.as_view(), name="order-counter"),
] + router.urls
