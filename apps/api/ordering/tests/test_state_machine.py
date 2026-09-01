"""docs/01 §5.1: three independent lifecycles. These tests hold the state
graph itself accountable — every valid transition succeeds, every invalid
one is rejected with a message an operator can act on."""

import pytest

from common.errors import InvalidStateTransition
from ordering import services as ordering_services
from ordering.models import OrderStatus
from ordering.state_machine import cancel, transition

pytestmark = pytest.mark.django_db


@pytest.fixture
def scheduled_order(hub, customer, service, garment_type, active_price_list, address, apartment):
    return ordering_services.create_order(
        hub=hub,
        customer=customer,
        service=service,
        lines=[{"garment_type": garment_type.id, "qty": 2}],
        channel="WEB",
        address=address,
        apartment=apartment,
    )


def test_create_order_lands_in_scheduled(scheduled_order):
    assert scheduled_order.status == OrderStatus.SCHEDULED
    assert scheduled_order.ref.startswith("ORD-")
    assert scheduled_order.total_minor == 3000


def test_whatsapp_order_without_slot_is_pending_confirmation(
    hub, customer, service, garment_type, active_price_list
):
    order = ordering_services.create_order(
        hub=hub,
        customer=customer,
        service=service,
        lines=[{"garment_type": garment_type.id, "qty": 1}],
        channel="WHATSAPP",
    )
    assert order.status == OrderStatus.PENDING_CONFIRMATION


def test_valid_transition_succeeds_and_writes_event(scheduled_order):
    order = transition(scheduled_order, OrderStatus.PICKUP_ASSIGNED, event_type="test")
    assert order.status == OrderStatus.PICKUP_ASSIGNED
    assert order.events.filter(to_status=OrderStatus.PICKUP_ASSIGNED).exists()


def test_invalid_transition_is_rejected(scheduled_order):
    with pytest.raises(InvalidStateTransition):
        transition(scheduled_order, OrderStatus.DELIVERED)
    scheduled_order.refresh_from_db()
    assert scheduled_order.status == OrderStatus.SCHEDULED  # unchanged


def test_delivered_order_updates_customer_stats(scheduled_order):
    order = scheduled_order
    for step in (
        OrderStatus.PICKUP_ASSIGNED,
        OrderStatus.PICKUP_EN_ROUTE,
        OrderStatus.PICKED_UP,
        OrderStatus.AT_HUB,
        OrderStatus.INTAKE_VERIFIED,
        OrderStatus.IN_PRODUCTION,
        OrderStatus.READY,
        OrderStatus.DELIVERY_ASSIGNED,
        OrderStatus.OUT_FOR_DELIVERY,
        OrderStatus.DELIVERED,
    ):
        order = transition(order, step)

    order.customer.refresh_from_db()
    assert order.customer.lifetime_orders == 1
    assert order.customer.status == "ACTIVE"
    assert order.customer.first_order_at is not None


def test_close_requires_paid_and_no_open_exception(scheduled_order):
    order = scheduled_order
    for step in (
        OrderStatus.PICKUP_ASSIGNED,
        OrderStatus.PICKUP_EN_ROUTE,
        OrderStatus.PICKED_UP,
        OrderStatus.AT_HUB,
        OrderStatus.INTAKE_VERIFIED,
        OrderStatus.IN_PRODUCTION,
        OrderStatus.READY,
        OrderStatus.DELIVERY_ASSIGNED,
        OrderStatus.OUT_FOR_DELIVERY,
        OrderStatus.DELIVERED,
    ):
        order = transition(order, step)

    with pytest.raises(InvalidStateTransition):
        transition(order, OrderStatus.CLOSED)  # still UNPAID

    order.payment_status = "PAID"
    order.save(update_fields=["payment_status"])
    order = transition(order, OrderStatus.CLOSED)
    assert order.status == OrderStatus.CLOSED


def test_close_blocked_by_open_exception(scheduled_order):
    from ordering.models import OrderException

    order = scheduled_order
    for step in (
        OrderStatus.PICKUP_ASSIGNED,
        OrderStatus.PICKUP_EN_ROUTE,
        OrderStatus.PICKED_UP,
        OrderStatus.AT_HUB,
        OrderStatus.INTAKE_VERIFIED,
        OrderStatus.IN_PRODUCTION,
        OrderStatus.READY,
        OrderStatus.DELIVERY_ASSIGNED,
        OrderStatus.OUT_FOR_DELIVERY,
        OrderStatus.DELIVERED,
    ):
        order = transition(order, step)
    order.payment_status = "PAID"
    order.save(update_fields=["payment_status"])
    OrderException.objects.create(
        hub=order.hub, order=order, kind="DAMAGED", description="torn shirt"
    )

    with pytest.raises(InvalidStateTransition):
        transition(order, OrderStatus.CLOSED)


def test_cancel_terminal_states_rejected(scheduled_order):
    order = scheduled_order
    for step in (
        OrderStatus.PICKUP_ASSIGNED,
        OrderStatus.PICKUP_EN_ROUTE,
        OrderStatus.PICKED_UP,
        OrderStatus.AT_HUB,
        OrderStatus.INTAKE_VERIFIED,
        OrderStatus.IN_PRODUCTION,
        OrderStatus.READY,
        OrderStatus.DELIVERY_ASSIGNED,
        OrderStatus.OUT_FOR_DELIVERY,
        OrderStatus.DELIVERED,
    ):
        order = transition(order, step)
    with pytest.raises(InvalidStateTransition):
        cancel(order, reason="too late")


def test_cancel_records_reason_and_actor(scheduled_order, admin_user):
    order = cancel(scheduled_order, actor=admin_user, reason="customer changed mind")
    assert order.status == OrderStatus.CANCELLED
    assert order.cancelled_reason == "customer changed mind"
    assert order.cancelled_by_id == admin_user.id


def test_reschedule_releases_old_slot_and_books_new(scheduled_order, capacity, hub, cluster):
    from django.utils import timezone

    from territory.models import RouteDayCapacity

    second_slot = RouteDayCapacity.objects.create(
        hub=hub,
        cluster=cluster,
        date=timezone.localdate() + timezone.timedelta(days=2),
        window_start="10:00",
        window_end="12:00",
        kind=RouteDayCapacity.Kind.PICKUP,
        capacity=2,
    )
    from ordering import services as ordering_services

    order = ordering_services.reschedule(scheduled_order, pickup_capacity=second_slot)
    assert order.pickup_capacity_id == second_slot.id
    second_slot.refresh_from_db()
    assert second_slot.booked_count == 1
