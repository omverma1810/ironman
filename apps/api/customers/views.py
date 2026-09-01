from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from common.permissions import IsOpsStaff, ScopedQuerysetMixin
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
    queryset = Address.objects.filter(deleted_at__isnull=True)
    serializer_class = AddressSerializer
    permission_classes = [IsOpsStaff]
    filterset_fields = ["customer"]


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
