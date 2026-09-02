"""custody-local fixtures. An order with verified quantities is built
directly via the ORM rather than driving ordering's full state machine —
custody only cares that verified_qty exists, not how the order got there."""

from __future__ import annotations

import pytest

from ordering.models import Order, OrderLine, OrderStatus


@pytest.fixture
def verified_order(hub, customer, service, garment_type, garment_type_trouser):
    order = Order.objects.create(
        hub=hub,
        customer=customer,
        service=service,
        channel="COUNTER",
        status=OrderStatus.AT_HUB,
        declared_total_qty=3,
        verified_total_qty=3,
        total_minor=4800,
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
    OrderLine.objects.create(
        hub=hub,
        order=order,
        garment_type=garment_type_trouser,
        declared_qty=1,
        verified_qty=1,
        unit_price_minor=1800,
        line_total_minor=1800,
    )
    return order


@pytest.fixture
def bag(verified_order):
    from custody.services import create_bag_for_order

    return create_bag_for_order(verified_order)
