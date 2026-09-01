from rest_framework import serializers

from customers.models import Address, ConsentRecord, Customer, CustomerNote


class AddressSerializer(serializers.ModelSerializer):
    apartment_name = serializers.CharField(source="apartment.name", read_only=True)

    class Meta:
        model = Address
        fields = [
            "id",
            "apartment",
            "apartment_name",
            "flat_no",
            "block",
            "landmark",
            "free_text_address",
            "label",
            "is_default",
        ]


class ConsentRecordSerializer(serializers.ModelSerializer):
    class Meta:
        model = ConsentRecord
        fields = ["id", "purpose", "granted", "source", "created_at"]


class CustomerNoteSerializer(serializers.ModelSerializer):
    author_name = serializers.CharField(source="author.full_name", read_only=True)

    class Meta:
        model = CustomerNote
        fields = ["id", "body", "is_internal", "author", "author_name", "created_at"]
        read_only_fields = ["author"]


class CustomerListSerializer(serializers.ModelSerializer):
    class Meta:
        model = Customer
        fields = [
            "id",
            "name",
            "phone",
            "status",
            "first_order_at",
            "last_order_at",
            "lifetime_orders",
            "lifetime_gross_minor",
            "acquisition_channel",
        ]


class CustomerDetailSerializer(serializers.ModelSerializer):
    addresses = AddressSerializer(many=True, read_only=True)
    notes = CustomerNoteSerializer(many=True, read_only=True)

    class Meta:
        model = Customer
        fields = [
            "id",
            "name",
            "phone",
            "email",
            "preferred_language",
            "status",
            "first_order_at",
            "last_order_at",
            "lifetime_orders",
            "lifetime_gross_minor",
            "acquisition_channel",
            "acquisition_apartment",
            "addresses",
            "notes",
            "created_at",
        ]
        read_only_fields = [
            "first_order_at",
            "last_order_at",
            "lifetime_orders",
            "lifetime_gross_minor",
            "acquisition_channel",
            "acquisition_apartment",
        ]


class CustomerMergeSerializer(serializers.Serializer):
    merge_customer_id = serializers.UUIDField()
