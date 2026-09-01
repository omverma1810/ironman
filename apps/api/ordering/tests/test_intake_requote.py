"""ADR-008: billing derives from verified quantities, not the declared
estimate. A variance beyond the configured threshold pauses the order in a
ReQuote rather than silently rebilling the customer."""

import pytest

from ordering import services as ordering_services
from ordering.models import OrderStatus, ReQuote
from ordering.state_machine import transition

pytestmark = pytest.mark.django_db


@pytest.fixture
def at_hub_order(
    hub,
    customer,
    service,
    garment_type,
    garment_type_trouser,
    active_price_list,
    address,
    apartment,
):
    order = ordering_services.create_order(
        hub=hub,
        customer=customer,
        service=service,
        lines=[{"garment_type": garment_type.id, "qty": 5}],
        channel="COUNTER",
        address=address,
        apartment=apartment,
    )
    for step in (
        OrderStatus.PICKUP_ASSIGNED,
        OrderStatus.PICKUP_EN_ROUTE,
        OrderStatus.PICKED_UP,
        OrderStatus.AT_HUB,
    ):
        order = transition(order, step)
    return order


def test_intake_within_threshold_goes_straight_to_verified(at_hub_order, garment_type):
    order = ordering_services.record_intake(
        at_hub_order, verified_lines=[{"garment_type": str(garment_type.id), "qty": 4}]
    )
    assert order.status == OrderStatus.INTAKE_VERIFIED
    assert order.verified_total_qty == 4
    assert not ReQuote.objects.filter(order=order).exists()


def test_intake_beyond_threshold_raises_requote_and_holds_order(at_hub_order, garment_type):
    order = ordering_services.record_intake(
        at_hub_order, verified_lines=[{"garment_type": str(garment_type.id), "qty": 1}]
    )
    assert order.status == OrderStatus.ON_HOLD
    requote = ReQuote.objects.get(order=order)
    assert requote.decision == ReQuote.Decision.PENDING
    assert requote.old_total_minor == 5 * 1500
    assert requote.new_total_minor == 1 * 1500


def test_requote_approval_moves_to_intake_verified(at_hub_order, garment_type):
    order = ordering_services.record_intake(
        at_hub_order, verified_lines=[{"garment_type": str(garment_type.id), "qty": 1}]
    )
    requote = ReQuote.objects.get(order=order)
    order = ordering_services.resolve_requote(requote, approved=True)
    assert order.status == OrderStatus.INTAKE_VERIFIED
    requote.refresh_from_db()
    assert requote.decision == ReQuote.Decision.APPROVED


def test_requote_rejection_cancels_order_at_original_price(at_hub_order, garment_type):
    order = ordering_services.record_intake(
        at_hub_order, verified_lines=[{"garment_type": str(garment_type.id), "qty": 1}]
    )
    requote = ReQuote.objects.get(order=order)
    original_total = requote.old_total_minor
    order = ordering_services.resolve_requote(requote, approved=False)
    assert order.status == OrderStatus.CANCELLED
    assert order.total_minor == original_total


def test_intake_rejected_before_order_reaches_hub(
    hub, customer, service, garment_type, active_price_list, address, apartment
):
    from common.errors import ApiError

    order = ordering_services.create_order(
        hub=hub,
        customer=customer,
        service=service,
        lines=[{"garment_type": garment_type.id, "qty": 1}],
        channel="COUNTER",
        address=address,
        apartment=apartment,
    )
    assert order.status == OrderStatus.SCHEDULED
    with pytest.raises(ApiError) as exc:
        ordering_services.record_intake(
            order, verified_lines=[{"garment_type": str(garment_type.id), "qty": 1}]
        )
    assert exc.value.code == "invalid_state_transition"
