"""docs/00 §4 G-6 / docs/08 batch 2.9: the exceptions queue's triage,
assignment and resolution flow, tested as real API calls per docs/06
§3.1's "the permission matrix is only real if it is tested code"."""

import pytest

from ordering.models import Order, OrderStatus

pytestmark = pytest.mark.django_db


@pytest.fixture
def order(hub, customer, service):
    return Order.objects.create(
        hub=hub, customer=customer, service=service, channel="COUNTER", status=OrderStatus.AT_HUB
    )


def test_operator_can_raise_an_exception(api_client, operator_user, order):
    api_client.force_authenticate(user=operator_user)
    resp = api_client.post(
        "/api/v1/order-exceptions/",
        {"order": str(order.id), "kind": "DAMAGED", "severity": "HIGH", "description": "torn hem"},
        format="json",
    )
    assert resp.status_code == 201, resp.data
    assert resp.data["status"] == "OPEN"
    assert resp.data["raised_by"] == operator_user.id
    assert resp.data["order_ref"] == order.ref


def test_field_staff_cannot_raise_an_exception(api_client, field_user, order):
    api_client.force_authenticate(user=field_user)
    resp = api_client.post(
        "/api/v1/order-exceptions/",
        {"order": str(order.id), "kind": "LOST", "severity": "HIGH", "description": "missing item"},
        format="json",
    )
    assert resp.status_code == 403


def test_customer_cannot_raise_an_exception(api_client, customer_user, order):
    api_client.force_authenticate(user=customer_user)
    resp = api_client.post(
        "/api/v1/order-exceptions/",
        {"order": str(order.id), "kind": "LOST", "severity": "HIGH", "description": "missing item"},
        format="json",
    )
    assert resp.status_code == 403


def test_anonymous_cannot_raise_an_exception(api_client, order):
    resp = api_client.post(
        "/api/v1/order-exceptions/",
        {"order": str(order.id), "kind": "LOST", "severity": "HIGH", "description": "missing item"},
        format="json",
    )
    assert resp.status_code in (401, 403)


def test_operator_can_assign_and_resolve(api_client, operator_user, admin_user, order):
    from ordering.models import OrderException

    exc = OrderException.objects.create(
        hub=order.hub,
        order=order,
        kind="COMPLAINT",
        severity="MEDIUM",
        description="late delivery",
        raised_by=operator_user,
    )

    api_client.force_authenticate(user=operator_user)
    resp = api_client.patch(
        f"/api/v1/order-exceptions/{exc.id}/",
        {"assigned_to": str(admin_user.id), "status": "INVESTIGATING"},
        format="json",
    )
    assert resp.status_code == 200, resp.data
    assert resp.data["assigned_to_name"] == admin_user.full_name

    resp = api_client.patch(
        f"/api/v1/order-exceptions/{exc.id}/",
        {"status": "RESOLVED", "resolution": "goodwill credit issued", "cost_minor": 5000},
        format="json",
    )
    assert resp.status_code == 200, resp.data
    assert resp.data["status"] == "RESOLVED"
    assert resp.data["cost_minor"] == 5000


def test_field_staff_cannot_update_an_exception(api_client, field_user, operator_user, order):
    from ordering.models import OrderException

    exc = OrderException.objects.create(
        hub=order.hub,
        order=order,
        kind="LOST",
        severity="HIGH",
        description="x",
        raised_by=operator_user,
    )
    api_client.force_authenticate(user=field_user)
    resp = api_client.patch(
        f"/api/v1/order-exceptions/{exc.id}/", {"status": "INVESTIGATING"}, format="json"
    )
    assert resp.status_code == 403


def test_list_filters_by_status_kind_severity_and_assignee(
    api_client, operator_user, admin_user, order
):
    from ordering.models import OrderException

    OrderException.objects.create(
        hub=order.hub,
        order=order,
        kind="DAMAGED",
        severity="HIGH",
        status="OPEN",
        description="a",
        raised_by=operator_user,
    )
    assigned = OrderException.objects.create(
        hub=order.hub,
        order=order,
        kind="LOST",
        severity="LOW",
        status="INVESTIGATING",
        description="b",
        raised_by=operator_user,
        assigned_to=admin_user,
    )

    api_client.force_authenticate(user=operator_user)
    resp = api_client.get("/api/v1/order-exceptions/", {"status": "INVESTIGATING"})
    ids = {row["id"] for row in resp.data["results"]}
    assert ids == {str(assigned.id)}

    resp = api_client.get("/api/v1/order-exceptions/", {"assigned_to": str(admin_user.id)})
    ids = {row["id"] for row in resp.data["results"]}
    assert ids == {str(assigned.id)}

    resp = api_client.get("/api/v1/order-exceptions/", {"kind": "DAMAGED", "severity": "HIGH"})
    assert len(resp.data["results"]) == 1


def test_operator_only_sees_own_hub_exceptions(api_client, operator_user, order):
    from ordering.models import OrderException
    from territory.models import Hub

    other_hub = Hub.objects.create(code="OTHER-HUB-EXC", name="Other Hub Exceptions")
    other_order = Order.objects.create(
        hub=other_hub,
        customer=order.customer,
        service=order.service,
        channel="COUNTER",
        status=OrderStatus.AT_HUB,
    )
    OrderException.objects.create(
        hub=other_hub, order=other_order, kind="LOST", severity="HIGH", description="x"
    )
    mine = OrderException.objects.create(
        hub=order.hub, order=order, kind="LOST", severity="HIGH", description="y"
    )

    api_client.force_authenticate(user=operator_user)
    resp = api_client.get("/api/v1/order-exceptions/")
    ids = {row["id"] for row in resp.data["results"]}
    assert ids == {str(mine.id)}
