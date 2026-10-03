from rest_framework import serializers

from growth.models import (
    Attribution,
    Campaign,
    ChannelCode,
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
    Spend,
    SpendCategory,
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


class CampaignSerializer(serializers.ModelSerializer):
    channel = serializers.CharField(source="channel.code", read_only=True)
    channel_name = serializers.CharField(source="channel.name", read_only=True)
    apartment_name = serializers.CharField(source="apartment.name", read_only=True, default="")
    cluster_name = serializers.CharField(source="cluster.name", read_only=True, default="")
    summary = serializers.SerializerMethodField()

    class Meta:
        model = Campaign
        fields = [
            "id",
            "hub",
            "name",
            "channel",
            "channel_name",
            "apartment",
            "apartment_name",
            "cluster",
            "cluster_name",
            "start_on",
            "end_on",
            "objective",
            "summary",
            "created_at",
        ]
        read_only_fields = fields

    def get_summary(self, obj) -> dict:
        from growth.marketing import campaign_summary

        return campaign_summary(obj)


class CampaignCreateSerializer(serializers.Serializer):
    hub = serializers.UUIDField()
    name = serializers.CharField(max_length=120)
    channel = serializers.ChoiceField(choices=ChannelCode.choices)
    apartment = serializers.UUIDField(required=False, allow_null=True)
    cluster = serializers.UUIDField(required=False, allow_null=True)
    start_on = serializers.DateField(required=False)
    end_on = serializers.DateField(required=False, allow_null=True)
    objective = serializers.CharField(max_length=255, required=False, allow_blank=True, default="")


class CampaignUpdateSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=120, required=False)
    objective = serializers.CharField(max_length=255, required=False, allow_blank=True)
    start_on = serializers.DateField(required=False)
    end_on = serializers.DateField(required=False, allow_null=True)


class SpendSerializer(serializers.ModelSerializer):
    campaign_name = serializers.CharField(source="campaign.name", read_only=True)
    channel = serializers.CharField(source="campaign.channel.code", read_only=True)
    entered_by_name = serializers.CharField(
        source="created_by.full_name", read_only=True, default=""
    )

    class Meta:
        model = Spend
        fields = [
            "id",
            "hub",
            "campaign",
            "campaign_name",
            "channel",
            "amount_minor",
            "spent_on",
            "category",
            "note",
            "entered_by_name",
            "created_at",
        ]
        read_only_fields = fields


class SpendCreateSerializer(serializers.Serializer):
    campaign = serializers.UUIDField()
    amount_minor = serializers.IntegerField(min_value=1)
    category = serializers.ChoiceField(choices=SpendCategory.choices)
    spent_on = serializers.DateField(required=False)
    note = serializers.CharField(max_length=255, required=False, allow_blank=True, default="")


class SpendRemoveSerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=255)


class ChannelCostSerializer(serializers.Serializer):
    channel = serializers.CharField()
    channel_name = serializers.CharField()
    is_paid = serializers.BooleanField()
    spend_minor = serializers.IntegerField()
    commission_minor = serializers.IntegerField()
    new_customers = serializers.IntegerField()
    cac_minor = serializers.IntegerField(allow_null=True)


class AcquisitionCostSerializer(serializers.Serializer):
    start = serializers.DateField()
    end = serializers.DateField()
    channels = ChannelCostSerializer(many=True)
    total_cost_minor = serializers.IntegerField()
    new_customers = serializers.IntegerField()
    blended_cac_minor = serializers.IntegerField(allow_null=True)
    paid_cac_minor = serializers.IntegerField(allow_null=True)


class LapsedCustomerSerializer(serializers.Serializer):
    customer = serializers.UUIDField()
    name = serializers.CharField()
    phone = serializers.CharField()
    apartment_name = serializers.CharField()
    delivered_orders = serializers.IntegerField()
    spent_minor = serializers.IntegerField()
    last_delivered_at = serializers.DateTimeField()
    days_since = serializers.IntegerField()
    last_contacted_at = serializers.DateTimeField(allow_null=True)


class ReengagementSendSerializer(serializers.Serializer):
    days = serializers.IntegerField(min_value=7, max_value=365, required=False)
    one_time_only = serializers.BooleanField(default=False)
    customers = serializers.ListField(child=serializers.UUIDField(), required=False)
    offer = serializers.CharField(max_length=120, required=False, allow_blank=True, default="")


class ReengagementResultSerializer(serializers.Serializer):
    eligible = serializers.IntegerField()
    sent = serializers.IntegerField()
    recently_contacted = serializers.IntegerField()
    opted_out = serializers.IntegerField()
    not_sent = serializers.IntegerField()
