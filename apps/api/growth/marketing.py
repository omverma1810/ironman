"""Campaigns and marketing spend (docs/08 batch 5.6, G-3) — the data
source for "cost to get a customer" (docs/07 ④):

    CAC(channel, period) = ( Σ spend for that channel in the period
                           + Σ commission earned on those customers' first orders )
                           ÷ new customers attributed to that channel

A customer counts as new on the date of their first *delivered* order, not
their first booking (docs/07 ①) — a cancelled first booking is a lead, and
counting it would flatter CAC. Phase 6 builds the full reports on top of
these same definitions.
"""

from __future__ import annotations

from datetime import date

from django.db import models, transaction
from django.utils import timezone

from common import audit
from common.errors import ApiError
from growth import services
from growth.models import (
    AccrualStatus,
    Attribution,
    Campaign,
    ChannelCode,
    CommissionAccrual,
    Spend,
    SpendCategory,
)
from ordering.models import Order, OrderStatus

_DELIVERED = [OrderStatus.DELIVERED, OrderStatus.CLOSED]


def _check_dates(start_on, end_on) -> None:
    if end_on and start_on and end_on < start_on:
        raise ApiError("A campaign can't end before it starts.", code="validation_error")


def get_campaign(campaign_id) -> Campaign:
    try:
        return Campaign.objects.select_related("channel").get(
            pk=campaign_id, deleted_at__isnull=True
        )
    except (Campaign.DoesNotExist, ValueError, TypeError) as exc:
        raise ApiError("Campaign not found.", code="not_found", status_code=404) from exc


@transaction.atomic
def create_campaign(
    *,
    hub,
    name: str,
    channel: str,
    apartment=None,
    cluster=None,
    start_on: date | None = None,
    end_on: date | None = None,
    objective: str = "",
    actor=None,
) -> Campaign:
    if channel not in ChannelCode.values:
        raise ApiError(f"'{channel}' is not a channel.", code="validation_error")
    start_on = start_on or timezone.localdate()
    _check_dates(start_on, end_on)
    if apartment is not None and cluster is None:
        cluster = apartment.cluster
    campaign = Campaign.objects.create(
        hub=hub,
        name=name.strip(),
        channel=services.get_channel(channel),
        apartment=apartment,
        cluster=cluster,
        start_on=start_on,
        end_on=end_on,
        objective=objective.strip(),
        created_by=actor,
    )
    audit.record(
        action="growth.campaign.created",
        object_type="Campaign",
        object_id=campaign.id,
        hub=hub,
        after={"name": campaign.name, "channel": channel, "start_on": str(start_on)},
        actor=actor,
    )
    return campaign


@transaction.atomic
def update_campaign(campaign: Campaign, *, changes: dict, actor=None) -> Campaign:
    for field in ("name", "objective", "start_on", "end_on"):
        if field in changes:
            setattr(campaign, field, changes[field])
    _check_dates(campaign.start_on, campaign.end_on)
    campaign.updated_by = actor
    campaign.save()
    return campaign


@transaction.atomic
def record_spend(
    campaign: Campaign,
    *,
    amount_minor: int,
    category: str,
    spent_on: date | None = None,
    note: str = "",
    actor=None,
) -> Spend:
    if amount_minor <= 0:
        raise ApiError("Spend must be a positive amount.", code="validation_error")
    if category not in SpendCategory.values:
        raise ApiError(f"'{category}' is not a spend category.", code="validation_error")
    spent_on = spent_on or timezone.localdate()
    if spent_on > timezone.localdate():
        raise ApiError("Spend can't be dated in the future.", code="validation_error")
    spend = Spend.objects.create(
        hub=campaign.hub,
        campaign=campaign,
        amount_minor=amount_minor,
        category=category,
        spent_on=spent_on,
        note=note.strip(),
        created_by=actor,
    )
    audit.record(
        action="growth.spend.recorded",
        object_type="Spend",
        object_id=spend.id,
        hub=campaign.hub,
        after={
            "campaign": campaign.name,
            "amount_minor": amount_minor,
            "category": category,
            "spent_on": str(spent_on),
        },
        actor=actor,
    )
    return spend


@transaction.atomic
def remove_spend(spend: Spend, *, reason: str, actor=None) -> Spend:
    if not reason.strip():
        raise ApiError("Say why this spend is being removed.", code="validation_error")
    spend.deleted_at = timezone.now()
    spend.updated_by = actor
    spend.save(update_fields=["deleted_at", "updated_by", "updated_at"])
    audit.record(
        action="growth.spend.removed",
        object_type="Spend",
        object_id=spend.id,
        hub=spend.hub,
        before={"amount_minor": spend.amount_minor, "spent_on": str(spend.spent_on)},
        after={"reason": reason.strip()},
        actor=actor,
    )
    return spend


# ---------------------------------------------------------- new customers


def first_deliveries(hub, start: date, end: date) -> dict:
    """{customer_id: (first delivered order id, date)} for customers whose
    first delivered order fell within [start, end]. One ordered pass over
    the hub's delivered orders — the first row per customer is theirs."""
    rows = (
        Order.objects.filter(
            hub=hub, status__in=_DELIVERED, delivered_at__isnull=False, deleted_at__isnull=True
        )
        .order_by("customer_id", "delivered_at")
        .values_list("customer_id", "id", "delivered_at")
    )
    result: dict = {}
    seen: set = set()
    for customer_id, order_id, delivered_at in rows:
        if customer_id in seen:
            continue
        seen.add(customer_id)
        day = timezone.localdate(delivered_at)
        if start <= day <= end:
            result[customer_id] = (order_id, day)
    return result


def _first_touch(customer_ids) -> dict:
    return {
        a.customer_id: a
        for a in Attribution.objects.filter(
            customer_id__in=customer_ids, is_first_touch=True
        ).select_related("channel", "apartment")
    }


def new_customers(hub, start: date, end: date, *, channel=None, apartment=None, cluster=None):
    """Customer ids counted as new in the period, optionally narrowed to
    those acquired through a channel / apartment / cluster."""
    firsts = first_deliveries(hub, start, end)
    touches = _first_touch(firsts.keys())
    ids = []
    for customer_id in firsts:
        touch = touches.get(customer_id)
        if channel is not None and (touch is None or touch.channel_id != channel.id):
            continue
        if apartment is not None and (touch is None or touch.apartment_id != apartment.id):
            continue
        if cluster is not None and (
            touch is None or touch.apartment is None or touch.apartment.cluster_id != cluster.id
        ):
            continue
        ids.append(customer_id)
    return ids


# --------------------------------------------------------------------- CAC


def acquisition_cost(hub, start: date, end: date) -> dict:
    """docs/07 ④ per channel, plus blended and paid-only CAC."""
    firsts = first_deliveries(hub, start, end)
    touches = _first_touch(firsts.keys())
    first_order_ids = {order_id for order_id, _ in firsts.values()}

    spend_by_channel = dict(
        Spend.objects.filter(
            hub=hub, deleted_at__isnull=True, spent_on__gte=start, spent_on__lte=end
        )
        .values_list("campaign__channel__code")
        .annotate(total=models.Sum("amount_minor"))
        .values_list("campaign__channel__code", "total")
    )
    commission_by_channel: dict[str, int] = {}
    for accrual in (
        CommissionAccrual.objects.filter(order_id__in=first_order_ids)
        .exclude(status=AccrualStatus.VOID)
        .select_related("order")
    ):
        touch = touches.get(accrual.order.customer_id) if accrual.order_id else None
        code = touch.channel.code if touch else ChannelCode.ORGANIC
        commission_by_channel[code] = commission_by_channel.get(code, 0) + accrual.amount_minor

    customers_by_channel: dict[str, int] = {}
    for customer_id in firsts:
        touch = touches.get(customer_id)
        code = touch.channel.code if touch else ChannelCode.ORGANIC
        customers_by_channel[code] = customers_by_channel.get(code, 0) + 1

    rows = []
    for code, label in ChannelCode.choices:
        spend = spend_by_channel.get(code, 0)
        commission = commission_by_channel.get(code, 0)
        customers = customers_by_channel.get(code, 0)
        if not (spend or commission or customers):
            continue
        channel = services.get_channel(code)
        cost = spend + commission
        rows.append(
            {
                "channel": code,
                "channel_name": channel.name,
                "is_paid": channel.is_paid,
                "spend_minor": spend,
                "commission_minor": commission,
                "new_customers": customers,
                "cac_minor": round(cost / customers) if customers else None,
            }
        )

    total_cost = sum(r["spend_minor"] + r["commission_minor"] for r in rows)
    total_customers = sum(r["new_customers"] for r in rows)
    paid = [r for r in rows if r["is_paid"]]
    paid_cost = sum(r["spend_minor"] + r["commission_minor"] for r in paid)
    paid_customers = sum(r["new_customers"] for r in paid)
    return {
        "start": start,
        "end": end,
        "channels": rows,
        "total_cost_minor": total_cost,
        "new_customers": total_customers,
        "blended_cac_minor": round(total_cost / total_customers) if total_customers else None,
        "paid_cac_minor": round(paid_cost / paid_customers) if paid_customers else None,
    }


def campaign_summary(campaign: Campaign) -> dict:
    end = campaign.end_on or timezone.localdate()
    spend = (
        campaign.spend.filter(deleted_at__isnull=True).aggregate(t=models.Sum("amount_minor"))["t"]
        or 0
    )
    customers = new_customers(
        campaign.hub,
        campaign.start_on,
        end,
        channel=campaign.channel,
        apartment=campaign.apartment,
        cluster=None if campaign.apartment else campaign.cluster,
    )
    return {
        "spend_minor": spend,
        "new_customers": len(customers),
        "cost_per_customer_minor": round(spend / len(customers)) if customers else None,
    }
