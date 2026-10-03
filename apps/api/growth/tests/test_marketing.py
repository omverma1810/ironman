"""docs/08 batch 5.6: campaigns, marketing spend and cost to get a customer
(docs/07 ④). New customers count on their first *delivered* order."""

from __future__ import annotations

from datetime import date, timedelta

import pytest
from django.utils import timezone
from freezegun import freeze_time

from common.errors import ApiError
from customers.models import Customer
from growth import commission, marketing, services
from growth.models import ChannelCode, PartnerKind
from identity.models import AuditEvent
from ordering.models import Order, OrderStatus

pytestmark = pytest.mark.django_db

# A fixed midday-IST instant: "today" must not move under a test, and a
# run that straddles IST midnight would otherwise compare windows built on
# two different days.
NOW = "2026-10-07 06:30:00+00:00"
TODAY = date(2026, 10, 7)


@pytest.fixture(autouse=True)
def frozen_clock():
    with freeze_time(NOW):
        yield


def _customer(hub, n):
    return Customer.objects.create(hub=hub, name=f"Cust {n}", phone=f"+9198766{n:05d}")


def _order(hub, customer, service, *, code="", self_reported="", delivered_on=TODAY, status=None):
    order = Order.objects.create(
        hub=hub,
        customer=customer,
        service=service,
        status=OrderStatus.SCHEDULED,
        referral_code=code,
        total_minor=5000,
    )
    services.capture_attribution(order, self_reported=self_reported)
    if delivered_on is not None:
        order.status = status or OrderStatus.DELIVERED
        order.delivered_at = timezone.make_aware(
            timezone.datetime.combine(delivered_on, timezone.datetime.min.time())
        ) + timedelta(hours=12)
        order.save(update_fields=["status", "delivered_at"])
    return order


@pytest.fixture
def flyer_campaign(hub, apartment, founder_user):
    return marketing.create_campaign(
        hub=hub,
        name="Flyers — Sai Krupa",
        channel=ChannelCode.FLYER,
        apartment=apartment,
        start_on=TODAY - timedelta(days=20),
        actor=founder_user,
    )


def test_spend_is_recorded_against_a_campaign_and_audited(flyer_campaign, founder_user):
    spend = marketing.record_spend(
        flyer_campaign, amount_minor=200000, category="PRINT", actor=founder_user
    )
    assert spend.hub_id == flyer_campaign.hub_id
    assert AuditEvent.objects.filter(action="growth.spend.recorded").exists()
    assert flyer_campaign.cluster_id == flyer_campaign.apartment.cluster_id


@pytest.mark.parametrize(
    "kwargs",
    [
        {"amount_minor": 0, "category": "PRINT"},
        {"amount_minor": 100, "category": "NOPE"},
        {"amount_minor": 100, "category": "PRINT", "spent_on": TODAY + timedelta(days=1)},
    ],
)
def test_invalid_spend_is_rejected(flyer_campaign, kwargs):
    with pytest.raises(ApiError):
        marketing.record_spend(flyer_campaign, **kwargs)


def test_campaign_cant_end_before_it_starts(hub):
    with pytest.raises(ApiError):
        marketing.create_campaign(
            hub=hub,
            name="Bad",
            channel=ChannelCode.FLYER,
            start_on=TODAY,
            end_on=TODAY - timedelta(days=1),
        )


def test_a_customer_is_new_on_their_first_delivered_order_only(hub, service):
    returning = _customer(hub, 1)
    _order(hub, returning, service, delivered_on=TODAY - timedelta(days=60))
    _order(hub, returning, service, delivered_on=TODAY)  # repeat, not new

    lead = _customer(hub, 2)
    _order(hub, lead, service, delivered_on=None)  # booked, never delivered

    fresh = _customer(hub, 3)
    _order(hub, fresh, service, delivered_on=TODAY - timedelta(days=2))

    new = marketing.new_customers(hub, TODAY - timedelta(days=29), TODAY)
    assert new == [fresh.id]


def test_cac_per_channel_includes_first_order_commission(
    hub, service, apartment, founder_user, admin_user, flyer_campaign
):
    # Flyers: ₹2,000 of print, two new customers who said they saw a flyer.
    marketing.record_spend(flyer_campaign, amount_minor=200000, category="PRINT")
    for n in (10, 11):
        _order(hub, _customer(hub, n), service, self_reported=ChannelCode.FLYER)

    # Watchman: no spend, but ₹30 commission on a first order.
    partner = services.onboard_partner(
        hub=hub, kind=PartnerKind.WATCHMAN, name="Ramesh", phone="9876500011"
    )
    code = services.create_referral_code(hub=hub, owner_partner=partner).code
    commission.create_rule(
        hub=hub,
        name="Std",
        basis="PER_ORDER",
        value=3000,
        effective_from=date(2026, 1, 1),
        is_default=True,
    )
    watch_order = _order(hub, _customer(hub, 12), service, code=code)
    commission.accrue_for_order(watch_order)

    # Organic: free.
    _order(hub, _customer(hub, 13), service)

    result = marketing.acquisition_cost(hub, TODAY - timedelta(days=29), TODAY)
    by_channel = {r["channel"]: r for r in result["channels"]}
    assert by_channel["FLYER"]["cac_minor"] == 100000  # ₹2,000 ÷ 2
    assert by_channel["WATCHMAN"]["commission_minor"] == 3000
    assert by_channel["WATCHMAN"]["cac_minor"] == 3000
    assert by_channel["ORGANIC"]["cac_minor"] == 0
    assert result["new_customers"] == 4
    assert result["blended_cac_minor"] == round(203000 / 4)
    # Paid CAC leaves organic out of the denominator (docs/07 ④).
    assert result["paid_cac_minor"] == round(203000 / 3)


def test_removed_spend_no_longer_counts(hub, service, flyer_campaign, founder_user):
    spend = marketing.record_spend(flyer_campaign, amount_minor=50000, category="PRINT")
    marketing.remove_spend(spend, reason="entered twice", actor=founder_user)
    assert marketing.campaign_summary(flyer_campaign)["spend_minor"] == 0
    with pytest.raises(ApiError):
        marketing.remove_spend(spend, reason=" ")


def test_campaign_summary_counts_its_channel_and_apartment(hub, service, apartment, flyer_campaign):
    marketing.record_spend(flyer_campaign, amount_minor=90000, category="PRINT")
    for n in (20, 21, 22):
        order = Order.objects.create(
            hub=hub,
            customer=_customer(hub, n),
            service=service,
            status=OrderStatus.SCHEDULED,
            apartment=apartment,
        )
        services.capture_attribution(order, self_reported=ChannelCode.FLYER)
        order.status = OrderStatus.DELIVERED
        order.delivered_at = timezone.now()
        order.save(update_fields=["status", "delivered_at"])
    # A flyer customer from elsewhere doesn't count for this apartment's flyers.
    _order(hub, _customer(hub, 23), service, self_reported=ChannelCode.FLYER)

    summary = marketing.campaign_summary(flyer_campaign)
    assert summary == {"spend_minor": 90000, "new_customers": 3, "cost_per_customer_minor": 30000}


# ------------------------------------------------------------------- API


@pytest.mark.parametrize("user_fixture", ["admin_user", "operator_user", "field_user"])
def test_only_founders_see_marketing(api_client, request, user_fixture):
    api_client.force_authenticate(user=request.getfixturevalue(user_fixture))
    for url in (
        "/api/v1/growth/campaigns/",
        "/api/v1/growth/spend/",
        "/api/v1/growth/acquisition-cost",
    ):
        assert api_client.get(url).status_code == 403, url


def test_founder_creates_campaign_enters_spend_and_reads_cac(
    api_client, founder_user, hub, apartment
):
    api_client.force_authenticate(user=founder_user)
    created = api_client.post(
        "/api/v1/growth/campaigns/",
        {
            "hub": str(hub.id),
            "name": "Instagram reel",
            "channel": "INFLUENCER",
            "apartment": str(apartment.id),
        },
        format="json",
    )
    assert created.status_code == 201, created.data
    assert created.data["cluster"] == apartment.cluster_id

    spend = api_client.post(
        "/api/v1/growth/spend/",
        {"campaign": created.data["id"], "amount_minor": 400000, "category": "INFLUENCER"},
        format="json",
    )
    assert spend.status_code == 201, spend.data

    listed = api_client.get("/api/v1/growth/campaigns/")
    assert listed.data["results"][0]["summary"]["spend_minor"] == 400000

    cac = api_client.get(f"/api/v1/growth/acquisition-cost?hub={hub.id}")
    assert cac.status_code == 200, cac.data
    assert cac.data["channels"][0]["spend_minor"] == 400000
    assert cac.data["channels"][0]["cac_minor"] is None  # spend, but no customers yet

    removed = api_client.post(
        f"/api/v1/growth/spend/{spend.data['id']}/remove/", {"reason": "typo"}, format="json"
    )
    assert removed.status_code == 200
    assert api_client.get("/api/v1/growth/spend/").data["results"] == []
