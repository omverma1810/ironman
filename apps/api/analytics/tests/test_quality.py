"""docs/08 batch 6.9: data-quality checks fire on seeded bad data (the
phase exit criterion) and stay quiet on clean data."""

from __future__ import annotations

from datetime import timedelta

import pytest
from django.utils import timezone

from analytics import quality
from billing.models import CashHandover
from customers.models import Customer
from growth import services as growth_services
from ordering.models import Order, OrderStatus

pytestmark = pytest.mark.django_db


def _delivered(hub, service, n, *, hours_ago=48, payment="UNPAID", self_reported="", channel="WEB"):
    customer = Customer.objects.create(hub=hub, name=f"DQ {n}", phone=f"+9198999{n:05d}")
    order = Order.objects.create(
        hub=hub, customer=customer, service=service, status=OrderStatus.SCHEDULED, channel=channel
    )
    growth_services.capture_attribution(order, self_reported=self_reported)
    order.status = OrderStatus.DELIVERED
    order.payment_status = payment
    order.delivered_at = timezone.now() - timedelta(hours=hours_ago)
    order.save(update_fields=["status", "payment_status", "delivered_at"])
    return order


def checks(hub):
    return {c["key"]: c for c in quality.run(hub)["checks"]}


def test_clean_hub_passes_everything(hub):
    result = quality.run(hub)
    assert result["failing"] == 0


def test_unknown_channel_fires_above_five_percent(hub, service):
    _delivered(hub, service, 1, self_reported="FLYER", payment="PAID")  # known: they told us
    unknown = _delivered(hub, service, 2, payment="PAID")  # web, no code, no answer
    _delivered(hub, service, 3, payment="PAID", channel="COUNTER")  # walk-in: known

    result = checks(hub)["unknown_channel"]
    assert result["row_count"] == 1
    assert result["rows"] == [{"customer": str(unknown.customer_id)}]
    assert result["value"] == 33.3 and not result["ok"]


def test_delivered_unpaid_and_missing_consumables_fire(hub, service):
    stale = _delivered(hub, service, 4, hours_ago=48)
    _delivered(hub, service, 5, hours_ago=2)  # within 24 h — not yet a problem
    result = checks(hub)
    assert not result["delivered_unpaid"]["ok"]
    assert [r["order"] for r in result["delivered_unpaid"]["rows"]] == [stale.ref]
    assert not result["missing_consumables"]["ok"]
    assert result["missing_consumables"]["row_count"] == 2


def test_cash_variance_fires(hub, field_user, admin_user):
    CashHandover.objects.create(
        hub=hub,
        from_user=field_user,
        to_user=admin_user,
        declared_amount_minor=10000,
        received_amount_minor=9500,
        variance_minor=-500,
        status="CONFIRMED",
        confirmed_at=timezone.now(),
    )
    result = checks(hub)["cash_variance"]
    assert not result["ok"] and result["rows"][0]["variance_minor"] == -500


def test_api_is_admin_and_founder_only(api_client, admin_user, operator_user, hub):
    api_client.force_authenticate(user=operator_user)
    assert api_client.get("/api/v1/analytics/data-quality").status_code == 403
    api_client.force_authenticate(user=admin_user)
    resp = api_client.get(f"/api/v1/analytics/data-quality?hub={hub.id}")
    assert resp.status_code == 200 and len(resp.data["checks"]) == 5
