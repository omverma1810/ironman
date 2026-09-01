from rest_framework import serializers

from catalog.models import GarmentType, Offer, Package, PriceLine, PriceList, Service


class ServiceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Service
        fields = ["id", "code", "name", "unit", "sla_hours", "is_active"]


class GarmentTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = GarmentType
        fields = ["id", "service", "code", "name", "default_press_seconds", "is_active"]


class PriceLineSerializer(serializers.ModelSerializer):
    garment_type_name = serializers.CharField(source="garment_type.name", read_only=True)

    class Meta:
        model = PriceLine
        fields = ["id", "garment_type", "garment_type_name", "unit_price_minor", "min_qty"]


class PriceListSerializer(serializers.ModelSerializer):
    lines = PriceLineSerializer(many=True, read_only=True)
    service_name = serializers.CharField(source="service.name", read_only=True)

    class Meta:
        model = PriceList
        fields = [
            "id",
            "hub",
            "service",
            "service_name",
            "version",
            "status",
            "effective_from",
            "effective_to",
            "notes",
            "lines",
            "created_at",
        ]
        read_only_fields = ["version", "status"]


class PriceListActivateSerializer(serializers.Serializer):
    effective_from = serializers.DateTimeField(required=False)


class OfferSerializer(serializers.ModelSerializer):
    class Meta:
        model = Offer
        fields = [
            "id",
            "code",
            "kind",
            "value_bps",
            "value_minor",
            "cap_minor",
            "apartment",
            "effective_from",
            "effective_to",
            "max_redemptions",
            "redemptions_count",
            "is_active",
        ]
        read_only_fields = ["redemptions_count"]


class PackageSerializer(serializers.ModelSerializer):
    class Meta:
        model = Package
        fields = [
            "id",
            "service",
            "name",
            "cycle",
            "included_qty",
            "price_minor",
            "effective_from",
            "effective_to",
            "is_active",
        ]


class QuoteRequestSerializer(serializers.Serializer):
    hub = serializers.UUIDField()
    service = serializers.UUIDField()
    apartment = serializers.UUIDField(required=False, allow_null=True)
    is_first_order = serializers.BooleanField(default=False)
    offer_codes = serializers.ListField(child=serializers.CharField(), required=False)
    lines = serializers.ListField(child=serializers.DictField(), allow_empty=False)
