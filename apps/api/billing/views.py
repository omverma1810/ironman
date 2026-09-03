"""docs/04 §3.7 (billing endpoints, batch 3.1). Issuing an invoice is
day-to-day order handling — `IsOpsStaff` (Operator/Admin/Founder), same
mapping used throughout for `[O][A]`-tagged rows. Reading the invoice
record back is different: docs/06 §3.1 is explicit that the store
operator "must not see what the business charges" — an invoice literally
is that — so list/detail/pdf is `[C own][A][B]`, Operator excluded, a
customer only ever seeing their own. Credit notes are `[A]` only, admin
config/correction territory like `supplies.ConsumptionRuleView`, not an
Operator action.
"""

from __future__ import annotations

from django.db import transaction
from drf_spectacular.utils import extend_schema
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

import ordering.services as ordering_services
from billing import services
from billing.models import Invoice
from billing.serializers import (
    CreditNoteCreateSerializer,
    CreditNoteSerializer,
    InvoiceDetailSerializer,
    InvoiceListSerializer,
    IssueInvoiceSerializer,
)
from common.permissions import HasRole, IsAdminOrFounder, IsOpsStaff, ScopedQuerysetMixin

_CAN_VIEW_INVOICES = HasRole.any("CUSTOMER", "ADMIN", "FOUNDER")


class InvoiceViewSet(ScopedQuerysetMixin, viewsets.ReadOnlyModelViewSet):
    queryset = Invoice.objects.select_related("order", "customer", "hub")
    permission_classes = [_CAN_VIEW_INVOICES]
    filterset_fields = ["status", "order"]
    lookup_field = "ref"
    lookup_url_kwarg = "ref"

    def get_serializer_class(self):
        return InvoiceDetailSerializer if self.action == "retrieve" else InvoiceListSerializer

    def get_queryset(self):
        # Not `super().get_queryset()`: with `ScopedQuerysetMixin` first in
        # MRO that resolves to its own hub-scoped wrapper, which returns
        # `.none()` for a customer (no `hub_scope`) before the filter
        # below ever runs. Build the base queryset directly instead, same
        # as `ordering.OrderViewSet.get_queryset`.
        user = self.request.user
        qs = Invoice.objects.select_related("order", "customer", "hub")
        if "CUSTOMER" in user.role_codes and not (user.role_codes - {"CUSTOMER"}):
            return qs.filter(customer__user=user)
        return self.scope_to_hub(qs)

    @action(detail=True, methods=["get"])
    def pdf(self, request, ref=None):
        invoice = self.get_object()
        return Response({"url": invoice.pdf_file.url if invoice.pdf_file else None})

    @extend_schema(request=CreditNoteCreateSerializer, responses={201: CreditNoteSerializer})
    @action(
        detail=True, methods=["post"], url_path="credit-note", permission_classes=[IsAdminOrFounder]
    )
    def credit_note(self, request, ref=None):
        invoice = self.get_object()
        serializer = CreditNoteCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        credit_note = services.issue_credit_note(
            invoice,
            reason=serializer.validated_data["reason"],
            amount_minor=serializer.validated_data["amount"],
            actor=request.user,
        )
        return Response(CreditNoteSerializer(credit_note).data, status=201)


@extend_schema(request=IssueInvoiceSerializer, responses={201: InvoiceDetailSerializer})
class IssueInvoiceView(APIView):
    """POST /billing/invoices/{order_id}/issue — same "action nested under
    a different app's resource id" shape as `custody.CreateBagForOrderView`."""

    permission_classes = [IsOpsStaff]

    @transaction.atomic
    def post(self, request, order_id):
        order = ordering_services.get_order(order_id)
        serializer = IssueInvoiceSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        invoice = services.issue_invoice(
            order,
            apply_gst=serializer.validated_data.get("apply_gst"),
            actor=request.user,
        )
        return Response(InvoiceDetailSerializer(invoice).data, status=201)
