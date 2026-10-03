"""Growth (docs/02 §3.10). Referral codes, campaigns, commissions and
attribution belong here. Batch 4.6 shipped `Feedback`; batch 5.1
(docs/08) adds `Channel`, `ReferralPartner` and `ReferralCode` — the
identity layer everything else in this phase (attribution, commission
accrual, settlements) is built on."""

from __future__ import annotations

from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.utils import timezone

from common.models import AppendOnlyModel, BaseModel, HubScopedModel


class Feedback(HubScopedModel):
    """docs/07 §"Customer Feedback": every ≤2 rating is a retention
    emergency, not a data point — `growth.services.submit_feedback` raises
    an `OrderException` for it, not just a stored row."""

    order = models.OneToOneField(
        "ordering.Order", on_delete=models.CASCADE, related_name="feedback"
    )
    customer = models.ForeignKey(
        "customers.Customer", on_delete=models.CASCADE, related_name="feedback"
    )
    rating = models.PositiveSmallIntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(5)]
    )
    comment = models.TextField(blank=True)
    tags = models.JSONField(default=list, blank=True)
    # Staff-moderated: a rating is never shown as a public testimonial
    # until someone reviews it — `responded_by`/`responded_at` record that
    # moderation, not a reply sent back to the customer.
    is_public = models.BooleanField(default=False)
    responded_by = models.ForeignKey(
        "identity.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    responded_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "growth_feedback"

    def __str__(self) -> str:
        return f"{self.order.ref}: {self.rating}/5"


class ChannelCode(models.TextChoices):
    WATCHMAN = "WATCHMAN", "Watchman"
    CUSTOMER_REFERRAL = "CUSTOMER_REFERRAL", "Customer referral"
    INFLUENCER = "INFLUENCER", "Influencer"
    FLYER = "FLYER", "Flyer"
    DIGITAL_AD = "DIGITAL_AD", "Digital ad"
    WALK_IN = "WALK_IN", "Walk-in"
    ORGANIC = "ORGANIC", "Organic"
    WHATSAPP = "WHATSAPP", "WhatsApp"


class Channel(BaseModel):
    """docs/02 §3.10. Not hub-scoped — a small, fixed, platform-wide
    lookup table (the eight codes above), the same "config, not
    operational data" tier as `notifications.NotificationTemplate`: seeded
    by migration, managed through Django Admin, no console screen of its
    own (docs/08 batch 5.1's console scope is partners and referral codes,
    the two things staff actually create day to day)."""

    code = models.CharField(max_length=24, choices=ChannelCode.choices, unique=True)
    name = models.CharField(max_length=80)
    is_paid = models.BooleanField(default=False)

    class Meta:
        db_table = "growth_channel"
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name


class PartnerKind(models.TextChoices):
    WATCHMAN = "WATCHMAN", "Watchman"
    INFLUENCER = "INFLUENCER", "Influencer"
    OTHER = "OTHER", "Other"


class PartnerStatus(models.TextChoices):
    ACTIVE = "ACTIVE", "Active"
    INACTIVE = "INACTIVE", "Inactive"


class CommissionBasis(models.TextChoices):
    PER_ORDER = "PER_ORDER", "Fixed amount per order"
    PER_ITEM = "PER_ITEM", "Fixed amount per item"
    PERCENT_OF_ORDER = "PERCENT_OF_ORDER", "Percent of order value"
    FLAT_FIRST_ORDER = "FLAT_FIRST_ORDER", "Flat amount, first order only"


class CommissionAppliesTo(models.TextChoices):
    FIRST_ORDER_ONLY = "FIRST_ORDER_ONLY", "Customer's first order only"
    ALL_ORDERS = "ALL_ORDERS", "Every order"
    FIRST_N_ORDERS = "FIRST_N_ORDERS", "Customer's first N orders"


class CommissionRule(HubScopedModel):
    """docs/02 §3.10 — what a referral partner earns per qualifying order.

    Rule-based and dated (A-04: "₹3 of a ₹15 shirt" first-order-only vs
    every order is a 5x swing in unit economics). `value` is paise for the
    fixed bases and basis points (1/100 of a percent) for
    `PERCENT_OF_ORDER`, so no float ever touches money (ADR-004).

    Terms are never edited once a rule has earned anything: every accrual
    keeps its own copy of the terms it was computed under, and changing
    terms means a new rule (D-01, docs/01 §2 "configuration is versioned,
    not mutated"). `is_default` marks the hub's rule for partners who
    don't have one of their own."""

    name = models.CharField(max_length=80)
    basis = models.CharField(max_length=20, choices=CommissionBasis.choices)
    value = models.PositiveIntegerField()
    applies_to = models.CharField(
        max_length=20,
        choices=CommissionAppliesTo.choices,
        default=CommissionAppliesTo.FIRST_ORDER_ONLY,
    )
    first_n = models.PositiveSmallIntegerField(null=True, blank=True)
    cap_minor = models.PositiveIntegerField(null=True, blank=True)
    effective_from = models.DateField(default=timezone.localdate)
    effective_to = models.DateField(null=True, blank=True)
    is_default = models.BooleanField(default=False)

    class Meta:
        db_table = "growth_commission_rule"
        indexes = [models.Index(fields=["hub", "is_default"])]

    def __str__(self) -> str:
        return self.name


class ReferralPartner(HubScopedModel):
    """docs/02 §3.10. `commission_rule` is optional: a partner without one
    earns under their hub's default rule (`CommissionRule.is_default`)."""

    kind = models.CharField(max_length=16, choices=PartnerKind.choices)
    name = models.CharField(max_length=120)
    phone = models.CharField(max_length=20)
    apartment = models.ForeignKey(
        "territory.Apartment", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    upi_id = models.CharField(max_length=64, blank=True)
    status = models.CharField(
        max_length=16, choices=PartnerStatus.choices, default=PartnerStatus.ACTIVE
    )
    onboarded_by = models.ForeignKey(
        "identity.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    notes = models.CharField(max_length=255, blank=True)
    commission_rule = models.ForeignKey(
        CommissionRule, null=True, blank=True, on_delete=models.PROTECT, related_name="partners"
    )

    class Meta:
        db_table = "growth_referral_partner"
        indexes = [models.Index(fields=["hub", "status"])]

    def __str__(self) -> str:
        return f"{self.name} ({self.kind})"


class ReferralCode(HubScopedModel):
    """docs/02 §3.10. Exactly one of `owner_partner`/`owner_customer` is
    set — `services.create_referral_code` enforces which, the same
    application-layer enforcement `billing.CreditEntry` uses for its own
    reason-vs-sign rule rather than a DB constraint (a partial `CHECK`
    that also excludes soft-deleted rows isn't worth it for two nullable
    FKs). `uses_count` is a denormalised counter batch 5.2's attribution
    capture will increment when a code is actually attached to an order —
    this batch only creates codes and validates them at booking time; it
    does not yet consume the counter."""

    code = models.CharField(max_length=24, unique=True)
    owner_partner = models.ForeignKey(
        ReferralPartner, null=True, blank=True, on_delete=models.CASCADE, related_name="codes"
    )
    owner_customer = models.ForeignKey(
        "customers.Customer",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="referral_codes",
    )
    apartment = models.ForeignKey(
        "territory.Apartment", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    is_active = models.BooleanField(default=True)
    uses_count = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = "growth_referral_code"
        indexes = [models.Index(fields=["hub", "is_active"])]

    def __str__(self) -> str:
        return self.code


class AttributionBasis(models.TextChoices):
    """How the channel was decided — kept so analytics (and the
    data-quality alerts of docs/08 batch 6.9) can tell a *known* channel
    from the `ORGANIC` fallback."""

    CODE = "CODE", "Referral code"
    SELF_REPORTED = "SELF_REPORTED", "Customer said so"
    ORDER_CHANNEL = "ORDER_CHANNEL", "How the order came in"
    DEFAULT = "DEFAULT", "Fallback (unknown)"
    BACKFILL = "BACKFILL", "Backfilled from older data"


class Attribution(AppendOnlyModel):
    """docs/02 §3.10 — where a customer came from. Append-only, and exactly
    one `is_first_touch` row per customer (a partial unique constraint):
    "attribution that can be edited later is attribution nobody believes"
    (R-502, A-03). Later orders that carry a referral code add further,
    non-first-touch rows."""

    hub = models.ForeignKey("territory.Hub", on_delete=models.PROTECT, related_name="+")
    customer = models.ForeignKey(
        "customers.Customer", on_delete=models.PROTECT, related_name="attributions"
    )
    order = models.ForeignKey(
        "ordering.Order", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    channel = models.ForeignKey(Channel, on_delete=models.PROTECT, related_name="+")
    apartment = models.ForeignKey(
        "territory.Apartment", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    partner = models.ForeignKey(
        ReferralPartner, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    referral_code = models.ForeignKey(
        ReferralCode, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    is_first_touch = models.BooleanField(default=False)
    basis = models.CharField(max_length=16, choices=AttributionBasis.choices)
    captured_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "growth_attribution"
        constraints = [
            models.UniqueConstraint(
                fields=["customer"],
                condition=models.Q(is_first_touch=True),
                name="uniq_growth_attribution_first_touch_per_customer",
            )
        ]
        indexes = [
            models.Index(fields=["channel", "captured_at"]),
            models.Index(fields=["apartment", "captured_at"]),
            models.Index(fields=["customer", "captured_at"]),
        ]

    def __str__(self) -> str:
        return (
            f"{self.customer_id} via {self.channel_id}{' (first)' if self.is_first_touch else ''}"
        )


class AccrualStatus(models.TextChoices):
    ACCRUED = "ACCRUED", "Accrued"
    APPROVED = "APPROVED", "In a settlement"
    SETTLED = "SETTLED", "Paid"
    VOID = "VOID", "Void"


class SettlementStatus(models.TextChoices):
    PENDING = "PENDING", "Awaiting payment"
    PAID = "PAID", "Paid"
    CANCELLED = "CANCELLED", "Cancelled"


def _settlement_ref() -> str:
    now = timezone.localtime()
    seq = (
        Settlement.objects.filter(created_at__year=now.year, created_at__month=now.month).count()
        + 1
    )
    return f"SET-{now:%y%m}-{seq:04d}"


def _statement_pdf_path(instance: "Settlement", filename: str) -> str:
    return f"growth/statements/{instance.hub_id}/{instance.ref}.pdf"


class Settlement(HubScopedModel):
    """docs/02 §3.10, A-13 — one payout to one partner covering every
    unpaid accrual up to `period_end`. `total_minor` is written once from
    the accruals it claims and never recomputed, so a statement always
    reconciles to its own lines (SC-6)."""

    ref = models.CharField(max_length=24, unique=True, editable=False, default=_settlement_ref)
    partner = models.ForeignKey(
        ReferralPartner, on_delete=models.PROTECT, related_name="settlements"
    )
    period_start = models.DateField(null=True, blank=True)
    period_end = models.DateField()
    total_minor = models.BigIntegerField()
    status = models.CharField(
        max_length=16, choices=SettlementStatus.choices, default=SettlementStatus.PENDING
    )
    paid_at = models.DateTimeField(null=True, blank=True)
    payment_method = models.CharField(max_length=16, blank=True)
    payment_ref = models.CharField(max_length=64, blank=True)
    approved_by = models.ForeignKey(
        "identity.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    statement_pdf = models.FileField(upload_to=_statement_pdf_path, null=True, blank=True)

    class Meta:
        db_table = "growth_settlement"
        indexes = [models.Index(fields=["partner", "status"])]

    def __str__(self) -> str:
        return self.ref


class CommissionAccrual(BaseModel):
    """docs/02 §3.10 — what one order earned one partner. The amount and
    the terms it was computed under are fixed at creation; only `status`
    (and the settlement that claims it) moves, and only through
    `growth.commission`. A partner earns once per order (docs/02 §5 #7);
    a mistake is voided, never edited or deleted."""

    hub = models.ForeignKey("territory.Hub", on_delete=models.PROTECT, related_name="+")
    partner = models.ForeignKey(ReferralPartner, on_delete=models.PROTECT, related_name="accruals")
    order = models.ForeignKey("ordering.Order", on_delete=models.PROTECT, related_name="+")
    rule = models.ForeignKey(CommissionRule, on_delete=models.PROTECT, related_name="accruals")
    rule_terms = models.JSONField(default=dict)
    amount_minor = models.BigIntegerField()
    status = models.CharField(
        max_length=16, choices=AccrualStatus.choices, default=AccrualStatus.ACCRUED
    )
    settlement = models.ForeignKey(
        Settlement, null=True, blank=True, on_delete=models.SET_NULL, related_name="accruals"
    )
    accrued_at = models.DateTimeField(default=timezone.now)
    void_reason = models.CharField(max_length=255, blank=True)

    class Meta:
        db_table = "growth_commission_accrual"
        constraints = [
            models.UniqueConstraint(
                fields=["partner", "order"], name="growth_accrual_once_per_partner_order"
            )
        ]
        indexes = [models.Index(fields=["partner", "status"])]

    def __str__(self) -> str:
        return f"{self.partner} · {self.amount_minor}p"


class ReferralProgram(HubScopedModel):
    """docs/08 batch 5.5 — the customer-refers-a-friend terms for one hub.
    When a referred customer's first order is delivered, the customer whose
    code they used earns `referrer_reward_minor` of store credit and the new
    customer `referee_reward_minor` (a welcome credit for their next
    order). Store credit, not cash: it can only be spent with IronMan (D-06)."""

    is_active = models.BooleanField(default=True)
    referrer_reward_minor = models.PositiveIntegerField(default=5000)
    referee_reward_minor = models.PositiveIntegerField(default=2500)
    min_order_minor = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = "growth_referral_program"
        constraints = [
            models.UniqueConstraint(fields=["hub"], name="growth_one_referral_program_per_hub")
        ]


class CustomerReferralReward(BaseModel):
    """One friend, one reward — the credit a referral earned and the order
    that qualified it. Unique on the referee, so a customer can only ever
    trigger a reward once, however many orders they place or codes they
    try."""

    hub = models.ForeignKey("territory.Hub", on_delete=models.PROTECT, related_name="+")
    referrer = models.ForeignKey(
        "customers.Customer", on_delete=models.PROTECT, related_name="referral_rewards_earned"
    )
    referee = models.OneToOneField(
        "customers.Customer", on_delete=models.PROTECT, related_name="referral_reward"
    )
    referral_code = models.ForeignKey(
        ReferralCode, on_delete=models.PROTECT, related_name="customer_rewards"
    )
    order = models.ForeignKey("ordering.Order", on_delete=models.PROTECT, related_name="+")
    referrer_credit_minor = models.PositiveIntegerField()
    referee_credit_minor = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = "growth_customer_referral_reward"


class Campaign(HubScopedModel):
    """docs/02 §3.10 / G-3 — a piece of marketing with a channel and,
    optionally, the apartment or cluster it targets ("₹4,000 to an
    influencer on 12 Sept, targeting Prestige Lakeside"). It's the label
    spend is entered against, so CAC can be worked out per channel and per
    apartment (docs/07 ④)."""

    name = models.CharField(max_length=120)
    channel = models.ForeignKey(Channel, on_delete=models.PROTECT, related_name="campaigns")
    apartment = models.ForeignKey(
        "territory.Apartment", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    cluster = models.ForeignKey(
        "territory.Cluster", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    start_on = models.DateField(default=timezone.localdate)
    end_on = models.DateField(null=True, blank=True)
    objective = models.CharField(max_length=255, blank=True)

    class Meta:
        db_table = "growth_campaign"
        indexes = [models.Index(fields=["hub", "start_on"])]

    def __str__(self) -> str:
        return self.name


class SpendCategory(models.TextChoices):
    INFLUENCER = "INFLUENCER", "Influencer"
    PRINT = "PRINT", "Print & flyers"
    ADS = "ADS", "Online ads"
    INCENTIVE = "INCENTIVE", "Incentives"
    OTHER = "OTHER", "Other"


class Spend(BaseModel):
    """docs/02 §3.10 — one marketing payment, the CAC data source (G-3).
    Never edited: a wrong entry is removed (soft-deleted, audit-logged) and
    entered again, so the history of what was claimed stays visible."""

    hub = models.ForeignKey("territory.Hub", on_delete=models.PROTECT, related_name="+")
    campaign = models.ForeignKey(Campaign, on_delete=models.PROTECT, related_name="spend")
    amount_minor = models.PositiveIntegerField()
    spent_on = models.DateField(default=timezone.localdate)
    category = models.CharField(max_length=16, choices=SpendCategory.choices)
    note = models.CharField(max_length=255, blank=True)

    class Meta:
        db_table = "growth_spend"
        indexes = [models.Index(fields=["hub", "spent_on"])]
