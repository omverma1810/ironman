from datetime import date

import pytest

from common.errors import ApiError
from fulfilment import services
from fulfilment.models import JobStatus, OfflineOpStatus
from ordering.models import OrderStatus

pytestmark = pytest.mark.django_db


# ── create_route_day / assign_route_day ────────────────────────────────────


def test_create_route_day_is_idempotent(hub, cluster):
    a = services.create_route_day(hub=hub, cluster=cluster, date=date(2026, 9, 10))
    b = services.create_route_day(hub=hub, cluster=cluster, date=date(2026, 9, 10))
    assert a.id == b.id


def test_assign_route_day_creates_pickup_job_and_assigns_order(
    route_day, scheduled_order, field_user
):
    services.assign_route_day(
        route_day,
        staff_ids=[field_user.id],
        jobs=[{"order_id": scheduled_order.id, "kind": "PICKUP", "assigned_to": field_user.id}],
    )
    job = route_day.jobs.get(order=scheduled_order, kind="PICKUP")
    assert job.status == JobStatus.PENDING
    assert job.assigned_to_id == field_user.id
    assert job.attempt_no == 1

    scheduled_order.refresh_from_db()
    assert scheduled_order.status == OrderStatus.PICKUP_ASSIGNED
    assert field_user in route_day.staff.all()


def test_assign_route_day_creates_delivery_job_and_assigns_order(
    route_day, ready_order, ready_order_bag, field_user
):
    services.assign_route_day(
        route_day,
        staff_ids=[field_user.id],
        jobs=[{"order_id": ready_order.id, "kind": "DELIVERY", "assigned_to": field_user.id}],
    )
    job = route_day.jobs.get(order=ready_order, kind="DELIVERY")
    assert job.status == JobStatus.PENDING

    ready_order.refresh_from_db()
    assert ready_order.status == OrderStatus.DELIVERY_ASSIGNED


def test_assign_route_day_rejects_order_in_wrong_status(route_day, ready_order, field_user):
    """A READY order can't take a PICKUP job — it's already past pickup."""
    with pytest.raises(ApiError):
        services.assign_route_day(
            route_day,
            staff_ids=[],
            jobs=[{"order_id": ready_order.id, "kind": "PICKUP"}],
        )


def test_assign_route_day_rejects_double_active_job(route_day, scheduled_order, field_user):
    services.assign_route_day(
        route_day,
        staff_ids=[],
        jobs=[{"order_id": scheduled_order.id, "kind": "PICKUP", "assigned_to": field_user.id}],
    )
    with pytest.raises(ApiError):
        services.assign_route_day(
            route_day,
            staff_ids=[],
            jobs=[{"order_id": scheduled_order.id, "kind": "PICKUP"}],
        )


# ── start_job / arrive_job ──────────────────────────────────────────────────


def test_start_pickup_job_drives_order_to_en_route(pickup_job, scheduled_order):
    services.start_job(pickup_job)
    scheduled_order.refresh_from_db()
    assert scheduled_order.status == OrderStatus.PICKUP_EN_ROUTE


def test_start_delivery_job_drives_order_to_out_for_delivery(delivery_job, ready_order):
    services.start_job(delivery_job)
    ready_order.refresh_from_db()
    assert ready_order.status == OrderStatus.OUT_FOR_DELIVERY


def test_arrive_job_does_not_change_order_status(pickup_job, scheduled_order):
    services.start_job(pickup_job)
    services.arrive_job(pickup_job)
    scheduled_order.refresh_from_db()
    assert scheduled_order.status == OrderStatus.PICKUP_EN_ROUTE


# ── complete_job (pickup) ────────────────────────────────────────────────────


def test_complete_pickup_updates_declared_qty_and_moves_order_to_at_hub(
    pickup_job, scheduled_order, garment_type
):
    services.start_job(pickup_job)
    services.complete_job(
        pickup_job, declared_lines=[{"garment_type": str(garment_type.id), "qty": 3}]
    )

    scheduled_order.refresh_from_db()
    assert scheduled_order.status == OrderStatus.AT_HUB
    assert scheduled_order.picked_up_at is not None
    line = scheduled_order.lines.get(garment_type=garment_type)
    assert line.declared_qty == 3
    assert scheduled_order.declared_total_qty == 3


def test_complete_pickup_computes_delivery_promised_at(pickup_job, scheduled_order):
    services.start_job(pickup_job)
    services.complete_job(pickup_job, declared_lines=[])
    scheduled_order.refresh_from_db()
    assert scheduled_order.delivery_promised_at is not None
    assert scheduled_order.delivery_promised_at > scheduled_order.picked_up_at


def test_complete_writes_a_done_job_attempt(pickup_job):
    services.start_job(pickup_job)
    services.complete_job(pickup_job, declared_lines=[])
    attempt = pickup_job.attempts.get()
    assert attempt.outcome == "DONE"
    assert attempt.attempt_no == 1


def test_complete_job_records_otp_proof_metadata(pickup_job):
    services.start_job(pickup_job)
    services.complete_job(
        pickup_job, declared_lines=[], proof={"kind": "OTP", "otp_verified": True}
    )
    proof = pickup_job.proofs.get()
    assert proof.kind == "OTP"
    assert proof.otp_verified is True


def test_record_proof_standalone(pickup_job):
    proof = services.record_proof(pickup_job, kind="OTP", otp_verified=True)
    assert proof.job_id == pickup_job.id
    assert proof.kind == "OTP"


# ── complete_job (delivery) ──────────────────────────────────────────────────


def test_complete_delivery_verifies_bag_codes_and_delivers(
    delivery_job, ready_order, ready_order_bag
):
    services.start_job(delivery_job)
    services.complete_job(delivery_job, bag_codes=[ready_order_bag.code])
    ready_order.refresh_from_db()
    assert ready_order.status == OrderStatus.DELIVERED


def test_complete_delivery_requires_bag_codes(delivery_job):
    services.start_job(delivery_job)
    with pytest.raises(ApiError):
        services.complete_job(delivery_job, bag_codes=[])


def test_complete_delivery_rejects_bag_code_from_another_order(
    delivery_job, ready_order_bag, hub, customer, service
):
    from custody.services import create_bag_for_order
    from ordering.models import Order, OrderLine

    other_order = Order.objects.create(
        hub=hub,
        customer=customer,
        service=service,
        channel="COUNTER",
        status=OrderStatus.READY,
        declared_total_qty=1,
        verified_total_qty=1,
        total_minor=1000,
    )
    OrderLine.objects.create(
        hub=hub,
        order=other_order,
        garment_type=ready_order_bag.garment_lines.first().garment_type,
        declared_qty=1,
        verified_qty=1,
        unit_price_minor=1000,
        line_total_minor=1000,
    )
    other_bag = create_bag_for_order(other_order)

    services.start_job(delivery_job)
    with pytest.raises(ApiError):
        services.complete_job(delivery_job, bag_codes=[other_bag.code])


# ── fail_job ─────────────────────────────────────────────────────────────────


def test_fail_pickup_job_moves_order_to_pickup_failed(pickup_job, scheduled_order):
    services.start_job(pickup_job)
    services.fail_job(pickup_job, reason_code="customer_absent")
    scheduled_order.refresh_from_db()
    assert scheduled_order.status == OrderStatus.PICKUP_FAILED

    attempt = pickup_job.attempts.get()
    assert attempt.outcome == "FAILED"
    assert attempt.failure_reason == "customer_absent"


def test_first_delivery_failure_does_not_return_to_hub(delivery_job, ready_order):
    services.start_job(delivery_job)
    services.fail_job(delivery_job, reason_code="customer_absent")
    ready_order.refresh_from_db()
    assert ready_order.status == OrderStatus.DELIVERY_FAILED


def test_second_delivery_failure_returns_to_hub(
    route_day, ready_order, ready_order_bag, field_user
):
    # First attempt fails.
    services.assign_route_day(
        route_day,
        staff_ids=[],
        jobs=[{"order_id": ready_order.id, "kind": "DELIVERY", "assigned_to": field_user.id}],
    )
    job1 = route_day.jobs.get(order=ready_order, kind="DELIVERY")
    services.start_job(job1)
    services.fail_job(job1, reason_code="customer_absent")
    ready_order.refresh_from_db()
    assert ready_order.status == OrderStatus.DELIVERY_FAILED

    # Ops dispatches a second attempt same-day — DELIVERY_FAILED has no
    # separate "assigned" state, so the order stays DELIVERY_FAILED until
    # the rider actually starts the second job.
    services.assign_route_day(
        route_day,
        staff_ids=[],
        jobs=[{"order_id": ready_order.id, "kind": "DELIVERY", "assigned_to": field_user.id}],
    )
    job2 = route_day.jobs.get(order=ready_order, kind="DELIVERY", attempt_no=2)
    services.start_job(job2)
    services.fail_job(job2, reason_code="customer_absent")

    ready_order.refresh_from_db()
    assert ready_order.status == OrderStatus.RETURNED_TO_HUB


# ── offline sync ─────────────────────────────────────────────────────────────


def test_apply_offline_op_applies_job_start(pickup_job, field_user):
    from django.utils import timezone

    op = services.apply_offline_op(
        device_id="phone-1",
        staff=field_user,
        client_op_id="op-1",
        op_type="job.start",
        payload={"job_id": str(pickup_job.id)},
        client_ts=timezone.now(),
    )
    assert op.status == OfflineOpStatus.APPLIED
    pickup_job.refresh_from_db()
    assert pickup_job.status == JobStatus.EN_ROUTE


def test_apply_offline_op_replay_is_idempotent(pickup_job, field_user):
    from django.utils import timezone

    now = timezone.now()
    first = services.apply_offline_op(
        device_id="phone-1",
        staff=field_user,
        client_op_id="op-2",
        op_type="job.start",
        payload={"job_id": str(pickup_job.id)},
        client_ts=now,
    )
    second = services.apply_offline_op(
        device_id="phone-1",
        staff=field_user,
        client_op_id="op-2",
        op_type="job.start",
        payload={"job_id": str(pickup_job.id)},
        client_ts=now,
    )
    assert first.id == second.id
    assert second.status == OfflineOpStatus.APPLIED


def test_apply_offline_op_reports_conflict_on_invalid_transition(pickup_job, field_user):
    from django.utils import timezone

    services.start_job(pickup_job)
    services.complete_job(pickup_job, declared_lines=[])

    op = services.apply_offline_op(
        device_id="phone-1",
        staff=field_user,
        client_op_id="op-3",
        op_type="job.start",
        payload={"job_id": str(pickup_job.id)},
        client_ts=timezone.now(),
    )
    assert op.status == OfflineOpStatus.CONFLICT


def test_apply_offline_op_rejects_unknown_op_type(field_user):
    from django.utils import timezone

    op = services.apply_offline_op(
        device_id="phone-1",
        staff=field_user,
        client_op_id="op-4",
        op_type="job.teleport",
        payload={},
        client_ts=timezone.now(),
    )
    assert op.status == OfflineOpStatus.REJECTED
