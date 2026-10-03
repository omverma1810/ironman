"""Nightly retention (docs/06 §5): "retention is code, not policy prose".

    proof photos           180 days  (kept while the order has an open issue)
    notification payloads   90 days  (the delivery log row stays)
    OTP records             30 days
    expired login tokens    once expired
    account deletions       when their grace period ends

Run by `manage.py run_maintenance`, or by the nightly GitHub Actions
schedule calling `POST /internal/maintenance` (there is no worker process in
the pilot deployment, the same reason analytics is computed live).
"""

from __future__ import annotations

import logging
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework_simplejwt.token_blacklist.models import OutstandingToken

from fulfilment.models import Proof
from identity.models import EmailVerificationToken, OtpChallenge, PasswordResetToken
from notifications.models import NotificationRequest
from ordering.models import OrderException
from privacy import services
from privacy.models import MaintenanceRun

logger = logging.getLogger("ironman")

_OPEN_ISSUE = [OrderException.Status.OPEN, OrderException.Status.INVESTIGATING]


def _days(key: str) -> timedelta:
    return timedelta(days=settings.IRONMAN["RETENTION_DAYS"][key])


def purge_proof_photos(now) -> int:
    cutoff = now - _days("proof_photos")
    held = OrderException.objects.filter(status__in=_OPEN_ISSUE).values("order_id")
    proofs = Proof.objects.filter(at__lt=cutoff).exclude(job__order_id__in=held)
    return services.delete_proof_files(proofs)


def purge_notification_payloads(now) -> int:
    cutoff = now - _days("notification_payloads")
    return (
        NotificationRequest.objects.filter(created_at__lt=cutoff)
        .exclude(payload={})
        .update(payload={})
    )


def purge_otp_records(now) -> int:
    cutoff = now - _days("otp_records")
    deleted, _ = OtpChallenge.objects.filter(created_at__lt=cutoff).delete()
    return deleted


def purge_expired_tokens(now) -> int:
    total = 0
    for model in (EmailVerificationToken, PasswordResetToken):
        deleted, _ = model.objects.filter(
            Q(expires_at__lt=now) | Q(consumed_at__lt=now - _days("otp_records"))
        ).delete()
        total += deleted
    # Blacklist rows cascade with their outstanding token.
    deleted, _ = OutstandingToken.objects.filter(expires_at__lt=now).delete()
    return total + deleted


STEPS = [
    ("account_deletions", lambda now: services.process_due_deletions(now=now)),
    ("proof_photos", purge_proof_photos),
    ("notification_payloads", purge_notification_payloads),
    ("otp_records", purge_otp_records),
    ("expired_tokens", purge_expired_tokens),
]


def run(*, trigger: str = "command", now=None) -> MaintenanceRun:
    """Each step runs in its own savepoint, so one failure doesn't undo the
    rest; the run row records what each step removed, or the error."""
    now = now or timezone.now()
    record = MaintenanceRun.objects.create(trigger=trigger)
    summary: dict[str, int | str] = {}
    errors = []
    for name, step in STEPS:
        try:
            with transaction.atomic():
                summary[name] = step(now)
        except Exception as exc:  # noqa: BLE001 — record it and carry on
            logger.exception("maintenance step %s failed", name)
            summary[name] = "failed"
            errors.append(f"{name}: {exc}")
    record.summary = summary
    record.error = "\n".join(errors)
    record.finished_at = timezone.now()
    record.save(update_fields=["summary", "error", "finished_at"])
    logger.info("maintenance run %s: %s", record.id, summary)
    return record
