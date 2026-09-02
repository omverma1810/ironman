"""docs/04 (custody endpoints, Phase 2). Production-stage scans are gated
to IsOpsStaff — docs/06 §3.1's "Scan stage transitions" row gives Field
staff only own/assigned scans, which is pickup/delivery custody handed off
in `fulfilment` (not yet built), not the in-hub production stages tracked
here. This mirrors the "Intake verification" row exactly (Operator/Admin/
Founder only).
"""

from __future__ import annotations

import django_filters
from django.db.models import Count, OuterRef, Subquery
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.utils import extend_schema
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

import ordering.services as ordering_services
from common.permissions import IsOpsStaff, ScopedQuerysetMixin
from custody import services
from custody.models import TERMINAL_STAGES, Bag, GarmentLine, GarmentStage, QcCheck, StageEvent
from custody.serializers import (
    BagCreateSerializer,
    BagDetailSerializer,
    BagScanSerializer,
    GarmentLineSerializer,
    GarmentTransitionSerializer,
    QcCheckCreateSerializer,
    QcCheckSerializer,
    ScanResultSerializer,
    StageEventSerializer,
)
from custody.state_machine import transition_bag, transition_garment_line


class BagViewSet(ScopedQuerysetMixin, viewsets.ReadOnlyModelViewSet):
    """Bag lists are always narrow in practice — scoped to one order from
    the console, or eventually to one hub's WIP on the production board —
    never "every bag ever created". So list and retrieve both return the
    full nested shape (garment lines included): the console needs it on
    both, and there's no unscoped list heavy enough to make that costly."""

    queryset = (
        Bag.objects.filter(deleted_at__isnull=True)
        .select_related("order", "hub")
        .prefetch_related("garment_lines__garment_type")
    )
    serializer_class = BagDetailSerializer
    permission_classes = [IsOpsStaff]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["order", "hub", "current_stage", "code"]

    @action(detail=True, methods=["post"])
    def print_tag(self, request, pk=None):
        bag = self.get_object()
        bag = services.mark_printed(bag)
        return Response(BagDetailSerializer(bag).data)

    @action(detail=True, methods=["get"])
    def stage_events(self, request, pk=None):
        bag = self.get_object()
        return Response(StageEventSerializer(bag.stage_events.all(), many=True).data)


@extend_schema(request=BagCreateSerializer, responses={201: BagDetailSerializer})
class CreateBagForOrderView(APIView):
    """POST /orders/{order_id}/bags — one bag from an order's verified
    lines (docs/02 §3.5/§3.6). A separate call from `POST /orders/{ref}/
    intake`: intake fixes quantities and pricing; bagging is a distinct
    physical action ops does after, at their own pace."""

    permission_classes = [IsOpsStaff]

    def post(self, request, order_id):
        order = ordering_services.get_order(order_id)
        serializer = BagCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        bag = services.create_bag_for_order(
            order,
            order_line_ids=serializer.validated_data.get("order_line_ids"),
            actor=request.user,
        )
        return Response(BagDetailSerializer(bag).data, status=201)


@extend_schema(request=BagScanSerializer, responses={200: ScanResultSerializer})
class ScanView(APIView):
    """POST /custody/scan — the QR scan endpoint (docs/02 §3.6: "scanning
    resolves it server-side", never a URL carrying customer data). Advances
    every garment line in the bag that can legally reach `to_stage`;
    reports back any that couldn't (already diverged, e.g. one item sent to
    REWORK) so the console can surface it instead of silently dropping it."""

    permission_classes = [IsOpsStaff]

    def post(self, request):
        serializer = BagScanSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        bag = get_object_or_404(Bag, code=data["code"])
        result = transition_bag(
            bag,
            data["to_stage"],
            actor=request.user,
            scanned=data.get("scanned", True),
            station=data.get("station", ""),
            device_id=data.get("device_id", ""),
        )
        return Response(
            {
                "bag": BagDetailSerializer(result.bag).data,
                "moved_count": len(result.moved),
                "skipped_count": len(result.skipped),
                "skipped": GarmentLineSerializer(result.skipped, many=True).data,
            }
        )


class GarmentLineFilterSet(django_filters.FilterSet):
    """`due` powers the production board's today/overdue filters (docs/08
    batch 2.6) — a garment already DELIVERED (or diverted to an exception
    branch) is no longer a *production* concern, so it's excluded from
    both regardless of how late its order's promise is."""

    due = django_filters.CharFilter(method="filter_due")
    # The board's default view — everything currently moving through the
    # shop, not a growing pile of every garment ever DELIVERED. A caller
    # asking for a specific `stage` (DELIVERED included) wants exactly
    # that stage, so this only applies when nothing else narrows it.
    exclude_terminal = django_filters.BooleanFilter(method="filter_exclude_terminal")

    class Meta:
        model = GarmentLine
        fields = ["bag", "hub", "stage", "is_rework"]

    def filter_exclude_terminal(self, queryset, name, value):
        if value:
            return queryset.exclude(stage__in=TERMINAL_STAGES)
        return queryset

    def filter_due(self, queryset, name, value):
        queryset = queryset.exclude(stage__in=TERMINAL_STAGES)
        now = timezone.localtime()
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        today_end = today_start + timezone.timedelta(days=1)
        if value == "overdue":
            return queryset.filter(bag__order__delivery_promised_at__lt=now)
        if value == "today":
            return queryset.filter(
                bag__order__delivery_promised_at__gte=today_start,
                bag__order__delivery_promised_at__lt=today_end,
            )
        return queryset


class GarmentLineViewSet(ScopedQuerysetMixin, viewsets.ReadOnlyModelViewSet):
    queryset = (
        GarmentLine.objects.filter(deleted_at__isnull=True)
        .select_related("bag", "bag__order", "garment_type", "hub")
        .annotate(
            stage_entered_at=Subquery(
                StageEvent.objects.filter(garment_line=OuterRef("pk"))
                .order_by("-occurred_at")
                .values("occurred_at")[:1]
            )
        )
    )
    serializer_class = GarmentLineSerializer
    permission_classes = [IsOpsStaff]
    filter_backends = [DjangoFilterBackend]
    filterset_class = GarmentLineFilterSet

    @action(detail=False, methods=["get"])
    def wip_summary(self, request):
        """Stage counts for the production board's WIP-by-stage columns —
        one aggregate query instead of the console fetching every line and
        counting client-side. Honours the same hub/due filters as the list
        so "today's overdue WIP" and "all WIP" use one consistent query
        shape."""
        counts = dict(
            self.filter_queryset(self.get_queryset())
            .values_list("stage")
            .annotate(count=Count("id"))
        )
        return Response({stage: counts.get(stage, 0) for stage in GarmentStage.values})

    @action(detail=True, methods=["post"])
    def transition(self, request, pk=None):
        """Single-garment moves — QC's REWORK branch and the exception
        branches (DAMAGED/LOST/HELD/RETURNED_UNPRESSED) are per-item, not
        per-bag, by nature (docs/01 §5.3)."""
        garment_line = self.get_object()
        serializer = GarmentTransitionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        garment_line = transition_garment_line(
            garment_line,
            data["to_stage"],
            actor=request.user,
            scanned=data.get("scanned", True),
            station=data.get("station", ""),
            device_id=data.get("device_id", ""),
        )
        return Response(GarmentLineSerializer(garment_line).data)

    @action(detail=True, methods=["post"])
    def qc(self, request, pk=None):
        garment_line = self.get_object()
        serializer = QcCheckCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        garment_line = services.record_qc(
            garment_line,
            result=data["result"],
            reason=data.get("reason", ""),
            actor=request.user,
            scanned=data.get("scanned", True),
            device_id=data.get("device_id", ""),
        )
        return Response(GarmentLineSerializer(garment_line).data)

    @action(detail=True, methods=["get"])
    def qc_checks(self, request, pk=None):
        garment_line = self.get_object()
        return Response(QcCheckSerializer(garment_line.qc_checks.all(), many=True).data)


class QcCheckViewSet(ScopedQuerysetMixin, viewsets.ReadOnlyModelViewSet):
    """Read-only cross-garment view — writes happen through
    `GarmentLineViewSet.qc` so a check and its resulting stage move are
    always recorded together (custody.services.record_qc)."""

    queryset = QcCheck.objects.filter(deleted_at__isnull=True).select_related("garment_line", "hub")
    serializer_class = QcCheckSerializer
    permission_classes = [IsOpsStaff]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["garment_line", "result", "hub"]
    http_method_names = ["get", "head", "options"]
