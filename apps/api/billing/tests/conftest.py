"""billing-local fixtures. An order with verified quantities is built
directly via the ORM rather than driving ordering's full state machine —
billing only cares that verified_qty (and the totals `record_intake`
would have derived from it) already exist, not how the order got there
(same reasoning as `custody.tests.conftest.verified_order`)."""

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
        status=OrderStatus.INTAKE_VERIFIED,
        declared_total_qty=3,
        verified_total_qty=3,
        subtotal_minor=4800,
        total_minor=4800,
        price_list_version=1,
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
def gst_hub(hub):
    from territory.models import TaxSettings

    TaxSettings.objects.update_or_create(
        hub=hub,
        defaults={"gst_enabled": True, "gstin": "29AAAAA0000A1Z5", "default_rate_bps": 1800},
    )
    return hub


@pytest.fixture
def field_job(hub, cluster, field_user, verified_order):
    """A delivery job assigning `field_user` to `verified_order` — just
    enough of `fulfilment`'s shape for `InvoiceViewSet`'s Field-scoping
    (`order__jobs__assigned_to`) to have something real to filter on."""
    from django.utils import timezone

    from fulfilment.models import Job, JobKind, RouteDay

    route_day = RouteDay.objects.create(hub=hub, cluster=cluster, date=timezone.localdate())
    return Job.objects.create(
        hub=hub,
        route_day=route_day,
        order=verified_order,
        kind=JobKind.DELIVERY,
        assigned_to=field_user,
    )
