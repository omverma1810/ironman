"""The longer reports behind the weekly numbers (docs/07 §4.2, docs/08
batches 6.3–6.7): apartment performance, channel performance, the
unit-economics waterfall, the operations daily view, and the Day 30/60/90
checkpoint. Same definitions as `metrics` — they reuse its building
blocks rather than restating any formula.
"""

from __future__ import annotations

from collections import defaultdict, namedtuple
from datetime import date, timedelta

from django.db.models import Avg, Count, Sum
from django.utils import timezone

from analytics import metrics
from customers.models import Customer
from growth import marketing
from growth.models import Feedback
from ordering.models import Order, OrderException, OrderStatus
from territory.models import Apartment, RouteDayCapacity

WIP = [
    OrderStatus.PICKED_UP,
    OrderStatus.AT_HUB,
    OrderStatus.INTAKE_VERIFIED,
    OrderStatus.IN_PRODUCTION,
    OrderStatus.READY,
    OrderStatus.DELIVERY_ASSIGNED,
    OrderStatus.OUT_FOR_DELIVERY,
    OrderStatus.DELIVERY_FAILED,
    OrderStatus.RETURNED_TO_HUB,
    OrderStatus.ON_HOLD,
]
NOT_DONE = WIP + [
    OrderStatus.PENDING_CONFIRMATION,
    OrderStatus.SCHEDULED,
    OrderStatus.PICKUP_ASSIGNED,
    OrderStatus.PICKUP_EN_ROUTE,
    OrderStatus.PICKUP_FAILED,
]


def _per_order_margin(orders) -> dict:
    """{order_id: (revenue, margin)} for orders with an issued invoice.
    `orders` is a queryset, matched by subquery: a year of orders as a list of
    ids runs into the database's parameter limit."""
    from billing.models import OrderCost

    revenue = metrics._order_revenue(orders)
    costs: dict = defaultdict(int)
    for order_id, amount in OrderCost.objects.filter(
        order_id__in=orders.order_by().values("id")
    ).values_list("order_id", "amount_minor"):
        costs[order_id] += amount
    return {oid: (rev, rev - costs[oid]) for oid, rev in revenue.items()}


# 6.3 Apartment performance ----------------------------------------------------


_Delivery = namedtuple("_Delivery", "id customer_id apartment_id")


def apartment_performance(hub, start: date, end: date) -> list[dict]:
    """docs/07 ⑥ — ranked by orders per active customer per week since
    launch, so a building live for 5 days isn't compared on raw volume
    with one live for 60."""
    orders_qs = metrics.delivered_orders(hub, start, end)
    # Three columns, not whole Order objects: a window since launch is every delivery.
    orders = [_Delivery(*row) for row in orders_qs.values_list("id", "customer_id", "apartment_id")]
    margins = _per_order_margin(orders_qs)
    firsts = marketing.first_deliveries(hub, start, end)
    first_order_ids = {oid for oid, _ in firsts.values()}

    lifetime_counts = dict(
        Order.objects.filter(hub=hub, status__in=metrics.DELIVERED, deleted_at__isnull=True)
        .values_list("customer_id")
        .annotate(n=Count("id"))
        .values_list("customer_id", "n")
    )
    ratings = defaultdict(list)
    for apartment_id, rating in Feedback.objects.filter(
        order_id__in=orders_qs.order_by().values("id")
    ).values_list("order__apartment_id", "rating"):
        ratings[apartment_id].append(rating)

    by_apartment: dict = defaultdict(list)
    for o in orders:
        by_apartment[o.apartment_id].append(o)

    apartments = {
        a.id: a
        for a in Apartment.objects.filter(cluster__hub=hub, deleted_at__isnull=True).select_related(
            "cluster"
        )
    }
    today = timezone.localdate()
    rows = []
    for apartment_id, apartment in apartments.items():
        group = by_apartment.get(apartment_id, [])
        customers = {o.customer_id for o in group}
        revenue = [margins[o.id][0] for o in group if o.id in margins]
        margin = sum(margins[o.id][1] for o in group if o.id in margins)
        launched = apartment.launched_on
        days_live = (today - launched).days if launched else None
        weeks_live = max(1, min((end - start).days + 1, days_live or 10**6) / 7)
        per_customer = len(group) / len(customers) if customers else 0
        rows.append(
            {
                "apartment": str(apartment_id),
                "name": apartment.name,
                "cluster": apartment.cluster.name,
                "days_since_launch": days_live,
                "customers": len(customers),
                "new_customers": sum(1 for o in group if o.id in first_order_ids),
                "orders": len(group),
                "repeat_rate": metrics._pct(
                    sum(1 for c in customers if lifetime_counts.get(c, 0) > 1), len(customers)
                ),
                "aov_minor": round(sum(revenue) / len(revenue)) if revenue else None,
                "margin_minor": margin,
                "avg_rating": (
                    round(sum(ratings[apartment_id]) / len(ratings[apartment_id]), 1)
                    if ratings[apartment_id]
                    else None
                ),
                "orders_per_customer": round(per_customer, 2) if customers else None,
                "score": round(per_customer / weeks_live, 3) if customers else 0,
            }
        )
    rows.sort(key=lambda r: (-r["score"], -r["orders"], r["name"]))
    return rows


# 6.4 Channel performance --------------------------------------------------------


def channel_performance(hub, start: date, end: date) -> list[dict]:
    """docs/07 §4.2 — volume, CAC, repeat rate and 60-day revenue per
    customer acquired through each channel in the period."""
    cac = {r["channel"]: r for r in marketing.acquisition_cost(hub, start, end)["channels"]}
    firsts = marketing.first_deliveries(hub, start, end)
    touches = metrics._first_touch(list(firsts))
    groups: dict = defaultdict(list)
    for customer_id in firsts:
        touch = touches.get(customer_id)
        groups[touch.channel.code if touch else "ORGANIC"].append(customer_id)

    # Every delivery by the cohort and its net revenue, fetched once: asking
    # per customer made a year-long window thousands of queries.
    cohort_orders = Order.objects.filter(
        customer_id__in=list(firsts),
        status__in=metrics.DELIVERED,
        delivered_at__isnull=False,
    )
    revenue = metrics._order_revenue(cohort_orders)
    delivered: dict = defaultdict(list)
    for oid, customer_id, at in cohort_orders.values_list("id", "customer_id", "delivered_at"):
        delivered[customer_id].append((oid, at))

    rows = []
    for code in sorted(set(groups) | set(cac)):
        customers = groups.get(code, [])
        repeaters = 0
        revenue_60 = 0
        for customer_id in customers:
            first_order_id, first_day = firsts[customer_id]
            lo, hi = metrics._day_range(first_day, first_day + timedelta(days=59))
            ids = [oid for oid, at in delivered[customer_id] if lo <= at < hi]
            if len(ids) > 1:
                repeaters += 1
            revenue_60 += sum(revenue.get(oid, 0) for oid in ids)
        info = cac.get(code, {})
        rows.append(
            {
                "channel": code,
                "channel_name": info.get("channel_name") or code.replace("_", " ").title(),
                "new_customers": len(customers),
                "spend_minor": info.get("spend_minor", 0),
                "commission_minor": info.get("commission_minor", 0),
                "cac_minor": info.get("cac_minor"),
                "repeat_rate": metrics._pct(repeaters, len(customers)),
                "revenue_60d_per_customer_minor": (
                    round(revenue_60 / len(customers)) if customers else None
                ),
            }
        )
    rows.sort(key=lambda r: (-r["new_customers"], r["channel"]))
    return rows


# 6.5 Unit economics --------------------------------------------------------------


def unit_economics(hub, start: date, end: date) -> dict:
    """docs/07 ⑧ as a waterfall: revenue → each cost → contribution, in
    totals and per order. Fixed costs are deliberately absent."""
    c = metrics.contribution(hub, start, end)
    orders = c["orders"]
    steps = [{"step": "Revenue", "total_minor": c["revenue_minor"]}]
    labels = {
        "CONSUMABLE": "Consumables",
        "COMMISSION": "Commission",
        "LABOUR": "Labour (estimate)",
        "DELIVERY": "Delivery",
        "OTHER": "Other",
    }
    for kind, label in labels.items():
        steps.append({"step": label, "total_minor": -c["costs_minor"][kind]})
    steps.append({"step": "Contribution", "total_minor": c["margin_minor"]})
    for s in steps:
        s["per_order_minor"] = round(s["total_minor"] / orders) if orders else None
    return {"orders": orders, "margin_pct": c["margin_pct"], "steps": steps}


# 6.7 Operations daily -------------------------------------------------------------


def operations_daily(hub, day: date | None = None) -> dict:
    """docs/07 §4.2 — for ops, not founders: today's on-time, work in
    progress by stage with ageing, capacity, overdue orders and open
    exceptions."""
    day = day or timezone.localdate()
    now = timezone.now()
    on_time = metrics.on_time(hub, day, day)

    wip = Order.objects.filter(hub=hub, status__in=WIP, deleted_at__isnull=True)
    stages = []
    for status in WIP:
        group = [o for o in wip if o.status == status]
        if not group:
            continue
        ages = [(now - (o.picked_up_at or o.created_at)).total_seconds() / 3600 for o in group]
        stages.append(
            {
                "status": status,
                "label": OrderStatus(status).label,
                "orders": len(group),
                "oldest_hours": round(max(ages), 1),
                "average_hours": round(sum(ages) / len(ages), 1),
            }
        )

    capacity = RouteDayCapacity.objects.filter(hub=hub, date=day).aggregate(
        capacity=Sum("capacity"), booked=Sum("booked_count")
    )
    overdue = (
        Order.objects.filter(
            hub=hub,
            status__in=NOT_DONE,
            delivery_promised_at__lt=now,
            deleted_at__isnull=True,
        )
        .select_related("customer")
        .order_by("delivery_promised_at")
    )
    exceptions = (
        OrderException.objects.filter(
            hub=hub,
            status__in=[OrderException.Status.OPEN, OrderException.Status.INVESTIGATING],
        )
        .values_list("severity")
        .annotate(n=Count("id"))
    )
    return {
        "date": str(day),
        "on_time": {k: on_time[k] for k in ("value", "pickup", "delivery", "jobs")},
        "wip": stages,
        "capacity": {
            "slots": capacity["capacity"] or 0,
            "booked": capacity["booked"] or 0,
            "utilisation": metrics._pct(capacity["booked"] or 0, capacity["capacity"] or 0),
        },
        "overdue": [
            {
                "order": str(o.id),
                "ref": o.ref,
                "customer": o.customer.name,
                "status": o.get_status_display(),
                "promised": o.delivery_promised_at.isoformat(),
                "hours_late": round((now - o.delivery_promised_at).total_seconds() / 3600, 1),
            }
            for o in overdue[:50]
        ],
        "open_exceptions": {severity: n for severity, n in exceptions},
    }


# 6.6 Day 30/60/90 checkpoint -------------------------------------------------------


def launch_date(hub) -> date | None:
    first = (
        Order.objects.filter(hub=hub, status__in=metrics.DELIVERED, delivered_at__isnull=False)
        .order_by("delivered_at")
        .values_list("delivered_at", flat=True)
        .first()
    )
    return timezone.localdate(first) if first else None


def checkpoint(hub, as_of: date | None = None) -> dict:
    """docs/07 §3 — answers the founders' Day 30/60/90 questions for the
    period from launch (first delivery) to `as_of`."""
    with marketing.first_delivery_memo():
        return _checkpoint(hub, as_of)


def _checkpoint(hub, as_of: date | None) -> dict:
    as_of = as_of or timezone.localdate()
    start = launch_date(hub) or as_of
    days = (as_of - start).days + 1
    orders = metrics.delivered_orders(hub, start, as_of)
    customers = orders.values("customer_id").distinct().count()
    new = metrics.new_customers(hub, start, as_of)["value"]
    aov = metrics.average_order_value(hub, start, as_of)
    contribution = metrics.contribution(hub, start, as_of)

    # Cohort repeat: of customers whose first delivery is ≥30 days before
    # as_of, how many came back within 30 days.
    matured_end = as_of - timedelta(days=30)
    cohort = metrics.repeat_customers(hub, start, matured_end) if matured_end >= start else None
    price_versions = list(
        orders.values("price_list_version")
        .annotate(n=Count("id"), avg_total=Avg("total_minor"))
        .order_by("price_list_version")
    )
    return {
        "as_of": str(as_of),
        "launched_on": str(start) if launch_date(hub) else None,
        "days_live": days,
        "checkpoint": next((d for d in (30, 60, 90) if days <= d), 90),
        "orders": orders.count(),
        "customers": customers,
        "new_customers": new,
        "orders_per_customer": round(orders.count() / customers, 2) if customers else None,
        "aov_minor": aov["value"],
        "contribution_per_order_minor": contribution["value"],
        "margin_pct": contribution["margin_pct"],
        "cohort_repeat_rate": cohort["cohort_repeat_rate"] if cohort else None,
        "cohort_size": cohort["cohort_size"] if cohort else 0,
        "top_apartments": apartment_performance(hub, start, as_of)[:5],
        "channels": channel_performance(hub, start, as_of),
        "price_versions": [
            {
                "version": p["price_list_version"],
                "orders": p["n"],
                "avg_order_minor": round(p["avg_total"]) if p["avg_total"] else None,
            }
            for p in price_versions
        ],
        "active_customers_total": Customer.objects.filter(
            hub=hub, orders__status__in=metrics.DELIVERED
        )
        .distinct()
        .count(),
    }
