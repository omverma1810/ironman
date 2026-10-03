"""Shared constants and builders for the analytics tests."""

from __future__ import annotations

from datetime import date, datetime, timedelta

from django.utils import timezone

from analytics import metrics
from billing import services as billing_services
from growth import services as growth_services
from ordering.models import Order, OrderLine, OrderStatus

# A fixed midday-IST instant: "today" must not move under a test, and a
# run that straddles IST midnight would otherwise compare windows built on
# two different days.
NOW = "2026-10-07 06:30:00+00:00"
TODAY = date(2026, 10, 7)


WEEK, WEEK_END = metrics.week_bounds(TODAY - timedelta(days=7))  # last full week
TZ = timezone.get_current_timezone()


def at(day: date, hour: int = 12):
    return timezone.make_aware(datetime.combine(day, datetime.min.time()), TZ) + timedelta(
        hours=hour
    )


def _delivered(hub, customer, service, garment_type, *, day, qty=2, price=1500, code="", apt=None):
    order = Order.objects.create(
        hub=hub,
        customer=customer,
        service=service,
        status=OrderStatus.SCHEDULED,
        referral_code=code,
        apartment=apt,
        declared_total_qty=qty,
        verified_total_qty=qty,
        subtotal_minor=qty * price,
        total_minor=qty * price,
    )
    OrderLine.objects.create(
        hub=hub,
        order=order,
        garment_type=garment_type,
        declared_qty=qty,
        verified_qty=qty,
        unit_price_minor=price,
        line_total_minor=qty * price,
    )
    growth_services.capture_attribution(order)
    order.status = OrderStatus.DELIVERED
    order.delivered_at = at(day)
    order.save(update_fields=["status", "delivered_at"])
    billing_services.issue_invoice(order)
    return order
