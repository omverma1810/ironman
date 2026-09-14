from django.db import transaction
from drf_spectacular.utils import extend_schema
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from catalog import services
from catalog.models import GarmentType, Offer, Package, PriceLine, PriceList, Service
from catalog.serializers import (
    GarmentTypeSerializer,
    OfferSerializer,
    PackageSerializer,
    PriceLineSetSerializer,
    PriceListActivateSerializer,
    PriceListSerializer,
    QuoteRequestSerializer,
    ServiceSerializer,
)
from common.errors import ApiError
from common.permissions import IsFounder


class ServiceViewSet(viewsets.ModelViewSet):
    queryset = Service.objects.filter(deleted_at__isnull=True)
    serializer_class = ServiceSerializer

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return [AllowAny()]
        return [IsFounder()]


class GarmentTypeViewSet(viewsets.ModelViewSet):
    queryset = GarmentType.objects.filter(deleted_at__isnull=True)
    serializer_class = GarmentTypeSerializer
    filterset_fields = ["service"]

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return [AllowAny()]
        return [IsFounder()]


class PriceListViewSet(viewsets.ModelViewSet):
    """Only FOUNDER may create/activate — pricing is one of the RBAC
    matrix's money-visibility rows (docs/06 §3.1)."""

    queryset = PriceList.objects.filter(deleted_at__isnull=True).select_related("service", "hub")
    serializer_class = PriceListSerializer
    permission_classes = [IsFounder]
    filterset_fields = ["hub", "service", "status"]

    def perform_create(self, serializer):
        hub = serializer.validated_data["hub"]
        service = serializer.validated_data["service"]
        last_version = (
            PriceList.objects.filter(hub=hub, service=service).order_by("-version").first()
        )
        next_version = (last_version.version + 1) if last_version else 1
        serializer.save(
            status=PriceList.Status.DRAFT, version=next_version, created_by=self.request.user
        )

    @action(detail=True, methods=["post"])
    def activate(self, request, pk=None):
        price_list = self.get_object()
        if price_list.status != PriceList.Status.DRAFT:
            raise ApiError(
                "Only a draft price list can be activated.",
                code="invalid_state_transition",
                status_code=409,
            )
        serializer = PriceListActivateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        from django.utils import timezone

        effective_from = serializer.validated_data.get("effective_from", timezone.now())

        with transaction.atomic():
            PriceList.objects.filter(
                hub=price_list.hub, service=price_list.service, status=PriceList.Status.ACTIVE
            ).update(status=PriceList.Status.SUPERSEDED, effective_to=effective_from)
            price_list.status = PriceList.Status.ACTIVE
            price_list.effective_from = effective_from
            price_list.save(update_fields=["status", "effective_from"])

        from common import audit

        audit.record(
            action="price_list.activated",
            object_type="PriceList",
            object_id=str(price_list.id),
            hub=price_list.hub,
            after={"version": price_list.version},
        )
        return Response(PriceListSerializer(price_list).data)

    @extend_schema(request=PriceLineSetSerializer, responses={200: PriceListSerializer})
    @action(detail=True, methods=["put"], url_path="lines")
    @transaction.atomic
    def lines(self, request, pk=None):
        """Replaces this DRAFT price list's entire line set — the model's
        own `PriceLine.save()` guard (ADR-005) already refuses to touch an
        ACTIVE/SUPERSEDED list's lines, but that check only fires on a
        per-row `save()`, not `bulk_create()`, so it's re-asserted here
        before either the soft-delete or the create."""
        price_list = self.get_object()
        if price_list.status != PriceList.Status.DRAFT:
            raise ApiError(
                "Only a draft price list's lines can be edited.",
                code="invalid_state_transition",
                status_code=409,
            )
        serializer = PriceLineSetSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        from django.utils import timezone

        PriceLine.objects.filter(price_list=price_list).update(
            deleted_at=timezone.now(), deleted_by=request.user
        )
        PriceLine.objects.bulk_create(
            PriceLine(
                price_list=price_list,
                garment_type=line["garment_type"],
                unit_price_minor=line["unit_price_minor"],
                min_qty=line["min_qty"],
                created_by=request.user,
            )
            for line in serializer.validated_data["lines"]
        )
        result = PriceList.objects.select_related("service", "hub").get(pk=price_list.pk)
        return Response(PriceListSerializer(result).data)


class OfferViewSet(viewsets.ModelViewSet):
    """Founder-only, same tier as `PriceListViewSet` — docs/04 §3.3 marks
    offer CRUD `[B]`, and an offer is pricing-and-discount configuration,
    not day-to-day order handling."""

    queryset = Offer.objects.filter(deleted_at__isnull=True)
    serializer_class = OfferSerializer
    permission_classes = [IsFounder]
    filterset_fields = ["kind", "is_active", "apartment"]


class PackageViewSet(viewsets.ModelViewSet):
    queryset = Package.objects.filter(deleted_at__isnull=True)
    serializer_class = PackageSerializer
    permission_classes = [IsFounder]


@extend_schema(request=QuoteRequestSerializer, responses={200: dict})
class QuoteView(APIView):
    """POST /catalog/quote — public, no side effects (docs/04 §3.3)."""

    permission_classes = [AllowAny]

    def post(self, request):
        serializer = QuoteRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        result = services.quote(
            hub_id=data["hub"],
            service_id=data["service"],
            lines=data["lines"],
            apartment_id=data.get("apartment"),
            is_first_order=data.get("is_first_order", False),
            offer_codes=data.get("offer_codes"),
        )
        return Response(result.to_dict())
