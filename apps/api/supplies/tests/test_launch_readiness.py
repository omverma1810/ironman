"""Launch-readiness hardening: levels exist from creation, cross-hub access
is closed, and cost is hidden from Operators."""

import pytest

from supplies.models import (
    ConsumptionRule,
    StockCategory,
    StockItem,
    StockLevel,
    StockUnit,
)
from supplies.services import receive_stock
from territory.models import Hub

pytestmark = pytest.mark.django_db


@pytest.fixture
def other_hub():
    return Hub.objects.create(code="OTHER-HUB", name="Other Hub", daily_pressing_capacity=50)


@pytest.fixture
def other_item(other_hub):
    return StockItem.objects.create(
        hub=other_hub,
        sku="OTHER-001",
        name="Other hub item",
        unit=StockUnit.PIECE,
        category=StockCategory.OTHER,
        reorder_level=5,
    )


def test_new_item_gets_zero_level_and_shows_in_reorder_alerts(api_client, operator_user, hub):
    api_client.force_authenticate(user=operator_user)
    resp = api_client.post(
        "/api/v1/supplies/items/",
        {
            "hub": str(hub.id),
            "sku": "NEW-1",
            "name": "New item",
            "unit": "PIECE",
            "category": "HANGER",
            "reorder_level": 10,
        },
        format="json",
    )
    assert resp.status_code == 201, resp.data
    level = StockLevel.objects.get(stock_item_id=resp.data["id"])
    assert level.qty_on_hand == 0

    alerts = api_client.get("/api/v1/supplies/reorder-alerts")
    assert [r["sku"] for r in alerts.data] == ["NEW-1"]


def test_operator_cannot_create_item_for_another_hub(api_client, operator_user, other_hub):
    api_client.force_authenticate(user=operator_user)
    resp = api_client.post(
        "/api/v1/supplies/items/",
        {"hub": str(other_hub.id), "sku": "X", "name": "X", "unit": "PIECE", "category": "OTHER"},
        format="json",
    )
    assert resp.status_code == 403
    assert not StockItem.objects.filter(sku="X").exists()


def test_operator_cannot_receive_or_adjust_other_hub_item(api_client, operator_user, other_item):
    api_client.force_authenticate(user=operator_user)
    receipt = api_client.post(
        "/api/v1/supplies/receipts",
        {"item": str(other_item.id), "qty": 5, "unit_cost": 10},
        format="json",
    )
    assert receipt.status_code == 404
    adjust = api_client.post(
        "/api/v1/supplies/adjustments",
        {"item": str(other_item.id), "delta": -1, "kind": "WASTAGE"},
        format="json",
    )
    assert adjust.status_code == 404
    assert StockLevel.objects.get(stock_item=other_item).qty_on_hand == 0


def test_founder_can_receive_into_any_hub(api_client, founder_user, other_item):
    api_client.force_authenticate(user=founder_user)
    resp = api_client.post(
        "/api/v1/supplies/receipts",
        {"item": str(other_item.id), "qty": 5, "unit_cost": 10},
        format="json",
    )
    assert resp.status_code == 201


def test_operator_does_not_see_cost_but_admin_does(
    api_client, operator_user, admin_user, stock_item
):
    receive_stock(stock_item, qty=10, unit_cost_minor=40)
    api_client.force_authenticate(user=operator_user)
    for url in ("/api/v1/supplies/levels/", "/api/v1/supplies/reorder-alerts"):
        resp = api_client.get(url)
        rows = resp.data["results"] if isinstance(resp.data, dict) else resp.data
        assert rows, url
        assert "avg_unit_cost_minor" not in rows[0]

    api_client.force_authenticate(user=admin_user)
    resp = api_client.get("/api/v1/supplies/levels/")
    assert resp.data["results"][0]["avg_unit_cost_minor"] == 40


def test_rules_are_hub_scoped_for_admin(api_client, admin_user, service, stock_item, other_item):
    ConsumptionRule.objects.create(service=service, stock_item=other_item, qty_per_unit=1)
    api_client.force_authenticate(user=admin_user)

    assert api_client.get("/api/v1/supplies/consumption-rules").data == []

    # Referencing another hub's item is refused...
    resp = api_client.put(
        "/api/v1/supplies/consumption-rules",
        {
            "rules": [
                {"service": str(service.id), "stock_item": str(other_item.id), "qty_per_unit": "1"}
            ]
        },
        format="json",
    )
    assert resp.status_code == 403

    # ...and replacing this hub's set leaves the other hub's rule intact.
    resp = api_client.put(
        "/api/v1/supplies/consumption-rules",
        {
            "rules": [
                {"service": str(service.id), "stock_item": str(stock_item.id), "qty_per_unit": "1"}
            ]
        },
        format="json",
    )
    assert resp.status_code == 200
    assert ConsumptionRule.objects.filter(stock_item=other_item).count() == 1
