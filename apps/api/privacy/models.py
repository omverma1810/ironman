"""Privacy (docs/06 §5–6, R-806). Account deletion is a request with a
grace period, not a DELETE statement: invoices must outlive the customer
by eight years, and every historical metric counts their orders."""

from __future__ import annotations

import secrets

from django.db import models
from django.utils import timezone

from common.models import BaseModel, TimeStampedUUIDModel


def _restore_token() -> str:
    return secrets.token_urlsafe(32)


class DeletionStatus(models.TextChoices):
    PENDING = "PENDING", "Pending (grace period)"
    CANCELLED = "CANCELLED", "Cancelled"
    COMPLETED = "COMPLETED", "Completed"


class DeletionRequest(BaseModel):
    """One customer's request to delete their account. While PENDING the
    login is deactivated; on `scheduled_for` the personal data is
    anonymised and the row becomes the tombstone. `phone_hmac` outlives the
    phone number so a re-registration can be recognised (referral abuse)
    without keeping the number itself."""

    user = models.ForeignKey(
        "identity.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    customer = models.ForeignKey(
        "customers.Customer",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="deletion_requests",
    )
    status = models.CharField(
        max_length=16, choices=DeletionStatus.choices, default=DeletionStatus.PENDING
    )
    requested_at = models.DateTimeField(default=timezone.now)
    scheduled_for = models.DateTimeField()
    cancelled_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    phone_hmac = models.CharField(max_length=64, db_index=True)
    restore_token = models.CharField(max_length=64, unique=True, default=_restore_token)
    reason = models.CharField(max_length=500, blank=True)

    class Meta(BaseModel.Meta):
        db_table = "privacy_deletion_request"
        indexes = [models.Index(fields=["status", "scheduled_for"])]
        constraints = [
            models.UniqueConstraint(
                fields=["user"],
                condition=models.Q(status="PENDING"),
                name="uniq_pending_deletion_per_user",
            )
        ]

    def __str__(self) -> str:
        return f"Deletion {self.status} — scheduled {self.scheduled_for:%Y-%m-%d}"


class MaintenanceRun(TimeStampedUUIDModel):
    """One run of the nightly retention job — what it removed, so "retention
    is code, not policy prose" (docs/06 §5) can be shown, not just claimed."""

    finished_at = models.DateTimeField(null=True, blank=True)
    trigger = models.CharField(max_length=16, default="command")
    summary = models.JSONField(default=dict, blank=True)
    error = models.TextField(blank=True)

    class Meta(TimeStampedUUIDModel.Meta):
        db_table = "privacy_maintenance_run"
