"""Route-day planning and job execution (docs/02 §3.7, docs/04 §3.6).
Business operations that call the guarded Job state machine and, through
`ordering.services`'s job-driven wrappers, the order's own state machine —
mirrors custody/services.py's shape and its boundary rule: never mutate
`Order.status` directly from here.
"""

from __future__ import annotations

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction

import custody.services as custody_services
import ordering.services as ordering_services
from common.errors import ApiError, InvalidStateTransition
from fulfilment.models import (
    TERMINAL_JOB_STATUSES,
    Job,
    JobAttempt,
    JobAttemptOutcome,
    JobKind,
    JobStatus,
    OfflineOp,
    OfflineOpStatus,
    Proof,
    RouteDay,
)
from fulfilment.state_machine import transition_job
from ordering.models import OrderStatus

_ASSIGNABLE_STATUS = {
    JobKind.PICKUP: {OrderStatus.SCHEDULED},
    # RETURNED_TO_HUB: a second failed delivery attempt (docs/01 §5.1) —
    # dispatching a third try is exactly this call, made by an ops decision
    # on the route-day planning screen, not automatic. DELIVERY_FAILED: a
    # same-day retry — the order graph has no separate "assigned" state
    # between a failed attempt and trying again (DELIVERY_FAILED's only
    # edges are OUT_FOR_DELIVERY and RETURNED_TO_HUB), so this assignment
    # leaves the order's own status untouched and `start_job` drives it
    # straight to OUT_FOR_DELIVERY when the rider actually sets off again.
    JobKind.DELIVERY: {
        OrderStatus.READY,
        OrderStatus.RETURNED_TO_HUB,
        OrderStatus.DELIVERY_FAILED,
    },
}


def create_route_day(*, hub, cluster, date, actor=None) -> RouteDay:
    route_day, _ = RouteDay.objects.get_or_create(
        hub=hub, cluster=cluster, date=date, defaults={"created_by": actor}
    )
    return route_day


@transaction.atomic
def assign_route_day(
    route_day: RouteDay, *, staff_ids: list, jobs: list[dict], actor=None
) -> RouteDay:
    """`{staff[], jobs[]}` (docs/04 §3.6). `jobs` entries are
    `{order_id, kind, assigned_to, sequence?, slot_start?, slot_end?}` —
    one Job gets created per entry and the underlying order is driven to
    PICKUP_ASSIGNED/DELIVERY_ASSIGNED in the same call. `attempt_no` is
    computed from how many prior Jobs this order/kind pair already has, so
    a retry after a failure (docs/01 §5.1) is just another entry here."""
    if staff_ids:
        route_day.staff.add(*staff_ids)

    for entry in jobs:
        order = ordering_services.get_order(entry["order_id"])
        kind = entry["kind"]

        if order.status not in _ASSIGNABLE_STATUS.get(kind, set()):
            raise ApiError(
                f"{order.ref} isn't ready for a {kind.lower()} job assignment "
                f"(status is {order.get_status_display()}).",
                code="invalid_state_transition",
                status_code=409,
            )
        if (
            Job.objects.filter(order=order, kind=kind)
            .exclude(status__in=TERMINAL_JOB_STATUSES)
            .exists()
        ):
            raise ApiError(
                f"{order.ref} already has an active {kind.lower()} job.", code="conflict"
            )

        attempt_no = Job.objects.filter(order=order, kind=kind).count() + 1
        job = Job.objects.create(
            hub=order.hub,
            route_day=route_day,
            order=order,
            kind=kind,
            sequence=entry.get("sequence", 0),
            assigned_to_id=entry.get("assigned_to"),
            slot_start=entry.get("slot_start") or order.pickup_slot_start,
            slot_end=entry.get("slot_end") or order.pickup_slot_end,
            attempt_no=attempt_no,
            created_by=actor,
        )
        if kind == JobKind.PICKUP:
            ordering_services.assign_pickup(order, actor=actor)
        elif order.status != OrderStatus.DELIVERY_FAILED:
            ordering_services.assign_delivery(
                order, actor=actor, slot_start=job.slot_start, slot_end=job.slot_end
            )

    return route_day


@transaction.atomic
def start_job(job: Job, *, actor=None) -> Job:
    job = transition_job(job, JobStatus.EN_ROUTE)
    if job.kind == JobKind.PICKUP:
        ordering_services.mark_pickup_en_route(job.order, actor=actor)
    else:
        ordering_services.mark_out_for_delivery(job.order, actor=actor)
    return job


@transaction.atomic
def arrive_job(job: Job, *, actor=None) -> Job:
    # No order-level transition — arrival is a Job-only checkpoint
    # (docs/01 §5.1 has no state between EN_ROUTE and the outcome).
    return transition_job(job, JobStatus.ARRIVED)


@transaction.atomic
def complete_job(
    job: Job,
    *,
    declared_lines: list[dict] | None = None,
    bag_codes: list[str] | None = None,
    proof: dict | None = None,
    actor=None,
) -> Job:
    job = transition_job(job, JobStatus.DONE)
    JobAttempt.objects.create(job=job, attempt_no=job.attempt_no, outcome=JobAttemptOutcome.DONE)
    if proof:
        _record_proof(job, proof)

    if job.kind == JobKind.PICKUP:
        _apply_declared_lines(job.order, declared_lines or [])
        ordering_services.mark_picked_up(job.order, actor=actor)
    else:
        if not bag_codes:
            raise ApiError(
                "Delivery completion needs at least one scanned bag code.",
                code="validation_error",
            )
        custody_services.verify_bag_codes(job.order, bag_codes)
        ordering_services.mark_delivered(job.order, actor=actor)

    return job


@transaction.atomic
def fail_job(job: Job, *, reason_code: str, note: str = "", actor=None) -> Job:
    job = transition_job(job, JobStatus.FAILED)
    JobAttempt.objects.create(
        job=job,
        attempt_no=job.attempt_no,
        outcome=JobAttemptOutcome.FAILED,
        failure_reason=reason_code,
        notes=note,
    )
    if job.kind == JobKind.PICKUP:
        ordering_services.mark_pickup_failed(job.order, actor=actor, reason=reason_code)
    else:
        ordering_services.mark_delivery_failed(
            job.order, actor=actor, reason=reason_code, attempt_no=job.attempt_no
        )
    return job


def _apply_declared_lines(order, declared_lines: list[dict]) -> None:
    """The rider's on-site count at the door (docs/08 batch F-5) —
    replaces the customer's online estimate with what was actually
    collected. Distinct from `verified_qty`, which the hub sets later
    during intake (`ordering.services.record_intake`)."""
    by_garment = {str(entry["garment_type"]): int(entry["qty"]) for entry in declared_lines}
    if not by_garment:
        return
    total = 0
    for line in order.lines.all():
        qty = by_garment.get(str(line.garment_type_id))
        if qty is not None:
            line.declared_qty = qty
            line.save(update_fields=["declared_qty"])
        total += line.declared_qty
    order.declared_total_qty = total
    order.save(update_fields=["declared_total_qty"])


def _record_proof(job: Job, proof: dict) -> Proof:
    return Proof.objects.create(
        hub=job.order.hub,
        job=job,
        kind=proof["kind"],
        file=proof.get("file"),
        otp_verified=proof.get("otp_verified", False),
        geo_lat=proof.get("geo_lat"),
        geo_lng=proof.get("geo_lng"),
    )


def record_proof(
    job: Job, *, kind: str, file=None, otp_verified: bool = False, geo_lat=None, geo_lng=None
) -> Proof:
    """`POST /fulfilment/proofs` (docs/04 §3.6) — a standalone proof
    capture separate from job completion, e.g. a photo taken before the
    rider is ready to mark the job done."""
    return _record_proof(
        job,
        {
            "kind": kind,
            "file": file,
            "otp_verified": otp_verified,
            "geo_lat": geo_lat,
            "geo_lng": geo_lng,
        },
    )


# ── Offline sync (docs/02 §3.7, R-304) ─────────────────────────────────────
# `client_op_id` is the idempotency key: a rider's whole offline queue can
# be replayed on every reconnect attempt and each op still applies exactly
# once. A domain error while applying one op never fails the batch — it's
# recorded as that op's own conflict/rejection and the rest still run.

_OP_HANDLERS = {
    "job.start": lambda job, payload, actor: start_job(job, actor=actor),
    "job.arrive": lambda job, payload, actor: arrive_job(job, actor=actor),
    "job.complete": lambda job, payload, actor: complete_job(
        job,
        declared_lines=payload.get("declared_lines"),
        bag_codes=payload.get("bag_codes"),
        proof=payload.get("proof"),
        actor=actor,
    ),
    "job.fail": lambda job, payload, actor: fail_job(
        job,
        reason_code=payload.get("reason_code", "unknown"),
        note=payload.get("note", ""),
        actor=actor,
    ),
}


def apply_offline_op(
    *, device_id: str, staff, client_op_id: str, op_type: str, payload: dict, client_ts
) -> OfflineOp:
    existing = OfflineOp.objects.filter(client_op_id=client_op_id).first()
    if existing:
        return existing  # already processed on an earlier sync — replay is a no-op

    handler = _OP_HANDLERS.get(op_type)
    job = None
    job_id = payload.get("job_id")
    if handler and job_id:
        try:
            job = Job.objects.filter(pk=job_id).select_related("hub").first()
        except (ValueError, DjangoValidationError):
            job = None  # malformed job_id — falls through to REJECTED below

    hub_id = job.hub_id if job else (staff.hub_scope[0] if staff.hub_scope else None)
    if hub_id is None:
        raise ApiError("Can't resolve a hub for this offline op.", code="validation_error")

    op = OfflineOp.objects.create(
        hub_id=hub_id,
        device_id=device_id,
        staff=staff,
        client_op_id=client_op_id,
        op_type=op_type,
        payload=payload,
        client_ts=client_ts,
        created_by=staff,
    )

    if not handler or job is None:
        op.status = OfflineOpStatus.REJECTED
        op.result_detail = f"Unknown op_type or missing job: {op_type}"
    else:
        try:
            handler(job, payload, staff)
            op.status = OfflineOpStatus.APPLIED
        except InvalidStateTransition as exc:
            op.status = OfflineOpStatus.CONFLICT
            op.result_detail = exc.message
        except ApiError as exc:
            op.status = OfflineOpStatus.REJECTED
            op.result_detail = exc.message

    op.save(update_fields=["status", "result_detail"])
    return op
