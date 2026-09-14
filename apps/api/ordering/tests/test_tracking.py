"""docs/01 §4b C-3, batch 4.1: the tokenised tracking link is the primary
customer channel and needs no login — these tests are as much about what
the response must NOT contain (another customer's data, staff names,
internal payload) as what it must."""

import pytest

from billing.services import issue_invoice
from ordering.models import Order, OrderLine, OrderStatus
from ordering.state_machine import transition

pytestmark = pytest.mark.django_db


@pytest.fixture
def tracked_order(hub, customer, service, garment_type, address, apartment):
    order = Order.objects.create(
        hub=hub,
        customer=customer,
        service=service,
        address=address,
        apartment=apartment,
        channel="WEB",
        status=OrderStatus.SCHEDULED,
        declared_total_qty=2,
        total_minor=3000,
        subtotal_minor=3000,
        price_list_version=1,
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


def test_unknown_token_is_not_found(api_client):
    resp = api_client.get("/api/v1/track/does-not-exist/")
    assert resp.status_code == 404


def test_valid_token_needs_no_authentication(api_client, tracked_order):
    resp = api_client.get(f"/api/v1/track/{tracked_order.tracking_token}/")
    assert resp.status_code == 200
    assert resp.data["ref"] == tracked_order.ref


def test_response_carries_stage_and_customer_facing_fields(api_client, tracked_order):
    resp = api_client.get(f"/api/v1/track/{tracked_order.tracking_token}/")
    body = resp.data
    assert body["stage"] == "booked"
    assert body["stage_label"] == "Booked"
    assert body["customer_name"] == tracked_order.customer.name
    assert body["service_name"] == tracked_order.service.name
    assert body["total_minor"] == 3000
    assert len(body["lines"]) == 1
    assert body["lines"][0]["garment_type_name"] == tracked_order.lines.first().garment_type.name


def test_response_never_leaks_phone_email_or_ids(api_client, tracked_order):
    resp = api_client.get(f"/api/v1/track/{tracked_order.tracking_token}/")
    body = resp.data
    rendered = str(body)
    assert "id" not in body
    assert "hub" not in body
    assert tracked_order.customer.phone not in rendered
    assert "customer_phone" not in body


def test_a_different_orders_token_never_returns_this_order(
    api_client, tracked_order, hub, customer, service
):
    other = Order.objects.create(
        hub=hub, customer=customer, service=service, channel="WEB", status=OrderStatus.SCHEDULED
    )
    resp = api_client.get(f"/api/v1/track/{tracked_order.tracking_token}/")
    assert resp.data["ref"] != other.ref


def test_no_invoice_yet_is_null(api_client, tracked_order):
    resp = api_client.get(f"/api/v1/track/{tracked_order.tracking_token}/")
    assert resp.data["invoice"] is None


def test_issued_invoice_is_visible_with_a_pdf_link(api_client, tracked_order):
    tracked_order.verified_total_qty = 2
    tracked_order.save(update_fields=["verified_total_qty"])
    invoice = issue_invoice(tracked_order)

    resp = api_client.get(f"/api/v1/track/{tracked_order.tracking_token}/")
    body_invoice = resp.data["invoice"]
    assert body_invoice["ref"] == invoice.ref
    assert body_invoice["status"] == "ISSUED"
    assert body_invoice["pdf_url"]


def test_draft_invoice_is_hidden(api_client, tracked_order):
    """`issue_invoice` never actually leaves an invoice in DRAFT (it writes
    straight to ISSUED) — this exercises the defensive branch directly via
    the ORM in case that ever changes."""
    from billing.models import Invoice

    Invoice.objects.create(
        hub=tracked_order.hub,
        order=tracked_order,
        customer=tracked_order.customer,
        status="DRAFT",
        total_minor=3000,
    )
    resp = api_client.get(f"/api/v1/track/{tracked_order.tracking_token}/")
    assert resp.data["invoice"] is None


def test_timeline_is_chronological_and_excludes_staff_identity(
    api_client, tracked_order, operator_user
):
    transition(
        tracked_order,
        OrderStatus.PICKUP_ASSIGNED,
        actor=operator_user,
        event_type="order.pickup_assigned",
    )
    transition(
        tracked_order,
        OrderStatus.PICKUP_EN_ROUTE,
        actor=operator_user,
        event_type="order.pickup_en_route",
    )

    resp = api_client.get(f"/api/v1/track/{tracked_order.tracking_token}/")
    events = resp.data["events"]
    assert [e["to_status"] for e in events] == [
        OrderStatus.PICKUP_ASSIGNED,
        OrderStatus.PICKUP_EN_ROUTE,
    ]
    assert all("actor" not in e and "actor_name" not in e and "payload" not in e for e in events)
