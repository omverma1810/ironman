from django.urls import path
from rest_framework.routers import DefaultRouter

from billing import views

router = DefaultRouter()
router.register("billing/invoices", views.InvoiceViewSet, basename="invoice")
router.register("billing/cash/handovers", views.CashHandoverViewSet, basename="cash-handover")
router.register("billing/cash/deposits", views.CashDepositViewSet, basename="cash-deposit")

urlpatterns = [
    path(
        "billing/invoices/<uuid:order_id>/issue",
        views.IssueInvoiceView.as_view(),
        name="billing-invoice-issue",
    ),
    path("billing/cash/mine", views.CashMineView.as_view(), name="billing-cash-mine"),
    path(
        "billing/cash/handover-recipients",
        views.CashHandoverRecipientsView.as_view(),
        name="billing-cash-handover-recipients",
    ),
    path(
        "billing/cash/reconciliation",
        views.CashReconciliationView.as_view(),
        name="billing-cash-reconciliation",
    ),
    path(
        "billing/orders/<uuid:order_id>/costs",
        views.OrderCostView.as_view(),
        name="billing-order-costs",
    ),
] + router.urls
