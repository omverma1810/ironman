"""Batch 9.1 — what the field app relies on: a rider acts only on their own
jobs (sync and proofs included), the day list carries the whole job card,
and the app can sign in with a bearer token."""

from __future__ import annotations

from datetime import timedelta

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from conftest import _make_role
from identity.models import RoleCode, User, UserRole

pytestmark = pytest.mark.django_db


@pytest.fixture
def other_rider(hub):
    user = User.objects.create_user(email="field2@test.local", password="testpass1234")
    user.email_verified_at = timezone.now()
    user.save(update_fields=["email_verified_at"])
    UserRole.objects.create(user=user, role=_make_role(RoleCode.FIELD), hub=hub)
    return user


def _sync(api_client, op_type, job, client_op_id, payload=None):
    return api_client.post(
        "/api/v1/fulfilment/sync",
        {
            "device_id": "phone-1",
            "ops": [
                {
                    "client_op_id": client_op_id,
                    "op_type": op_type,
                    "payload": {"job_id": str(job.id), **(payload or {})},
                    "client_ts": "2026-09-02T09:00:00Z",
                }
            ],
        },
        format="json",
    )


# ── ownership ────────────────────────────────────────────────────────────


def test_sync_rejects_an_op_on_another_riders_job(api_client, other_rider, pickup_job):
    api_client.force_authenticate(user=other_rider)
    resp = _sync(api_client, "job.start", pickup_job, "stolen-1")
    assert resp.status_code == 200
    assert resp.data[0]["status"] == "REJECTED"
    pickup_job.refresh_from_db()
    assert pickup_job.status == "PENDING"


def test_sync_applies_ops_on_an_old_job_of_their_own(api_client, field_user, pickup_job):
    # A queue built offline can be replayed days later: no date window.
    pickup_job.route_day.date = timezone.localdate() - timedelta(days=9)
    pickup_job.route_day.save(update_fields=["date"])
    api_client.force_authenticate(user=field_user)
    resp = _sync(api_client, "job.start", pickup_job, "old-1")
    assert resp.data[0]["status"] == "APPLIED"


def test_sync_replay_is_idempotent(api_client, field_user, pickup_job):
    api_client.force_authenticate(user=field_user)
    first = _sync(api_client, "job.start", pickup_job, "same-1")
    again = _sync(api_client, "job.start", pickup_job, "same-1")
    assert first.data[0]["status"] == again.data[0]["status"] == "APPLIED"


def test_proof_on_another_riders_job_is_not_found(api_client, other_rider, pickup_job):
    api_client.force_authenticate(user=other_rider)
    resp = api_client.post("/api/v1/fulfilment/proofs", {"job": str(pickup_job.id), "kind": "OTP"})
    assert resp.status_code == 404


def test_proof_on_an_unknown_job_is_not_found_not_a_crash(api_client, field_user):
    api_client.force_authenticate(user=field_user)
    resp = api_client.post(
        "/api/v1/fulfilment/proofs",
        {"job": "00000000-0000-0000-0000-000000000000", "kind": "OTP"},
    )
    assert resp.status_code == 404


def test_proof_photo_must_be_an_image(api_client, field_user, pickup_job):
    api_client.force_authenticate(user=field_user)
    resp = api_client.post(
        "/api/v1/fulfilment/proofs",
        {
            "job": str(pickup_job.id),
            "kind": "PHOTO",
            "file": SimpleUploadedFile("x.txt", b"hello", content_type="text/plain"),
        },
        format="multipart",
    )
    assert resp.status_code == 400


def test_proof_photo_from_own_job_is_stored(api_client, field_user, pickup_job):
    api_client.force_authenticate(user=field_user)
    resp = api_client.post(
        "/api/v1/fulfilment/proofs",
        {
            "job": str(pickup_job.id),
            "kind": "PHOTO",
            "file": SimpleUploadedFile("x.jpg", b"\xff\xd8\xff", content_type="image/jpeg"),
        },
        format="multipart",
    )
    assert resp.status_code == 201, resp.data


# ── the day list is a job card ───────────────────────────────────────────


def test_mine_carries_the_whole_job_card(api_client, field_user, pickup_job):
    api_client.force_authenticate(user=field_user)
    resp = api_client.get("/api/v1/fulfilment/jobs/mine/")
    assert resp.status_code == 200
    card = resp.data[0]
    assert card["customer_name"]
    assert card["customer_phone"]
    assert card["order_ref"] == pickup_job.order.ref
    assert card["lines"] and card["lines"][0]["declared_qty"] == 2
    assert card["date"] == str(timezone.localdate())
    assert card["bag_count"] == 0
    for key in ("address", "apartment_name", "special_instructions", "order_status"):
        assert key in card


def test_mine_does_not_grow_with_the_number_of_jobs(
    api_client, field_user, route_day, hub, customer, service, garment_type
):
    from fulfilment import services
    from ordering.models import Order, OrderLine, OrderStatus

    def add_job():
        order = Order.objects.create(
            hub=hub,
            customer=customer,
            service=service,
            channel="COUNTER",
            status=OrderStatus.SCHEDULED,
            declared_total_qty=1,
            total_minor=1500,
            pickup_slot_start=timezone.now(),
            pickup_slot_end=timezone.now() + timedelta(hours=2),
        )
        OrderLine.objects.create(
            hub=hub,
            order=order,
            garment_type=garment_type,
            declared_qty=1,
            unit_price_minor=1500,
            line_total_minor=1500,
        )
        services.assign_route_day(
            route_day,
            staff_ids=[field_user.id],
            jobs=[{"order_id": order.id, "kind": "PICKUP", "assigned_to": field_user.id}],
        )

    api_client.force_authenticate(user=field_user)

    def count():
        with CaptureQueriesContext(connection) as ctx:
            assert api_client.get("/api/v1/fulfilment/jobs/mine/").status_code == 200
        return len(ctx)

    add_job()
    base = count()
    for _ in range(5):
        add_job()
    assert count() == base


def test_a_delivery_card_says_how_many_bags_but_not_their_codes(
    api_client, field_user, delivery_job, ready_order_bag
):
    api_client.force_authenticate(user=field_user)
    card = api_client.get("/api/v1/fulfilment/jobs/mine/").data[0]
    assert card["bag_count"] == 1
    assert ready_order_bag.code not in str(card)


# ── bearer sign-in for the app ───────────────────────────────────────────


def _token_login(api_client, email, password="testpass1234"):
    return api_client.post(
        "/api/v1/auth/staff/token", {"email": email, "password": password}, format="json"
    )


def test_field_staff_can_sign_in_with_a_token(api_client, field_user):
    resp = _token_login(api_client, "field@test.local")
    assert resp.status_code == 200, resp.data
    assert resp.data["user"]["roles"] == ["FIELD"]
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {resp.data['access']}")
    assert api_client.get("/api/v1/me").status_code == 200
    assert api_client.get("/api/v1/fulfilment/jobs/mine/").status_code == 200


def test_token_sign_in_is_for_field_staff_only(api_client, operator_user, admin_user):
    for email in ("operator@test.local", admin_user.email):
        resp = _token_login(api_client, email)
        assert resp.status_code == 403
        assert "access" not in resp.data


def test_token_sign_in_rejects_a_wrong_password(api_client, field_user):
    resp = _token_login(api_client, "field@test.local", "nope-nope-nope")
    assert resp.status_code == 401


def test_the_refresh_token_renews_and_a_deactivated_rider_is_locked_out(api_client, field_user):
    tokens = _token_login(api_client, "field@test.local").data
    renewed = api_client.post("/api/v1/auth/refresh", {"refresh": tokens["refresh"]}, format="json")
    assert renewed.status_code == 200
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {renewed.data['access']}")
    assert api_client.get("/api/v1/me").status_code == 200
    field_user.is_active = False
    field_user.save(update_fields=["is_active"])
    # Whatever the refresh endpoint still hands out, no token works for an
    # inactive account.
    assert api_client.get("/api/v1/me").status_code == 401
    assert api_client.get("/api/v1/fulfilment/jobs/mine/").status_code == 401


# ── push ─────────────────────────────────────────────────────────────────

TOKEN = "ExponentPushToken[abcdefghijklmnopqrstuv]"


def test_a_rider_can_register_a_phone_and_an_operator_cannot(api_client, field_user, operator_user):
    body = {"token": TOKEN, "platform": "android", "app_version": "1.0.0"}
    api_client.force_authenticate(user=operator_user)
    assert api_client.post("/api/v1/notifications/devices", body, format="json").status_code == 403
    api_client.force_authenticate(user=field_user)
    assert api_client.post("/api/v1/notifications/devices", body, format="json").status_code == 204
    assert (
        api_client.delete(
            "/api/v1/notifications/devices", {"token": TOKEN}, format="json"
        ).status_code
        == 204
    )


def test_assigning_jobs_nudges_the_rider_once_it_commits(
    field_user, route_day, scheduled_order, django_capture_on_commit_callbacks
):
    from unittest import mock

    from fulfilment import services
    from notifications import services as notification_services
    from notifications.models import DeviceToken

    DeviceToken.objects.create(user=field_user, token=TOKEN, platform="android")
    with mock.patch.object(notification_services, "push_to_user") as nudge:
        with django_capture_on_commit_callbacks(execute=True):
            services.assign_route_day(
                route_day,
                staff_ids=[field_user.id],
                jobs=[
                    {
                        "order_id": scheduled_order.id,
                        "kind": "PICKUP",
                        "assigned_to": field_user.id,
                    }
                ],
            )
    nudge.assert_called_once()
    assert nudge.call_args.args[0] == field_user
    assert "1 new job" in nudge.call_args.kwargs["body"]


def test_a_push_that_fails_never_breaks_planning(
    field_user, route_day, scheduled_order, django_capture_on_commit_callbacks
):
    from unittest import mock

    from fulfilment import services
    from notifications import push
    from notifications.models import DeviceToken

    DeviceToken.objects.create(user=field_user, token=TOKEN, platform="android")
    boom = mock.Mock()
    boom.send.side_effect = RuntimeError("expo is down")
    with mock.patch.object(push, "get_push_sender", return_value=boom):
        with django_capture_on_commit_callbacks(execute=True):
            services.assign_route_day(
                route_day,
                staff_ids=[field_user.id],
                jobs=[
                    {
                        "order_id": scheduled_order.id,
                        "kind": "PICKUP",
                        "assigned_to": field_user.id,
                    }
                ],
            )
    assert route_day.jobs.count() == 1
