from rest_framework import serializers

from growth.models import Feedback, PartnerKind, PartnerStatus, ReferralCode, ReferralPartner


class FeedbackCreateSerializer(serializers.Serializer):
    order = serializers.UUIDField()
    rating = serializers.IntegerField(min_value=1, max_value=5)
    comment = serializers.CharField(required=False, allow_blank=True)
    tags = serializers.ListField(child=serializers.CharField(), required=False)


class FeedbackSerializer(serializers.ModelSerializer):
    order_ref = serializers.CharField(source="order.ref", read_only=True)
    customer_name = serializers.CharField(source="customer.name", read_only=True)

    class Meta:
        model = Feedback
        fields = [
            "id",
            "order",
            "order_ref",
            "customer_name",
            "rating",
            "comment",
            "tags",
            "is_public",
            "responded_by",
            "responded_at",
            "created_at",
        ]
        read_only_fields = [f for f in fields if f != "is_public"]


class FeedbackModerateSerializer(serializers.Serializer):
    is_public = serializers.BooleanField()


# ── Referral partners & codes (docs/08 batch 5.1) ─────────────────────────


class ReferralPartnerSerializer(serializers.ModelSerializer):
    apartment_name = serializers.CharField(source="apartment.name", read_only=True, default="")
    onboarded_by_name = serializers.CharField(
        source="onboarded_by.full_name", read_only=True, default=""
    )

    class Meta:
        model = ReferralPartner
        fields = [
            "id",
            "hub",
            "kind",
            "name",
            "phone",
            "apartment",
            "apartment_name",
            "upi_id",
            "status",
            "onboarded_by",
            "onboarded_by_name",
            "notes",
            "created_at",
        ]
        read_only_fields = [
            "id",
            "hub",
            "status",
            "onboarded_by",
            "onboarded_by_name",
            "created_at",
        ]


class ReferralPartnerCreateSerializer(serializers.Serializer):
    hub = serializers.UUIDField()
    kind = serializers.ChoiceField(choices=PartnerKind.choices)
    name = serializers.CharField(max_length=120)
    phone = serializers.CharField(max_length=20)
    apartment = serializers.UUIDField(required=False, allow_null=True)
    upi_id = serializers.CharField(max_length=64, required=False, allow_blank=True, default="")
    notes = serializers.CharField(max_length=255, required=False, allow_blank=True, default="")


class ReferralPartnerStatusSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=PartnerStatus.choices)


class ReferralCodeSerializer(serializers.ModelSerializer):
    owner_partner_name = serializers.CharField(
        source="owner_partner.name", read_only=True, default=""
    )
    owner_customer_name = serializers.CharField(
        source="owner_customer.name", read_only=True, default=""
    )
    apartment_name = serializers.CharField(source="apartment.name", read_only=True, default="")

    class Meta:
        model = ReferralCode
        fields = [
            "id",
            "hub",
            "code",
            "owner_partner",
            "owner_partner_name",
            "owner_customer",
            "owner_customer_name",
            "apartment",
            "apartment_name",
            "is_active",
            "uses_count",
            "created_at",
        ]
        read_only_fields = [
            "id",
            "hub",
            "code",
            "owner_partner",
            "owner_customer",
            "uses_count",
            "created_at",
        ]


class ReferralCodeCreateSerializer(serializers.Serializer):
    hub = serializers.UUIDField()
    owner_partner = serializers.UUIDField(required=False, allow_null=True)
    owner_customer = serializers.UUIDField(required=False, allow_null=True)
    apartment = serializers.UUIDField(required=False, allow_null=True)
    code = serializers.CharField(max_length=24, required=False, allow_blank=True)


class ReferralCodeValidateSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=24)


class ReferralCodeValidateResponseSerializer(serializers.Serializer):
    code = serializers.CharField()
    is_active = serializers.BooleanField()
    owner_partner = serializers.UUIDField(allow_null=True)
    owner_customer = serializers.UUIDField(allow_null=True)
    apartment = serializers.UUIDField(allow_null=True)
