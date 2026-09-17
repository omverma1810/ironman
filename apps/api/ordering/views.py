from django.db.models import Prefetch
from django.shortcuts import get_object_or_404
from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.utils import extend_schema
from rest_framework import filters, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

import catalog.services as catalog_services
import customers.services as customers_services
import territory.services as territory_services
from common.permissions import IsOpsStaff, ScopedQuerysetMixin
from common.permissions import is_customer_only as _is_customer_only
from common.throttles import ScopedRateThrottle
from ordering import services
from ordering.models import Order, OrderEvent, OrderException, OrderStatus, ReQuote
from ordering.serializers import (
    OrderCancelSerializer,
    OrderCreateSerializer,
    OrderDetailSerializer,
    OrderEventSerializer,
    OrderExceptionSerializer,
    OrderIntakeSerializer,
    OrderListSerializer,
    OrderRescheduleSerializer,
    PublicOrderTrackingSerializer,
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
        .select_related("customer", "apartment", "service", "hub", "address", "address__apartment")
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
            .select_related(
                "customer", "apartment", "service", "hub", "address", "address__apartment"
            )
            .prefetch_related("lines")
        )
        if _is_customer_only(user):
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
        apartment = territory_services.get_apartment(data.get("apartment"))

        if _is_customer_only(request.user):
            # Never the body's `customer` id — a customer proves who they
            # are via their session, not by naming an id, or any customer
            # could create an order under anyone else's identity. Covers
            # a first-time booker too: they have no Customer row yet.
            customer = customers_services.get_or_create_customer_for_user(
                request.user, hub=hub, channel=data["channel"], apartment=apartment
            )
        elif data.get("customer"):
            customer = customers_services.get_customer(data["customer"])
        else:
            from common.errors import ApiError

            raise ApiError("customer is required.", code="validation_error", status_code=400)

        service = catalog_services.get_service(data["service"])
        if _is_customer_only(request.user):
            # `get_address` performs no ownership check — never safe to
            # trust a customer-supplied address id at face value either
            # (same reasoning as `customer` above).
            address = customers_services.get_or_create_address_for_customer(
                customer,
                address_id=data.get("address"),
                apartment=apartment,
                flat_no=data.get("flat_no", ""),
                block=data.get("block", ""),
                landmark=data.get("landmark", ""),
                free_text_address=data.get("free_text_address", ""),
            )
        else:
            address = customers_services.get_address(data.get("address"))
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
            idempotency_key=request.headers.get("Idempotency-Key"),
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


@extend_schema(responses={200: PublicOrderTrackingSerializer})
class OrderTrackingView(APIView):
    """GET /track/{token}/ — docs/01 §4b C-3, batch 4.1: the tokenised
    tracking link, no login. `tracking_token` (not `id`/`ref`, both
    guessable or enumerable) is the only credential, so this stays
    strictly read-only and never accepts any other lookup key."""

    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "order_tracking"

    def get(self, request, token):
        order = get_object_or_404(
            Order.objects.filter(deleted_at__isnull=True)
            .select_related("customer", "service", "address", "address__apartment", "invoice")
            .prefetch_related(
                "lines", Prefetch("events", queryset=OrderEvent.objects.order_by("created_at"))
            ),
            tracking_token=token,
        )
        return Response(PublicOrderTrackingSerializer(order).data)


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
            idempotency_key=request.headers.get("Idempotency-Key"),
        )
        # A replayed Idempotency-Key returns the order from its *first*
        # call already at AT_HUB (create_order() already ran this same
        # transition then) — transitioning it again would be a same-state
        # AT_HUB -> AT_HUB the state machine doesn't allow.
        if order.status != OrderStatus.AT_HUB:
            order = transition(
                order, OrderStatus.AT_HUB, actor=request.user, event_type="order.counter_intake"
            )
        return Response(OrderDetailSerializer(order).data, status=201)


class ReQuoteViewSet(viewsets.ReadOnlyModelViewSet):
    """`[C]` a customer sees and responds only to their own order's
    re-quotes (docs/04 §3.4) — `get_queryset` is what makes another
    customer's re-quote 404 instead of visible/approvable, the same
    ownership scoping as `OrderViewSet`/`InvoiceViewSet`/`AddressViewSet`."""

    queryset = ReQuote.objects.filter(deleted_at__isnull=True).select_related("order")
    serializer_class = ReQuoteSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ["order", "decision"]

    def get_queryset(self):
        qs = ReQuote.objects.filter(deleted_at__isnull=True).select_related("order")
        if _is_customer_only(self.request.user):
            return qs.filter(order__customer__user=self.request.user)
        return qs

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
