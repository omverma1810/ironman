"""Data-quality guardrails (docs/07 §4.4, docs/08 batch 6.9): metrics
fail silently unless something watches them. Each check returns its value,
its threshold, whether it's breached and the rows that breach it, so a red
check always says what to fix. Checks run on demand from the dashboard
(there is no nightly worker in production)."""

from __future__ import annotations

from datetime import timedelta

from django.db.models import Exists, OuterRef
from django.utils import timezone

from analytics import metrics
from billing.models import CashHandover, HandoverStatus, OrderCost
from custody.models import StageEvent
from growth import marketing
from growth.models import Attribution, AttributionBasis
from ordering.models import Order, PaymentStatus


def _check(key, label, value, threshold, breached, rows, explain) -> dict:
    return {
        "key": key,
        "label": label,
        "value": value,
        "threshold": threshold,
        "ok": not breached,
        "explain": explain,
        "rows": rows[:50],
        "row_count": len(rows),
    }


def unknown_acquisition_channel(hub, days=30) -> dict:
    """SC-6: ≥95% of new customers carry an acquisition channel."""
    today = timezone.localdate()
    firsts = marketing.first_deliveries(hub, today - timedelta(days=days - 1), today)
    touches = {
        a.customer_id: a
        for a in Attribution.objects.filter(customer_id__in=list(firsts), is_first_touch=True)
    }
    unknown = [
        cid
        for cid in firsts
        if cid not in touches or touches[cid].basis == AttributionBasis.DEFAULT
    ]
    share = metrics._pct(len(unknown), len(firsts)) or 0.0
    return _check(
        "unknown_channel",
        "New customers with no known channel",
        share,
        5.0,
        share > 5.0,
        [{"customer": str(c)} for c in unknown],
        "Ask how they heard about IronMan at booking, or use referral codes.",
    )


def manual_stage_moves(hub, days=7) -> dict:
    """Garments moved between stages without a tag scan — the leading
    indicator that the tag workflow is being bypassed."""
    since = timezone.now() - timedelta(days=days)
    events = StageEvent.objects.filter(hub=hub, occurred_at__gte=since)
    total = events.count()
    manual = list(
        events.filter(scanned=False)
        .select_related("garment_line__order_line__order", "bag__order")
        .order_by("-occurred_at")
    )
    share = metrics._pct(len(manual), total) or 0.0

    def ref(e):
        if e.bag_id and e.bag and e.bag.order_id:
            return e.bag.order.ref
        if e.garment_line_id:
            return e.garment_line.order_line.order.ref
        return ""

    return _check(
        "manual_stage_moves",
        "Stage moves without a tag scan",
        share,
        20.0,
        share > 20.0,
        [
            {"order": ref(e), "to_stage": e.to_stage, "at": e.occurred_at.isoformat()}
            for e in manual
        ],
        "Scan the bag or garment tag at each station instead of moving it by hand.",
    )


def delivered_unpaid(hub, hours=24) -> dict:
    cutoff = timezone.now() - timedelta(hours=hours)
    orders = list(
        Order.objects.filter(
            hub=hub,
            status__in=metrics.DELIVERED,
            delivered_at__lt=cutoff,
            payment_status=PaymentStatus.UNPAID,
            deleted_at__isnull=True,
        )
        .select_related("customer")
        .order_by("delivered_at")
    )
    return _check(
        "delivered_unpaid",
        "Delivered over 24 h ago with no payment",
        len(orders),
        0,
        len(orders) > 0,
        [
            {"order": o.ref, "customer": o.customer.name, "delivered": o.delivered_at.isoformat()}
            for o in orders
        ],
        "Record the cash/UPI collected, or follow up with the customer.",
    )


def cash_variance(hub, days=7) -> dict:
    since = timezone.now() - timedelta(days=days)
    handovers = list(
        CashHandover.objects.filter(
            hub=hub, status=HandoverStatus.CONFIRMED, confirmed_at__gte=since
        )
        .exclude(variance_minor=0)
        .exclude(variance_minor__isnull=True)
        .select_related("from_user")
    )
    return _check(
        "cash_variance",
        "Cash handovers that didn't match",
        len(handovers),
        0,
        len(handovers) > 0,
        [
            {
                "staff": h.from_user.full_name or h.from_user.email,
                "variance_minor": h.variance_minor,
                "note": h.variance_note,
            }
            for h in handovers
        ],
        "Check the rider's collections against what was handed over.",
    )


def missing_consumables(hub, days=7) -> dict:
    """Delivered orders with no consumable cost — breaks money made per
    order (⑧)."""
    today = timezone.localdate()
    orders = list(
        metrics.delivered_orders(hub, today - timedelta(days=days - 1), today)
        .annotate(
            has_consumable=Exists(OrderCost.objects.filter(order=OuterRef("pk"), kind="CONSUMABLE"))
        )
        .filter(has_consumable=False)
        .order_by("delivered_at")
    )
    return _check(
        "missing_consumables",
        "Delivered orders with no consumables recorded",
        len(orders),
        0,
        len(orders) > 0,
        [{"order": o.ref, "delivered": o.delivered_at.isoformat()} for o in orders],
        "Set consumption rules in Supplies so packing issues stock automatically.",
    )


CHECKS = [
    unknown_acquisition_channel,
    manual_stage_moves,
    delivered_unpaid,
    cash_variance,
    missing_consumables,
]


def run(hub) -> dict:
    results = [check(hub) for check in CHECKS]
    return {
        "checked_at": timezone.now().isoformat(),
        "failing": sum(1 for r in results if not r["ok"]),
        "checks": results,
    }
