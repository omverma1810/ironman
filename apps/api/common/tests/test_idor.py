"""docs/06 §7: "IDOR probes on every {id} endpoint with a wrong-tenant
actor". Two hubs and two customers; every object belongs to hub B and to
customer B. Hub-A staff and customer A must not be able to read or change
any of it by guessing its id. "Not found" is the expected answer: a 403
would confirm that the id exists.
"""

from __future__ import annotations

import pytest
from django.utils import timezone

from billing import services as billing_services
from custody.models import Bag
from customers.models import Address, ConsentRecord, Customer, CustomerNote
from fulfilment.models import Job, RouteDay
from growth.models import Feedback, ReferralPartner
from ordering.models import Order, OrderException, OrderLine, OrderStatus, ReQuote
from territory.models import Apartment, Cluster, Hub

pytestmark = pytest.mark.django_db

HIDDEN = {403, 404}


@pytest.fixture
def hub_b(db):
    return Hub.objects.create(code="HUB-B", name="Other Hub", daily_pressing_capacity=100)


@pytest.fixture
def other(hub_b, service, garment_type):
    """Hub B's world, owned by customer B."""
    cluster = Cluster.objects.create(hub=hub_b, name="B Cluster")
    apartment = Apartment.objects.create(
        cluster=cluster, name="B Towers", pincode="500001", launched_on=timezone.localdate()
    )
    customer = Customer.objects.create(hub=hub_b, phone="+919700000099", name="Bina Other")
    address = Address.objects.create(customer=customer, apartment=apartment, flat_no="9")
    order = Order.objects.create(
        hub=hub_b,
        customer=customer,
        service=service,
        address=address,
        status=OrderStatus.SCHEDULED,
        declared_total_qty=1,
        verified_total_qty=1,
        subtotal_minor=1500,
        total_minor=1500,
    )
    OrderLine.objects.create(
        hub=hub_b,
        order=order,
        garment_type=garment_type,
        declared_qty=1,
        verified_qty=1,
        unit_price_minor=1500,
        line_total_minor=1500,
    )
    order.status = OrderStatus.DELIVERED
    order.delivered_at = timezone.now()
    order.save(update_fields=["status", "delivered_at"])
    invoice = billing_services.issue_invoice(order)
    route_day = RouteDay.objects.create(hub=hub_b, cluster=cluster, date=timezone.localdate())
    job = Job.objects.create(hub=hub_b, route_day=route_day, order=order, kind="DELIVERY")
    return {
        "order": order,
        "customer": customer,
        "address": address,
        "invoice": invoice,
        "job": job,
        "route_day": route_day,
        "bag": Bag.objects.create(hub=hub_b, order=order),
        "exception": OrderException.objects.create(
            hub=hub_b, order=order, kind="DAMAGED", description="Torn"
        ),
        "requote": ReQuote.objects.create(
            hub=hub_b, order=order, reason="More shirts", old_total_minor=1500, new_total_minor=3000
        ),
        "feedback": Feedback.objects.create(hub=hub_b, order=order, customer=customer, rating=4),
        "partner": ReferralPartner.objects.create(
            hub=hub_b, kind="WATCHMAN", name="Ravi", phone="+919700000098"
        ),
        "apartment": apartment,
        "cluster": cluster,
        "consent": ConsentRecord.objects.create(customer=customer, purpose="MARKETING"),
        "note": CustomerNote.objects.create(customer=customer, body="Prefers mornings"),
    }


def _paths(o) -> list[str]:
    return [
        f"orders/{o['order'].id}/",
        f"orders/{o['order'].id}/events/",
        f"customers/{o['customer'].id}/",
        f"customer-addresses/{o['address'].id}/",
        f"customer-consents/{o['consent'].id}/",
        f"customer-notes/{o['note'].id}/",
        f"billing/invoices/{o['invoice'].ref}/",
        f"billing/invoices/{o['invoice'].ref}/pdf/",
        f"fulfilment/jobs/{o['job'].id}/",
        f"fulfilment/route-days/{o['route_day'].id}/",
        f"custody/bags/{o['bag'].id}/",
        f"order-exceptions/{o['exception'].id}/",
        f"requotes/{o['requote'].id}/",
        f"growth/feedback/{o['feedback'].id}/",
        f"growth/partners/{o['partner'].id}/",
        f"territory/apartments-admin/{o['apartment'].id}/",
        f"territory/clusters/{o['cluster'].id}/",
    ]


def _probe(api_client, user, paths):
    api_client.force_authenticate(user=user)
    leaks = []
    for path in paths:
        url = f"/api/v1/{path}"
        for method in ("get", "patch", "delete"):
            status = getattr(api_client, method)(url, {}, format="json").status_code
            if status not in HIDDEN and not (method != "get" and status == 405):
                leaks.append(f"{method.upper()} {path} → {status}")
    return leaks


@pytest.mark.parametrize("who", ["operator_user", "admin_user", "field_user"])
def test_hub_a_staff_cannot_reach_hub_b(request, api_client, other, who):
    leaks = _probe(api_client, request.getfixturevalue(who), _paths(other))
    assert not leaks, leaks


def test_one_customer_cannot_reach_another(api_client, customer_user, other):
    leaks = _probe(api_client, customer_user, _paths(other))
    assert not leaks, leaks


def test_hub_a_admin_list_views_hide_hub_b(api_client, admin_user, other):
    api_client.force_authenticate(user=admin_user)
    for path, needle in (
        ("orders/", other["order"].ref),
        ("customers/", "Bina Other"),
        ("billing/invoices/", other["invoice"].ref),
        ("growth/partners/", "Ravi"),
    ):
        body = api_client.get(f"/api/v1/{path}").content.decode()
        assert needle not in body, path
    # ?hub= naming a hub you don't belong to is refused, not honoured.
    resp = api_client.get(f"/api/v1/analytics/weekly?hub={other['order'].hub_id}")
    assert resp.status_code in HIDDEN


def test_staff_cannot_attach_records_to_another_hubs_customer(api_client, admin_user, other):
    api_client.force_authenticate(user=admin_user)
    customer = str(other["customer"].id)
    for path, body in (
        ("customer-addresses/", {"customer": customer, "flat_no": "1"}),
        ("customer-notes/", {"customer": customer, "body": "x"}),
        ("customer-consents/", {"customer": customer, "purpose": "MARKETING"}),
    ):
        assert api_client.post(f"/api/v1/{path}", body, format="json").status_code == 404, path


def test_the_founder_does_see_hub_b(api_client, founder_user, other):
    """The control: the probes above fail for lack of scope, not a bad URL."""
    api_client.force_authenticate(user=founder_user)
    for path in _paths(other):
        assert api_client.get(f"/api/v1/{path}").status_code == 200, path
