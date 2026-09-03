from django.urls import path
from rest_framework.routers import DefaultRouter

from supplies import views

router = DefaultRouter()
router.register("supplies/items", views.StockItemViewSet, basename="stock-item")
router.register("supplies/levels", views.StockLevelViewSet, basename="stock-level")
router.register("supplies/movements", views.StockMovementViewSet, basename="stock-movement")

urlpatterns = [
    path("supplies/receipts", views.StockReceiptView.as_view(), name="supplies-receipts"),
    path("supplies/adjustments", views.StockAdjustmentView.as_view(), name="supplies-adjustments"),
    path(
        "supplies/reorder-alerts",
        views.ReorderAlertListView.as_view(),
        name="supplies-reorder-alerts",
    ),
    path(
        "supplies/consumption-rules",
        views.ConsumptionRuleView.as_view(),
        name="supplies-consumption-rules",
    ),
] + router.urls
