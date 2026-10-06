"""The founders' ten weekly numbers (docs/07 §2, docs/08 batch 6.2).

Every metric is a pair: a *tile* (the headline figures) and the *rows*
that produced it (the drill-down). Both are computed from the same
queryset in the same function, so a tile can never disagree with its
drill-down — docs/07 §4.1's "a metric that silently disagrees with its own
drill-down is worse than no metric", and the tests assert it.

Figures are computed live for any window rather than read from nightly
rollup tables (docs/07 §4.1 / ADR-011): at pilot volume a week is a few
hundred rows, production has no background worker to run the rollups,
and live figures are never a night stale. The window functions are the
seam a rollup can cache behind later without changing a caller.

Business week = Monday to Sunday, IST (`week_bounds`).
"""

from __future__ import annotations

import statistics
from collections import Counter, defaultdict
from contextvars import ContextVar
from datetime import date, timedelta

from django.conf import settings
from django.core.cache import cache
from django.db.models import Count, Sum
from django.utils import timezone

from billing.models import CreditNote, Invoice, InvoiceStatus, OrderCost
from customers.models import Customer
from fulfilment.models import Job, JobAttempt, JobAttemptOutcome, JobStatus
from growth import marketing
from growth.models import (
    AccrualStatus,
    Attribution,
    ChannelCode,
    CommissionAccrual,
    Feedback,
    Settlement,
    SettlementStatus,
)
from ordering.models import Order, OrderStatus

DELIVERED = [OrderStatus.DELIVERED, OrderStatus.CLOSED]
REFERRAL_CHANNELS = [ChannelCode.WATCHMAN, ChannelCode.CUSTOMER_REFERRAL]
CUSTOMER_CAUSED_FAILURES = {"CUSTOMER_ABSENT", "CUSTOMER_RESCHEDULED"}


# The dashboard asks every metric for ten windows (this week, the previous one
# and an eight-week sparkline) but shows only each window's headline figure.
# Building the drill-down rows for all of them was most of its cost, so
# `weekly()` switches them off; `metric_rows()` (the drill-down) leaves them on.
_WANT_ROWS: ContextVar[bool] = ContextVar("analytics_want_rows", default=True)


_LIFETIME_MEMO: ContextVar[dict | None] = ContextVar("analytics_lifetime_memo", default=None)


def _wants_rows() -> bool:
    return _WANT_ROWS.get()


def week_bounds(day: date) -> tuple[date, date]:
    monday = day - timedelta(days=day.weekday())
    return monday, monday + timedelta(days=6)


def _day_range(start: date, end: date):
    """[start 00:00, end+1 00:00) in IST as aware datetimes."""
    tz = timezone.get_current_timezone()
    lo = timezone.make_aware(timezone.datetime.combine(start, timezone.datetime.min.time()), tz)
    hi = timezone.make_aware(
        timezone.datetime.combine(end + timedelta(days=1), timezone.datetime.min.time()), tz
    )
    return lo, hi


def _pct(part: int, whole: int) -> float | None:
    return round(100 * part / whole, 1) if whole else None


def delivered_orders(hub, start: date, end: date):
    lo, hi = _day_range(start, end)
    return Order.objects.filter(
        hub=hub,
        status__in=DELIVERED,
        delivered_at__gte=lo,
        delivered_at__lt=hi,
        deleted_at__isnull=True,
    )


def _first_touch(customer_ids) -> dict:
    return {
        a.customer_id: a
        for a in Attribution.objects.filter(
            customer_id__in=customer_ids, is_first_touch=True
        ).select_related("channel", "partner", "apartment")
    }


def _customer_rows(customer_ids, extra: dict | None = None) -> list[dict]:
    if not _wants_rows():
        return []
    touches = _first_touch(customer_ids)
    customers = Customer.objects.filter(pk__in=customer_ids).select_related("acquisition_apartment")
    rows = []
    for c in customers:
        touch = touches.get(c.id)
        rows.append(
            {
                "customer": str(c.id),
                "name": c.name,
                "phone": c.phone,
                "apartment": c.acquisition_apartment.name if c.acquisition_apartment else "",
                "channel": touch.channel.name if touch else "",
                **((extra or {}).get(c.id, {})),
            }
        )
    return sorted(rows, key=lambda r: r["name"])


# ① New customers ---------------------------------------------------------


def new_customers(hub, start, end) -> dict:
    firsts = marketing.first_deliveries(hub, start, end)
    rows = _customer_rows(
        list(firsts), {cid: {"first_delivered_on": str(day)} for cid, (_, day) in firsts.items()}
    )
    # Same count either way: customers that still exist.
    value = len(rows) if _wants_rows() else Customer.objects.filter(pk__in=list(firsts)).count()
    return {"value": value, "rows": rows}


# ② Repeat customers --------------------------------------------------------


def repeat_customers(hub, start, end) -> dict:
    lo, _ = _day_range(start, end)
    returning = set(
        Order.objects.filter(
            customer_id__in=delivered_orders(hub, start, end).values("customer_id"),
            status__in=DELIVERED,
            delivered_at__lt=lo,
            deleted_at__isnull=True,
        )
        .values_list("customer_id", flat=True)
        .distinct()
    )

    # R2: of this week's new customers, who had a 2nd delivered order within N days.
    # One query for every delivery by the cohort, then a pass in Python: asking
    # per customer made a long window (the Day-90 checkpoint) thousands of queries.
    window_days = settings.IRONMAN["REPEAT_CUSTOMER_WINDOW_DAYS"]
    firsts = marketing.first_deliveries(hub, start, end)
    deliveries = defaultdict(list)
    for customer_id, delivered_at in Order.objects.filter(
        customer_id__in=list(firsts), status__in=DELIVERED, delivered_at__isnull=False
    ).values_list("customer_id", "delivered_at"):
        deliveries[customer_id].append(delivered_at)
    repeated = set()
    for customer_id in firsts:
        times = sorted(deliveries[customer_id])
        if not times:
            continue
        first_at = times[0]
        if any(first_at < t <= first_at + timedelta(days=window_days) for t in times[1:]):
            repeated.add(customer_id)
    maturing = end + timedelta(days=window_days) > timezone.localdate()
    return {
        "value": len(returning),
        "cohort_size": len(firsts),
        "cohort_repeated": len(repeated),
        "cohort_repeat_rate": _pct(len(repeated), len(firsts)),
        "cohort_maturing": maturing,
        "window_days": window_days,
        "rows": _customer_rows(list(returning)),
    }


# ③ Orders per customer -----------------------------------------------------


def _lifetime_totals(hub) -> dict:
    """Every delivered order and the customers behind them. It doesn't depend
    on the window, so the dashboard's nine windows share one answer."""
    memo = _LIFETIME_MEMO.get()
    if memo is not None and hub.pk in memo:
        return memo[hub.pk]
    totals = Order.objects.filter(hub=hub, status__in=DELIVERED, deleted_at__isnull=True).aggregate(
        orders=Count("id"), customers=Count("customer_id", distinct=True)
    )
    if memo is not None:
        memo[hub.pk] = totals
    return totals


def orders_per_customer(hub, start, end) -> dict:
    orders = delivered_orders(hub, start, end)
    per_customer = Counter(orders.values_list("customer_id", flat=True))
    lifetime = _lifetime_totals(hub)
    lifetime_orders, lifetime_customers = lifetime["orders"], lifetime["customers"]
    total = sum(per_customer.values())
    return {
        "value": round(total / len(per_customer), 2) if per_customer else None,
        "orders": total,
        "active_customers": len(per_customer),
        "lifetime_average": (
            round(lifetime_orders / lifetime_customers, 2) if lifetime_customers else None
        ),
        "rows": _customer_rows(
            list(per_customer), {cid: {"orders": n} for cid, n in per_customer.items()}
        ),
    }


# ④ Cost to get a customer --------------------------------------------------


def acquisition_cost(hub, start, end) -> dict:
    result = marketing.acquisition_cost(hub, start, end)
    return {
        "value": result["blended_cac_minor"],
        "paid_cac_minor": result["paid_cac_minor"],
        "total_cost_minor": result["total_cost_minor"],
        "new_customers": result["new_customers"],
        "rows": result["channels"],
    }


# ⑤ Referrals -----------------------------------------------------------------


def referrals(hub, start, end) -> dict:
    lo, hi = _day_range(start, end)
    firsts = marketing.first_deliveries(hub, start, end)
    touches = _first_touch(list(firsts))
    referred = {cid: t for cid, t in touches.items() if t.channel.code in REFERRAL_CHANNELS}
    by_channel = Counter(t.channel.code for t in referred.values())
    by_partner = Counter(t.partner.name for t in referred.values() if t.partner_id)
    accrued = (
        CommissionAccrual.objects.filter(hub=hub, accrued_at__gte=lo, accrued_at__lt=hi)
        .exclude(status=AccrualStatus.VOID)
        .aggregate(t=Sum("amount_minor"))["t"]
        or 0
    )
    settled = (
        Settlement.objects.filter(
            hub=hub, status=SettlementStatus.PAID, paid_at__gte=lo, paid_at__lt=hi
        ).aggregate(t=Sum("total_minor"))["t"]
        or 0
    )
    rows = _customer_rows(
        list(referred),
        {
            cid: {"referred_by": t.partner.name if t.partner_id else "a customer"}
            for cid, t in referred.items()
        },
    )
    return {
        "value": len(referred),
        "watchman": by_channel.get(ChannelCode.WATCHMAN, 0),
        "customer_referral": by_channel.get(ChannelCode.CUSTOMER_REFERRAL, 0),
        "commission_accrued_minor": accrued,
        "commission_settled_minor": settled,
        "leaderboard": [{"partner": p, "new_customers": n} for p, n in by_partner.most_common()],
        "rows": rows,
    }


# ⑥ Apartments ----------------------------------------------------------------


def apartments(hub, start, end) -> dict:
    grouped = (
        delivered_orders(hub, start, end)
        .order_by()
        .values("apartment__name")
        .annotate(orders=Count("id"), customers=Count("customer_id", distinct=True))
    )
    rows = sorted(
        (
            {
                "apartment": g["apartment__name"] or "No apartment",
                "orders": g["orders"],
                "customers": g["customers"],
            }
            for g in grouped
        ),
        key=lambda r: (-r["orders"], r["apartment"]),
    )
    return {
        "value": len([r for r in rows if r["apartment"] != "No apartment"]),
        "top": rows[0]["apartment"] if rows else None,
        "rows": rows,
    }


# ⑦ Average order value -------------------------------------------------------


def _order_revenue(orders) -> dict:
    """Net invoice value per order: total less credit notes. Orders without
    an issued invoice are left out (no revenue recorded yet). `orders` is a
    queryset of the orders in question (matched by subquery, not a list of
    ids: a busy week's id list made these two queries slow); a plain list of
    ids still works for callers that already hold one."""
    order_ids = orders.order_by().values("id") if hasattr(orders, "order_by") else list(orders)
    invoices = Invoice.objects.filter(
        order_id__in=order_ids, status__in=[InvoiceStatus.ISSUED, InvoiceStatus.PAID]
    ).values_list("order_id", "total_minor")
    credited = dict(
        CreditNote.objects.filter(invoice__order_id__in=order_ids)
        .values_list("invoice__order_id")
        .annotate(t=Sum("amount_minor"))
        .values_list("invoice__order_id", "t")
    )
    return {oid: total - (credited.get(oid) or 0) for oid, total in invoices}


def average_order_value(hub, start, end) -> dict:
    orders = delivered_orders(hub, start, end)
    revenue = _order_revenue(orders)
    values = list(revenue.values())
    rows = []
    if _wants_rows():
        refs = dict(orders.values_list("id", "ref"))
        rows = sorted(
            ({"order": refs[oid], "net_minor": v} for oid, v in revenue.items()),
            key=lambda r: r["order"],
        )
    return {
        "value": round(sum(values) / len(values)) if values else None,
        "median_minor": round(statistics.median(values)) if values else None,
        "orders": len(values),
        "revenue_minor": sum(values),
        "rows": rows,
    }


# ⑧ Money made per order ------------------------------------------------------


COST_KINDS = ["CONSUMABLE", "COMMISSION", "LABOUR", "DELIVERY", "OTHER"]


def contribution(hub, start, end) -> dict:
    orders = delivered_orders(hub, start, end)
    revenue = _order_revenue(orders)
    costs: dict = defaultdict(lambda: defaultdict(int))
    for order_id, kind, amount in OrderCost.objects.filter(
        order_id__in=orders.order_by().values("id")
    ).values_list("order_id", "kind", "amount_minor"):
        costs[order_id][kind] += amount
    per_order = {oid: {k: costs[oid].get(k, 0) for k in COST_KINDS} for oid in revenue}
    margins = {oid: revenue[oid] - sum(per_order[oid].values()) for oid in revenue}
    rows = []
    if _wants_rows():
        refs = dict(orders.values_list("id", "ref"))
        rows = [
            {
                "order": refs[oid],
                "revenue_minor": revenue[oid],
                **per_order[oid],
                "margin_minor": margins[oid],
            }
            for oid in sorted(revenue, key=lambda i: refs[i])
        ]
    total_revenue = sum(revenue.values())
    total_margin = sum(margins.values())
    waterfall = {k: sum(c[k] for c in per_order.values()) for k in COST_KINDS}
    return {
        "value": round(total_margin / len(revenue)) if revenue else None,
        "margin_pct": _pct(total_margin, total_revenue),
        "revenue_minor": total_revenue,
        "margin_minor": total_margin,
        "costs_minor": waterfall,
        "orders": len(revenue),
        "rows": rows,
    }


# ⑨ On-time pickup / delivery ---------------------------------------------------


def on_time(hub, start, end) -> dict:
    lo, hi = _day_range(start, end)
    grace = timedelta(minutes=settings.IRONMAN["ON_TIME_GRACE_MINUTES"])
    done = Job.objects.filter(
        hub=hub, status=JobStatus.DONE, completed_at__gte=lo, completed_at__lt=hi
    ).select_related("order")
    failed_attempts = JobAttempt.objects.filter(
        job__hub=hub, outcome=JobAttemptOutcome.FAILED, at__gte=lo, at__lt=hi
    ).select_related("job", "job__order")

    rows = []
    for job in done:
        promise = job.slot_end or (
            job.order.pickup_promised_at if job.kind == "PICKUP" else job.order.delivery_promised_at
        )
        on_time_ = promise is None or job.completed_at <= promise + grace
        rows.append(
            {
                "order": job.order.ref,
                "kind": job.kind,
                "at": job.completed_at.isoformat(),
                "promised_by": promise.isoformat() if promise else None,
                "result": "ON_TIME" if on_time_ else "LATE",
            }
        )
    for attempt in failed_attempts:
        customer_caused = attempt.failure_reason in CUSTOMER_CAUSED_FAILURES
        rows.append(
            {
                "order": attempt.job.order.ref,
                "kind": attempt.job.kind,
                "at": attempt.at.isoformat(),
                "promised_by": attempt.job.slot_end.isoformat() if attempt.job.slot_end else None,
                "result": "FAILED_CUSTOMER" if customer_caused else "FAILED",
            }
        )
    rows.sort(key=lambda r: r["at"])

    def pct(kind=None, exclude_customer=False):
        subset = [r for r in rows if kind is None or r["kind"] == kind]
        if exclude_customer:
            subset = [r for r in subset if r["result"] != "FAILED_CUSTOMER"]
        return _pct(sum(r["result"] == "ON_TIME" for r in subset), len(subset))

    return {
        "value": pct(),
        "excluding_customer_caused": pct(exclude_customer=True),
        "pickup": pct("PICKUP"),
        "delivery": pct("DELIVERY"),
        "jobs": len(rows),
        "grace_minutes": settings.IRONMAN["ON_TIME_GRACE_MINUTES"],
        "rows": rows,
    }


# ⑩ Customer feedback -----------------------------------------------------------


def feedback(hub, start, end) -> dict:
    lo, hi = _day_range(start, end)
    items = Feedback.objects.filter(
        hub=hub, created_at__gte=lo, created_at__lt=hi, deleted_at__isnull=True
    ).select_related("order", "customer")
    ratings = [f.rating for f in items]
    delivered = delivered_orders(hub, start, end).count()
    distribution = Counter(ratings)
    rows = [
        {
            "order": f.order.ref,
            "customer": f.customer.name,
            "rating": f.rating,
            "comment": f.comment,
            "at": f.created_at.isoformat(),
        }
        for f in sorted(items, key=lambda f: f.created_at)
    ]
    return {
        "value": round(sum(ratings) / len(ratings), 2) if ratings else None,
        "responses": len(ratings),
        "response_rate": _pct(len(ratings), delivered),
        "distribution": {str(r): distribution.get(r, 0) for r in range(1, 6)},
        "promoters": sum(1 for r in ratings if r >= 4),
        "passives": sum(1 for r in ratings if r == 3),
        "detractors": sum(1 for r in ratings if r <= 2),
        "rows": rows,
    }


# ---------------------------------------------------------------- registry

METRICS = {
    "new_customers": ("New customers", new_customers, False),
    "repeat_customers": ("Repeat customers", repeat_customers, False),
    "orders_per_customer": ("Orders per customer", orders_per_customer, False),
    "acquisition_cost": ("Cost to get a customer", acquisition_cost, True),
    "referrals": ("Referrals", referrals, False),
    "apartments": ("Apartments ordering", apartments, False),
    "average_order_value": ("Average order value", average_order_value, False),
    "contribution": ("Money made per order", contribution, True),
    "on_time": ("On-time pickup & delivery", on_time, False),
    "feedback": ("Customer feedback", feedback, False),
}
"""key → (label, function, founder_only). Founder-only tiles carry
margins and acquisition cost (docs/06 §2 "Unit economics / margin")."""

SPARK_WEEKS = 8


def _headline(hub, key: str, fn, start: date):
    """One earlier week's headline figure, for the sparkline. A week that has
    fully elapsed rarely changes, so each is kept for a few minutes: opening
    the dashboard again recomputes this week and nothing else. Late edits
    (a credit note, a corrected delivery) show up when the entry expires; this
    week's own tile and every drill-down stay live."""
    seconds = settings.IRONMAN.get("ANALYTICS_PAST_WEEK_CACHE_SECONDS", 0)
    end = start + timedelta(days=6)
    if not seconds or end >= timezone.localdate():
        return fn(hub, start, end)["value"]
    cache_key = f"analytics:headline:{hub.pk}:{key}:{start}"
    hit = cache.get(cache_key)
    if hit is not None:
        return hit[0]
    value = fn(hub, start, end)["value"]
    cache.set(cache_key, (value,), seconds)  # a tuple: None is a real answer
    return value


def weekly(hub, week_start: date, *, include_money: bool) -> dict:
    """All ten tiles for one week, each with last week's value and an
    eight-week trend of its headline figure. Drill-down rows are left out
    here — `metric_rows` serves them."""
    rows_token = _WANT_ROWS.set(False)
    lifetime_token = _LIFETIME_MEMO.set({})
    try:
        with marketing.first_delivery_memo():
            return _weekly(hub, week_start, include_money=include_money)
    finally:
        _LIFETIME_MEMO.reset(lifetime_token)
        _WANT_ROWS.reset(rows_token)


def _weekly(hub, week_start: date, *, include_money: bool) -> dict:
    tiles = []
    for key, (label, fn, founder_only) in METRICS.items():
        if founder_only and not include_money:
            tiles.append({"key": key, "label": label, "restricted": True})
            continue
        end = week_start + timedelta(days=6)
        current = fn(hub, week_start, end)
        trend = []
        for back in range(SPARK_WEEKS - 1, 0, -1):
            s = week_start - timedelta(weeks=back)
            trend.append({"week": str(s), "value": _headline(hub, key, fn, s)})
        trend.append({"week": str(week_start), "value": current["value"]})
        previous = trend[-2]["value"] if len(trend) > 1 else None
        tile = {k: v for k, v in current.items() if k != "rows"}
        tiles.append(
            {
                "key": key,
                "label": label,
                "restricted": False,
                **tile,
                "previous": previous,
                "trend": trend,
            }
        )
    return {
        "week_start": str(week_start),
        "week_end": str(week_start + timedelta(days=6)),
        "tiles": tiles,
    }


def metric_rows(hub, key: str, week_start: date) -> dict:
    label, fn, _ = METRICS[key]
    result = fn(hub, week_start, week_start + timedelta(days=6))
    return {"key": key, "label": label, "value": result["value"], "rows": result["rows"]}
