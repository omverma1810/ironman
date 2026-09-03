"""docs/04 §3.7 (billing endpoints, batches 3.1-3.2). Issuing an invoice
and recording a payment are both day-to-day order handling — `IsOpsStaff`
(Operator/Admin/Founder) for issuing, `IsOpsStaff` **or** field staff
(their own job's order, `CASH`/`UPI_QR` only — R-405 collecting COD at the
door) for recording.

Reading the invoice back is `[C own][Field job][O][A][B]`, matching docs/06
§3.1's permission matrix ("View invoice" row) — an earlier reading of that
section's prose ("the store operator must not see what the business
charges") wrongly excluded Operator here; that sentence is about the
*bold* rows in the matrix (price lists, commission rules, unit economics),
not the invoice total an operator has to collect as COD. Credit notes stay
`[A]` only, admin config/correction territory like
`supplies.ConsumptionRuleView`, not an Operator or Field action.
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
    PaymentSerializer,
    RecordPaymentSerializer,
)
from common.errors import ApiError
from common.permissions import HasRole, IsAdminOrFounder, IsOpsStaff, ScopedQuerysetMixin

_CAN_VIEW_INVOICES = HasRole.any("CUSTOMER", "FIELD", "OPERATOR", "ADMIN", "FOUNDER")
_CAN_RECORD_PAYMENT = HasRole.any("FIELD", "OPERATOR", "ADMIN", "FOUNDER")

# Field staff collect COD/UPI at the door — never an ADJUSTMENT (that's a
# correction, admin/founder territory, same reasoning as credit notes).
_FIELD_ALLOWED_METHODS = {"CASH", "UPI_QR"}


class InvoiceViewSet(ScopedQuerysetMixin, viewsets.ReadOnlyModelViewSet):
    queryset = Invoice.objects.select_related("order", "customer", "hub").prefetch_related(
        "payments"
    )
    permission_classes = [_CAN_VIEW_INVOICES]
    filterset_fields = ["status", "order"]
    lookup_field = "ref"
    lookup_url_kwarg = "ref"

    def get_serializer_class(self):
        return InvoiceDetailSerializer if self.action == "retrieve" else InvoiceListSerializer

    def get_queryset(self):
        # Not `super().get_queryset()`: with `ScopedQuerysetMixin` first in
        # MRO that resolves to its own hub-scoped wrapper, which returns
        # `.none()` for a customer/field user (no `hub_scope`) before the
        # filter below ever runs. Build the base queryset directly instead,
        # same as `ordering.OrderViewSet.get_queryset`.
        user = self.request.user
        qs = Invoice.objects.select_related("order", "customer", "hub").prefetch_related("payments")
        if "CUSTOMER" in user.role_codes and not (user.role_codes - {"CUSTOMER"}):
            return qs.filter(customer__user=user)
        if "FIELD" in user.role_codes and not (user.role_codes - {"FIELD"}):
            return qs.filter(order__jobs__assigned_to=user).distinct()
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

    @extend_schema(request=RecordPaymentSerializer, responses={201: PaymentSerializer})
    @action(
        detail=True, methods=["post"], url_path="payments", permission_classes=[_CAN_RECORD_PAYMENT]
    )
    def payments(self, request, ref=None):
        invoice = self.get_object()
        serializer = RecordPaymentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        user = request.user
        if "FIELD" in user.role_codes and not (user.role_codes - {"FIELD"}):
            if data["method"] not in _FIELD_ALLOWED_METHODS:
                raise ApiError(
                    "Field staff can only record CASH or UPI_QR payments.",
                    code="permission_denied",
                    status_code=403,
                )

        payment = services.record_payment(
            invoice,
            method=data["method"],
            amount_minor=data["amount"],
            idempotency_key=data["idempotency_key"],
            gateway_ref=data.get("gateway_ref", ""),
            actor=user,
        )
        return Response(PaymentSerializer(payment).data, status=201)


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
