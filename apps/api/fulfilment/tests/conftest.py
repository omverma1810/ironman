"""fulfilment-local fixtures. Orders are built directly via the ORM at
whatever status a given job flow needs — fulfilment only cares that the
order is at SCHEDULED (for a pickup) or READY (for a delivery), not how it
got there (mirrors custody/tests/conftest.py)."""

from __future__ import annotations

from datetime import timedelta

import pytest
from django.utils import timezone

from ordering.models import Order, OrderLine, OrderStatus


@pytest.fixture
def scheduled_order(hub, customer, service, garment_type):
    order = Order.objects.create(
        hub=hub,
        customer=customer,
        service=service,
        channel="COUNTER",
        status=OrderStatus.SCHEDULED,
        declared_total_qty=2,
        total_minor=3000,
        pickup_slot_start=timezone.now(),
        pickup_slot_end=timezone.now() + timedelta(hours=2),
    )
    OrderLine.objects.create(
        hub=hub,
        order=order,
        garment_type=garment_type,
        declared_qty=2,
        unit_price_minor=1500,
        line_total_minor=3000,
    )
    return order


@pytest.fixture
def ready_order(hub, customer, service, garment_type):
    order = Order.objects.create(
        hub=hub,
        customer=customer,
        service=service,
        channel="COUNTER",
        status=OrderStatus.READY,
        declared_total_qty=2,
        verified_total_qty=2,
        total_minor=3000,
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
    return order


@pytest.fixture
def ready_order_bag(ready_order):
    from custody.services import create_bag_for_order

    return create_bag_for_order(ready_order)


@pytest.fixture
def route_day(hub, cluster):
    from fulfilment.models import RouteDay

    return RouteDay.objects.create(hub=hub, cluster=cluster, date=timezone.localdate())


@pytest.fixture
def pickup_job(route_day, scheduled_order, field_user):
    from fulfilment import services

    services.assign_route_day(
        route_day,
        staff_ids=[field_user.id],
        jobs=[{"order_id": scheduled_order.id, "kind": "PICKUP", "assigned_to": field_user.id}],
    )
    return route_day.jobs.get(order=scheduled_order, kind="PICKUP")


@pytest.fixture
def delivery_job(route_day, ready_order, ready_order_bag, field_user):
    from fulfilment import services

    services.assign_route_day(
        route_day,
        staff_ids=[field_user.id],
        jobs=[{"order_id": ready_order.id, "kind": "DELIVERY", "assigned_to": field_user.id}],
    )
    return route_day.jobs.get(order=ready_order, kind="DELIVERY")
