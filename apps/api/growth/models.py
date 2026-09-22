"""Growth (docs/02 §3.10). Referral codes, campaigns, commissions and
attribution belong here. Batch 4.6 shipped `Feedback`; batch 5.1
(docs/08) adds `Channel`, `ReferralPartner` and `ReferralCode` — the
identity layer everything else in this phase (attribution, commission
accrual, settlements) is built on."""

from __future__ import annotations

from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

from common.models import BaseModel, HubScopedModel


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


class ReferralPartner(HubScopedModel):
    """docs/02 §3.10. `commission_rule` isn't wired yet — batch 5.3 adds
    `CommissionRule` and the FK to it, the same "stops at what this batch
    needs" split `supplies.ConsumptionRule`'s own docstring describes for
    `OrderCost` (which didn't exist yet when that model was written)."""

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
