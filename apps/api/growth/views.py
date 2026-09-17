from django.utils import timezone
from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

import customers.services as customers_services
import ordering.services as ordering_services
from common.errors import ApiError
from common.permissions import IsAdminOrFounder
from common.permissions import is_customer_only as _is_customer_only
from growth import services
from growth.models import Feedback
from growth.serializers import (
    FeedbackCreateSerializer,
    FeedbackModerateSerializer,
    FeedbackSerializer,
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
