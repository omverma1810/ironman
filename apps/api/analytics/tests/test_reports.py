"""docs/08 batches 6.3–6.7: apartment and channel performance, the
unit-economics waterfall, the operations daily view and the checkpoint.
Reuses the week of data built in `test_weekly_metrics`."""

from __future__ import annotations

from datetime import timedelta

import pytest

from analytics import metrics, reports
from analytics.tests.factories import TODAY, WEEK, WEEK_END
from ordering.models import Order, OrderException, OrderStatus

pytestmark = pytest.mark.django_db


def test_apartment_ranking_reconciles_and_puts_active_buildings_first(hub, apartment, week):
    rows = reports.apartment_performance(hub, WEEK, WEEK_END)
    top = rows[0]
    assert top["apartment"] == str(apartment.id)
    assert top["orders"] == 2 and top["customers"] == 1  # Asha's two orders
    assert top["orders_per_customer"] == 2.0
    # Orders with an apartment, per apartment, sum to the delivered orders with one.
    with_apartment = metrics.delivered_orders(hub, WEEK, WEEK_END).exclude(apartment=None).count()
    assert sum(r["orders"] for r in rows) == with_apartment


def test_unit_economics_waterfall_sums_to_contribution(hub, week):
    ue = reports.unit_economics(hub, WEEK, WEEK_END)
    steps = {s["step"]: s["total_minor"] for s in ue["steps"]}
    assert steps["Revenue"] == 15000
    assert steps["Consumables"] == -200 and steps["Labour (estimate)"] == -900
    assert sum(v for k, v in steps.items() if k != "Contribution") == steps["Contribution"]
    assert ue["orders"] == 4


def test_channel_performance_counts_each_new_customer_once(hub, week):
    rows = reports.channel_performance(hub, WEEK, WEEK_END)
    assert (
        sum(r["new_customers"] for r in rows) == metrics.new_customers(hub, WEEK, WEEK_END)["value"]
    )
    watchman = next(r for r in rows if r["channel"] == "WATCHMAN")
    assert watchman["new_customers"] == 1
    assert watchman["repeat_rate"] == 100.0  # Asha reordered within 60 days
    assert watchman["revenue_60d_per_customer_minor"] == 6000


def test_operations_daily_shows_wip_overdue_and_exceptions(hub, customer, service, week):
    from django.utils import timezone

    stuck = Order.objects.create(
        hub=hub,
        customer=customer,
        service=service,
        status=OrderStatus.IN_PRODUCTION,
        picked_up_at=timezone.now() - timedelta(hours=30),
        delivery_promised_at=timezone.now() - timedelta(hours=2),
    )
    OrderException.objects.create(
        hub=hub, order=stuck, kind="DAMAGED", severity="HIGH", description="Torn collar"
    )
    ops = reports.operations_daily(hub)
    production = next(s for s in ops["wip"] if s["status"] == "IN_PRODUCTION")
    assert production["orders"] == 1 and production["oldest_hours"] == 30.0
    assert ops["overdue"][0]["ref"] == stuck.ref
    assert ops["open_exceptions"] == {"HIGH": 1}


def test_checkpoint_runs_from_launch(hub, week):
    cp = reports.checkpoint(hub, TODAY)
    assert cp["launched_on"] == str(WEEK - timedelta(days=20))  # Bina's first delivery
    assert cp["orders"] == 5
    assert cp["checkpoint"] == 30
    assert cp["top_apartments"]


def test_report_roles(api_client, founder_user, admin_user, operator_user, hub, week):
    period = f"hub={hub.id}&from={WEEK}&to={WEEK_END}"
    api_client.force_authenticate(user=operator_user)
    assert api_client.get(f"/api/v1/analytics/operations?hub={hub.id}").status_code == 200
    for url in ("apartments", "channels", "unit-economics", "checkpoint"):
        assert api_client.get(f"/api/v1/analytics/{url}?{period}").status_code == 403, url

    api_client.force_authenticate(user=admin_user)
    apartments = api_client.get(f"/api/v1/analytics/apartments?{period}")
    assert apartments.status_code == 200
    assert "margin_minor" not in apartments.data["rows"][0]
    for url in ("channels", "unit-economics", "checkpoint"):
        assert api_client.get(f"/api/v1/analytics/{url}?{period}").status_code == 403, url

    api_client.force_authenticate(user=founder_user)
    assert (
        "margin_minor" in api_client.get(f"/api/v1/analytics/apartments?{period}").data["rows"][0]
    )
    for url in ("channels", "unit-economics", "checkpoint"):
        assert api_client.get(f"/api/v1/analytics/{url}?{period}").status_code == 200, url
