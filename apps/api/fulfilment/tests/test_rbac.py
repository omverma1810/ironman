"""docs/06 §3.1: route-day planning is Admin/Founder only ([A] — no
Operator, unlike custody's ops-staff-wide gate). Job status updates and
proofs follow the "Update job status / proof" row exactly: Field
own/assigned, Ops/Admin, Founder — Operator is excluded from these too.
See fulfilment/views.py's module docstring."""

import pytest

pytestmark = pytest.mark.django_db


# ── route-day planning: Admin/Founder only ──────────────────────────────────


def test_admin_can_create_route_day(api_client, admin_user, hub, cluster):
    api_client.force_authenticate(user=admin_user)
    resp = api_client.post(
        "/api/v1/fulfilment/route-days/",
        {"cluster": str(cluster.id), "date": "2026-09-10"},
        format="json",
    )
    assert resp.status_code == 201, resp.data


def test_founder_can_create_route_day(api_client, founder_user, cluster):
    api_client.force_authenticate(user=founder_user)
    resp = api_client.post(
        "/api/v1/fulfilment/route-days/",
        {"cluster": str(cluster.id), "date": "2026-09-10"},
        format="json",
    )
    assert resp.status_code == 201, resp.data


def test_operator_cannot_create_route_day(api_client, operator_user, cluster):
    api_client.force_authenticate(user=operator_user)
    resp = api_client.post(
        "/api/v1/fulfilment/route-days/",
        {"cluster": str(cluster.id), "date": "2026-09-10"},
        format="json",
    )
    assert resp.status_code == 403


def test_field_cannot_create_route_day(api_client, field_user, cluster):
    api_client.force_authenticate(user=field_user)
    resp = api_client.post(
        "/api/v1/fulfilment/route-days/",
        {"cluster": str(cluster.id), "date": "2026-09-10"},
        format="json",
    )
    assert resp.status_code == 403


def test_anonymous_cannot_create_route_day(api_client, cluster):
    resp = api_client.post(
        "/api/v1/fulfilment/route-days/",
        {"cluster": str(cluster.id), "date": "2026-09-10"},
        format="json",
    )
    assert resp.status_code in (401, 403)


def test_admin_can_assign_route_day(api_client, admin_user, route_day, scheduled_order, field_user):
    api_client.force_authenticate(user=admin_user)
    resp = api_client.post(
        f"/api/v1/fulfilment/route-days/{route_day.id}/assign/",
        {
            "staff": [str(field_user.id)],
            "jobs": [
                {
                    "order_id": str(scheduled_order.id),
                    "kind": "PICKUP",
                    "assigned_to": str(field_user.id),
                }
            ],
        },
        format="json",
    )
    assert resp.status_code == 200, resp.data
    assert len(resp.data["jobs"]) == 1


def test_operator_cannot_assign_route_day(api_client, operator_user, route_day, scheduled_order):
    api_client.force_authenticate(user=operator_user)
    resp = api_client.post(
        f"/api/v1/fulfilment/route-days/{route_day.id}/assign/",
        {"staff": [], "jobs": [{"order_id": str(scheduled_order.id), "kind": "PICKUP"}]},
        format="json",
    )
    assert resp.status_code == 403


def test_founder_sees_route_days_across_hubs(api_client, founder_user, route_day):
    from territory.models import Cluster, Hub

    other_hub = Hub.objects.create(code="OTHER-HUB-FG", name="Other Hub FG")
    other_cluster = Cluster.objects.create(hub=other_hub, name="Other Cluster FG")
    from fulfilment.models import RouteDay

    other_route_day = RouteDay.objects.create(
        hub=other_hub, cluster=other_cluster, date="2026-09-11"
    )

    api_client.force_authenticate(user=founder_user)
    resp = api_client.get("/api/v1/fulfilment/route-days/")
    ids = {r["id"] for r in resp.data["results"]}
    assert str(route_day.id) in ids
    assert str(other_route_day.id) in ids


def test_admin_only_sees_own_hub_route_days(api_client, admin_user, route_day):
    from territory.models import Cluster, Hub

    other_hub = Hub.objects.create(code="OTHER-HUB-FF", name="Other Hub FF")
    other_cluster = Cluster.objects.create(hub=other_hub, name="Other Cluster FF")
    from fulfilment.models import RouteDay

    other_route_day = RouteDay.objects.create(
        hub=other_hub, cluster=other_cluster, date="2026-09-10"
    )

    api_client.force_authenticate(user=admin_user)
    resp = api_client.get("/api/v1/fulfilment/route-days/")
    ids = {r["id"] for r in resp.data["results"]}
    assert str(route_day.id) in ids
    assert str(other_route_day.id) not in ids


# ── job status updates: Field own/assigned, Admin/Founder, never Operator ──


def test_field_can_start_own_job(api_client, field_user, pickup_job):
    api_client.force_authenticate(user=field_user)
    resp = api_client.post(f"/api/v1/fulfilment/jobs/{pickup_job.id}/start/")
    assert resp.status_code == 200, resp.data
    assert resp.data["status"] == "EN_ROUTE"


def test_field_cannot_see_or_start_another_riders_job(api_client, hub, pickup_job):
    from identity.models import Role, RoleCode, User, UserRole

    role, _ = Role.objects.get_or_create(code=RoleCode.FIELD, defaults={"name": "FIELD"})
    other_field = User.objects.create_user(email="other-field@test.local", password="testpass1234")
    UserRole.objects.create(user=other_field, role=role, hub=hub)

    api_client.force_authenticate(user=other_field)
    resp = api_client.post(f"/api/v1/fulfilment/jobs/{pickup_job.id}/start/")
    assert resp.status_code == 404


def test_admin_can_start_any_job_in_hub(api_client, admin_user, pickup_job):
    api_client.force_authenticate(user=admin_user)
    resp = api_client.post(f"/api/v1/fulfilment/jobs/{pickup_job.id}/start/")
    assert resp.status_code == 200, resp.data


def test_operator_cannot_start_job(api_client, operator_user, pickup_job):
    api_client.force_authenticate(user=operator_user)
    resp = api_client.post(f"/api/v1/fulfilment/jobs/{pickup_job.id}/start/")
    assert resp.status_code == 403


def test_customer_cannot_start_job(api_client, customer_user, pickup_job):
    api_client.force_authenticate(user=customer_user)
    resp = api_client.post(f"/api/v1/fulfilment/jobs/{pickup_job.id}/start/")
    assert resp.status_code == 403


def test_anonymous_cannot_start_job(api_client, pickup_job):
    resp = api_client.post(f"/api/v1/fulfilment/jobs/{pickup_job.id}/start/")
    assert resp.status_code in (401, 403)


def test_field_can_complete_own_pickup_job(api_client, field_user, pickup_job):
    api_client.force_authenticate(user=field_user)
    api_client.post(f"/api/v1/fulfilment/jobs/{pickup_job.id}/start/")
    resp = api_client.post(
        f"/api/v1/fulfilment/jobs/{pickup_job.id}/complete/",
        {"declared_lines": []},
        format="json",
    )
    assert resp.status_code == 200, resp.data
    assert resp.data["status"] == "DONE"


def test_field_can_fail_own_job(api_client, field_user, pickup_job):
    api_client.force_authenticate(user=field_user)
    api_client.post(f"/api/v1/fulfilment/jobs/{pickup_job.id}/start/")
    resp = api_client.post(
        f"/api/v1/fulfilment/jobs/{pickup_job.id}/fail/",
        {"reason_code": "customer_absent"},
        format="json",
    )
    assert resp.status_code == 200, resp.data
    assert resp.data["status"] == "FAILED"


def test_operator_cannot_fail_job(api_client, operator_user, pickup_job):
    api_client.force_authenticate(user=operator_user)
    resp = api_client.post(
        f"/api/v1/fulfilment/jobs/{pickup_job.id}/fail/",
        {"reason_code": "customer_absent"},
        format="json",
    )
    assert resp.status_code == 403


def test_field_can_arrive_own_job(api_client, field_user, pickup_job):
    api_client.force_authenticate(user=field_user)
    api_client.post(f"/api/v1/fulfilment/jobs/{pickup_job.id}/start/")
    resp = api_client.post(f"/api/v1/fulfilment/jobs/{pickup_job.id}/arrive/")
    assert resp.status_code == 200, resp.data
    assert resp.data["status"] == "ARRIVED"


def test_field_can_view_own_job_attempts_and_proofs(api_client, field_user, pickup_job):
    api_client.force_authenticate(user=field_user)
    api_client.post(f"/api/v1/fulfilment/jobs/{pickup_job.id}/start/")
    api_client.post(
        f"/api/v1/fulfilment/jobs/{pickup_job.id}/complete/",
        {"declared_lines": []},
        format="json",
    )
    resp = api_client.get(f"/api/v1/fulfilment/jobs/{pickup_job.id}/attempts/")
    assert resp.status_code == 200
    assert len(resp.data) == 1
    assert resp.data[0]["outcome"] == "DONE"

    resp = api_client.get(f"/api/v1/fulfilment/jobs/{pickup_job.id}/proofs/")
    assert resp.status_code == 200
    assert resp.data == []


# ── jobs/mine ────────────────────────────────────────────────────────────


def test_jobs_mine_returns_only_assigned_jobs(api_client, field_user, pickup_job):
    api_client.force_authenticate(user=field_user)
    resp = api_client.get("/api/v1/fulfilment/jobs/mine/")
    assert resp.status_code == 200
    assert len(resp.data) == 1
    assert resp.data[0]["id"] == str(pickup_job.id)


def test_jobs_mine_filters_by_date(api_client, field_user, pickup_job, route_day):
    api_client.force_authenticate(user=field_user)
    resp = api_client.get(f"/api/v1/fulfilment/jobs/mine/?date={route_day.date}")
    assert resp.status_code == 200
    assert len(resp.data) == 1

    resp = api_client.get("/api/v1/fulfilment/jobs/mine/?date=2099-01-01")
    assert resp.status_code == 200
    assert resp.data == []


def test_admin_cannot_call_jobs_mine(api_client, admin_user):
    api_client.force_authenticate(user=admin_user)
    resp = api_client.get("/api/v1/fulfilment/jobs/mine/")
    assert resp.status_code == 403


# ── proof capture ──────────────────────────────────────────────────────────


def test_field_can_create_proof_for_own_job(api_client, field_user, pickup_job):
    api_client.force_authenticate(user=field_user)
    resp = api_client.post(
        "/api/v1/fulfilment/proofs",
        {"job": str(pickup_job.id), "kind": "OTP", "otp_verified": "true"},
    )
    assert resp.status_code == 201, resp.data
    assert resp.data["otp_verified"] is True


def test_photo_proof_without_a_file_is_rejected(api_client, field_user, pickup_job):
    api_client.force_authenticate(user=field_user)
    resp = api_client.post(
        "/api/v1/fulfilment/proofs", {"job": str(pickup_job.id), "kind": "PHOTO"}
    )
    assert resp.status_code == 400


def test_operator_cannot_create_proof(api_client, operator_user, pickup_job):
    api_client.force_authenticate(user=operator_user)
    resp = api_client.post("/api/v1/fulfilment/proofs", {"job": str(pickup_job.id), "kind": "OTP"})
    assert resp.status_code == 403


# ── offline sync: Field only ─────────────────────────────────────────────


def test_field_can_sync_offline_ops(api_client, field_user, pickup_job):
    api_client.force_authenticate(user=field_user)
    resp = api_client.post(
        "/api/v1/fulfilment/sync",
        {
            "device_id": "phone-9",
            "ops": [
                {
                    "client_op_id": "sync-op-1",
                    "op_type": "job.start",
                    "payload": {"job_id": str(pickup_job.id)},
                    "client_ts": "2026-09-02T09:00:00Z",
                }
            ],
        },
        format="json",
    )
    assert resp.status_code == 200, resp.data
    assert resp.data[0]["status"] == "APPLIED"


def test_admin_cannot_sync_offline_ops(api_client, admin_user):
    api_client.force_authenticate(user=admin_user)
    resp = api_client.post(
        "/api/v1/fulfilment/sync",
        {"device_id": "phone-9", "ops": []},
        format="json",
    )
    assert resp.status_code == 403
