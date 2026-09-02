"""docs/08 batch 2.6: the production board is a projection of GarmentLine
state (custody/models.py's StageEvent docstring). These tests cover the
aggregate/ageing/due-filter surface added to GarmentLineViewSet — the
per-garment transition/QC/scan behaviour is already covered by
test_state_machine.py and test_rbac.py."""

from datetime import timedelta

import pytest
from django.utils import timezone

from custody.models import GarmentStage
from custody.state_machine import transition_garment_line

pytestmark = pytest.mark.django_db


def test_wip_summary_counts_by_stage(api_client, operator_user, bag):
    line = bag.garment_lines.first()
    transition_garment_line(line, GarmentStage.SORTED)

    api_client.force_authenticate(user=operator_user)
    resp = api_client.get("/api/v1/custody/garment-lines/wip_summary/")
    assert resp.status_code == 200, resp.data
    # every GarmentStage is a key, even ones with zero garments in them
    assert set(resp.data.keys()) == set(GarmentStage.values)
    assert resp.data["SORTED"] == 1
    assert resp.data["RECEIVED"] == bag.garment_lines.count() - 1


def test_wip_summary_scoped_to_own_hub(api_client, operator_user, bag):
    from territory.models import Hub

    other_hub = Hub.objects.create(code="OTHER-HUB-PB", name="Other Hub PB")
    from custody.models import Bag

    Bag.objects.create(hub=other_hub, order=bag.order, garment_count=5)

    api_client.force_authenticate(user=operator_user)
    resp = api_client.get("/api/v1/custody/garment-lines/wip_summary/")
    # the other hub's bag has no garment lines of its own, so this just
    # confirms the operator's own hub's count isn't inflated by it
    assert resp.data["RECEIVED"] == bag.garment_lines.count()


def test_garment_line_list_exposes_order_and_ageing_fields(api_client, operator_user, bag):
    api_client.force_authenticate(user=operator_user)
    resp = api_client.get("/api/v1/custody/garment-lines/", {"bag": str(bag.id)})
    assert resp.status_code == 200, resp.data
    row = resp.data["results"][0]
    assert row["order_ref"] == bag.order.ref
    assert row["order"] == str(bag.order.id)
    assert row["hub"] == bag.hub.id
    # never scanned yet — falls back to created_at, not null
    assert row["stage_entered_at"] is not None


def test_exclude_terminal_filter_hides_delivered_lines(api_client, operator_user, bag):
    line = bag.garment_lines.first()
    line.stage = GarmentStage.DELIVERED
    line.save(update_fields=["stage"])

    api_client.force_authenticate(user=operator_user)
    resp = api_client.get(
        "/api/v1/custody/garment-lines/", {"bag": str(bag.id), "exclude_terminal": "true"}
    )
    stages = {row["stage"] for row in resp.data["results"]}
    assert "DELIVERED" not in stages
    assert len(resp.data["results"]) == bag.garment_lines.count() - 1


def test_stage_entered_at_reflects_latest_scan(api_client, operator_user, bag):
    line = bag.garment_lines.first()
    transition_garment_line(line, GarmentStage.SORTED)

    api_client.force_authenticate(user=operator_user)
    resp = api_client.get("/api/v1/custody/garment-lines/", {"bag": str(bag.id), "stage": "SORTED"})
    row = resp.data["results"][0]
    latest_event = line.stage_events.order_by("-occurred_at").first()
    assert row["stage_entered_at"] == latest_event.occurred_at


def test_due_filter_overdue_excludes_delivered_and_future_orders(
    api_client, operator_user, hub, customer, service, garment_type
):
    from custody.services import create_bag_for_order
    from ordering.models import Order, OrderLine, OrderStatus

    def make_order(delivery_promised_at):
        order = Order.objects.create(
            hub=hub,
            customer=customer,
            service=service,
            channel="COUNTER",
            status=OrderStatus.AT_HUB,
            declared_total_qty=1,
            verified_total_qty=1,
            total_minor=1500,
            delivery_promised_at=delivery_promised_at,
        )
        OrderLine.objects.create(
            hub=hub,
            order=order,
            garment_type=garment_type,
            declared_qty=1,
            verified_qty=1,
            unit_price_minor=1500,
            line_total_minor=1500,
        )
        return create_bag_for_order(order)

    now = timezone.now()
    overdue_bag = make_order(now - timedelta(hours=2))
    future_bag = make_order(now + timedelta(days=1))
    delivered_bag = make_order(now - timedelta(hours=5))
    for line in delivered_bag.garment_lines.all():
        line.stage = GarmentStage.DELIVERED
        line.save(update_fields=["stage"])

    api_client.force_authenticate(user=operator_user)
    resp = api_client.get("/api/v1/custody/garment-lines/", {"due": "overdue"})
    bag_ids = {row["bag"] for row in resp.data["results"]}
    assert overdue_bag.id in bag_ids
    assert future_bag.id not in bag_ids
    assert delivered_bag.id not in bag_ids


def test_due_filter_today(api_client, operator_user, hub, customer, service, garment_type):
    from custody.services import create_bag_for_order
    from ordering.models import Order, OrderLine, OrderStatus

    today_5pm = timezone.now().replace(hour=17, minute=0, second=0, microsecond=0)
    order = Order.objects.create(
        hub=hub,
        customer=customer,
        service=service,
        channel="COUNTER",
        status=OrderStatus.AT_HUB,
        declared_total_qty=1,
        verified_total_qty=1,
        total_minor=1500,
        delivery_promised_at=today_5pm,
    )
    OrderLine.objects.create(
        hub=hub,
        order=order,
        garment_type=garment_type,
        declared_qty=1,
        verified_qty=1,
        unit_price_minor=1500,
        line_total_minor=1500,
    )
    today_bag = create_bag_for_order(order)

    api_client.force_authenticate(user=operator_user)
    resp = api_client.get("/api/v1/custody/garment-lines/", {"due": "today"})
    bag_ids = {row["bag"] for row in resp.data["results"]}
    assert today_bag.id in bag_ids
