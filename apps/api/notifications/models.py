"""Notifications (docs/02 §3.11, batch 4.2 — docs/08). A channel router
picks the best available channel per recipient and dispatches through a
pluggable provider; `dedupe_key` is the guard against the classic "the
customer got the delivery message four times because Celery retried"."""

from __future__ import annotations

from django.db import models

from common.models import AppendOnlyModel, BaseModel, HubScopedModel


class NotificationChannel(models.TextChoices):
    WHATSAPP = "WHATSAPP", "WhatsApp"
    SMS = "SMS", "SMS"
    PUSH = "PUSH", "Push"
    EMAIL = "EMAIL", "Email"


class ApprovalStatus(models.TextChoices):
    PENDING = "PENDING", "Pending"
    APPROVED = "APPROVED", "Approved"
    REJECTED = "REJECTED", "Rejected"


class RecipientKind(models.TextChoices):
    CUSTOMER = "CUSTOMER", "Customer"
    STAFF = "STAFF", "Staff"


class NotificationTemplate(BaseModel):
    """One template body per (event) `code` × `channel` × `locale` — e.g.
    `order.scheduled` has a WhatsApp variant and an SMS fallback variant.
    `provider_template_id` is the BSP's own approved template name; a
    WhatsApp template can't be used to send until `approval_status` is
    APPROVED (Meta/DLT review — docs/00 §5 D-05, 1–3 weeks lead time)."""

    code = models.CharField(max_length=64)
    channel = models.CharField(max_length=16, choices=NotificationChannel.choices)
    locale = models.CharField(max_length=8, default="en")
    provider_template_id = models.CharField(max_length=128, blank=True)
    body = models.TextField()
    variables = models.JSONField(default=list, blank=True)
    approval_status = models.CharField(
        max_length=16, choices=ApprovalStatus.choices, default=ApprovalStatus.PENDING
    )

    class Meta:
        db_table = "notifications_template"
        constraints = [
            models.UniqueConstraint(
                fields=["code", "channel", "locale"], name="uniq_template_code_channel_locale"
            )
        ]

    def __str__(self) -> str:
        return f"{self.code} ({self.channel}/{self.locale})"

    @property
    def is_usable(self) -> bool:
        """A WhatsApp template needs BSP approval before it can be used;
        SMS/email/push templates ship as soon as they're written."""
        if self.channel == NotificationChannel.WHATSAPP:
            return self.approval_status == ApprovalStatus.APPROVED
        return True


class NotificationRequest(HubScopedModel):
    """One row per attempted send — `dedupe_key` (docs/02 invariant 6) is
    unique so a retried lifecycle event never queues the same message
    twice. `recipient_kind`/`recipient_id` is deliberately polymorphic
    (customer or staff) rather than two nullable FKs."""

    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        SENT = "SENT", "Sent"
        SKIPPED = "SKIPPED", "Skipped"
        FAILED = "FAILED", "Failed"

    recipient_kind = models.CharField(max_length=16, choices=RecipientKind.choices)
    recipient_id = models.UUIDField()
    # Not in docs/02's minimal schema, but every notification this batch
    # sends is order-lifecycle-triggered and `GET /notifications/log?order=`
    # (docs/04 §3.11) needs an indexed, filterable column to do that —
    # cheaper and more honest than filtering on `payload` JSON.
    order = models.ForeignKey(
        "ordering.Order",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="notification_requests",
    )
    template = models.ForeignKey(NotificationTemplate, on_delete=models.PROTECT, related_name="+")
    channel = models.CharField(max_length=16, choices=NotificationChannel.choices)
    payload = models.JSONField(default=dict, blank=True)
    dedupe_key = models.CharField(max_length=160, unique=True)
    scheduled_for = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.PENDING)
    skipped_reason = models.CharField(max_length=64, blank=True)

    class Meta:
        db_table = "notifications_request"
        indexes = [models.Index(fields=["order", "-created_at"])]

    def __str__(self) -> str:
        return f"{self.template.code} -> {self.recipient_kind}:{self.recipient_id} ({self.status})"


class NotificationDelivery(AppendOnlyModel):
    """Append-only delivery history for a request — a provider status
    webhook (QUEUED -> SENT -> DELIVERED -> READ, or FAILED) adds a new
    row rather than updating one, so the full progression is auditable."""

    class Status(models.TextChoices):
        QUEUED = "QUEUED", "Queued"
        SENT = "SENT", "Sent"
        DELIVERED = "DELIVERED", "Delivered"
        READ = "READ", "Read"
        FAILED = "FAILED", "Failed"

    request = models.ForeignKey(
        NotificationRequest, on_delete=models.CASCADE, related_name="deliveries"
    )
    provider = models.CharField(max_length=32)
    provider_message_id = models.CharField(max_length=128, blank=True)
    status = models.CharField(max_length=16, choices=Status.choices)
    error = models.TextField(blank=True)
    cost_minor = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = "notifications_delivery"
        indexes = [models.Index(fields=["request", "-created_at"])]

    def __str__(self) -> str:
        return f"{self.request_id}: {self.provider} -> {self.status}"


class NotificationPref(BaseModel):
    """Opt-in/out per recipient per channel. Absence of a row means the
    channel-router default (opted in) — a row only exists once someone
    changes it."""

    recipient_kind = models.CharField(max_length=16, choices=RecipientKind.choices)
    recipient_id = models.UUIDField()
    channel = models.CharField(max_length=16, choices=NotificationChannel.choices)
    opted_in = models.BooleanField(default=True)

    class Meta:
        db_table = "notifications_pref"
        constraints = [
            models.UniqueConstraint(
                fields=["recipient_kind", "recipient_id", "channel"],
                name="uniq_pref_recipient_channel",
            )
        ]

    def __str__(self) -> str:
        return f"{self.recipient_kind}:{self.recipient_id} {self.channel} opted_in={self.opted_in}"
