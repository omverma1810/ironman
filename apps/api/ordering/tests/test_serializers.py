"""`OrderDetailSerializer.address` resolves the order's `customers.Address`
FK into rider-readable text — left to a plain ModelSerializer field it was
just the row's UUID (docs/08 batch 2.11: the field PWA's maps deep link and
address line are the first real consumer of this field)."""

import pytest

from customers.models import Address
from ordering.models import Order, OrderStatus

pytestmark = pytest.mark.django_db


def test_order_address_resolves_to_text_not_a_uuid(
    api_client, operator_user, hub, customer, service, apartment
):
    apartment.address = "12 MG Road"
    apartment.save(update_fields=["address"])
    address = Address.objects.create(
        customer=customer, apartment=apartment, flat_no="4B", landmark="Near the water tank"
    )
    order = Order.objects.create(
        hub=hub,
        customer=customer,
        service=service,
        address=address,
        channel="COUNTER",
        status=OrderStatus.AT_HUB,
    )

    api_client.force_authenticate(user=operator_user)
    resp = api_client.get(f"/api/v1/orders/{order.id}/")

    assert resp.status_code == 200, resp.data
    assert resp.data["address"] != str(address.id)
    assert "Flat 4B" in resp.data["address"]
    assert "Test Towers" in resp.data["address"]
    assert "12 MG Road" in resp.data["address"]
    assert "Near the water tank" in resp.data["address"]


def test_order_address_is_null_when_order_has_no_address(
    api_client, operator_user, hub, customer, service
):
    order = Order.objects.create(
        hub=hub, customer=customer, service=service, channel="COUNTER", status=OrderStatus.AT_HUB
    )

    api_client.force_authenticate(user=operator_user)
    resp = api_client.get(f"/api/v1/orders/{order.id}/")

    assert resp.status_code == 200, resp.data
    assert resp.data["address"] is None
