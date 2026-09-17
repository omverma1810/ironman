"""`growth.services.submit_feedback` and `FeedbackViewSet` (docs/04 —
growth, docs/07 §"Customer Feedback"): a customer rates their own
delivered order once; a ≤2 rating raises an `OrderException` instead of
just sitting as a data point; staff see and moderate everything, scoped
to nothing (a founder's "are customers happy" view is cross-hub)."""

import pytest

from common.errors import ApiError
from growth.models import Feedback
from growth.services import submit_feedback
from ordering import services as ordering_services
from ordering.models import OrderException, OrderStatus
from ordering.state_machine import transition

pytestmark = pytest.mark.django_db


@pytest.fixture
def delivered_order(hub, customer, service, garment_type, active_price_list, address, apartment):
    order = ordering_services.create_order(
        hub=hub,
        customer=customer,
        service=service,
        lines=[{"garment_type": garment_type.id, "qty": 2}],
        channel="WEB",
        address=address,
        apartment=apartment,
    )
    for step in (
        OrderStatus.AT_HUB,
        OrderStatus.INTAKE_VERIFIED,
        OrderStatus.IN_PRODUCTION,
        OrderStatus.READY,
        OrderStatus.DELIVERY_ASSIGNED,
        OrderStatus.OUT_FOR_DELIVERY,
        OrderStatus.DELIVERED,
    ):
        order = transition(order, step)
    return order


def test_submit_feedback_creates_a_row(delivered_order, customer):
    feedback = submit_feedback(delivered_order, customer, rating=5, comment="Great service")
    assert feedback.order_id == delivered_order.id
    assert feedback.customer_id == customer.id
    assert feedback.hub_id == delivered_order.hub_id
    assert feedback.rating == 5
    assert not OrderException.objects.filter(order=delivered_order).exists()


def test_low_rating_raises_a_high_severity_exception(delivered_order, customer):
    submit_feedback(delivered_order, customer, rating=1, comment="Shirt came back stained")
    exception = OrderException.objects.get(order=delivered_order)
    assert exception.kind == OrderException.Kind.COMPLAINT
    assert exception.severity == OrderException.Severity.HIGH
    assert exception.sla_due_at is not None


def test_cannot_submit_feedback_twice(delivered_order, customer):
    submit_feedback(delivered_order, customer, rating=4)
    with pytest.raises(ApiError):
        submit_feedback(delivered_order, customer, rating=5)


def test_cannot_submit_feedback_for_undelivered_order(
    hub, customer, service, garment_type, active_price_list, address, apartment
):
    order = ordering_services.create_order(
        hub=hub,
        customer=customer,
        service=service,
        lines=[{"garment_type": garment_type.id, "qty": 1}],
        channel="WEB",
        address=address,
        apartment=apartment,
    )
    with pytest.raises(ApiError):
        submit_feedback(order, customer, rating=5)


def test_cannot_submit_feedback_for_someone_elses_order(delivered_order):
    from customers.models import Customer

    other_customer = Customer.objects.create(
        hub=delivered_order.hub, phone="+919999900001", name="Someone Else"
    )
    with pytest.raises(ApiError):
        submit_feedback(delivered_order, other_customer, rating=5)


def test_customer_can_submit_feedback_via_api(api_client, customer_user, delivered_order):
    api_client.force_authenticate(user=customer_user)
    resp = api_client.post(
        "/api/v1/growth/feedback/",
        {"order": str(delivered_order.id), "rating": 5, "comment": "Fast and clean"},
        format="json",
    )
    assert resp.status_code == 201, resp.data
    assert Feedback.objects.filter(order=delivered_order, rating=5).exists()


def test_customer_cannot_submit_feedback_for_another_customers_order(api_client, delivered_order):
    from identity.models import Role, RoleCode, User, UserRole

    other_user = User.objects.create_user(phone="+919888800009")
    role, _ = Role.objects.get_or_create(code=RoleCode.CUSTOMER, defaults={"name": "Customer"})
    UserRole.objects.create(user=other_user, role=role, hub=None)

    api_client.force_authenticate(user=other_user)
    resp = api_client.post(
        "/api/v1/growth/feedback/",
        {"order": str(delivered_order.id), "rating": 5},
        format="json",
    )
    assert resp.status_code == 403


def test_customer_cannot_list_feedback(api_client, customer_user, delivered_order, customer):
    """docs/04: `GET /growth/feedback` is `[A][B]` only — a customer finds
    out whether they've rated their own order via `Order.has_feedback`
    (see `OrderListSerializer`), not by listing this endpoint."""
    submit_feedback(delivered_order, customer, rating=4)
    api_client.force_authenticate(user=customer_user)
    resp = api_client.get("/api/v1/growth/feedback/")
    assert resp.status_code == 403


def test_order_serializer_reports_has_feedback(api_client, customer_user, delivered_order):
    api_client.force_authenticate(user=customer_user)
    resp = api_client.get(f"/api/v1/orders/{delivered_order.id}/")
    assert resp.status_code == 200
    assert resp.data["has_feedback"] is False

    submit_feedback(delivered_order, delivered_order.customer, rating=5)
    resp = api_client.get(f"/api/v1/orders/{delivered_order.id}/")
    assert resp.data["has_feedback"] is True


def test_staff_can_list_and_moderate_any_feedback(
    api_client, founder_user, delivered_order, customer
):
    feedback = submit_feedback(delivered_order, customer, rating=5)

    api_client.force_authenticate(user=founder_user)
    listed = api_client.get("/api/v1/growth/feedback/")
    assert listed.status_code == 200
    assert len(listed.data["results"]) == 1

    resp = api_client.patch(
        f"/api/v1/growth/feedback/{feedback.id}/", {"is_public": True}, format="json"
    )
    assert resp.status_code == 200, resp.data
    feedback.refresh_from_db()
    assert feedback.is_public is True
    assert feedback.responded_by_id == founder_user.id


def test_operator_cannot_moderate_feedback(api_client, operator_user, delivered_order, customer):
    submit_feedback(delivered_order, customer, rating=5)
    api_client.force_authenticate(user=operator_user)
    resp = api_client.get("/api/v1/growth/feedback/")
    assert resp.status_code == 403
