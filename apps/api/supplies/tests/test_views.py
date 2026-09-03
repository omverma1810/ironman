import pytest

from supplies.services import adjust_stock, receive_stock

pytestmark = pytest.mark.django_db


def test_reorder_alert_lists_items_at_or_below_reorder_level(api_client, operator_user, stock_item):
    receive_stock(stock_item, qty=50, unit_cost_minor=40)  # reorder_level is 50
    api_client.force_authenticate(user=operator_user)
    resp = api_client.get("/api/v1/supplies/reorder-alerts")
    assert resp.status_code == 200
    assert [str(row["stock_item"]) for row in resp.data] == [str(stock_item.id)]


def test_reorder_alert_excludes_items_above_reorder_level(api_client, operator_user, stock_item):
    receive_stock(stock_item, qty=51, unit_cost_minor=40)
    api_client.force_authenticate(user=operator_user)
    resp = api_client.get("/api/v1/supplies/reorder-alerts")
    assert resp.status_code == 200
    assert resp.data == []


def test_reorder_alert_excludes_inactive_items(api_client, operator_user, stock_item):
    stock_item.is_active = False
    stock_item.save(update_fields=["is_active"])
    receive_stock(stock_item, qty=1, unit_cost_minor=40)
    api_client.force_authenticate(user=operator_user)
    resp = api_client.get("/api/v1/supplies/reorder-alerts")
    assert resp.status_code == 200
    assert resp.data == []


def test_movements_filter_by_item_and_date_range(api_client, admin_user, stock_item):
    receive_stock(stock_item, qty=10, unit_cost_minor=40, actor=admin_user)
    adjust_stock(stock_item, delta=-2, kind="ISSUE", actor=admin_user)
    api_client.force_authenticate(user=admin_user)

    resp = api_client.get(f"/api/v1/supplies/movements/?item={stock_item.id}")
    assert resp.status_code == 200
    assert len(resp.data["results"]) == 2

    resp = api_client.get("/api/v1/supplies/movements/?from=2999-01-01T00:00:00Z")
    assert resp.status_code == 200
    assert resp.data["results"] == []


def test_stock_item_list_is_hub_scoped(api_client, operator_user, stock_item, founder_user):
    from territory.models import Hub

    other_hub = Hub.objects.create(code="OTHER-HUB", name="Other Hub", daily_pressing_capacity=50)
    from supplies.models import StockCategory, StockItem, StockUnit

    StockItem.objects.create(
        hub=other_hub,
        sku="OTHER-001",
        name="Other hub item",
        unit=StockUnit.PIECE,
        category=StockCategory.OTHER,
    )

    api_client.force_authenticate(user=operator_user)
    resp = api_client.get("/api/v1/supplies/items/")
    assert resp.status_code == 200
    skus = {row["sku"] for row in resp.data["results"]}
    assert skus == {stock_item.sku}

    api_client.force_authenticate(user=founder_user)
    resp = api_client.get("/api/v1/supplies/items/")
    assert resp.status_code == 200
    skus = {row["sku"] for row in resp.data["results"]}
    assert skus == {stock_item.sku, "OTHER-001"}
