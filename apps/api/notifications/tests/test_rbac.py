"""docs/04 §3.11: preferences are [C] (the customer's own), test-send and
the delivery log are [A] (ops/admin) — the same matrix-as-tests approach
`ordering/tests/test_rbac.py` and friends use throughout this codebase."""

import pytest

from notifications.models import (
    NotificationChannel,
    NotificationDelivery,
    NotificationRequest,
    NotificationTemplate,
    RecipientKind,
)
from ordering.models import Order, OrderStatus

pytestmark = pytest.mark.django_db


@pytest.fixture
def order(hub, customer, service):
    return Order.objects.create(
        hub=hub, customer=customer, service=service, channel="WEB", status=OrderStatus.SCHEDULED
    )


@pytest.fixture
def sms_template():
    return NotificationTemplate.objects.create(
        code="order.scheduled", channel=NotificationChannel.SMS, body="Hi {customer_name}."
    )


# ── preferences: [C] ─────────────────────────────────────────────────────


def test_customer_can_read_their_own_preferences(api_client, customer_user):
    api_client.force_authenticate(user=customer_user)
    resp = api_client.get("/api/v1/notifications/preferences")
    assert resp.status_code == 200
    channels = {row["channel"] for row in resp.data}
    assert channels == set(NotificationChannel.values)
    assert all(row["opted_in"] is True for row in resp.data)


def test_customer_can_opt_out_of_a_channel(api_client, customer_user):
    api_client.force_authenticate(user=customer_user)
    resp = api_client.patch(
        "/api/v1/notifications/preferences",
        {"channel": "WHATSAPP", "opted_in": False},
        format="json",
    )
    assert resp.status_code == 200
    row = next(r for r in resp.data if r["channel"] == "WHATSAPP")
    assert row["opted_in"] is False


def test_customer_without_a_linked_profile_gets_a_clear_404(api_client):
    from identity.models import Role, RoleCode, User, UserRole

    role, _ = Role.objects.get_or_create(code=RoleCode.CUSTOMER, defaults={"name": "Customer"})
    user = User.objects.create_user(phone="+919000000001")
    UserRole.objects.create(user=user, role=role, hub=None)
    api_client.force_authenticate(user=user)
    resp = api_client.get("/api/v1/notifications/preferences")
    assert resp.status_code == 404


def test_staff_cannot_read_customer_preferences(api_client, operator_user):
    api_client.force_authenticate(user=operator_user)
    resp = api_client.get("/api/v1/notifications/preferences")
    assert resp.status_code == 403


def test_anonymous_cannot_read_preferences(api_client):
    resp = api_client.get("/api/v1/notifications/preferences")
    assert resp.status_code in (401, 403)


# ── test send: [A], staging only ─────────────────────────────────────────


def test_operator_can_fire_a_test_notification_outside_prod(
    api_client, operator_user, order, sms_template
):
    api_client.force_authenticate(user=operator_user)
    resp = api_client.post(
        "/api/v1/notifications/test",
        {"event_key": "order.scheduled", "order": str(order.id)},
        format="json",
    )
    assert resp.status_code == 200, resp.data


def test_test_endpoint_is_disabled_when_the_allowlist_guard_is_off(
    api_client, operator_user, order, sms_template, settings
):
    settings.IRONMAN = {**settings.IRONMAN, "NOTIFICATIONS_ENFORCE_RECIPIENT_ALLOWLIST": False}
    api_client.force_authenticate(user=operator_user)
    resp = api_client.post(
        "/api/v1/notifications/test",
        {"event_key": "order.scheduled", "order": str(order.id)},
        format="json",
    )
    assert resp.status_code == 403


def test_customer_cannot_fire_a_test_notification(api_client, customer_user, order, sms_template):
    api_client.force_authenticate(user=customer_user)
    resp = api_client.post(
        "/api/v1/notifications/test",
        {"event_key": "order.scheduled", "order": str(order.id)},
        format="json",
    )
    assert resp.status_code == 403


def test_field_staff_cannot_fire_a_test_notification(api_client, field_user, order, sms_template):
    api_client.force_authenticate(user=field_user)
    resp = api_client.post(
        "/api/v1/notifications/test",
        {"event_key": "order.scheduled", "order": str(order.id)},
        format="json",
    )
    assert resp.status_code == 403


# ── delivery log: [A] ─────────────────────────────────────────────────────


@pytest.fixture
def sent_request(order, sms_template):
    request = NotificationRequest.objects.create(
        hub=order.hub,
        order=order,
        template=sms_template,
        channel=NotificationChannel.SMS,
        recipient_kind=RecipientKind.CUSTOMER,
        recipient_id=order.customer_id,
        dedupe_key=f"{order.id}:order.scheduled:SMS:{order.customer_id}",
        status=NotificationRequest.Status.SENT,
    )
    NotificationDelivery.objects.create(
        request=request, provider="sms", status=NotificationDelivery.Status.SENT
    )
    return request


def test_operator_can_list_the_delivery_log(api_client, operator_user, sent_request):
    api_client.force_authenticate(user=operator_user)
    resp = api_client.get("/api/v1/notifications/log/")
    assert resp.status_code == 200
    assert resp.data["results"][0]["id"] == str(sent_request.id)
    assert resp.data["results"][0]["deliveries"][0]["status"] == "SENT"


def test_operator_can_filter_the_delivery_log_by_order(
    api_client, operator_user, sent_request, order
):
    api_client.force_authenticate(user=operator_user)
    resp = api_client.get(f"/api/v1/notifications/log/?order={order.id}")
    assert resp.status_code == 200
    assert len(resp.data["results"]) == 1


def test_customer_cannot_view_the_delivery_log(api_client, customer_user, sent_request):
    api_client.force_authenticate(user=customer_user)
    resp = api_client.get("/api/v1/notifications/log/")
    assert resp.status_code == 403


def test_anonymous_cannot_view_the_delivery_log(api_client, sent_request):
    resp = api_client.get("/api/v1/notifications/log/")
    assert resp.status_code in (401, 403)
