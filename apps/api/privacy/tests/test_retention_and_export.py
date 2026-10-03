"""docs/06 §5: the retention windows are enforced by code, the nightly
trigger can't be called by anyone without the secret, and a customer's
export holds their data and nobody else's."""

from __future__ import annotations

import json
from datetime import timedelta

import pytest
from django.core.files.base import ContentFile
from django.utils import timezone
from freezegun import freeze_time

from customers.models import Address, ConsentRecord, Customer
from fulfilment.models import Job, JobStatus, Proof, RouteDay
from identity.models import OtpChallenge
from notifications.models import NotificationRequest, NotificationTemplate
from ordering.models import Order, OrderException
from privacy import retention
from privacy.models import MaintenanceRun
from privacy.views import maintenance_signature

pytestmark = pytest.mark.django_db


def _proof(hub, cluster, order, *, days_old):
    route_day, _ = RouteDay.objects.get_or_create(
        hub=hub, cluster=cluster, date=timezone.localdate()
    )
    job = Job.objects.create(
        hub=hub, route_day=route_day, order=order, kind="DELIVERY", status=JobStatus.DONE
    )
    proof = Proof.objects.create(
        hub=hub, job=job, kind="PHOTO", at=timezone.now() - timedelta(days=days_old)
    )
    proof.file.save("door.jpg", ContentFile(b"jpeg"), save=True)
    return proof


def test_proof_photos_go_after_180_days_unless_an_issue_is_open(hub, cluster, customer, service):
    def order():
        return Order.objects.create(hub=hub, customer=customer, service=service)

    old = _proof(hub, cluster, order(), days_old=181)
    fresh = _proof(hub, cluster, order(), days_old=10)
    disputed_order = order()
    disputed = _proof(hub, cluster, disputed_order, days_old=200)
    OrderException.objects.create(
        hub=hub, order=disputed_order, kind="DAMAGED", description="Claim"
    )

    assert retention.run().summary["proof_photos"] == 1
    for proof in (old, fresh, disputed):
        proof.refresh_from_db()
    assert not old.file and fresh.file and disputed.file


def test_payloads_and_otps_age_out(hub, customer):
    template = NotificationTemplate.objects.create(
        code="t", channel="SMS", locale="en", body="Hi {name}", variables=["name"]
    )
    with freeze_time(timezone.now() - timedelta(days=91)):
        old = NotificationRequest.objects.create(
            hub=hub,
            recipient_kind="CUSTOMER",
            recipient_id=customer.id,
            template=template,
            channel="SMS",
            payload={"name": "Asha"},
            dedupe_key="old",
        )
        OtpChallenge.issue(phone="+919800000001", purpose="LOGIN")
    recent = NotificationRequest.objects.create(
        hub=hub,
        recipient_kind="CUSTOMER",
        recipient_id=customer.id,
        template=template,
        channel="SMS",
        payload={"name": "Asha"},
        dedupe_key="recent",
    )
    OtpChallenge.issue(phone="+919800000002", purpose="LOGIN")

    summary = retention.run().summary
    assert summary["notification_payloads"] == 1 and summary["otp_records"] == 1
    old.refresh_from_db()
    recent.refresh_from_db()
    assert old.payload == {} and recent.payload == {"name": "Asha"}
    assert list(OtpChallenge.objects.values_list("phone", flat=True)) == ["+919800000002"]
    assert MaintenanceRun.objects.get().finished_at


def test_maintenance_endpoint_needs_todays_signature(api_client):
    url = "/api/v1/internal/maintenance"
    assert api_client.post(url).status_code == 403
    stale = maintenance_signature(timezone.now().date() - timedelta(days=2))
    assert api_client.post(url, HTTP_X_MAINTENANCE_SIGNATURE=stale).status_code == 403

    good = maintenance_signature(timezone.now().date())
    resp = api_client.post(url, HTTP_X_MAINTENANCE_SIGNATURE=good)
    assert resp.status_code == 200 and resp.data["ok"]
    assert MaintenanceRun.objects.get().trigger == "schedule"


def test_export_is_the_customers_own_data(
    api_client, hub, apartment, customer, customer_user, service
):
    Address.objects.create(customer=customer, apartment=apartment, flat_no="B-402")
    ConsentRecord.objects.create(customer=customer, purpose="MARKETING", granted=True)
    Order.objects.create(hub=hub, customer=customer, service=service, total_minor=4500)
    stranger = Customer.objects.create(hub=hub, phone="+919811111111", name="Stranger")
    Order.objects.create(hub=hub, customer=stranger, service=service)

    api_client.force_authenticate(user=customer_user)
    resp = api_client.get("/api/v1/me/export")
    assert resp.status_code == 200
    assert resp["Content-Disposition"].startswith('attachment; filename="ironman-my-data-')
    data = json.loads(resp.content)
    assert data["account"]["phone"] == customer.phone
    assert data["addresses"][0]["flat_no"] == "B-402"
    assert data["consents"][0]["purpose"] == "MARKETING"
    assert [o["total_minor"] for o in data["orders"]] == [4500]
    assert "Stranger" not in resp.content.decode()


def test_export_needs_sign_in(api_client):
    assert api_client.get("/api/v1/me/export").status_code == 401
    assert api_client.get("/api/v1/me/deletion").status_code == 401
