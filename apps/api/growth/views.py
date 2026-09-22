from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

import customers.services as customers_services
import ordering.services as ordering_services
import territory.services as territory_services
from common.errors import ApiError
from common.permissions import IsAdminOrFounder, ScopedQuerysetMixin
from common.permissions import is_customer_only as _is_customer_only
from growth import services
from growth.models import Feedback, ReferralCode, ReferralPartner
from growth.serializers import (
    FeedbackCreateSerializer,
    FeedbackModerateSerializer,
    FeedbackSerializer,
    ReferralCodeCreateSerializer,
    ReferralCodeSerializer,
    ReferralCodeValidateResponseSerializer,
    ReferralCodeValidateSerializer,
    ReferralPartnerCreateSerializer,
    ReferralPartnerSerializer,
    ReferralPartnerStatusSerializer,
)


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

    queryset = ReferralPartner.objects.filter(deleted_at__isnull=True).select_related(
        "apartment", "onboarded_by"
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
