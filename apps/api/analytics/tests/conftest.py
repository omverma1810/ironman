"""Fixtures shared by the analytics tests: a pinned clock and one built
week of orders, invoices, jobs and feedback."""

from __future__ import annotations

from datetime import timedelta

import pytest
from freezegun import freeze_time

from analytics.tests.factories import NOW, WEEK, _delivered, at
from billing import services as billing_services
from customers.models import Customer
from fulfilment.models import Job, JobAttempt, RouteDay
from growth import services as growth_services
from growth.models import Feedback, PartnerKind
from ordering.models import Order, OrderStatus


@pytest.fixture(autouse=True)
def frozen_clock():
    with freeze_time(NOW):
        yield


@pytest.fixture
def week(hub, cluster, apartment, service, garment_type, active_price_list, admin_user):
    partner = growth_services.onboard_partner(
        hub=hub, kind=PartnerKind.WATCHMAN, name="Ramesh", phone="9876500021"
    )
    code = growth_services.create_referral_code(hub=hub, owner_partner=partner).code
    c = {
        n: Customer.objects.create(hub=hub, name=f"{n} Rao", phone=f"+91988800{i:04d}")
        for i, n in enumerate(["Asha", "Bina", "Chitra", "Deepa"])
    }
    # Asha: came via the watchman, first order this week, second order this week too.
    a1 = _delivered(hub, c["Asha"], service, garment_type, day=WEEK, code=code, apt=apartment)
    _delivered(hub, c["Asha"], service, garment_type, day=WEEK + timedelta(days=2), apt=apartment)
    # Bina: an old customer who came back this week.
    _delivered(hub, c["Bina"], service, garment_type, day=WEEK - timedelta(days=20))
    b2 = _delivered(hub, c["Bina"], service, garment_type, day=WEEK + timedelta(days=3), qty=4)
    # Chitra: new this week, one order.
    _delivered(hub, c["Chitra"], service, garment_type, day=WEEK + timedelta(days=4))
    # Deepa: booked, never delivered — a lead, not a customer.
    Order.objects.create(
        hub=hub, customer=c["Deepa"], service=service, status=OrderStatus.CANCELLED
    )

    billing_services.record_order_cost(a1, kind="CONSUMABLE", amount_minor=200)
    billing_services.record_order_cost(b2, kind="LABOUR", amount_minor=900)

    day = RouteDay.objects.create(hub=hub, cluster=cluster, date=WEEK)
    Job.objects.create(
        hub=hub,
        route_day=day,
        order=a1,
        kind="DELIVERY",
        status="DONE",
        slot_end=at(WEEK, 13),
        completed_at=at(WEEK, 12),
    )
    Job.objects.create(
        hub=hub,
        route_day=day,
        order=b2,
        kind="DELIVERY",
        status="DONE",
        slot_end=at(WEEK, 10),
        completed_at=at(WEEK, 12),
    )
    failed = Job.objects.create(
        hub=hub, route_day=day, order=b2, kind="PICKUP", status="FAILED", slot_end=at(WEEK, 9)
    )
    JobAttempt.objects.create(
        job=failed, attempt_no=1, outcome="FAILED", failure_reason="CUSTOMER_ABSENT", at=at(WEEK, 9)
    )

    Feedback.objects.create(hub=hub, order=a1, customer=c["Asha"], rating=5)
    fb = Feedback.objects.create(hub=hub, order=b2, customer=c["Bina"], rating=2)
    Feedback.objects.filter(pk=fb.pk).update(created_at=at(WEEK + timedelta(days=3)))
    Feedback.objects.filter(order=a1).update(created_at=at(WEEK + timedelta(days=1)))
    return c
