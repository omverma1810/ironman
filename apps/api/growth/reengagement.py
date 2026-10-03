"""Lapsed customers and re-engagement (docs/08 batch 5.7, A-06 / G-11):
"send simple follow-ups to customers who tried IronMan but have not ordered
again" — the Day 31–60 core activity in the client's plan.

A customer is lapsed when their last delivered order is older than
`LAPSED_AFTER_DAYS` and they have nothing in progress (an open order means
they're already back). Sending goes through the notifications app, so it
honours opt-outs, the non-prod recipient allowlist and the delivery log
exactly like order messages; a cooldown stops anyone being messaged twice
in a fortnight however often the button is pressed.
"""

from __future__ import annotations

from datetime import timedelta

from django.conf import settings
from django.db.models import Count, Max, Q, Sum
from django.utils import timezone

from common import audit
from customers.models import Customer
from notifications import services as notifications_services
from notifications.models import NotificationRequest
from ordering.models import OrderStatus

TEMPLATE_CODE = "growth.reengagement"
TEMPLATE_BODY = (
    "Hi {customer_name}, it's been a while! Your clothes deserve IronMan again — "
    "book a doorstep pickup in under a minute: {book_link}{offer_line} — IronMan"
)

_DONE = [OrderStatus.DELIVERED, OrderStatus.CLOSED]
_NOT_OPEN = _DONE + [OrderStatus.CANCELLED, OrderStatus.DRAFT]


def _cfg(key):
    return settings.IRONMAN[key]


def lapsed_customers(hub, *, days: int | None = None, one_time_only: bool = False) -> list[dict]:
    days = days or _cfg("LAPSED_AFTER_DAYS")
    cutoff = timezone.now() - timedelta(days=days)
    customers = (
        Customer.objects.filter(hub=hub, deleted_at__isnull=True)
        .exclude(status__in=[Customer.Status.BLOCKED, Customer.Status.DELETED])
        .annotate(
            delivered_orders=Count("orders", filter=Q(orders__status__in=_DONE)),
            open_orders=Count(
                "orders",
                filter=~Q(orders__status__in=_NOT_OPEN) & Q(orders__deleted_at__isnull=True),
            ),
            last_delivered_at=Max("orders__delivered_at", filter=Q(orders__status__in=_DONE)),
            spent_minor=Sum("orders__total_minor", filter=Q(orders__status__in=_DONE)),
        )
        .filter(delivered_orders__gt=0, open_orders=0, last_delivered_at__lt=cutoff)
        .select_related("acquisition_apartment")
        .order_by("last_delivered_at")
    )
    if one_time_only:
        customers = customers.filter(delivered_orders=1)

    last_contacted = dict(
        NotificationRequest.objects.filter(
            template__code=TEMPLATE_CODE, recipient_id__in=[c.id for c in customers]
        )
        .values_list("recipient_id")
        .annotate(at=Max("created_at"))
        .values_list("recipient_id", "at")
    )
    now = timezone.now()
    return [
        {
            "customer": c.id,
            "name": c.name,
            "phone": c.phone,
            "apartment_name": c.acquisition_apartment.name if c.acquisition_apartment else "",
            "delivered_orders": c.delivered_orders,
            "spent_minor": c.spent_minor or 0,
            "last_delivered_at": c.last_delivered_at,
            "days_since": (now - c.last_delivered_at).days,
            "last_contacted_at": last_contacted.get(c.id),
        }
        for c in customers
    ]


def send(
    hub,
    *,
    days: int | None = None,
    one_time_only: bool = False,
    customer_ids: list | None = None,
    offer: str = "",
    actor=None,
) -> dict:
    notifications_services.ensure_template(
        TEMPLATE_CODE, TEMPLATE_BODY, ["customer_name", "book_link", "offer_line"]
    )
    rows = lapsed_customers(hub, days=days, one_time_only=one_time_only)
    if customer_ids is not None:
        wanted = {str(i) for i in customer_ids}
        rows = [r for r in rows if str(r["customer"]) in wanted]

    cooldown_start = timezone.now() - timedelta(days=_cfg("REENGAGEMENT_COOLDOWN_DAYS"))
    book_link = f"{_cfg('PUBLIC_SITE_URL').rstrip('/')}/book?src=reengage"
    offer_line = f". {offer.strip().rstrip('.')}" if offer.strip() else ""
    today = timezone.localdate().isoformat()

    counts = {"sent": 0, "recently_contacted": 0, "opted_out": 0, "not_sent": 0}
    for row in rows:
        if row["last_contacted_at"] and row["last_contacted_at"] >= cooldown_start:
            counts["recently_contacted"] += 1
            continue
        customer = Customer.objects.get(pk=row["customer"])
        _, outcome = notifications_services.notify_customer(
            TEMPLATE_CODE,
            customer,
            context={
                "customer_name": (customer.name or "there").split(" ")[0],
                "book_link": book_link,
                "offer_line": offer_line,
            },
            dedupe_key=f"reengage:{customer.id}:{today}",
        )
        if outcome == "sent":
            counts["sent"] += 1
        elif outcome == "opted_out":
            counts["opted_out"] += 1
        elif outcome == "duplicate":
            counts["recently_contacted"] += 1
        else:
            counts["not_sent"] += 1

    result = {"eligible": len(rows), **counts}
    audit.record(
        action="growth.reengagement.sent",
        object_type="Hub",
        object_id=hub.id,
        hub=hub,
        after={
            **result,
            "days": days or _cfg("LAPSED_AFTER_DAYS"),
            "one_time_only": one_time_only,
            "offer": offer.strip(),
        },
        actor=actor,
    )
    return result
