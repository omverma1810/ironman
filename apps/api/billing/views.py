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
from django.db.models import Q
from django.utils import timezone
from django.utils.dateparse import parse_date
from drf_spectacular.utils import extend_schema
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

import ordering.services as ordering_services
import territory.services as territory_services
from billing import services
from billing.models import CashDeposit, CashHandover, Invoice
from billing.serializers import (
    CashBalanceSerializer,
    CashDepositSerializer,
    CashHandoverSerializer,
    CashReconciliationRowSerializer,
    ConfirmHandoverSerializer,
    CreateDepositSerializer,
    CreditNoteCreateSerializer,
    CreditNoteSerializer,
    HandoverRecipientSerializer,
    InitiateHandoverSerializer,
    InvoiceDetailSerializer,
    InvoiceListSerializer,
    IssueInvoiceSerializer,
    OrderContributionMarginSerializer,
    PaymentSerializer,
    RecordPaymentSerializer,
)
from common.errors import ApiError
from common.permissions import (
    HasRole,
    IsAdminOrFounder,
    IsFieldStaff,
    IsOpsStaff,
    ScopedQuerysetMixin,
)
from identity.models import User

_CAN_VIEW_INVOICES = HasRole.any("CUSTOMER", "FIELD", "OPERATOR", "ADMIN", "FOUNDER")
_CAN_RECORD_PAYMENT = HasRole.any("FIELD", "OPERATOR", "ADMIN", "FOUNDER")
_CAN_VIEW_HANDOVERS = HasRole.any("FIELD", "OPERATOR", "ADMIN", "FOUNDER")

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


class CashMineView(APIView):
    """GET /billing/cash/mine — a rider's own running cash-in-hand
    balance (docs/04 §3.7, docs/06 §3.1 "Own cash balance / handover")."""

    permission_classes = [IsFieldStaff]

    @extend_schema(responses={200: CashBalanceSerializer})
    def get(self, request):
        balance = services.cash_balance(request.user)
        return Response(CashBalanceSerializer({"balance_minor": balance}).data)


class CashHandoverRecipientsView(APIView):
    """GET /billing/cash/handover-recipients — who a field rider can hand
    cash to: ops staff at their own hub, plus any founder (hub-independent,
    same eligibility `services.initiate_handover` itself enforces). Deliberately
    not `/identity/staff` (Admin/Founder-only, docs/06 §3.1) — a rider needs
    this list to fill in `POST .../handovers`'s `to_user`, so it has to be
    reachable by field staff themselves."""

    permission_classes = [IsFieldStaff]

    @extend_schema(responses={200: HandoverRecipientSerializer(many=True)})
    def get(self, request):
        hub_ids = request.user.hub_scope
        qs = (
            User.objects.filter(
                Q(user_roles__role__code__in=["OPERATOR", "ADMIN"], user_roles__hub_id__in=hub_ids)
                | Q(user_roles__role__code="FOUNDER")
            )
            .distinct()
            .order_by("full_name")
        )
        return Response(HandoverRecipientSerializer(qs, many=True).data)


class CashHandoverViewSet(viewsets.GenericViewSet):
    """`/billing/cash/handovers` — list/create is the field-initiated side
    (docs/04 `POST /billing/cash/handover`, pluralised here to match every
    other router-based resource in this app), `confirm` is the hub side
    (`POST .../{id}/confirm`). Not `ScopedQuerysetMixin`: field staff need
    "my own handovers" scoping, not hub scoping, so `get_queryset` builds
    both branches directly — same reasoning as `InvoiceViewSet`'s own
    override.
    """

    queryset = CashHandover.objects.select_related("from_user", "to_user", "confirmed_by")
    serializer_class = CashHandoverSerializer
    permission_classes = [_CAN_VIEW_HANDOVERS]
    filterset_fields = ["status"]

    def get_queryset(self):
        user = self.request.user
        qs = CashHandover.objects.select_related("from_user", "to_user", "confirmed_by")
        if "FIELD" in user.role_codes and not (user.role_codes - {"FIELD"}):
            return qs.filter(from_user=user)
        if user.is_superuser or user.is_unrestricted:
            return qs
        return qs.filter(hub_id__in=user.hub_scope)

    def list(self, request):
        return Response(
            self.get_serializer(self.filter_queryset(self.get_queryset()), many=True).data
        )

    @extend_schema(request=InitiateHandoverSerializer, responses={201: CashHandoverSerializer})
    def create(self, request):
        if "FIELD" not in request.user.role_codes:
            raise ApiError(
                "Only field staff can initiate a cash handover.",
                code="permission_denied",
                status_code=403,
            )
        serializer = InitiateHandoverSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            to_user = User.objects.get(pk=serializer.validated_data["to_user"])
        except User.DoesNotExist as exc:
            raise ApiError("Recipient not found.", code="not_found") from exc
        handover = services.initiate_handover(
            from_user=request.user,
            to_user=to_user,
            amount_minor=serializer.validated_data["amount"],
        )
        return Response(CashHandoverSerializer(handover).data, status=201)

    @extend_schema(request=ConfirmHandoverSerializer, responses={200: CashHandoverSerializer})
    @action(detail=True, methods=["post"], permission_classes=[IsOpsStaff])
    def confirm(self, request, pk=None):
        handover = self.get_object()
        serializer = ConfirmHandoverSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        confirmed = services.confirm_handover(
            handover,
            received_amount_minor=serializer.validated_data["received_amount"],
            actor=request.user,
            note=serializer.validated_data["note"],
        )
        return Response(CashHandoverSerializer(confirmed).data)


class CashDepositViewSet(ScopedQuerysetMixin, viewsets.GenericViewSet):
    """`/billing/cash/deposits` — the far end of the same liability chain
    (docs/00 G-5): closing the books by banking hub cash. Not in docs/04's
    endpoint list (that doc covers handover/reconciliation only), but
    explicitly called out as in-scope by docs/08 batch 3.3 and docs/00
    G-5/R-405 — `IsOpsStaff` since this is day-to-day hub closing, the
    same tier that confirms handovers, not admin-only like a credit note.
    """

    queryset = CashDeposit.objects.select_related("deposited_by")
    serializer_class = CashDepositSerializer
    permission_classes = [IsOpsStaff]

    def list(self, request):
        return Response(
            self.get_serializer(self.filter_queryset(self.get_queryset()), many=True).data
        )

    @extend_schema(request=CreateDepositSerializer, responses={201: CashDepositSerializer})
    def create(self, request):
        user = request.user
        hub_ids = user.hub_scope
        if not user.is_unrestricted and not hub_ids:
            raise ApiError(
                "Your account has no hub assigned — ask an admin to fix your staff record.",
                code="validation_error",
            )
        serializer = CreateDepositSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        hub_id = request.data.get("hub") or (hub_ids[0] if hub_ids else None)
        if not hub_id:
            raise ApiError("A hub must be specified.", code="validation_error")
        hub = territory_services.get_hub(hub_id)
        deposit = services.record_deposit(
            hub,
            amount_minor=data["amount"],
            actor=user,
            reference=data["reference"],
            notes=data["notes"],
        )
        return Response(CashDepositSerializer(deposit).data, status=201)


class CashReconciliationView(APIView):
    """GET /billing/cash/reconciliation?date= — docs/06 §3.1 restricts
    this specific view (not handover confirmation) to Admin/Founder: it
    surfaces every rider's variance in one place, which is oversight
    territory the RBAC matrix explicitly keeps narrower than day-to-day
    hub operations."""

    permission_classes = [IsAdminOrFounder]

    @extend_schema(responses={200: CashReconciliationRowSerializer(many=True)})
    def get(self, request):
        date_param = request.query_params.get("date")
        date = parse_date(date_param) if date_param else timezone.localdate()
        if date is None:
            raise ApiError("Invalid date.", code="validation_error")
        user = request.user
        hub_ids = None if user.is_unrestricted else user.hub_scope
        rows = services.cash_reconciliation(hub_ids, date=date)
        return Response(CashReconciliationRowSerializer(rows, many=True).data)


class OrderCostView(APIView):
    """GET /billing/orders/{order_id}/costs — docs/07 §2⑧'s per-order
    contribution-margin waterfall. Admin/Founder only: docs/06 §3.1's
    matrix keeps "unit economics / margin" in bold — the operator sees the
    invoice total an operator has to collect (docs/06 §3.1's own "View
    invoice" row, see this module's own docstring above), not what the
    business actually nets on it."""

    permission_classes = [IsAdminOrFounder]

    @extend_schema(responses={200: OrderContributionMarginSerializer})
    def get(self, request, order_id):
        order = ordering_services.get_order(order_id)
        margin = services.order_contribution_margin(order)
        costs = services.order_costs(order)
        return Response(OrderContributionMarginSerializer({**margin, "costs": costs}).data)
