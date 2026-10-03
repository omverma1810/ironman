"""docs/06 §6 account deletion, step by step: blockers, fresh OTP, grace
period with two ways back, then anonymisation that keeps the money trail."""

from __future__ import annotations

from datetime import timedelta

import pytest
from django.core.files.base import ContentFile
from django.utils import timezone
from freezegun import freeze_time
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken
from rest_framework_simplejwt.tokens import RefreshToken

from billing import services as billing_services
from billing.models import Invoice
from customers.models import Address, Customer
from fulfilment.models import Job, JobStatus, Proof, RouteDay
from growth.models import Feedback
from identity.models import AuditEvent, OtpChallenge, User
from notifications.models import NotificationRequest
from ordering.models import Order, OrderException, OrderLine, OrderStatus
from privacy import retention, services
from privacy.models import DeletionRequest, DeletionStatus

pytestmark = pytest.mark.django_db


def _order(hub, customer, service, garment_type, *, status=OrderStatus.DELIVERED, pay=True):
    order = Order.objects.create(
        hub=hub,
        customer=customer,
        service=service,
        status=OrderStatus.SCHEDULED,
        total_minor=3000,
        subtotal_minor=3000,
        declared_total_qty=2,
        verified_total_qty=2,
        special_instructions="Ring twice, ask for Mrs Rao",
    )
    OrderLine.objects.create(
        hub=hub,
        order=order,
        garment_type=garment_type,
        declared_qty=2,
        verified_qty=2,
        unit_price_minor=1500,
        line_total_minor=3000,
    )
    order.status = status
    if status == OrderStatus.DELIVERED:
        order.delivered_at = timezone.now()
    order.save(update_fields=["status", "delivered_at"])
    if status == OrderStatus.DELIVERED:
        invoice = billing_services.issue_invoice(order)
        if pay:
            billing_services.record_payment(
                invoice, method="CASH", amount_minor=3000, idempotency_key=f"pay-{order.id}"
            )
    return order


def _code(user) -> str:
    _, code = OtpChallenge.issue(phone=user.phone, purpose="VERIFY")
    return code


def _delete(api_client, user, code):
    api_client.force_authenticate(user=user)
    return api_client.delete("/api/v1/me", {"code": code}, format="json")


# ------------------------------------------------------------- blockers


def test_blockers_name_what_to_settle(
    api_client, hub, customer, customer_user, service, garment_type
):
    _order(hub, customer, service, garment_type, status=OrderStatus.IN_PRODUCTION)
    unpaid = _order(hub, customer, service, garment_type, pay=False)
    OrderException.objects.create(hub=hub, order=unpaid, kind="DAMAGED", description="Torn")

    api_client.force_authenticate(user=customer_user)
    check = api_client.get("/api/v1/me/deletion").data
    assert not check["can_delete"]
    codes = [b["code"] for b in check["blockers"]]
    assert codes == ["order_in_progress", "invoice_unpaid", "issue_open"]
    assert "₹30.00 is still due" in check["blockers"][1]["message"]

    resp = _delete(api_client, customer_user, _code(customer_user))
    assert resp.status_code == 409
    assert resp.data["error"]["code"] == "deletion_blocked"
    customer_user.refresh_from_db()
    assert customer_user.is_active


def test_clean_account_can_delete(api_client, hub, customer, customer_user, service, garment_type):
    _order(hub, customer, service, garment_type)  # delivered and paid
    api_client.force_authenticate(user=customer_user)
    check = api_client.get("/api/v1/me/deletion").data
    assert check == {"can_delete": True, "blockers": [], "grace_days": 7}


# ------------------------------------------------------------ request


def test_wrong_code_is_refused(api_client, customer_user):
    _code(customer_user)
    resp = _delete(api_client, customer_user, "000000")
    assert resp.status_code == 400 and resp.data["error"]["code"] == "invalid_otp"
    assert not DeletionRequest.objects.exists()


def test_request_deactivates_and_revokes_sessions(api_client, customer, customer_user):
    refresh = RefreshToken.for_user(customer_user)
    resp = _delete(api_client, customer_user, _code(customer_user))
    assert resp.status_code == 202
    request = DeletionRequest.objects.get()
    assert request.status == DeletionStatus.PENDING
    assert request.customer == customer
    assert request.scheduled_for - request.requested_at == timedelta(days=7)

    customer_user.refresh_from_db()
    assert not customer_user.is_active
    assert BlacklistedToken.objects.filter(token__jti=refresh["jti"]).exists()

    # The access token stops working at once.
    api_client.force_authenticate(user=None)
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")
    assert api_client.get("/api/v1/me").status_code == 401

    # A restore link went out, and the request is audited.
    assert NotificationRequest.objects.filter(dedupe_key__startswith="deletion:").exists()
    assert AuditEvent.objects.filter(action="customer.deletion_requested").exists()


def test_staff_cannot_delete_their_own_account(api_client, admin_user):
    api_client.force_authenticate(user=admin_user)
    resp = api_client.delete("/api/v1/me", {"code": "123456"}, format="json")
    assert resp.status_code == 403 and resp.data["error"]["code"] == "staff_account"
    assert api_client.get("/api/v1/me/export").status_code == 403


# ------------------------------------------------------------ restore


def test_signing_in_during_grace_restores(api_client, customer_user):
    _delete(api_client, customer_user, _code(customer_user))
    api_client.force_authenticate(user=None)
    _, code = OtpChallenge.issue(phone=customer_user.phone, purpose="LOGIN")
    resp = api_client.post(
        "/api/v1/auth/otp/verify", {"phone": customer_user.phone, "code": code}, format="json"
    )
    assert resp.status_code == 200 and resp.data["restored"] is True
    customer_user.refresh_from_db()
    assert customer_user.is_active
    assert DeletionRequest.objects.get().status == DeletionStatus.CANCELLED


def test_restore_link(api_client, customer_user):
    _delete(api_client, customer_user, _code(customer_user))
    request = DeletionRequest.objects.get()
    assert services.restore_link(request).endswith(
        f"/account/restore?token={request.restore_token}"
    )

    api_client.force_authenticate(user=None)
    assert api_client.post("/api/v1/privacy/restore", {"token": "nope"}).status_code == 404
    resp = api_client.post("/api/v1/privacy/restore", {"token": request.restore_token})
    assert resp.status_code == 200
    customer_user.refresh_from_db()
    assert customer_user.is_active
    # A used link can't be replayed into a second restore.
    assert (
        api_client.post("/api/v1/privacy/restore", {"token": request.restore_token}).status_code
        == 409
    )


def test_closed_account_cannot_sign_in(api_client, customer_user):
    customer_user.is_active = False
    customer_user.save(update_fields=["is_active"])
    _, code = OtpChallenge.issue(phone=customer_user.phone, purpose="LOGIN")
    resp = api_client.post(
        "/api/v1/auth/otp/verify", {"phone": customer_user.phone, "code": code}, format="json"
    )
    assert resp.status_code == 403 and resp.data["error"]["code"] == "account_disabled"


# ---------------------------------------------------------- anonymise


def test_expiry_anonymises_and_keeps_the_money_trail(
    api_client, hub, cluster, apartment, customer, customer_user, service, garment_type
):
    address = Address.objects.create(
        customer=customer, apartment=apartment, flat_no="B-402", landmark="Near temple"
    )
    order = _order(hub, customer, service, garment_type)
    order.address = address
    order.save(update_fields=["address"])
    Feedback.objects.create(hub=hub, order=order, customer=customer, rating=5, comment="Crisp!")
    route_day = RouteDay.objects.create(hub=hub, cluster=cluster, date=timezone.localdate())
    job = Job.objects.create(
        hub=hub, route_day=route_day, order=order, kind="DELIVERY", status=JobStatus.DONE
    )
    proof = Proof.objects.create(hub=hub, job=job, kind="PHOTO", geo_lat=17.4, geo_lng=78.5)
    proof.file.save("door.jpg", ContentFile(b"jpeg"), save=True)
    phone = customer_user.phone

    _delete(api_client, customer_user, _code(customer_user))
    request = DeletionRequest.objects.get()

    assert retention.run().summary["account_deletions"] == 0  # still in grace
    with freeze_time(request.scheduled_for + timedelta(minutes=1)):
        run = retention.run()
    assert run.summary["account_deletions"] == 1

    request.refresh_from_db()
    assert request.status == DeletionStatus.COMPLETED
    customer.refresh_from_db()
    assert customer.name == "Deleted customer"
    assert customer.phone.startswith("DEL-") and customer.email == ""
    assert customer.status == Customer.Status.DELETED and customer.deleted_at
    assert customer.user is None
    customer_user.refresh_from_db()
    assert customer_user.phone is None and customer_user.full_name == ""
    assert not customer_user.is_active and not customer_user.has_usable_password()

    address = Address.all_objects.get(pk=address.pk)
    assert (address.flat_no, address.landmark) == ("", "")
    assert address.apartment == apartment  # analytics still know the building
    order.refresh_from_db()
    assert order.special_instructions == ""
    assert order.customer_id == customer.id and order.status == OrderStatus.DELIVERED
    invoice = Invoice.objects.get(order=order)
    assert billing_services.invoice_balance(invoice) == 0  # payments intact
    proof.refresh_from_db()
    assert not proof.file and proof.geo_lat is None
    assert Feedback.objects.get(order=order).comment == "Crisp!"  # text kept, now anonymous

    assert services.was_deleted(phone)
    assert AuditEvent.objects.filter(action="customer.deleted").exists()


def test_reregistering_starts_fresh(api_client, customer, customer_user):
    phone = customer_user.phone
    _delete(api_client, customer_user, _code(customer_user))
    services.complete_deletion(DeletionRequest.objects.get())

    api_client.force_authenticate(user=None)
    _, code = OtpChallenge.issue(phone=phone, purpose="LOGIN")
    resp = api_client.post("/api/v1/auth/otp/verify", {"phone": phone, "code": code}, format="json")
    assert resp.status_code == 200 and resp.data["created"] is True
    new_user = User.objects.get(phone=phone)
    assert new_user.pk != customer_user.pk
    assert not Customer.objects.filter(user=new_user, pk=customer.pk).exists()
