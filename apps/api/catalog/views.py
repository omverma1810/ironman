from django.db import transaction
from drf_spectacular.utils import extend_schema
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from catalog import services
from catalog.models import GarmentType, Offer, Package, PriceList, Service
from catalog.serializers import (
    GarmentTypeSerializer,
    OfferSerializer,
    PackageSerializer,
    PriceListActivateSerializer,
    PriceListSerializer,
    QuoteRequestSerializer,
    ServiceSerializer,
)
from common.errors import ApiError
from common.permissions import IsFounder, IsOpsStaff


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


class OfferViewSet(viewsets.ModelViewSet):
    queryset = Offer.objects.filter(deleted_at__isnull=True)
    serializer_class = OfferSerializer
    permission_classes = [IsOpsStaff]
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
