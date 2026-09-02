"""Guarded Job status transitions (docs/02 §3.7). Mirrors
custody/state_machine.py and ordering/state_machine.py: every status
change goes through `transition_job()` — never a direct `.status = X`.
This module only moves `Job.status`; driving the *order's* own state
machine is `fulfilment.services`'s job (docs/01 §5.1 boundary).
"""

from __future__ import annotations

from django.db import transaction
from django.utils import timezone

from common.errors import InvalidStateTransition
from fulfilment.models import TERMINAL_JOB_STATUSES, Job, JobStatus

ALLOWED: dict[str, set[str]] = {
    JobStatus.PENDING: {JobStatus.EN_ROUTE, JobStatus.FAILED},
    # `complete` (DONE) is reachable straight from EN_ROUTE too — `arrive`
    # is a best-effort checkpoint a rider may skip on a fast pickup or a
    # batch offline sync, not a hard gate (docs/01 §5.1 describes arrival
    # and completion as one door-side beat, not two required button
    # presses).
    JobStatus.EN_ROUTE: {JobStatus.ARRIVED, JobStatus.DONE, JobStatus.FAILED},
    JobStatus.ARRIVED: {JobStatus.DONE, JobStatus.FAILED},
    JobStatus.DONE: set(),
    JobStatus.FAILED: set(),
}

_TIMESTAMP_FIELD = {
    JobStatus.EN_ROUTE: "started_at",
    JobStatus.ARRIVED: "arrived_at",
    JobStatus.DONE: "completed_at",
    JobStatus.FAILED: "completed_at",
}


@transaction.atomic
def transition_job(job: Job, to_status: str) -> Job:
    job = Job.objects.select_for_update().get(pk=job.pk)
    from_status = job.status

    if from_status in TERMINAL_JOB_STATUSES:
        raise InvalidStateTransition(
            f"{job} is already {job.get_status_display()} — no further moves."
        )
    if to_status not in ALLOWED.get(from_status, set()):
        raise InvalidStateTransition(
            f"{job} can't move from {job.get_status_display()} to "
            f"{JobStatus(to_status).label} directly.",
            detail=f"Allowed from {from_status}: {sorted(ALLOWED.get(from_status, set()))}",
        )

    job.status = to_status
    update_fields = ["status"]
    field = _TIMESTAMP_FIELD.get(to_status)
    if field and not getattr(job, field):
        setattr(job, field, timezone.now())
        update_fields.append(field)
    job.save(update_fields=update_fields)
    return job
