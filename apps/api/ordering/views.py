from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.utils import extend_schema
from rest_framework import filters, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

import catalog.services as catalog_services
import customers.services as customers_services
import territory.services as territory_services
from common.permissions import IsOpsStaff, ScopedQuerysetMixin
from common.throttles import ScopedRateThrottle
from ordering import services
from ordering.models import Order, OrderException, OrderStatus, ReQuote
from ordering.serializers import (
    OrderCancelSerializer,
    OrderCreateSerializer,
    OrderDetailSerializer,
    OrderEventSerializer,
    OrderExceptionSerializer,
    OrderIntakeSerializer,
    OrderListSerializer,
    OrderRescheduleSerializer,
    ReQuoteDecisionSerializer,
    ReQuoteSerializer,
)
from ordering.state_machine import cancel as cancel_order
from ordering.state_machine import transition


class OrderViewSet(ScopedQuerysetMixin, viewsets.ModelViewSet):
    """docs/04 §3.4. Customers see only their own orders; staff see their
    hub scope (docs/06 §3.2, enforced by ScopedQuerysetMixin)."""

    queryset = (
        Order.objects.filter(deleted_at__isnull=True)
        .select_related("customer", "apartment", "service", "hub")
        .prefetch_related("lines")
    )
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ["status", "channel", "apartment", "hub"]
    search_fields = ["ref", "customer__name", "customer__phone"]
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_queryset(self):
        user = self.request.user
        qs = (
            Order.objects.filter(deleted_at__isnull=True)
            .select_related("customer", "apartment", "service", "hub")
            .prefetch_related("lines")
        )
        if "CUSTOMER" in user.role_codes and not (user.role_codes - {"CUSTOMER"}):
            return qs.filter(customer__user=user)
        self.queryset = qs
        return self.scope_to_hub(qs)

    def get_serializer_class(self):
        return OrderDetailSerializer if self.action == "retrieve" else OrderListSerializer

    def create(self, request, *args, **kwargs):
        serializer = OrderCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        hub = territory_services.get_hub(data["hub"])
        customer = customers_services.get_customer(data["customer"])
        service = catalog_services.get_service(data["service"])
        address = customers_services.get_address(data.get("address"))
        apartment = territory_services.get_apartment(data.get("apartment"))
        pickup_capacity = territory_services.get_capacity(data.get("pickup_capacity"))

        order = services.create_order(
            hub=hub,
            customer=customer,
            service=service,
            lines=data["lines"],
            channel=data["channel"],
            address=address,
            apartment=apartment,
            pickup_capacity=pickup_capacity,
            notes=data.get("notes", ""),
            special_instructions=data.get("special_instructions", ""),
            referral_code=data.get("referral_code", ""),
            actor=request.user,
        )
        return Response(OrderDetailSerializer(order).data, status=201)

    @action(detail=True, methods=["post"], throttle_classes=[ScopedRateThrottle])
    def cancel(self, request, pk=None):
        order = self.get_object()
        serializer = OrderCancelSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        order = cancel_order(order, actor=request.user, reason=serializer.validated_data["reason"])
        return Response(OrderDetailSerializer(order).data)

    @action(detail=True, methods=["post"])
    def reschedule(self, request, pk=None):
        order = self.get_object()
        serializer = OrderRescheduleSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        capacity = territory_services.get_capacity(serializer.validated_data["pickup_capacity"])
        order = services.reschedule(order, pickup_capacity=capacity, actor=request.user)
        return Response(OrderDetailSerializer(order).data)

    @action(detail=True, methods=["get"])
    def events(self, request, pk=None):
        order = self.get_object()
        return Response(OrderEventSerializer(order.events.all(), many=True).data)

    @action(detail=True, methods=["post"], permission_classes=[IsOpsStaff])
    def advance(self, request, pk=None):
        """Generic ops-driven advance for stages not yet covered by a
        dedicated custody/fulfilment endpoint (those land in Phase 2).
        Still fully guarded by the same state machine."""
        order = self.get_object()
        to_status = request.data.get("to_status")
        if to_status not in OrderStatus.values:
            from common.errors import ApiError

            raise ApiError("Unknown target status.", code="validation_error")
        order = transition(order, to_status, actor=request.user, event_type="order.advanced")
        return Response(OrderDetailSerializer(order).data)

    @action(detail=True, methods=["post"], permission_classes=[IsOpsStaff])
    def intake(self, request, pk=None):
        order = self.get_object()
        serializer = OrderIntakeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        order = services.record_intake(
            order,
            verified_lines=serializer.validated_data["verified_lines"],
            notes=serializer.validated_data.get("notes", ""),
            actor=request.user,
        )
        return Response(OrderDetailSerializer(order).data)


@extend_schema(request=OrderCreateSerializer, responses={201: OrderDetailSerializer})
class CounterOrderView(APIView):
    """POST /orders/counter — walk-in intake in one call (R-103, docs/00
    §4 G-7). The store sits inside the neighbourhood it serves; SRC-B had
    no non-pickup order path at all."""

    permission_classes = [IsOpsStaff]

    def post(self, request):
        serializer = OrderCreateSerializer(data={**request.data, "channel": "COUNTER"})
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        hub = territory_services.get_hub(data["hub"])
        customer = customers_services.get_customer(data["customer"])
        service = catalog_services.get_service(data["service"])
        order = services.create_order(
            hub=hub,
            customer=customer,
            service=service,
            lines=data["lines"],
            channel="COUNTER",
            notes=data.get("notes", ""),
            actor=request.user,
        )
        order = transition(
            order, OrderStatus.AT_HUB, actor=request.user, event_type="order.counter_intake"
        )
        return Response(OrderDetailSerializer(order).data, status=201)


class ReQuoteViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = ReQuote.objects.filter(deleted_at__isnull=True).select_related("order")
    serializer_class = ReQuoteSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ["order", "decision"]

    @action(detail=True, methods=["post"])
    def respond(self, request, pk=None):
        requote = self.get_object()
        serializer = ReQuoteDecisionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        order = services.resolve_requote(
            requote, approved=serializer.validated_data["approved"], actor=request.user
        )
        return Response(OrderDetailSerializer(order).data)


class OrderExceptionViewSet(ScopedQuerysetMixin, viewsets.ModelViewSet):
    queryset = OrderException.objects.filter(deleted_at__isnull=True).select_related(
        "order", "raised_by", "assigned_to"
    )
    serializer_class = OrderExceptionSerializer
    permission_classes = [IsOpsStaff]
    filterset_fields = ["status", "kind", "severity", "order", "assigned_to"]

    def perform_create(self, serializer):
        serializer.save(raised_by=self.request.user, hub=serializer.validated_data["order"].hub)
