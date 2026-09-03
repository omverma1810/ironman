"""docs/04 §3.8 (supplies endpoints, batch 2.13). Day-to-day stock handling
(items, receipts, adjustments, reorder alerts) is `[O][A]` → `IsOpsStaff`,
the same mapping used for every other `[O][A]`-tagged row in this codebase
(e.g. `territory`'s apartment endpoints). The ledger (`movements`) and the
consumption-rule formulas are oversight/config, not day-to-day handling —
`[A][B]` and `[A]` respectively — so both get `IsAdminOrFounder`, Operator
excluded, mirroring `fulfilment.views`' reasoning for route-day planning.
"""

from __future__ import annotations

from django.db import models, transaction
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import viewsets
from rest_framework.response import Response
from rest_framework.views import APIView

from common.permissions import IsAdminOrFounder, IsOpsStaff, ScopedQuerysetMixin
from supplies import services
from supplies.models import ConsumptionRule, StockItem, StockLevel, StockMovement
from supplies.serializers import (
    ConsumptionRuleReplaceSerializer,
    ConsumptionRuleSerializer,
    StockAdjustmentSerializer,
    StockItemSerializer,
    StockLevelSerializer,
    StockMovementSerializer,
    StockReceiptSerializer,
)


class StockItemViewSet(ScopedQuerysetMixin, viewsets.ModelViewSet):
    queryset = StockItem.objects.filter(deleted_at__isnull=True)
    serializer_class = StockItemSerializer
    permission_classes = [IsOpsStaff]
    http_method_names = ["get", "post", "patch", "head", "options"]


class StockLevelViewSet(ScopedQuerysetMixin, viewsets.ReadOnlyModelViewSet):
    queryset = StockLevel.objects.select_related("stock_item").filter(
        stock_item__deleted_at__isnull=True
    )
    serializer_class = StockLevelSerializer
    permission_classes = [IsOpsStaff]


class StockMovementViewSet(ScopedQuerysetMixin, viewsets.ReadOnlyModelViewSet):
    queryset = StockMovement.objects.select_related("stock_item", "actor")
    serializer_class = StockMovementSerializer
    permission_classes = [IsAdminOrFounder]

    def get_queryset(self):
        qs = self.scope_to_hub(super().get_queryset())
        params = self.request.query_params
        item = params.get("item")
        if item:
            qs = qs.filter(stock_item_id=item)
        from_ts = params.get("from")
        if from_ts:
            qs = qs.filter(at__gte=from_ts)
        to_ts = params.get("to")
        if to_ts:
            qs = qs.filter(at__lte=to_ts)
        return qs


@extend_schema(request=StockReceiptSerializer, responses={201: StockMovementSerializer})
class StockReceiptView(APIView):
    permission_classes = [IsOpsStaff]

    def post(self, request):
        serializer = StockReceiptSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        stock_item = services.get_stock_item(data["item"])
        movement = services.receive_stock(
            stock_item,
            qty=data["qty"],
            unit_cost_minor=data["unit_cost"],
            supplier=data["supplier"],
            invoice_ref=data["invoice_ref"],
            note=data["note"],
            actor=request.user,
        )
        return Response(StockMovementSerializer(movement).data, status=201)


@extend_schema(request=StockAdjustmentSerializer, responses={201: StockMovementSerializer})
class StockAdjustmentView(APIView):
    permission_classes = [IsOpsStaff]

    def post(self, request):
        serializer = StockAdjustmentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        stock_item = services.get_stock_item(data["item"])
        movement = services.adjust_stock(
            stock_item,
            delta=data["delta"],
            kind=data["kind"],
            note=data["note"],
            actor=request.user,
        )
        return Response(StockMovementSerializer(movement).data, status=201)


@extend_schema(responses={200: StockLevelSerializer(many=True)})
class ReorderAlertListView(ScopedQuerysetMixin, APIView):
    permission_classes = [IsOpsStaff]

    def get(self, request):
        qs = StockLevel.objects.select_related("stock_item").filter(
            stock_item__is_active=True,
            stock_item__deleted_at__isnull=True,
            qty_on_hand__lte=models.F("stock_item__reorder_level"),
        )
        qs = self.scope_to_hub(qs)
        return Response(StockLevelSerializer(qs, many=True).data)


class ConsumptionRuleView(APIView):
    permission_classes = [IsAdminOrFounder]

    @extend_schema(responses={200: ConsumptionRuleSerializer(many=True)})
    def get(self, request):
        rules = ConsumptionRule.objects.select_related("service", "garment_type", "stock_item")
        return Response(ConsumptionRuleSerializer(rules, many=True).data)

    @extend_schema(
        request=ConsumptionRuleReplaceSerializer,
        responses={200: ConsumptionRuleSerializer(many=True)},
    )
    @transaction.atomic
    def put(self, request):
        serializer = ConsumptionRuleReplaceSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        # Soft-delete, not `.delete()` — no domain row is ever hard-deleted
        # (common/models.py `BaseModel`).
        ConsumptionRule.objects.update(deleted_at=timezone.now(), deleted_by=request.user)
        rules = [
            ConsumptionRule(
                service=r["service"],
                garment_type=r.get("garment_type"),
                stock_item=r["stock_item"],
                qty_per_unit=r["qty_per_unit"],
                created_by=request.user,
            )
            for r in serializer.validated_data["rules"]
        ]
        ConsumptionRule.objects.bulk_create(rules)
        result = ConsumptionRule.objects.select_related("service", "garment_type", "stock_item")
        return Response(ConsumptionRuleSerializer(result, many=True).data)
