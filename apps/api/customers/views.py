from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from common.errors import ApiError
from common.permissions import IsOpsStaff, ScopedQuerysetMixin
from common.permissions import is_customer_only as _is_customer_only
from customers import services
from customers.models import Address, ConsentRecord, Customer, CustomerNote
from customers.serializers import (
    AddressSerializer,
    ConsentRecordSerializer,
    CustomerDetailSerializer,
    CustomerListSerializer,
    CustomerMergeSerializer,
    CustomerNoteSerializer,
)


class CustomerViewSet(ScopedQuerysetMixin, viewsets.ModelViewSet):
    queryset = Customer.objects.filter(deleted_at__isnull=True)
    permission_classes = [IsOpsStaff]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ["status", "acquisition_channel"]
    search_fields = ["name", "phone", "email"]

    def get_serializer_class(self):
        return (
            CustomerDetailSerializer
            if self.action in ("retrieve", "create", "update", "partial_update")
            else CustomerListSerializer
        )

    @action(detail=True, methods=["get"])
    def duplicates(self, request, pk=None):
        customer = self.get_object()
        dupes = services.find_possible_duplicates(customer)
        return Response(CustomerListSerializer(dupes, many=True).data)

    @action(detail=True, methods=["post"])
    def merge(self, request, pk=None):
        surviving = self.get_object()
        serializer = CustomerMergeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        merged = self.get_queryset().get(pk=serializer.validated_data["merge_customer_id"])
        result = services.merge_customers(surviving=surviving, merged=merged, actor=request.user)
        return Response(CustomerDetailSerializer(result).data)


class AddressViewSet(viewsets.ModelViewSet):
    """`[A]` staff manage any customer's addresses; `[C]` a customer manages
    only their own (docs/08 batch 4.4's account area) — `get_queryset`'s
    filter is what makes another customer's address 404 rather than
    editable, the same ownership scoping as `OrderViewSet`/
    `InvoiceViewSet`."""

    queryset = Address.objects.filter(deleted_at__isnull=True)
    serializer_class = AddressSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ["customer"]

    def get_queryset(self):
        qs = Address.objects.filter(deleted_at__isnull=True)
        if _is_customer_only(self.request.user):
            return qs.filter(customer__user=self.request.user)
        if not IsOpsStaff().has_permission(self.request, self):
            return qs.none()
        return qs

    def perform_create(self, serializer):
        if _is_customer_only(self.request.user):
            customer = getattr(self.request.user, "customer_profile", None)
            if not customer:
                raise ApiError(
                    "Book your first order before saving an address.",
                    code="no_customer_profile",
                    status_code=400,
                )
            serializer.save(customer=customer)
        else:
            if "customer" not in serializer.validated_data:
                raise ApiError("customer is required.", code="validation_error", status_code=400)
            serializer.save()

    def perform_update(self, serializer):
        # A customer-role caller may edit their own address's details but
        # never reassign whose address it is — `get_queryset` already
        # guarantees `instance.customer` is their own, so simply not
        # touching the field on this path is enough.
        if _is_customer_only(self.request.user):
            serializer.validated_data.pop("customer", None)
        serializer.save()


class ConsentRecordViewSet(viewsets.ModelViewSet):
    queryset = ConsentRecord.objects.filter(deleted_at__isnull=True)
    serializer_class = ConsentRecordSerializer
    permission_classes = [IsOpsStaff]
    filterset_fields = ["customer", "purpose"]


class CustomerNoteViewSet(viewsets.ModelViewSet):
    queryset = CustomerNote.objects.filter(deleted_at__isnull=True)
    serializer_class = CustomerNoteSerializer
    permission_classes = [IsOpsStaff]
    filterset_fields = ["customer"]

    def perform_create(self, serializer):
        serializer.save(author=self.request.user)
