"""Customers (docs/02 §3.4). `acquisition_*` fields are write-once at first
order (R-502, A-03) — attribution that can be edited later is attribution
nobody believes."""

from __future__ import annotations

from django.db import models
from django.utils import timezone

from common.models import BaseModel, HubScopedModel


class Customer(HubScopedModel):
    class Status(models.TextChoices):
        LEAD = "LEAD", "Lead"
        ACTIVE = "ACTIVE", "Active"
        LAPSED = "LAPSED", "Lapsed"
        BLOCKED = "BLOCKED", "Blocked"

    user = models.OneToOneField(
        "identity.User",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="customer_profile",
    )
    phone = models.CharField(max_length=20, db_index=True)
    name = models.CharField(max_length=150, blank=True)
    email = models.EmailField(blank=True)
    preferred_language = models.CharField(max_length=8, default="en")
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.LEAD)

    first_order_at = models.DateTimeField(null=True, blank=True)
    last_order_at = models.DateTimeField(null=True, blank=True)
    lifetime_orders = models.PositiveIntegerField(default=0)
    lifetime_gross_minor = models.BigIntegerField(default=0)

    # docs/02 §3.4 — write-once at first order. Never edited after set.
    acquisition_channel = models.CharField(max_length=32, blank=True)
    acquisition_apartment = models.ForeignKey(
        "territory.Apartment", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    # Becomes a FK to growth.ReferralPartner once that app lands (Phase 5,
    # docs/08). A bare id for now rather than a dangling cross-app FK.
    acquisition_partner_id = models.UUIDField(null=True, blank=True)

    class Meta:
        db_table = "customers_customer"
        constraints = [
            models.UniqueConstraint(fields=["hub", "phone"], name="uniq_customer_phone_per_hub")
        ]
        indexes = [models.Index(fields=["hub", "status"])]

    def __str__(self) -> str:
        return self.name or self.phone

    def record_delivered_order(self, *, gross_minor: int):
        """Called by ordering.services on an order reaching DELIVERED —
        keeps the customer summary fields correct without a nightly job
        (07 §2① counts a customer from their first DELIVERED order, not
        first booking)."""
        now = timezone.now()
        if not self.first_order_at:
            self.first_order_at = now
            self.status = self.Status.ACTIVE
        self.last_order_at = now
        self.lifetime_orders = models.F("lifetime_orders") + 1
        self.lifetime_gross_minor = models.F("lifetime_gross_minor") + gross_minor
        self.save(
            update_fields=[
                "first_order_at",
                "last_order_at",
                "lifetime_orders",
                "lifetime_gross_minor",
                "status",
            ]
        )


class Address(BaseModel):
    customer = models.ForeignKey(Customer, on_delete=models.CASCADE, related_name="addresses")
    apartment = models.ForeignKey(
        "territory.Apartment", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    flat_no = models.CharField(max_length=32, blank=True)
    block = models.CharField(max_length=32, blank=True)
    landmark = models.CharField(max_length=160, blank=True)
    free_text_address = models.TextField(blank=True)
    label = models.CharField(max_length=32, default="Home")
    is_default = models.BooleanField(default=False)

    class Meta:
        db_table = "customers_address"

    def __str__(self) -> str:
        return f"{self.label} — {self.flat_no}, {self.apartment or self.free_text_address}"


class ConsentRecord(BaseModel):
    class Purpose(models.TextChoices):
        SERVICE = "SERVICE", "Service communication"
        MARKETING = "MARKETING", "Marketing"
        WHATSAPP = "WHATSAPP", "WhatsApp messaging"

    customer = models.ForeignKey(Customer, on_delete=models.CASCADE, related_name="consents")
    purpose = models.CharField(max_length=16, choices=Purpose.choices)
    granted = models.BooleanField(default=True)
    source = models.CharField(max_length=64, blank=True)
    ip = models.GenericIPAddressField(null=True, blank=True)

    class Meta:
        db_table = "customers_consent_record"

    def __str__(self) -> str:
        return f"{self.customer} — {self.purpose}: {'granted' if self.granted else 'withdrawn'}"


class CustomerNote(BaseModel):
    customer = models.ForeignKey(Customer, on_delete=models.CASCADE, related_name="notes")
    author = models.ForeignKey(
        "identity.User", null=True, on_delete=models.SET_NULL, related_name="+"
    )
    body = models.TextField()
    is_internal = models.BooleanField(default=True)

    class Meta:
        db_table = "customers_note"


class CustomerMergeLog(BaseModel):
    surviving = models.ForeignKey(
        Customer, on_delete=models.CASCADE, related_name="absorbed_merges"
    )
    merged_id = models.UUIDField()
    payload = models.JSONField(default=dict)

    class Meta:
        db_table = "customers_merge_log"
