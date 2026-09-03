from django.urls import path
from rest_framework.routers import DefaultRouter

from billing import views

router = DefaultRouter()
router.register("billing/invoices", views.InvoiceViewSet, basename="invoice")

urlpatterns = [
    path(
        "billing/invoices/<uuid:order_id>/issue",
        views.IssueInvoiceView.as_view(),
        name="billing-invoice-issue",
    ),
] + router.urls
