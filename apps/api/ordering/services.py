"""Order creation, scheduling and intake (docs/04 §3.4). Booking, counter
intake and the re-quote flow all call `catalog.services.quote()` for
pricing and `territory.services.book_slot()` for capacity — this module
never computes a price or decrements capacity itself (docs/03 §3.1
boundary rule)."""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

from django.conf import settings
from django.db import transaction
from django.utils import timezone

import catalog.services as catalog_services
import territory.services as territory_services
from common.errors import ApiError
from customers.models import Customer
from ordering.models import Order, OrderLine, OrderStatus, ReQuote
from ordering.state_machine import transition


def get_order(order_id):
    return Order.objects.get(pk=order_id)


@transaction.atomic
def create_order(
    *,
    hub,
    customer: Customer,
    service,
    lines: list[dict],
    channel: str,
    address=None,
    apartment=None,
    pickup_capacity=None,
    notes: str = "",
    special_instructions: str = "",
    actor=None,
    referral_code: str = "",
) -> Order:
    is_first_order = customer.lifetime_orders == 0
    quote_result = catalog_services.quote(
        hub_id=hub.id,
        service_id=service.id,
        lines=lines,
        apartment_id=apartment.id if apartment else None,
        is_first_order=is_first_order,
    )

    order = Order.objects.create(
        hub=hub,
        customer=customer,
        address=address,
        apartment=apartment,
        service=service,
        channel=channel,
        status=OrderStatus.DRAFT,
        declared_total_qty=sum(int(entry["qty"]) for entry in lines),
        price_list_version=quote_result.price_list_version,
        estimate_minor=quote_result.total_minor,
        subtotal_minor=quote_result.subtotal_minor,
        discount_minor=quote_result.discount_minor,
        total_minor=quote_result.total_minor,
        offers_applied=quote_result.offers_applied,
        notes=notes,
        special_instructions=special_instructions,
        referral_code=referral_code,
        created_by=actor,
    )

    for line in quote_result.lines:
        OrderLine.objects.create(
            hub=hub,
            order=order,
            garment_type_id=line.garment_type_id,
            declared_qty=line.qty,
            unit_price_minor=line.unit_price_minor,
            line_total_minor=line.line_total_minor,
        )

    if pickup_capacity:
        capacity = territory_services.book_slot(pickup_capacity.id)
        order.pickup_capacity = capacity
        order.pickup_slot_start = timezone.make_aware(
            timezone.datetime.combine(capacity.date, capacity.window_start)
        )
        order.pickup_slot_end = timezone.make_aware(
            timezone.datetime.combine(capacity.date, capacity.window_end)
        )
        order.pickup_promised_at = order.pickup_slot_end
        order.save(
            update_fields=[
                "pickup_capacity",
                "pickup_slot_start",
                "pickup_slot_end",
                "pickup_promised_at",
            ]
        )
        order = transition(order, OrderStatus.SCHEDULED, actor=actor, event_type="order.scheduled")
    else:
        target = (
            OrderStatus.PENDING_CONFIRMATION if channel == "WHATSAPP" else OrderStatus.SCHEDULED
        )
        order = transition(order, target, actor=actor, event_type="order.created")

    return order


@transaction.atomic
def reschedule(order: Order, *, pickup_capacity, actor=None) -> Order:
    """A reschedule creates a NEW promise; the original slot is released.
    The state machine allows SCHEDULED -> SCHEDULED explicitly for this
    (docs/01 §5.1 / 07 §2⑨: whoever asks for the reschedule owns the miss
    on the original promise — recorded via the OrderEvent payload)."""
    if order.status not in (OrderStatus.SCHEDULED, OrderStatus.PICKUP_FAILED):
        raise ApiError(
            f"{order.ref} can't be rescheduled from its current status.",
            code="invalid_state_transition",
            status_code=409,
        )

    old_capacity_id = order.pickup_capacity_id
    capacity = territory_services.book_slot(pickup_capacity.id)
    if old_capacity_id:
        territory_services.release_slot(old_capacity_id)

    order.pickup_capacity = capacity
    order.pickup_slot_start = timezone.make_aware(
        timezone.datetime.combine(capacity.date, capacity.window_start)
    )
    order.pickup_slot_end = timezone.make_aware(
        timezone.datetime.combine(capacity.date, capacity.window_end)
    )
    order.pickup_promised_at = order.pickup_slot_end
    order.save(
        update_fields=[
            "pickup_capacity",
            "pickup_slot_start",
            "pickup_slot_end",
            "pickup_promised_at",
        ]
    )
    return transition(order, OrderStatus.SCHEDULED, actor=actor, event_type="order.rescheduled")


@transaction.atomic
def record_intake(
    order: Order, *, verified_lines: list[dict], actor=None, notes: str = ""
) -> Order:
    """docs/02 §3.5 / ADR-008: verified counts drive billing, not the
    declared estimate. Variance beyond the configured threshold pauses the
    order in a ReQuote rather than silently rebilling the customer."""
    if order.status != OrderStatus.AT_HUB:
        raise ApiError(
            f"{order.ref} must be at the hub before intake can be recorded.",
            code="invalid_state_transition",
            status_code=409,
        )

    by_garment = {str(v["garment_type"]): int(v["qty"]) for v in verified_lines}
    total_verified = 0
    quote_lines = []
    for line in order.lines.all():
        verified_qty = by_garment.get(str(line.garment_type_id), 0)
        line.verified_qty = verified_qty
        line.save(update_fields=["verified_qty"])
        total_verified += verified_qty
        if verified_qty > 0:
            quote_lines.append({"garment_type": line.garment_type_id, "qty": verified_qty})

    order.verified_total_qty = total_verified
    old_total = order.total_minor

    is_first_order = order.customer.lifetime_orders == 0
    result = catalog_services.quote(
        hub_id=order.hub_id,
        service_id=order.service_id,
        lines=quote_lines,
        apartment_id=order.apartment_id,
        is_first_order=is_first_order,
    )
    new_total = result.total_minor

    threshold_qty = settings.IRONMAN["REQUOTE_VARIANCE_QTY"]
    threshold_pct = Decimal(str(settings.IRONMAN["REQUOTE_VARIANCE_PCT"]))
    qty_diff = abs(total_verified - order.declared_total_qty)
    value_diff = abs(new_total - old_total)
    pct_diff = Decimal(value_diff) / Decimal(max(old_total, 1))

    order.subtotal_minor = result.subtotal_minor
    order.discount_minor = result.discount_minor
    order.total_minor = new_total
    order.notes = f"{order.notes}\n[intake] {notes}".strip()

    needs_requote = qty_diff > threshold_qty and pct_diff > threshold_pct

    if needs_requote:
        order.save(
            update_fields=[
                "verified_total_qty",
                "subtotal_minor",
                "discount_minor",
                "total_minor",
                "notes",
            ]
        )
        ReQuote.objects.create(
            hub=order.hub,
            order=order,
            reason=f"Verified count differs by {qty_diff} items",
            old_total_minor=old_total,
            new_total_minor=new_total,
        )
        return transition(
            order,
            OrderStatus.ON_HOLD,
            actor=actor,
            event_type="order.requote_raised",
            payload={"old_total_minor": old_total, "new_total_minor": new_total},
        )

    order.save(
        update_fields=[
            "verified_total_qty",
            "subtotal_minor",
            "discount_minor",
            "total_minor",
            "notes",
        ]
    )
    return transition(
        order, OrderStatus.INTAKE_VERIFIED, actor=actor, event_type="order.intake_verified"
    )


@transaction.atomic
def resolve_requote(requote: ReQuote, *, approved: bool, actor=None) -> Order:
    order = requote.order
    requote.decision = ReQuote.Decision.APPROVED if approved else ReQuote.Decision.REJECTED
    requote.decided_at = timezone.now()
    requote.save(update_fields=["decision", "decided_at"])

    if approved:
        return transition(
            order, OrderStatus.INTAKE_VERIFIED, actor=actor, event_type="order.requote_approved"
        )

    order.total_minor = requote.old_total_minor
    order.save(update_fields=["total_minor"])
    return transition(
        order,
        OrderStatus.CANCELLED,
        actor=actor,
        event_type="order.requote_rejected",
        payload={"reason": "customer rejected re-quote"},
    )


# ── Job-driven transitions (docs/02 §3.7) ──────────────────────────────────
# `fulfilment` drives the pickup/delivery legs of the order state machine
# through these — never `ordering.state_machine.transition` directly — the
# same boundary custody keeps around `GarmentLine.stage` vs `Order.status`.


@transaction.atomic
def assign_pickup(order: Order, *, actor=None) -> Order:
    return transition(
        order, OrderStatus.PICKUP_ASSIGNED, actor=actor, event_type="order.pickup_assigned"
    )


@transaction.atomic
def mark_pickup_en_route(order: Order, *, actor=None) -> Order:
    return transition(
        order, OrderStatus.PICKUP_EN_ROUTE, actor=actor, event_type="order.pickup_en_route"
    )


@transaction.atomic
def mark_picked_up(order: Order, *, actor=None) -> Order:
    """PICKED_UP then straight through to AT_HUB — this pilot's single-hub
    topology means the ride back isn't a separately tracked state (docs/01
    §5.1's PICKED_UP -> AT_HUB edge has no rider action of its own; a
    later phase with multi-leg routes could split this). Also computes
    `delivery_promised_at` from the service's `sla_hours` — the SLA counts
    from the real pickup, not the booking-time estimate, so this is the
    first point that timestamp is knowable."""
    order = transition(order, OrderStatus.PICKED_UP, actor=actor, event_type="order.picked_up")
    order = transition(order, OrderStatus.AT_HUB, actor=actor, event_type="order.arrived_at_hub")
    if not order.delivery_promised_at:
        order.delivery_promised_at = timezone.now() + timedelta(hours=order.service.sla_hours)
        order.save(update_fields=["delivery_promised_at"])
    return order


@transaction.atomic
def mark_pickup_failed(order: Order, *, actor=None, reason: str) -> Order:
    return transition(
        order,
        OrderStatus.PICKUP_FAILED,
        actor=actor,
        event_type="order.pickup_failed",
        payload={"reason": reason},
    )


@transaction.atomic
def assign_delivery(order: Order, *, actor=None, slot_start=None, slot_end=None) -> Order:
    """READY -> DELIVERY_ASSIGNED. Unlike pickup, there's no customer-chosen
    delivery window from booking to carry forward — `Order.delivery_capacity`
    has no equivalent of `pickup_capacity`'s booking-time slot lock (docs/02
    §4) — ops sets the window operationally when planning the route day."""
    if slot_start:
        order.delivery_slot_start = slot_start
        order.delivery_slot_end = slot_end
        order.save(update_fields=["delivery_slot_start", "delivery_slot_end"])
    return transition(
        order, OrderStatus.DELIVERY_ASSIGNED, actor=actor, event_type="order.delivery_assigned"
    )


@transaction.atomic
def mark_out_for_delivery(order: Order, *, actor=None) -> Order:
    return transition(
        order, OrderStatus.OUT_FOR_DELIVERY, actor=actor, event_type="order.out_for_delivery"
    )


@transaction.atomic
def mark_delivered(order: Order, *, actor=None) -> Order:
    return transition(order, OrderStatus.DELIVERED, actor=actor, event_type="order.delivered")


@transaction.atomic
def mark_delivery_failed(order: Order, *, actor=None, reason: str, attempt_no: int) -> Order:
    """docs/01 §5.1: "Attempt 1 or 2 failed ... Retry, or RETURNED_TO_HUB."
    The second failed attempt returns the order to the hub automatically —
    a third rider dispatch needs an ops decision, not another Job."""
    order = transition(
        order,
        OrderStatus.DELIVERY_FAILED,
        actor=actor,
        event_type="order.delivery_failed",
        payload={"reason": reason, "attempt_no": attempt_no},
    )
    if attempt_no >= 2:
        order = transition(
            order, OrderStatus.RETURNED_TO_HUB, actor=actor, event_type="order.returned_to_hub"
        )
    return order
