"""Fulfilment (docs/02 §3.7, docs/01 §5.1). Pickup and delivery are jobs a
field-staff member works off a route day; completing or failing one drives
the *order's* own state machine (see `ordering.services`'s job-driven
transition wrappers) — this app never writes `Order.status` directly, the
same boundary custody keeps around `GarmentLine.stage`.
"""

from __future__ import annotations

from django.db import models
from django.utils import timezone

from common.models import AppendOnlyModel, HubScopedModel


class RouteDayStatus(models.TextChoices):
    PLANNED = "PLANNED", "Planned"
    ACTIVE = "ACTIVE", "Active"
    CLOSED = "CLOSED", "Closed"


class RouteDay(HubScopedModel):
    """One cluster's jobs for one day — the unit ops plans capacity and
    assigns staff against (docs/08 batch 2.7)."""

    cluster = models.ForeignKey(
        "territory.Cluster", on_delete=models.PROTECT, related_name="route_days"
    )
    date = models.DateField()
    status = models.CharField(
        max_length=16, choices=RouteDayStatus.choices, default=RouteDayStatus.PLANNED
    )
    # Roster for the day — who's working it, independent of which specific
    # jobs end up assigned to whom (docs/02 §3.7 `assigned_staff[]`).
    staff = models.ManyToManyField("identity.User", blank=True, related_name="route_days")

    class Meta:
        db_table = "fulfilment_route_day"
        indexes = [models.Index(fields=["hub", "date"])]
        constraints = [
            models.UniqueConstraint(fields=["cluster", "date"], name="uniq_route_day_cluster_date")
        ]

    def __str__(self) -> str:
        return f"{self.cluster.name} — {self.date}"


class JobKind(models.TextChoices):
    PICKUP = "PICKUP", "Pickup"
    DELIVERY = "DELIVERY", "Delivery"


class JobStatus(models.TextChoices):
    PENDING = "PENDING", "Pending"
    EN_ROUTE = "EN_ROUTE", "En route"
    ARRIVED = "ARRIVED", "Arrived"
    DONE = "DONE", "Done"
    FAILED = "FAILED", "Failed"


TERMINAL_JOB_STATUSES = frozenset({JobStatus.DONE, JobStatus.FAILED})


class Job(HubScopedModel):
    """One pickup or delivery leg of one order. A failed delivery gets
    retried as a *new* Job (same order, `attempt_no` incremented) rather
    than reopening this one — `JobAttempt` is the append-only history a
    single Job accumulates across its own EN_ROUTE→ARRIVED→DONE/FAILED
    run; a retry is a fresh row so `route_day`/`assigned_to` can differ
    from the failed attempt."""

    route_day = models.ForeignKey(RouteDay, on_delete=models.PROTECT, related_name="jobs")
    order = models.ForeignKey("ordering.Order", on_delete=models.CASCADE, related_name="jobs")
    kind = models.CharField(max_length=16, choices=JobKind.choices)
    sequence = models.PositiveIntegerField(default=0)
    assigned_to = models.ForeignKey(
        "identity.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="jobs"
    )
    status = models.CharField(max_length=16, choices=JobStatus.choices, default=JobStatus.PENDING)
    slot_start = models.DateTimeField(null=True, blank=True)
    slot_end = models.DateTimeField(null=True, blank=True)
    started_at = models.DateTimeField(null=True, blank=True)
    arrived_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    attempt_no = models.PositiveIntegerField(default=1)

    class Meta:
        db_table = "fulfilment_job"
        indexes = [
            models.Index(fields=["assigned_to", "slot_start"]),
            models.Index(fields=["hub", "status"]),
        ]

    def __str__(self) -> str:
        return f"{self.get_kind_display()} — {self.order.ref} (#{self.attempt_no})"


class JobAttemptOutcome(models.TextChoices):
    DONE = "DONE", "Done"
    FAILED = "FAILED", "Failed"


class JobAttempt(AppendOnlyModel):
    """The append-only record of how a job's run ended — mirrors
    `custody.StageEvent`'s role for the garment lifecycle."""

    job = models.ForeignKey(Job, on_delete=models.CASCADE, related_name="attempts")
    attempt_no = models.PositiveIntegerField()
    outcome = models.CharField(max_length=8, choices=JobAttemptOutcome.choices)
    failure_reason = models.CharField(max_length=64, blank=True)
    notes = models.CharField(max_length=255, blank=True)
    at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "fulfilment_job_attempt"
        indexes = [models.Index(fields=["job", "-at"])]

    def __str__(self) -> str:
        return f"{self.job} — {self.outcome}"


class ProofKind(models.TextChoices):
    PHOTO = "PHOTO", "Photo"
    OTP = "OTP", "OTP"
    SIGNATURE = "SIGNATURE", "Signature"


def _proof_upload_path(instance: "Proof", filename: str) -> str:
    return f"fulfilment/proofs/{instance.job.order.hub_id}/{instance.job_id}/{filename}"


class Proof(HubScopedModel):
    """docs/06 §3: geolocation is optional and off by default, captured
    only at proof-of-delivery, never continuously. The file lives in
    private object storage, never served by a public URL (see
    `fulfilment.services.proof_download_url`)."""

    job = models.ForeignKey(Job, on_delete=models.CASCADE, related_name="proofs")
    kind = models.CharField(max_length=16, choices=ProofKind.choices)
    file = models.FileField(upload_to=_proof_upload_path, null=True, blank=True)
    otp_verified = models.BooleanField(default=False)
    geo_lat = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    geo_lng = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "fulfilment_proof"
        indexes = [models.Index(fields=["job", "-at"])]

    def __str__(self) -> str:
        return f"{self.job} — {self.kind}"


class OfflineOpStatus(models.TextChoices):
    PENDING = "PENDING", "Pending"
    APPLIED = "APPLIED", "Applied"
    CONFLICT = "CONFLICT", "Conflict"
    REJECTED = "REJECTED", "Rejected"


class OfflineOp(HubScopedModel):
    """One entry of a rider's offline queue (docs/02 §3.7, R-304).
    `client_op_id` is the idempotency key: the field app can replay its
    whole queue on every reconnect and each op still applies exactly
    once. Not append-only like `JobAttempt` — `status` is written again
    once the op is processed."""

    device_id = models.CharField(max_length=128)
    staff = models.ForeignKey("identity.User", on_delete=models.CASCADE, related_name="offline_ops")
    client_op_id = models.CharField(max_length=64, unique=True)
    op_type = models.CharField(max_length=32)
    payload = models.JSONField(default=dict)
    client_ts = models.DateTimeField()
    server_received_at = models.DateTimeField(default=timezone.now)
    status = models.CharField(
        max_length=16, choices=OfflineOpStatus.choices, default=OfflineOpStatus.PENDING
    )
    result_detail = models.CharField(max_length=255, blank=True)

    class Meta:
        db_table = "fulfilment_offline_op"
        indexes = [models.Index(fields=["staff", "-server_received_at"])]

    def __str__(self) -> str:
        return f"{self.op_type} — {self.client_op_id} ({self.status})"
