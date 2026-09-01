"""
Guarded state transitions (docs/03 §3.2, docs/01 §5.1). Every status change
goes through `transition()` — never a direct `order.status = X`. It
validates the source state, takes a row lock, writes the OrderEvent, and
writes an AuditEvent for sensitive actions.
"""

from __future__ import annotations

from django.db import transaction
from django.utils import timezone

from common import audit
from common.errors import InvalidStateTransition
from ordering.models import Order, OrderEvent, OrderStatus

# The allowed graph (docs/01 §5.1 diagram). Keys are source states; values
# are the states directly reachable from them.
ALLOWED: dict[str, set[str]] = {
    OrderStatus.DRAFT: {
        OrderStatus.PENDING_CONFIRMATION,
        OrderStatus.SCHEDULED,
        OrderStatus.CANCELLED,
    },
    OrderStatus.PENDING_CONFIRMATION: {OrderStatus.SCHEDULED, OrderStatus.CANCELLED},
    # AT_HUB direct from SCHEDULED: a counter/walk-in order (R-103) has no
    # pickup leg at all — the customer is already standing at the hub, so
    # handing the garments over at the counter IS the intake.
    OrderStatus.SCHEDULED: {
        OrderStatus.PICKUP_ASSIGNED,
        OrderStatus.CANCELLED,
        OrderStatus.SCHEDULED,
        OrderStatus.AT_HUB,
    },
    OrderStatus.PICKUP_ASSIGNED: {
        OrderStatus.PICKUP_EN_ROUTE,
        OrderStatus.PICKUP_FAILED,
        OrderStatus.CANCELLED,
    },
    OrderStatus.PICKUP_EN_ROUTE: {OrderStatus.PICKED_UP, OrderStatus.PICKUP_FAILED},
    OrderStatus.PICKUP_FAILED: {OrderStatus.SCHEDULED, OrderStatus.CANCELLED},
    OrderStatus.PICKED_UP: {OrderStatus.AT_HUB},
    OrderStatus.AT_HUB: {OrderStatus.INTAKE_VERIFIED, OrderStatus.ON_HOLD},
    OrderStatus.INTAKE_VERIFIED: {OrderStatus.IN_PRODUCTION, OrderStatus.ON_HOLD},
    OrderStatus.IN_PRODUCTION: {OrderStatus.READY, OrderStatus.ON_HOLD},
    OrderStatus.READY: {OrderStatus.DELIVERY_ASSIGNED, OrderStatus.ON_HOLD},
    OrderStatus.DELIVERY_ASSIGNED: {OrderStatus.OUT_FOR_DELIVERY, OrderStatus.CANCELLED},
    OrderStatus.OUT_FOR_DELIVERY: {OrderStatus.DELIVERED, OrderStatus.DELIVERY_FAILED},
    OrderStatus.DELIVERY_FAILED: {OrderStatus.OUT_FOR_DELIVERY, OrderStatus.RETURNED_TO_HUB},
    OrderStatus.RETURNED_TO_HUB: {OrderStatus.DELIVERY_ASSIGNED, OrderStatus.ON_HOLD},
    OrderStatus.ON_HOLD: {
        OrderStatus.INTAKE_VERIFIED,
        OrderStatus.IN_PRODUCTION,
        OrderStatus.READY,
        OrderStatus.DELIVERY_ASSIGNED,
        OrderStatus.CANCELLED,
    },
    OrderStatus.DELIVERED: {OrderStatus.CLOSED},
    OrderStatus.CANCELLED: set(),
    OrderStatus.CLOSED: set(),
}

# Transitions that always write an AuditEvent in addition to the
# always-written OrderEvent (docs/06 §3.3 — money- and trust-sensitive).
SENSITIVE = {OrderStatus.CANCELLED, OrderStatus.ON_HOLD}

TIMESTAMP_FIELD_ON_ENTER = {
    OrderStatus.PICKED_UP: "picked_up_at",
    OrderStatus.DELIVERED: "delivered_at",
}


@transaction.atomic
def transition(
    order: Order,
    to_status: str,
    *,
    actor=None,
    event_type: str | None = None,
    payload: dict | None = None,
) -> Order:
    order = Order.objects.select_for_update().get(pk=order.pk)
    from_status = order.status

    if to_status == from_status == OrderStatus.SCHEDULED:
        pass  # reschedule — same state, different slot; allowed explicitly
    elif to_status not in ALLOWED.get(from_status, set()):
        raise InvalidStateTransition(
            f"Order {order.ref} can't move from {order.get_status_display()} "
            f"to {OrderStatus(to_status).label} directly.",
            detail=f"Allowed from {from_status}: {sorted(ALLOWED.get(from_status, set()))}",
        )

    order.status = to_status
    field = TIMESTAMP_FIELD_ON_ENTER.get(to_status)
    if field and not getattr(order, field):
        setattr(order, field, timezone.now())

    if to_status == OrderStatus.CLOSED:
        _guard_close(order)

    update_fields = ["status"]
    if field:
        update_fields.append(field)
    order.save(update_fields=update_fields)

    OrderEvent.objects.create(
        order=order,
        event_type=event_type or f"status.{to_status.lower()}",
        from_status=from_status,
        to_status=to_status,
        actor=actor,
        actor_role=getattr(actor, "primary_role_code", "") if actor else "",
        payload=payload or {},
    )

    if to_status in SENSITIVE:
        audit.record(
            action=f"order.{to_status.lower()}",
            object_type="Order",
            object_id=str(order.id),
            hub=order.hub,
            actor=actor,
            before={"status": from_status},
            after={"status": to_status},
        )

    if to_status == OrderStatus.DELIVERED:
        order.customer.record_delivered_order(gross_minor=order.total_minor)

    return order


def _guard_close(order: Order) -> None:
    """Invariant (docs/02 §5): CLOSED requires PAID/WRITTEN_OFF and no
    open exception."""

    if order.payment_status not in ("PAID", "WRITTEN_OFF"):
        raise InvalidStateTransition(
            f"{order.ref} can't be closed — payment status is {order.payment_status}.",
        )
    if order.exceptions.filter(status__in=["OPEN", "INVESTIGATING"]).exists():
        raise InvalidStateTransition(f"{order.ref} can't be closed — it has an open exception.")


def cancel(order: Order, *, actor=None, reason: str) -> Order:
    if order.status in (OrderStatus.DELIVERED, OrderStatus.CLOSED, OrderStatus.CANCELLED):
        raise InvalidStateTransition(f"{order.ref} can no longer be cancelled.")
    order = transition(
        order,
        OrderStatus.CANCELLED,
        actor=actor,
        event_type="order.cancelled",
        payload={"reason": reason},
    )
    order.cancelled_by = actor
    order.cancelled_reason = reason
    order.cancelled_at = timezone.now()
    order.save(update_fields=["cancelled_by", "cancelled_reason", "cancelled_at"])
    return order
