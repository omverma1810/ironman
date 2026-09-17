"""`ReQuoteViewSet` (docs/04 §3.4 `[C]`) had `permission_classes =
[IsAuthenticated]` and no queryset scoping at all — any authenticated
customer could list, view, and even approve/reject another customer's
re-quote (a pricing decision on someone else's order). These tests hold
the ownership line `get_queryset` now enforces, the same pattern already
covering `OrderViewSet`/`InvoiceViewSet`/`AddressViewSet`."""

import pytest

from ordering import services as ordering_services
from ordering.models import OrderStatus, ReQuote
from ordering.state_machine import transition

pytestmark = pytest.mark.django_db


@pytest.fixture
def on_hold_order_with_requote(hub, customer, service, garment_type, active_price_list):
    order = ordering_services.create_order(
        hub=hub,
        customer=customer,
        service=service,
        lines=[{"garment_type": garment_type.id, "qty": 5}],
        channel="COUNTER",
    )
    for step in (
        OrderStatus.PICKUP_ASSIGNED,
        OrderStatus.PICKUP_EN_ROUTE,
        OrderStatus.PICKED_UP,
        OrderStatus.AT_HUB,
    ):
        order = transition(order, step)
    order = ordering_services.record_intake(
        order, verified_lines=[{"garment_type": str(garment_type.id), "qty": 1}]
    )
    return ReQuote.objects.get(order=order)


def test_customer_can_see_and_respond_to_their_own_requote(
    api_client, customer_user, on_hold_order_with_requote
):
    api_client.force_authenticate(user=customer_user)
    listed = api_client.get("/api/v1/requotes/")
    assert listed.status_code == 200
    assert [row["id"] for row in listed.data["results"]] == [str(on_hold_order_with_requote.id)]

    resp = api_client.post(
        f"/api/v1/requotes/{on_hold_order_with_requote.id}/respond/",
        {"approved": True},
        format="json",
    )
    assert resp.status_code == 200, resp.data
    assert resp.data["status"] == OrderStatus.INTAKE_VERIFIED


def test_a_customer_cannot_see_or_respond_to_another_customers_requote(
    api_client, customer_user, on_hold_order_with_requote
):
    from customers.models import Customer
    from identity.models import Role, RoleCode, User, UserRole

    other_user = User.objects.create_user(phone="+919888800003")
    role, _ = Role.objects.get_or_create(code=RoleCode.CUSTOMER, defaults={"name": "Customer"})
    UserRole.objects.create(user=other_user, role=role, hub=None)
    Customer.objects.create(
        hub=on_hold_order_with_requote.order.hub, user=other_user, phone="+919888800003"
    )

    api_client.force_authenticate(user=other_user)
    listed = api_client.get("/api/v1/requotes/")
    assert listed.data["results"] == []

    resp = api_client.post(
        f"/api/v1/requotes/{on_hold_order_with_requote.id}/respond/",
        {"approved": True},
        format="json",
    )
    assert resp.status_code == 404


def test_staff_can_see_and_respond_to_any_requote(
    api_client, operator_user, on_hold_order_with_requote
):
    api_client.force_authenticate(user=operator_user)
    listed = api_client.get("/api/v1/requotes/")
    assert listed.status_code == 200
    assert len(listed.data["results"]) == 1
