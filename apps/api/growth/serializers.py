from rest_framework import serializers

from growth.models import (
    Attribution,
    CommissionAccrual,
    CommissionAppliesTo,
    CommissionBasis,
    CommissionRule,
    CustomerReferralReward,
    Feedback,
    PartnerKind,
    PartnerStatus,
    ReferralCode,
    ReferralPartner,
    ReferralProgram,
    Settlement,
)


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
    commission_rule_name = serializers.CharField(
        source="commission_rule.name", read_only=True, default=""
    )
    # Annotated by the partner viewset; absent (so 0) on a freshly created row.
    accrued_minor = serializers.IntegerField(read_only=True, default=0)
    payable_minor = serializers.IntegerField(read_only=True, default=0)
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
            "commission_rule",
            "commission_rule_name",
            "accrued_minor",
            "payable_minor",
            "created_at",
        ]
        read_only_fields = [
            "id",
            "hub",
            "status",
            "commission_rule",
            "commission_rule_name",
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


class AttributionSerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(source="customer.name", read_only=True)
    channel_code = serializers.CharField(source="channel.code", read_only=True)
    channel_name = serializers.CharField(source="channel.name", read_only=True)
    partner_name = serializers.CharField(source="partner.name", read_only=True, default="")
    code = serializers.CharField(source="referral_code.code", read_only=True, default="")
    order_ref = serializers.CharField(source="order.ref", read_only=True, default="")
    apartment_name = serializers.CharField(source="apartment.name", read_only=True, default="")

    class Meta:
        model = Attribution
        fields = [
            "id",
            "customer",
            "customer_name",
            "order",
            "order_ref",
            "channel",
            "channel_code",
            "channel_name",
            "partner",
            "partner_name",
            "referral_code",
            "code",
            "apartment",
            "apartment_name",
            "is_first_touch",
            "basis",
            "captured_at",
        ]
        read_only_fields = fields


class CommissionRuleSerializer(serializers.ModelSerializer):
    partner_count = serializers.SerializerMethodField()
    has_accruals = serializers.SerializerMethodField()

    class Meta:
        model = CommissionRule
        fields = [
            "id",
            "hub",
            "name",
            "basis",
            "value",
            "applies_to",
            "first_n",
            "cap_minor",
            "effective_from",
            "effective_to",
            "is_default",
            "partner_count",
            "has_accruals",
            "created_at",
        ]
        read_only_fields = fields

    def get_partner_count(self, obj) -> int:
        return obj.partners.filter(deleted_at__isnull=True).count()

    def get_has_accruals(self, obj) -> bool:
        return obj.accruals.exists()


class CommissionRuleCreateSerializer(serializers.Serializer):
    hub = serializers.UUIDField()
    name = serializers.CharField(max_length=80)
    basis = serializers.ChoiceField(choices=CommissionBasis.choices)
    value = serializers.IntegerField(min_value=1)
    applies_to = serializers.ChoiceField(
        choices=CommissionAppliesTo.choices, default=CommissionAppliesTo.FIRST_ORDER_ONLY
    )
    first_n = serializers.IntegerField(min_value=1, required=False, allow_null=True)
    cap_minor = serializers.IntegerField(min_value=1, required=False, allow_null=True)
    effective_from = serializers.DateField(required=False)
    effective_to = serializers.DateField(required=False, allow_null=True)
    is_default = serializers.BooleanField(default=False)


class CommissionRuleUpdateSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=80, required=False)
    basis = serializers.ChoiceField(choices=CommissionBasis.choices, required=False)
    value = serializers.IntegerField(min_value=1, required=False)
    applies_to = serializers.ChoiceField(choices=CommissionAppliesTo.choices, required=False)
    first_n = serializers.IntegerField(min_value=1, required=False, allow_null=True)
    cap_minor = serializers.IntegerField(min_value=1, required=False, allow_null=True)
    effective_from = serializers.DateField(required=False)
    effective_to = serializers.DateField(required=False, allow_null=True)
    is_default = serializers.BooleanField(required=False)


class PartnerCommissionRuleSerializer(serializers.Serializer):
    commission_rule = serializers.UUIDField(allow_null=True)


class CommissionAccrualSerializer(serializers.ModelSerializer):
    partner_name = serializers.CharField(source="partner.name", read_only=True)
    order_ref = serializers.CharField(source="order.ref", read_only=True)
    rule_name = serializers.CharField(source="rule.name", read_only=True)
    settlement_ref = serializers.CharField(source="settlement.ref", read_only=True, default="")

    class Meta:
        model = CommissionAccrual
        fields = [
            "id",
            "hub",
            "partner",
            "partner_name",
            "order",
            "order_ref",
            "rule",
            "rule_name",
            "rule_terms",
            "amount_minor",
            "status",
            "settlement",
            "settlement_ref",
            "accrued_at",
            "void_reason",
        ]
        read_only_fields = fields


class AccrualVoidSerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=255)


class PartnerBalanceSerializer(serializers.Serializer):
    partner = serializers.UUIDField()
    accrued_minor = serializers.IntegerField()
    in_settlement_minor = serializers.IntegerField()
    payable_minor = serializers.IntegerField()
    paid_minor = serializers.IntegerField()
    void_minor = serializers.IntegerField()


class SettlementSerializer(serializers.ModelSerializer):
    partner_name = serializers.CharField(source="partner.name", read_only=True)
    partner_upi_id = serializers.CharField(source="partner.upi_id", read_only=True)
    approved_by_name = serializers.CharField(
        source="approved_by.full_name", read_only=True, default=""
    )
    accrual_count = serializers.SerializerMethodField()

    class Meta:
        model = Settlement
        fields = [
            "id",
            "hub",
            "ref",
            "partner",
            "partner_name",
            "partner_upi_id",
            "period_start",
            "period_end",
            "total_minor",
            "status",
            "paid_at",
            "payment_method",
            "payment_ref",
            "approved_by",
            "approved_by_name",
            "accrual_count",
            "created_at",
        ]
        read_only_fields = fields

    def get_accrual_count(self, obj) -> int:
        return obj.accruals.count()


class SettlementCreateSerializer(serializers.Serializer):
    partner = serializers.UUIDField()
    period_start = serializers.DateField(required=False, allow_null=True)
    period_end = serializers.DateField(required=False, allow_null=True)


class SettlementMarkPaidSerializer(serializers.Serializer):
    payment_method = serializers.ChoiceField(choices=["UPI", "CASH", "BANK"], default="UPI")
    payment_ref = serializers.CharField(max_length=64, required=False, allow_blank=True, default="")


class ReferralProgramSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReferralProgram
        fields = [
            "id",
            "hub",
            "is_active",
            "referrer_reward_minor",
            "referee_reward_minor",
            "min_order_minor",
            "updated_at",
        ]
        read_only_fields = ["id", "hub", "updated_at"]


class ReferralProgramUpdateSerializer(serializers.Serializer):
    is_active = serializers.BooleanField(required=False)
    referrer_reward_minor = serializers.IntegerField(min_value=0, required=False)
    referee_reward_minor = serializers.IntegerField(min_value=0, required=False)
    min_order_minor = serializers.IntegerField(min_value=0, required=False)


class CustomerReferralRewardSerializer(serializers.ModelSerializer):
    referrer_name = serializers.CharField(source="referrer.name", read_only=True)
    referee_name = serializers.CharField(source="referee.name", read_only=True)
    code = serializers.CharField(source="referral_code.code", read_only=True)
    order_ref = serializers.CharField(source="order.ref", read_only=True)

    class Meta:
        model = CustomerReferralReward
        fields = [
            "id",
            "hub",
            "referrer",
            "referrer_name",
            "referee",
            "referee_name",
            "code",
            "order",
            "order_ref",
            "referrer_credit_minor",
            "referee_credit_minor",
            "created_at",
        ]
        read_only_fields = fields


class MyReferralSerializer(serializers.Serializer):
    code = serializers.CharField()
    is_active = serializers.BooleanField()
    friends_joined = serializers.IntegerField()
    rewards_count = serializers.IntegerField()
    rewards_earned_minor = serializers.IntegerField()
    referrer_reward_minor = serializers.IntegerField()
    referee_reward_minor = serializers.IntegerField()
    min_order_minor = serializers.IntegerField()
    credit_balance_minor = serializers.IntegerField()
