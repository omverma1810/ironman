"""
Ordering (docs/02 §3.5, docs/01 §5.1). The order lifecycle is one of three
independent state machines (docs/00 §3.3 M-3) — payment and garment-custody
status are tracked separately (custody/billing, later phases) and must
never be conflated back into this one.
"""

from __future__ import annotations

from django.db import models
from django.utils import timezone

from common.models import AppendOnlyModel, HubScopedModel


class OrderStatus(models.TextChoices):
    DRAFT = "DRAFT", "Draft"
    PENDING_CONFIRMATION = "PENDING_CONFIRMATION", "Pending confirmation"
    SCHEDULED = "SCHEDULED", "Scheduled"
    PICKUP_ASSIGNED = "PICKUP_ASSIGNED", "Pickup assigned"
    PICKUP_EN_ROUTE = "PICKUP_EN_ROUTE", "Pickup en route"
    PICKUP_FAILED = "PICKUP_FAILED", "Pickup failed"
    PICKED_UP = "PICKED_UP", "Picked up"
    AT_HUB = "AT_HUB", "At hub"
    INTAKE_VERIFIED = "INTAKE_VERIFIED", "Intake verified"
    IN_PRODUCTION = "IN_PRODUCTION", "In production"
    READY = "READY", "Ready"
    DELIVERY_ASSIGNED = "DELIVERY_ASSIGNED", "Delivery assigned"
    OUT_FOR_DELIVERY = "OUT_FOR_DELIVERY", "Out for delivery"
    DELIVERY_FAILED = "DELIVERY_FAILED", "Delivery failed"
    RETURNED_TO_HUB = "RETURNED_TO_HUB", "Returned to hub"
    DELIVERED = "DELIVERED", "Delivered"
    ON_HOLD = "ON_HOLD", "On hold"
    CANCELLED = "CANCELLED", "Cancelled"
    CLOSED = "CLOSED", "Closed"


class PaymentStatus(models.TextChoices):
    UNPAID = "UNPAID", "Unpaid"
    PARTIALLY_PAID = "PARTIALLY_PAID", "Partially paid"
    PAID = "PAID", "Paid"
    WRITTEN_OFF = "WRITTEN_OFF", "Written off"


class Channel(models.TextChoices):
    WEB = "WEB", "Web"
    WHATSAPP = "WHATSAPP", "WhatsApp"
    COUNTER = "COUNTER", "Counter / walk-in"
    PHONE = "PHONE", "Phone"
    APP = "APP", "Mobile app"


def _order_ref() -> str:
    now = timezone.localtime()
    seq = Order.objects.filter(created_at__year=now.year, created_at__month=now.month).count() + 1
    return f"ORD-{now:%y%m}-{seq:04d}"


class Order(HubScopedModel):
    ref = models.CharField(max_length=24, unique=True, editable=False)
    customer = models.ForeignKey(
        "customers.Customer", on_delete=models.PROTECT, related_name="orders"
    )
    address = models.ForeignKey(
        "customers.Address", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    apartment = models.ForeignKey(
        "territory.Apartment",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="orders",
    )
    service = models.ForeignKey("catalog.Service", on_delete=models.PROTECT, related_name="+")
    channel = models.CharField(max_length=16, choices=Channel.choices, default=Channel.WEB)

    status = models.CharField(max_length=24, choices=OrderStatus.choices, default=OrderStatus.DRAFT)
    payment_status = models.CharField(
        max_length=20, choices=PaymentStatus.choices, default=PaymentStatus.UNPAID
    )

    pickup_capacity = models.ForeignKey(
        "territory.RouteDayCapacity",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="pickup_orders",
    )
    delivery_capacity = models.ForeignKey(
        "territory.RouteDayCapacity",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="delivery_orders",
    )
    pickup_slot_start = models.DateTimeField(null=True, blank=True)
    pickup_slot_end = models.DateTimeField(null=True, blank=True)
    delivery_slot_start = models.DateTimeField(null=True, blank=True)
    delivery_slot_end = models.DateTimeField(null=True, blank=True)

    # The promise — written once at SCHEDULED, immutable thereafter. A
    # reschedule creates a NEW promise (07 §2⑨ / ADR-009's on-time rule).
    pickup_promised_at = models.DateTimeField(null=True, blank=True)
    delivery_promised_at = models.DateTimeField(null=True, blank=True)

    picked_up_at = models.DateTimeField(null=True, blank=True)
    delivered_at = models.DateTimeField(null=True, blank=True)

    declared_total_qty = models.PositiveIntegerField(default=0)
    verified_total_qty = models.PositiveIntegerField(null=True, blank=True)

    price_list_version = models.PositiveIntegerField(null=True, blank=True)
    estimate_minor = models.BigIntegerField(default=0)
    subtotal_minor = models.BigIntegerField(default=0)
    discount_minor = models.BigIntegerField(default=0)
    tax_minor = models.BigIntegerField(default=0)
    total_minor = models.BigIntegerField(default=0)

    referral_code = models.CharField(max_length=32, blank=True)
    offers_applied = models.JSONField(default=list, blank=True)

    notes = models.TextField(blank=True)
    special_instructions = models.TextField(blank=True)

    cancelled_by = models.ForeignKey(
        "identity.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    cancelled_reason = models.CharField(max_length=255, blank=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "ordering_order"
        indexes = [
            models.Index(fields=["hub", "status", "pickup_slot_start"]),
            models.Index(fields=["apartment", "-created_at"]),
            models.Index(fields=["customer", "-created_at"]),
        ]

    def save(self, *args, **kwargs):
        if not self.ref:
            self.ref = _order_ref()
        super().save(*args, **kwargs)

    def __str__(self) -> str:
        return self.ref

    @property
    def is_late_pickup(self) -> bool:
        if not self.pickup_promised_at or self.picked_up_at:
            return False
        from django.conf import settings

        grace = settings.IRONMAN["ON_TIME_GRACE_MINUTES"]
        return timezone.now() > self.pickup_promised_at + timezone.timedelta(minutes=grace)


class OrderLine(HubScopedModel):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="lines")
    garment_type = models.ForeignKey(
        "catalog.GarmentType", on_delete=models.PROTECT, related_name="+"
    )
    declared_qty = models.PositiveIntegerField(default=0)
    verified_qty = models.PositiveIntegerField(null=True, blank=True)
    unit_price_minor = models.BigIntegerField()
    line_total_minor = models.BigIntegerField(default=0)
    notes = models.CharField(max_length=255, blank=True)

    class Meta:
        db_table = "ordering_order_line"

    def __str__(self) -> str:
        return f"{self.order.ref} — {self.garment_type.name} x{self.declared_qty}"


class OrderEvent(AppendOnlyModel):
    """The order timeline (docs/04 §3.4 `/orders/{ref}/events`)."""

    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="events")
    event_type = models.CharField(max_length=48)
    from_status = models.CharField(max_length=24, blank=True)
    to_status = models.CharField(max_length=24, blank=True)
    actor = models.ForeignKey(
        "identity.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    actor_role = models.CharField(max_length=16, blank=True)
    payload = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = "ordering_order_event"
        indexes = [models.Index(fields=["order", "-created_at"])]

    def __str__(self) -> str:
        return f"{self.order.ref}: {self.from_status} → {self.to_status}"


class ReQuote(HubScopedModel):
    """ADR-008: billing derives from verified quantities; a variance above
    the configured threshold pauses the order until the customer responds."""

    class Decision(models.TextChoices):
        PENDING = "PENDING", "Pending"
        APPROVED = "APPROVED", "Approved"
        REJECTED = "REJECTED", "Rejected"

    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="requotes")
    reason = models.CharField(max_length=255)
    old_total_minor = models.BigIntegerField()
    new_total_minor = models.BigIntegerField()
    decision = models.CharField(max_length=16, choices=Decision.choices, default=Decision.PENDING)
    sent_at = models.DateTimeField(default=timezone.now)
    decided_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "ordering_requote"

    def __str__(self) -> str:
        return (
            f"{self.order.ref}: {self.old_total_minor} → {self.new_total_minor} ({self.decision})"
        )


class OrderException(HubScopedModel):
    """docs/00 §4 G-6 — damage/loss/dispute handling. Zero coverage in the
    draft FRD; this is the fastest way to lose a customer in this
    business, and it needs an owner and an SLA."""

    class Kind(models.TextChoices):
        DAMAGED = "DAMAGED", "Damaged"
        LOST = "LOST", "Lost"
        MISSING = "MISSING", "Missing"
        WRONG_ITEM = "WRONG_ITEM", "Wrong item"
        REPRESS = "REPRESS", "Re-press requested"
        COMPLAINT = "COMPLAINT", "Complaint"

    class Severity(models.TextChoices):
        LOW = "LOW", "Low"
        MEDIUM = "MEDIUM", "Medium"
        HIGH = "HIGH", "High"

    class Status(models.TextChoices):
        OPEN = "OPEN", "Open"
        INVESTIGATING = "INVESTIGATING", "Investigating"
        RESOLVED = "RESOLVED", "Resolved"
        WRITTEN_OFF = "WRITTEN_OFF", "Written off"

    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="exceptions")
    kind = models.CharField(max_length=16, choices=Kind.choices)
    severity = models.CharField(max_length=8, choices=Severity.choices, default=Severity.MEDIUM)
    description = models.TextField()
    raised_by = models.ForeignKey(
        "identity.User", null=True, on_delete=models.SET_NULL, related_name="+"
    )
    assigned_to = models.ForeignKey(
        "identity.User",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="assigned_exceptions",
    )
    sla_due_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.OPEN)
    resolution = models.TextField(blank=True)
    cost_minor = models.BigIntegerField(default=0)
    resolved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "ordering_order_exception"
        indexes = [models.Index(fields=["hub", "status"])]

    def __str__(self) -> str:
        return f"{self.order.ref}: {self.kind} ({self.status})"
