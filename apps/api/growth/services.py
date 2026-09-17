"""docs/07 §"Customer Feedback": average rating, response rate and trend
all read from here eventually (Phase 6) — this module is just the write
path, batch 4.6's actual scope."""

from __future__ import annotations

from django.db import transaction
from django.utils import timezone

from common.errors import ApiError
from customers.models import Customer
from growth.models import Feedback
from ordering.models import Order, OrderException, OrderStatus

LOW_RATING_THRESHOLD = 2
LOW_RATING_SLA_HOURS = 24


@transaction.atomic
def submit_feedback(
    order: Order,
    customer: Customer,
    *,
    rating: int,
    comment: str = "",
    tags: list[str] | None = None,
) -> Feedback:
    if order.customer_id != customer.id:
        raise ApiError("That order doesn't belong to you.", code="forbidden", status_code=403)
    if order.status not in (OrderStatus.DELIVERED, OrderStatus.CLOSED):
        raise ApiError(
            "Feedback can only be left once an order has been delivered.",
            code="invalid_state",
            status_code=400,
        )
    if Feedback.objects.filter(order=order).exists():
        raise ApiError(
            "Feedback has already been submitted for this order.",
            code="already_submitted",
            status_code=400,
        )

    feedback = Feedback.objects.create(
        hub=order.hub,
        order=order,
        customer=customer,
        rating=rating,
        comment=comment,
        tags=tags or [],
    )

    if rating <= LOW_RATING_THRESHOLD:
        # "A bad rating in a 100-customer business is a retention
        # emergency, not a data point" — this is the one place a customer
        # action raises an OrderException directly, rather than an ops
        # action reporting one.
        OrderException.objects.create(
            hub=order.hub,
            order=order,
            kind=OrderException.Kind.COMPLAINT,
            severity=OrderException.Severity.HIGH,
            description=f"Low rating ({rating}/5) on {order.ref}: {comment or 'no comment left'}",
            sla_due_at=timezone.now() + timezone.timedelta(hours=LOW_RATING_SLA_HOURS),
        )

    return feedback
