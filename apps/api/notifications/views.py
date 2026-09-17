from django.conf import settings
from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.utils import extend_schema, extend_schema_view
from rest_framework import filters, viewsets
from rest_framework.response import Response
from rest_framework.views import APIView

import ordering.services as ordering_services
from common.errors import ApiError
from common.permissions import IsCustomer, IsOpsStaff, ScopedQuerysetMixin
from notifications import services
from notifications.models import (
    NotificationChannel,
    NotificationPref,
    NotificationRequest,
    RecipientKind,
)
from notifications.serializers import (
    NotificationPreferenceSerializer,
    NotificationRequestSerializer,
    NotificationTestSerializer,
)


@extend_schema_view(
    get=extend_schema(responses={200: NotificationPreferenceSerializer(many=True)}),
    patch=extend_schema(
        request=NotificationPreferenceSerializer,
        responses={200: NotificationPreferenceSerializer(many=True)},
    ),
)
class NotificationPreferenceView(APIView):
    """GET/PATCH /notifications/preferences — docs/04 §3.11 [C]. A missing
    row means the router default (opted in); PATCH upserts exactly the
    one channel it's given, leaving the others untouched."""

    permission_classes = [IsCustomer]

    def _customer(self, request):
        customer = getattr(request.user, "customer_profile", None)
        if not customer:
            raise ApiError(
                "No customer profile on this account yet.",
                code="no_customer_profile",
                status_code=404,
            )
        return customer

    def get(self, request):
        customer = self._customer(request)
        rows = {
            p.channel: p.opted_in
            for p in NotificationPref.objects.filter(
                recipient_kind=RecipientKind.CUSTOMER, recipient_id=customer.id
            )
        }
        data = [
            {"channel": channel, "opted_in": rows.get(channel, True)}
            for channel in NotificationChannel.values
        ]
        return Response(NotificationPreferenceSerializer(data, many=True).data)

    def patch(self, request):
        customer = self._customer(request)
        serializer = NotificationPreferenceSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        NotificationPref.objects.update_or_create(
            recipient_kind=RecipientKind.CUSTOMER,
            recipient_id=customer.id,
            channel=serializer.validated_data["channel"],
            defaults={"opted_in": serializer.validated_data["opted_in"]},
        )
        return self.get(request)


@extend_schema(request=NotificationTestSerializer, responses={200: NotificationRequestSerializer})
class NotificationTestView(APIView):
    """POST /notifications/test — docs/04 §3.11 [A], staging only. Fires
    `notify()` for real against an existing order, so ops can confirm a
    template renders and a channel actually dispatches before trusting it
    on a real lifecycle event — gated off entirely once the recipient
    allowlist guard itself is (i.e. in production)."""

    permission_classes = [IsOpsStaff]

    def post(self, request):
        if not settings.IRONMAN["NOTIFICATIONS_ENFORCE_RECIPIENT_ALLOWLIST"]:
            raise ApiError(
                "Test sends are disabled in production.", code="not_available", status_code=403
            )
        serializer = NotificationTestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        order = ordering_services.get_order(serializer.validated_data["order"])
        result = services.notify(serializer.validated_data["event_key"], order)
        if result is None:
            return Response(
                {"detail": "No usable channel for this recipient/event — nothing was sent."},
                status=200,
            )
        return Response(NotificationRequestSerializer(result).data)


class NotificationLogViewSet(ScopedQuerysetMixin, viewsets.ReadOnlyModelViewSet):
    """GET /notifications/log?order= — docs/04 §3.11 [A]: what was sent,
    to whom, delivered? The exact-match `order` filter is the documented
    contract; `search=` on the order's own ref is what a support
    conversation actually hands an operator ("did ORD-2609-0055 get the
    message"), same reasoning `OrderViewSet.search_fields` documents."""

    serializer_class = NotificationRequestSerializer
    permission_classes = [IsOpsStaff]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ["order", "channel", "status"]
    search_fields = ["order__ref"]

    def get_queryset(self):
        qs = (
            NotificationRequest.objects.select_related("order", "template")
            .prefetch_related("deliveries")
            .order_by("-created_at")
        )
        return self.scope_to_hub(qs)
