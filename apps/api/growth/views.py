import uuid

from django.db.models import Q, Sum
from django.db.models.functions import Coalesce
from django.http import HttpResponse
from django.utils import timezone
from drf_spectacular.utils import OpenApiTypes, extend_schema
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

import customers.services as customers_services
import ordering.services as ordering_services
import territory.services as territory_services
from common.errors import ApiError
from common.permissions import IsAdminOrFounder, IsFounder, IsOpsStaff, ScopedQuerysetMixin
from common.permissions import is_customer_only as _is_customer_only
from growth import commission, referrals, services
from growth.models import (
    AccrualStatus,
    Attribution,
    CommissionAccrual,
    CommissionRule,
    CustomerReferralReward,
    Feedback,
    ReferralCode,
    ReferralPartner,
    Settlement,
)
from growth.serializers import (
    AccrualVoidSerializer,
    AttributionSerializer,
    CommissionAccrualSerializer,
    CommissionRuleCreateSerializer,
    CommissionRuleSerializer,
    CommissionRuleUpdateSerializer,
    CustomerReferralRewardSerializer,
    FeedbackCreateSerializer,
    FeedbackModerateSerializer,
    FeedbackSerializer,
    MyReferralSerializer,
    PartnerBalanceSerializer,
    PartnerCommissionRuleSerializer,
    ReferralCodeCreateSerializer,
    ReferralCodeSerializer,
    ReferralCodeValidateResponseSerializer,
    ReferralCodeValidateSerializer,
    ReferralPartnerCreateSerializer,
    ReferralPartnerSerializer,
    ReferralPartnerStatusSerializer,
    ReferralProgramSerializer,
    ReferralProgramUpdateSerializer,
    SettlementCreateSerializer,
    SettlementMarkPaidSerializer,
    SettlementSerializer,
)
from supplies.services import user_can_access_hub


def _check_hub_access(user, hub_id) -> None:
    """A hub-scoped user can't act on another hub's rows by naming them in
    a request body — reported as not found, never forbidden (no probing)."""
    if not user_can_access_hub(user, hub_id):
        raise ApiError("Not found.", code="not_found", status_code=404)


class FeedbackViewSet(viewsets.ModelViewSet):
    """`[C]` a customer submits feedback for their own delivered order;
    `[A][B]` admin/founder see and moderate all of it (docs/04 — growth).
    No hub scoping for staff: a founder's "are customers happy" view is
    explicitly cross-hub (docs/07 §"Customer Feedback")."""

    queryset = Feedback.objects.filter(deleted_at__isnull=True).select_related("order", "customer")
    serializer_class = FeedbackSerializer
    filterset_fields = ["rating", "is_public", "order"]
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_permissions(self):
        if self.action == "create":
            return [IsAuthenticated()]
        return [IsAdminOrFounder()]

    def get_queryset(self):
        return Feedback.objects.filter(deleted_at__isnull=True).select_related("order", "customer")

    def create(self, request, *args, **kwargs):
        serializer = FeedbackCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        order = ordering_services.get_order(data["order"])
        if _is_customer_only(request.user):
            customer = getattr(request.user, "customer_profile", None)
            if not customer:
                raise ApiError("customer profile not found.", code="forbidden", status_code=403)
        else:
            customer = customers_services.get_customer(order.customer_id)

        feedback = services.submit_feedback(
            order,
            customer,
            rating=data["rating"],
            comment=data.get("comment", ""),
            tags=data.get("tags"),
        )
        return Response(FeedbackSerializer(feedback).data, status=201)

    def partial_update(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = FeedbackModerateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        if "is_public" in serializer.validated_data:
            instance.is_public = serializer.validated_data["is_public"]
            instance.responded_by = request.user
            instance.responded_at = timezone.now()
            instance.save(update_fields=["is_public", "responded_by", "responded_at"])
        return Response(FeedbackSerializer(instance).data)


class ReferralPartnerViewSet(ScopedQuerysetMixin, viewsets.ModelViewSet):
    """`[A][B]` (docs/04 §3.9) — onboarding and managing watchmen/
    influencers is founder/admin territory, the same tier as pricing and
    commission config, not day-to-day ops."""

    queryset = (
        ReferralPartner.objects.filter(deleted_at__isnull=True)
        .select_related("apartment", "onboarded_by", "commission_rule")
        .annotate(
            accrued_minor=Coalesce(
                Sum("accruals__amount_minor", filter=Q(accruals__status=AccrualStatus.ACCRUED)),
                0,
            ),
            payable_minor=Coalesce(
                Sum(
                    "accruals__amount_minor",
                    filter=Q(accruals__status__in=[AccrualStatus.ACCRUED, AccrualStatus.APPROVED]),
                ),
                0,
            ),
        )
    )
    serializer_class = ReferralPartnerSerializer
    permission_classes = [IsAdminOrFounder]
    filterset_fields = ["kind", "status", "apartment"]
    http_method_names = ["get", "post", "patch", "head", "options"]

    def create(self, request, *args, **kwargs):
        serializer = ReferralPartnerCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        hub = territory_services.get_hub(data["hub"])
        apartment = territory_services.get_apartment(data.get("apartment"))
        partner = services.onboard_partner(
            hub=hub,
            kind=data["kind"],
            name=data["name"],
            phone=data["phone"],
            apartment=apartment,
            upi_id=data.get("upi_id", ""),
            notes=data.get("notes", ""),
            actor=request.user,
        )
        return Response(ReferralPartnerSerializer(partner).data, status=201)

    @action(detail=True, methods=["post"])
    def status(self, request, pk=None):
        partner = self.get_object()
        serializer = ReferralPartnerStatusSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        partner = services.set_partner_status(
            partner, status=serializer.validated_data["status"], actor=request.user
        )
        return Response(ReferralPartnerSerializer(partner).data)

    @extend_schema(
        request=PartnerCommissionRuleSerializer, responses={200: ReferralPartnerSerializer}
    )
    @action(
        detail=True,
        methods=["post"],
        url_path="commission-rule",
        permission_classes=[IsFounder],
    )
    def commission_rule(self, request, pk=None):
        """docs/06 §2: editing commission terms is Founder-only."""
        partner = self.get_object()
        serializer = PartnerCommissionRuleSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        rule_id = serializer.validated_data["commission_rule"]
        rule = commission.get_rule(rule_id) if rule_id else None
        partner = commission.assign_rule(partner, rule, actor=request.user)
        return Response(ReferralPartnerSerializer(partner).data)

    @extend_schema(responses={200: CommissionAccrualSerializer(many=True)})
    @action(detail=True, methods=["get"])
    def accruals(self, request, pk=None):
        partner = self.get_object()
        rows = (
            CommissionAccrual.objects.filter(partner=partner)
            .select_related("partner", "order", "rule", "settlement")
            .order_by("-accrued_at")
        )
        page = self.paginate_queryset(rows)
        if page is not None:
            return self.get_paginated_response(CommissionAccrualSerializer(page, many=True).data)
        return Response(CommissionAccrualSerializer(rows, many=True).data)

    @extend_schema(responses={200: PartnerBalanceSerializer})
    @action(detail=True, methods=["get"])
    def balance(self, request, pk=None):
        partner = self.get_object()
        return Response(commission.partner_balance(partner))


class ReferralCodeViewSet(ScopedQuerysetMixin, viewsets.ModelViewSet):
    """`[A][B]` (docs/04 §3.9) for issuing/listing codes; `validate` below
    is the one public endpoint in this app, called from the booking wizard
    before a code is attached to an order."""

    queryset = ReferralCode.objects.filter(deleted_at__isnull=True).select_related(
        "owner_partner", "owner_customer", "apartment"
    )
    serializer_class = ReferralCodeSerializer
    permission_classes = [IsAdminOrFounder]
    filterset_fields = ["is_active", "owner_partner", "owner_customer", "apartment"]
    http_method_names = ["get", "post", "patch", "head", "options"]

    def create(self, request, *args, **kwargs):
        serializer = ReferralCodeCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        hub = territory_services.get_hub(data["hub"])
        owner_partner = (
            services.get_partner(data["owner_partner"]) if data.get("owner_partner") else None
        )
        owner_customer = (
            customers_services.get_customer(data["owner_customer"])
            if data.get("owner_customer")
            else None
        )
        apartment = territory_services.get_apartment(data.get("apartment"))
        referral_code = services.create_referral_code(
            hub=hub,
            owner_partner=owner_partner,
            owner_customer=owner_customer,
            apartment=apartment,
            code=data.get("code") or None,
            actor=request.user,
        )
        return Response(ReferralCodeSerializer(referral_code).data, status=201)


class ReferralCodeValidateView(APIView):
    """Public — no auth, called from the booking wizard as a customer types
    a code in (docs/04 §3.9)."""

    permission_classes = [AllowAny]

    @extend_schema(
        request=ReferralCodeValidateSerializer,
        responses={200: ReferralCodeValidateResponseSerializer},
    )
    def post(self, request):
        serializer = ReferralCodeValidateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        referral_code = services.validate_referral_code(serializer.validated_data["code"])
        return Response(
            {
                "code": referral_code.code,
                "is_active": referral_code.is_active,
                "owner_partner": referral_code.owner_partner_id,
                "owner_customer": referral_code.owner_customer_id,
                "apartment": referral_code.apartment_id,
            }
        )


class AttributionViewSet(ScopedQuerysetMixin, viewsets.ReadOnlyModelViewSet):
    """Where customers came from — read-only (the rows are append-only and
    written only by `services.capture_attribution`). Ops staff see their
    own hub's; a customer's own row is also what the console customer page
    shows as "Acquired via"."""

    queryset = Attribution.objects.select_related(
        "channel", "partner", "referral_code", "order", "apartment"
    )
    serializer_class = AttributionSerializer
    permission_classes = [IsOpsStaff]
    filterset_fields = ["customer", "order", "is_first_touch", "basis"]


class CommissionRuleViewSet(ScopedQuerysetMixin, viewsets.ModelViewSet):
    """docs/06 §2: Admin and Founder see commission rules; only a Founder
    creates or changes them."""

    queryset = CommissionRule.objects.filter(deleted_at__isnull=True).order_by(
        "-is_default", "-effective_from", "name"
    )
    serializer_class = CommissionRuleSerializer
    filterset_fields = ["is_default"]
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_permissions(self):
        if self.action in ("create", "partial_update", "update"):
            return [IsFounder()]
        return [IsAdminOrFounder()]

    @extend_schema(
        request=CommissionRuleCreateSerializer, responses={201: CommissionRuleSerializer}
    )
    def create(self, request, *args, **kwargs):
        serializer = CommissionRuleCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        _check_hub_access(request.user, data["hub"])
        hub = territory_services.get_hub(data.pop("hub"))
        rule = commission.create_rule(hub=hub, actor=request.user, **data)
        return Response(CommissionRuleSerializer(rule).data, status=201)

    @extend_schema(
        request=CommissionRuleUpdateSerializer, responses={200: CommissionRuleSerializer}
    )
    def partial_update(self, request, *args, **kwargs):
        rule = self.get_object()
        serializer = CommissionRuleUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        rule = commission.update_rule(
            rule, changes=dict(serializer.validated_data), actor=request.user
        )
        return Response(CommissionRuleSerializer(rule).data)


class CommissionAccrualViewSet(ScopedQuerysetMixin, viewsets.ReadOnlyModelViewSet):
    """Every commission earned, across partners. Written only by
    `growth.commission` on delivery; a Founder can void one that shouldn't
    have been earned (say, a partner who referred themselves)."""

    queryset = CommissionAccrual.objects.select_related(
        "partner", "order", "rule", "settlement"
    ).order_by("-accrued_at")
    serializer_class = CommissionAccrualSerializer
    permission_classes = [IsAdminOrFounder]
    filterset_fields = ["partner", "status", "settlement", "order"]

    @extend_schema(request=AccrualVoidSerializer, responses={200: CommissionAccrualSerializer})
    @action(detail=True, methods=["post"], permission_classes=[IsFounder])
    def void(self, request, pk=None):
        accrual = self.get_object()
        serializer = AccrualVoidSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        accrual = commission.void_accrual(
            accrual, reason=serializer.validated_data["reason"], actor=request.user
        )
        return Response(CommissionAccrualSerializer(accrual).data)


class SettlementViewSet(ScopedQuerysetMixin, viewsets.ModelViewSet):
    """docs/04 §3.9 / A-13 — settlement runs and payout records. Running a
    settlement and marking it paid are Founder-only (docs/06 §2); Admin can
    see them and download statements."""

    queryset = (
        Settlement.objects.filter(deleted_at__isnull=True)
        .select_related("partner", "approved_by")
        .order_by("-created_at")
    )
    serializer_class = SettlementSerializer
    filterset_fields = ["partner", "status"]
    http_method_names = ["get", "post", "head", "options"]

    def get_permissions(self):
        if self.action in ("create", "mark_paid", "cancel"):
            return [IsFounder()]
        return [IsAdminOrFounder()]

    @extend_schema(request=SettlementCreateSerializer, responses={201: SettlementSerializer})
    def create(self, request, *args, **kwargs):
        serializer = SettlementCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        partner = services.get_partner(data["partner"])
        _check_hub_access(request.user, partner.hub_id)
        settlement = commission.create_settlement(
            partner,
            period_start=data.get("period_start"),
            period_end=data.get("period_end"),
            actor=request.user,
        )
        return Response(SettlementSerializer(settlement).data, status=201)

    @extend_schema(request=SettlementMarkPaidSerializer, responses={200: SettlementSerializer})
    @action(detail=True, methods=["post"], url_path="mark-paid")
    def mark_paid(self, request, pk=None):
        settlement = self.get_object()
        serializer = SettlementMarkPaidSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        settlement = commission.mark_settlement_paid(
            settlement,
            payment_ref=serializer.validated_data["payment_ref"],
            payment_method=serializer.validated_data["payment_method"],
            actor=request.user,
        )
        return Response(SettlementSerializer(settlement).data)

    @extend_schema(request=None, responses={200: SettlementSerializer})
    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        settlement = commission.cancel_settlement(self.get_object(), actor=request.user)
        return Response(SettlementSerializer(settlement).data)

    @extend_schema(responses={(200, "application/pdf"): OpenApiTypes.BINARY})
    @action(detail=True, methods=["get"])
    def statement(self, request, pk=None):
        """Rendered from the settlement's current state every time, so the
        download always matches what the console shows."""
        from growth.pdf import render_statement_bytes

        settlement = self.get_object()
        response = HttpResponse(render_statement_bytes(settlement), content_type="application/pdf")
        response["Content-Disposition"] = f'inline; filename="{settlement.ref}.pdf"'
        return response


class MyReferralView(APIView):
    """`[C]` docs/08 batch 5.5 — the signed-in customer's own share code,
    issued on first request, with what their referrals have earned."""

    permission_classes = [IsAuthenticated]

    @extend_schema(responses={200: MyReferralSerializer})
    def get(self, request):
        customer = getattr(request.user, "customer_profile", None)
        if customer is None:
            # A signed-in phone number becomes a customer at its first
            # booking (docs/04 §3.1) — staff never do.
            raise ApiError(
                "Your referral code appears after your first booking.",
                code="not_found",
                status_code=404,
            )
        return Response(referrals.summary(customer))


class ReferralProgramView(APIView):
    """The hub's refer-a-friend terms. Admin and Founder see them; only a
    Founder changes them — it's money given away, the same tier as offers
    and commission rules (docs/06 §2)."""

    def get_permissions(self):
        if self.request.method == "PATCH":
            return [IsFounder()]
        return [IsAdminOrFounder()]

    def _hub(self, request):
        hub_id = request.query_params.get("hub")
        if hub_id:
            try:
                hub_id = uuid.UUID(hub_id)
            except ValueError as exc:
                raise ApiError("Not found.", code="not_found", status_code=404) from exc
            _check_hub_access(request.user, hub_id)
            return territory_services.get_hub(hub_id)
        hub_ids = request.user.hub_scope
        if request.user.is_superuser or request.user.is_unrestricted or not hub_ids:
            hub = territory_services.default_hub()
        else:
            hub = territory_services.get_hub(sorted(hub_ids, key=str)[0])
        if hub is None:
            raise ApiError("No hub is set up yet.", code="not_found", status_code=404)
        return hub

    @extend_schema(responses={200: ReferralProgramSerializer})
    def get(self, request):
        return Response(ReferralProgramSerializer(referrals.get_program(self._hub(request))).data)

    @extend_schema(
        request=ReferralProgramUpdateSerializer, responses={200: ReferralProgramSerializer}
    )
    def patch(self, request):
        serializer = ReferralProgramUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        program = referrals.update_program(
            referrals.get_program(self._hub(request)),
            changes=dict(serializer.validated_data),
            actor=request.user,
        )
        return Response(ReferralProgramSerializer(program).data)


class CustomerReferralRewardViewSet(ScopedQuerysetMixin, viewsets.ReadOnlyModelViewSet):
    """Every referral reward paid — written only by `growth.referrals`."""

    queryset = CustomerReferralReward.objects.select_related(
        "referrer", "referee", "referral_code", "order"
    ).order_by("-created_at")
    serializer_class = CustomerReferralRewardSerializer
    permission_classes = [IsAdminOrFounder]
    filterset_fields = ["referrer", "referee"]
