from django.utils.dateparse import parse_date
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import viewsets
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from common.permissions import IsAdminOrFounder, IsOpsStaff, ScopedQuerysetMixin
from territory import services
from territory.models import Apartment, ApartmentContact, Cluster, Hub, RouteDayCapacity
from territory.serializers import (
    ApartmentContactSerializer,
    ApartmentPublicSerializer,
    ApartmentSerializer,
    ClusterSerializer,
    HubSerializer,
    RouteDayCapacitySerializer,
)


@extend_schema(parameters=[OpenApiParameter("pincode", str)], responses={200: dict})
class ServiceabilityView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        pincode = request.query_params.get("pincode")
        return Response(services.check_serviceability(pincode=pincode))


@extend_schema(
    parameters=[OpenApiParameter("q", str), OpenApiParameter("cluster", str)],
    responses={200: ApartmentPublicSerializer(many=True)},
)
class ApartmentSearchView(APIView):
    """Public search used by the booking wizard (docs/04 §3.2)."""

    permission_classes = [AllowAny]

    def get(self, request):
        q = request.query_params.get("q", "").strip()
        cluster_id = request.query_params.get("cluster")
        qs = Apartment.objects.filter(is_active=True)
        if q:
            qs = qs.filter(name__icontains=q)
        if cluster_id:
            qs = qs.filter(cluster_id=cluster_id)
        return Response(ApartmentPublicSerializer(qs[:20], many=True).data)


@extend_schema(
    parameters=[
        OpenApiParameter("cluster", str),
        OpenApiParameter("kind", str),
        OpenApiParameter("from", str),
        OpenApiParameter("to", str),
    ],
    responses={200: RouteDayCapacitySerializer(many=True)},
)
class CapacityView(APIView):
    """Public slot-availability check for the booking wizard."""

    permission_classes = [AllowAny]

    def get(self, request):
        cluster_id = request.query_params.get("cluster")
        kind = request.query_params.get("kind", "PICKUP")
        date_from = parse_date(request.query_params.get("from", ""))
        date_to = parse_date(request.query_params.get("to", ""))
        qs = RouteDayCapacity.objects.filter(kind=kind)
        if cluster_id:
            qs = qs.filter(cluster_id=cluster_id)
        if date_from:
            qs = qs.filter(date__gte=date_from)
        if date_to:
            qs = qs.filter(date__lte=date_to)
        data = [
            {**RouteDayCapacitySerializer(row).data, "available": row.available}
            for row in qs.order_by("date", "window_start")[:100]
        ]
        return Response(data)


class HubViewSet(viewsets.ModelViewSet):
    """Any ops staff may read the hub list — an operator building a
    counter order needs to pick a hub (docs/06 §3.1 row "operational
    analytics"/base data is IsOpsStaff-visible). Only founders create or
    edit hubs — opening a new location is a business decision, not a
    day-to-day op."""

    queryset = Hub.objects.filter(deleted_at__isnull=True)
    serializer_class = HubSerializer

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return [IsOpsStaff()]
        return [IsAdminOrFounder()]


class ClusterViewSet(ScopedQuerysetMixin, viewsets.ModelViewSet):
    queryset = Cluster.objects.filter(deleted_at__isnull=True).select_related("hub")
    serializer_class = ClusterSerializer
    permission_classes = [IsOpsStaff]
    filterset_fields = ["hub", "is_active"]


class ApartmentViewSet(ScopedQuerysetMixin, viewsets.ModelViewSet):
    queryset = (
        Apartment.objects.filter(deleted_at__isnull=True)
        .select_related("cluster", "cluster__hub")
        .prefetch_related("contacts")
    )
    serializer_class = ApartmentSerializer
    permission_classes = [IsOpsStaff]
    filterset_fields = ["cluster", "is_active"]
    hub_field = "cluster__hub"


class ApartmentContactViewSet(ScopedQuerysetMixin, viewsets.ModelViewSet):
    queryset = ApartmentContact.objects.filter(deleted_at__isnull=True).select_related(
        "apartment__cluster__hub"
    )
    serializer_class = ApartmentContactSerializer
    permission_classes = [IsOpsStaff]
    filterset_fields = ["apartment", "kind"]
    hub_field = "apartment__cluster__hub"


class RouteDayCapacityViewSet(ScopedQuerysetMixin, viewsets.ModelViewSet):
    queryset = RouteDayCapacity.objects.filter(deleted_at__isnull=True).select_related(
        "cluster", "hub"
    )
    serializer_class = RouteDayCapacitySerializer
    permission_classes = [IsOpsStaff]
    filterset_fields = ["cluster", "date", "kind"]
