"""docs/06 §3.1 / docs/04 §3.8: operator handles day-to-day stock
(items, receipts, adjustments, reorder alerts); the ledger and the
consumption-rule formulas are admin/founder oversight, operator excluded
(same reasoning `fulfilment.views` documents for route-day planning)."""

import pytest

pytestmark = pytest.mark.django_db


def test_operator_can_create_stock_item(api_client, operator_user, hub):
    api_client.force_authenticate(user=operator_user)
    resp = api_client.post(
        "/api/v1/supplies/items/",
        {"hub": str(hub.id), "sku": "COVER-001", "name": "Poly cover", "category": "COVER"},
        format="json",
    )
    assert resp.status_code == 201, resp.data


def test_field_staff_cannot_create_stock_item(api_client, field_user, hub):
    api_client.force_authenticate(user=field_user)
    resp = api_client.post(
        "/api/v1/supplies/items/",
        {"hub": str(hub.id), "sku": "COVER-001", "name": "Poly cover", "category": "COVER"},
        format="json",
    )
    assert resp.status_code == 403


def test_customer_cannot_create_stock_item(api_client, customer_user, hub):
    api_client.force_authenticate(user=customer_user)
    resp = api_client.post(
        "/api/v1/supplies/items/",
        {"hub": str(hub.id), "sku": "COVER-001", "name": "Poly cover", "category": "COVER"},
        format="json",
    )
    assert resp.status_code == 403


def test_anonymous_cannot_list_stock_items(api_client):
    resp = api_client.get("/api/v1/supplies/items/")
    assert resp.status_code in (401, 403)


def test_operator_can_post_receipt(api_client, operator_user, stock_item):
    api_client.force_authenticate(user=operator_user)
    resp = api_client.post(
        "/api/v1/supplies/receipts",
        {"item": str(stock_item.id), "qty": 50, "unit_cost": 40, "supplier": "Acme"},
        format="json",
    )
    assert resp.status_code == 201, resp.data
    assert resp.data["kind"] == "RECEIPT"


def test_operator_can_post_adjustment(api_client, operator_user, stock_item):
    from supplies.services import receive_stock

    receive_stock(stock_item, qty=50, unit_cost_minor=40)
    api_client.force_authenticate(user=operator_user)
    resp = api_client.post(
        "/api/v1/supplies/adjustments",
        {"item": str(stock_item.id), "delta": -10, "kind": "ISSUE", "note": "packed"},
        format="json",
    )
    assert resp.status_code == 201, resp.data


def test_field_staff_cannot_post_receipt(api_client, field_user, stock_item):
    api_client.force_authenticate(user=field_user)
    resp = api_client.post(
        "/api/v1/supplies/receipts",
        {"item": str(stock_item.id), "qty": 50, "unit_cost": 40},
        format="json",
    )
    assert resp.status_code == 403


def test_operator_can_see_reorder_alerts(api_client, operator_user, stock_item):
    api_client.force_authenticate(user=operator_user)
    resp = api_client.get("/api/v1/supplies/reorder-alerts")
    assert resp.status_code == 200, resp.data


def test_operator_cannot_read_movements(api_client, operator_user, stock_item):
    api_client.force_authenticate(user=operator_user)
    resp = api_client.get("/api/v1/supplies/movements/")
    assert resp.status_code == 403


def test_admin_can_read_movements(api_client, admin_user, stock_item):
    from supplies.services import receive_stock

    receive_stock(stock_item, qty=10, unit_cost_minor=40, actor=admin_user)
    api_client.force_authenticate(user=admin_user)
    resp = api_client.get("/api/v1/supplies/movements/")
    assert resp.status_code == 200, resp.data
    assert len(resp.data["results"]) == 1


def test_founder_can_read_movements(api_client, founder_user, stock_item):
    api_client.force_authenticate(user=founder_user)
    resp = api_client.get("/api/v1/supplies/movements/")
    assert resp.status_code == 200


def test_operator_cannot_write_consumption_rules(api_client, operator_user, service, stock_item):
    api_client.force_authenticate(user=operator_user)
    resp = api_client.put(
        "/api/v1/supplies/consumption-rules",
        {
            "rules": [
                {
                    "service": str(service.id),
                    "stock_item": str(stock_item.id),
                    "qty_per_unit": "1.00",
                }
            ]
        },
        format="json",
    )
    assert resp.status_code == 403


def test_admin_can_write_and_read_consumption_rules(
    api_client, admin_user, service, garment_type, stock_item
):
    api_client.force_authenticate(user=admin_user)
    resp = api_client.put(
        "/api/v1/supplies/consumption-rules",
        {
            "rules": [
                {
                    "service": str(service.id),
                    "garment_type": str(garment_type.id),
                    "stock_item": str(stock_item.id),
                    "qty_per_unit": "1.00",
                }
            ]
        },
        format="json",
    )
    assert resp.status_code == 200, resp.data
    assert len(resp.data) == 1

    resp = api_client.get("/api/v1/supplies/consumption-rules")
    assert resp.status_code == 200
    assert len(resp.data) == 1
    assert resp.data[0]["stock_item_sku"] == stock_item.sku


def test_consumption_rules_replace_is_idempotent_across_calls(
    api_client, admin_user, service, stock_item
):
    """The whole set is soft-deleted and recreated on every PUT — a second
    PUT of the exact same rule must not collide on the composite unique
    constraint against the first call's now-deleted row."""
    api_client.force_authenticate(user=admin_user)
    payload = {
        "rules": [
            {"service": str(service.id), "stock_item": str(stock_item.id), "qty_per_unit": "2.00"}
        ]
    }
    first = api_client.put("/api/v1/supplies/consumption-rules", payload, format="json")
    assert first.status_code == 200, first.data
    second = api_client.put("/api/v1/supplies/consumption-rules", payload, format="json")
    assert second.status_code == 200, second.data
    assert len(second.data) == 1
