"""docs/08 batch 5.7 (A-06): the lapsed-customer segment and the
re-engagement send."""

from __future__ import annotations

from datetime import timedelta

import pytest
from django.utils import timezone

from customers.models import Customer
from growth import reengagement
from notifications.models import NotificationPref, NotificationRequest
from ordering.models import Order, OrderStatus

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def allow_test_phones(settings):
    cfg = dict(settings.IRONMAN)
    cfg["NOTIFICATIONS_ENFORCE_RECIPIENT_ALLOWLIST"] = False
    settings.IRONMAN = cfg


def _customer(hub, n, **kw):
    return Customer.objects.create(hub=hub, name=f"Meera {n}", phone=f"+9198777{n:05d}", **kw)


def _order(hub, customer, service, *, days_ago=None, status=OrderStatus.DELIVERED):
    order = Order.objects.create(
        hub=hub, customer=customer, service=service, status=status, total_minor=4000
    )
    if days_ago is not None:
        order.delivered_at = timezone.now() - timedelta(days=days_ago)
        order.save(update_fields=["delivered_at"])
    return order


@pytest.fixture
def segment(hub, service):
    lapsed_once = _customer(hub, 1)
    _order(hub, lapsed_once, service, days_ago=45)

    lapsed_twice = _customer(hub, 2)
    _order(hub, lapsed_twice, service, days_ago=90)
    _order(hub, lapsed_twice, service, days_ago=40)

    recent = _customer(hub, 3)
    _order(hub, recent, service, days_ago=5)

    came_back = _customer(hub, 4)  # old delivery, but a new order is in progress
    _order(hub, came_back, service, days_ago=60)
    _order(hub, came_back, service, status=OrderStatus.SCHEDULED)

    never_delivered = _customer(hub, 5)
    _order(hub, never_delivered, service, status=OrderStatus.CANCELLED)

    blocked = _customer(hub, 6, status=Customer.Status.BLOCKED)
    _order(hub, blocked, service, days_ago=60)
    return {"once": lapsed_once, "twice": lapsed_twice}


def test_segment_is_delivered_customers_gone_quiet_with_nothing_open(hub, segment):
    rows = reengagement.lapsed_customers(hub, days=30)
    # Longest gone first.
    assert [r["customer"] for r in rows] == [segment["once"].id, segment["twice"].id]
    once = next(r for r in rows if r["customer"] == segment["once"].id)
    assert once["delivered_orders"] == 1
    assert once["days_since"] == 45
    assert once["spent_minor"] == 4000


def test_one_time_only_narrows_to_customers_who_ordered_once(hub, segment):
    rows = reengagement.lapsed_customers(hub, days=30, one_time_only=True)
    assert [r["customer"] for r in rows] == [segment["once"].id]


def test_send_messages_each_lapsed_customer_once_per_cooldown(hub, segment, admin_user):
    first = reengagement.send(hub, days=30, offer="Use code FIRST20", actor=admin_user)
    assert first == {
        "eligible": 2,
        "sent": 2,
        "recently_contacted": 0,
        "opted_out": 0,
        "not_sent": 0,
    }
    request = NotificationRequest.objects.filter(recipient_id=segment["once"].id).get()
    assert request.template.code == reengagement.TEMPLATE_CODE
    assert request.order_id is None
    assert "/book?src=reengage" in request.payload["book_link"]
    assert request.payload["offer_line"] == ". Use code FIRST20"

    again = reengagement.send(hub, days=30, actor=admin_user)
    assert again["sent"] == 0
    assert again["recently_contacted"] == 2


def test_send_can_target_chosen_customers(hub, segment):
    result = reengagement.send(hub, days=30, customer_ids=[segment["once"].id])
    assert result["eligible"] == 1 and result["sent"] == 1


def test_opted_out_customers_are_not_messaged(hub, segment):
    for channel in ("WHATSAPP", "SMS"):
        NotificationPref.objects.create(
            recipient_kind="CUSTOMER",
            recipient_id=segment["once"].id,
            channel=channel,
            opted_in=False,
        )
    result = reengagement.send(hub, days=30)
    assert result["opted_out"] == 1 and result["sent"] == 1


def test_a_staff_edited_template_is_never_overwritten(hub, segment):
    from notifications.models import NotificationTemplate

    reengagement.send(hub, days=30, customer_ids=[])
    sms = NotificationTemplate.objects.get(code=reengagement.TEMPLATE_CODE, channel="SMS")
    sms.body = "Custom {customer_name} {book_link}{offer_line}"
    sms.save()
    reengagement.send(hub, days=30, customer_ids=[])
    sms.refresh_from_db()
    assert sms.body.startswith("Custom")


# ------------------------------------------------------------------- API


def test_admin_lists_and_sends_operator_cannot(api_client, admin_user, operator_user, hub, segment):
    api_client.force_authenticate(user=operator_user)
    assert api_client.get("/api/v1/growth/lapsed-customers").status_code == 403
    assert api_client.post("/api/v1/growth/campaigns/lapsed/send", {}).status_code == 403

    api_client.force_authenticate(user=admin_user)
    rows = api_client.get(f"/api/v1/growth/lapsed-customers?hub={hub.id}&days=30")
    assert rows.status_code == 200
    assert len(rows.data) == 2
    sent = api_client.post(
        f"/api/v1/growth/campaigns/lapsed/send?hub={hub.id}",
        {"days": 30, "one_time_only": True},
        format="json",
    )
    assert sent.status_code == 200, sent.data
    assert sent.data["sent"] == 1
