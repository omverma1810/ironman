"""docs/08 batch 5.5: customer referral codes, sharing and reward credit."""

from __future__ import annotations

import pytest
from django.utils import timezone

from billing.services import customer_credit_balance
from customers.models import Customer
from growth import referrals, services
from growth.models import CustomerReferralReward
from ordering.models import Order, OrderStatus

pytestmark = pytest.mark.django_db


@pytest.fixture
def referrer(hub):
    return Customer.objects.create(hub=hub, name="Priya Sharma", phone="+919855500001")


@pytest.fixture
def friend(hub):
    return Customer.objects.create(hub=hub, name="Rohan Gupta", phone="+919855500002")


def _order(hub, customer, service, *, code="", total=6000, delivered=True):
    order = Order.objects.create(
        hub=hub,
        customer=customer,
        service=service,
        status=OrderStatus.SCHEDULED,
        referral_code=code,
        total_minor=total,
    )
    services.capture_attribution(order)
    if delivered:
        order.status = OrderStatus.DELIVERED
        order.delivered_at = timezone.now()
        order.save(update_fields=["status", "delivered_at"])
    return order


def test_a_customer_gets_one_stable_share_code(referrer):
    code = referrals.customer_code(referrer)
    assert code.code.startswith("PRIYASHA")
    assert referrals.customer_code(referrer).id == code.id


def test_friends_first_delivered_order_credits_both_customers(hub, service, referrer, friend):
    code = referrals.customer_code(referrer).code
    order = _order(hub, friend, service, code=code)

    reward = referrals.reward_for_order(order)
    assert reward.referrer_id == referrer.id
    assert customer_credit_balance(referrer) == 5000  # ₹50 default
    assert customer_credit_balance(friend) == 2500  # ₹25 welcome credit

    summary = referrals.summary(referrer)
    assert summary["friends_joined"] == 1
    assert summary["rewards_count"] == 1
    assert summary["rewards_earned_minor"] == 5000


def test_a_friend_rewards_only_once(hub, service, referrer, friend):
    code = referrals.customer_code(referrer).code
    first = _order(hub, friend, service, code=code)
    referrals.reward_for_order(first)
    assert referrals.reward_for_order(first) is None
    second = _order(hub, friend, service, code=code)
    assert referrals.reward_for_order(second) is None
    assert customer_credit_balance(referrer) == 5000


def test_only_the_friends_first_order_qualifies(hub, service, referrer, friend):
    code = referrals.customer_code(referrer).code
    _order(hub, friend, service, code=code, delivered=False)  # first order, not delivered yet
    second = _order(hub, friend, service)
    assert referrals.reward_for_order(second) is None


def test_an_existing_customer_using_a_code_later_earns_nothing(hub, service, referrer, friend):
    first = _order(hub, friend, service)  # came in on their own
    referrals.reward_for_order(first)
    code = referrals.customer_code(referrer).code
    later = _order(hub, friend, service, code=code)
    assert referrals.reward_for_order(later) is None
    assert customer_credit_balance(referrer) == 0


def test_you_cant_refer_yourself(hub, service, referrer):
    code = referrals.customer_code(referrer).code
    order = _order(hub, referrer, service, code=code)
    assert referrals.reward_for_order(order) is None


def test_inactive_programme_or_small_order_earns_nothing(hub, service, referrer, friend):
    program = referrals.get_program(hub)
    referrals.update_program(program, changes={"min_order_minor": 10000})
    code = referrals.customer_code(referrer).code
    assert referrals.reward_for_order(_order(hub, friend, service, code=code, total=6000)) is None

    referrals.update_program(program, changes={"min_order_minor": 0, "is_active": False})
    assert referrals.reward_for_order(_order(hub, friend, service, code=code)) is None


def test_partner_codes_never_pay_customer_rewards(hub, service, friend, admin_user):
    from growth.models import PartnerKind

    partner = services.onboard_partner(
        hub=hub, kind=PartnerKind.WATCHMAN, name="Ramesh", phone="9876500009"
    )
    code = services.create_referral_code(hub=hub, owner_partner=partner).code
    assert referrals.reward_for_order(_order(hub, friend, service, code=code)) is None


def test_reward_failure_never_raises_on_delivery(hub, service, referrer, friend, monkeypatch):
    code = referrals.customer_code(referrer).code
    order = _order(hub, friend, service, code=code)

    def boom(*a, **k):
        raise RuntimeError("ledger down")

    monkeypatch.setattr(referrals.billing_services, "record_credit", boom)
    assert referrals.reward_on_delivery(order) is None
    assert not CustomerReferralReward.objects.exists()


# ------------------------------------------------------------------- API


def test_customer_sees_their_own_code_and_terms(api_client, customer_user, customer):
    api_client.force_authenticate(user=customer_user)
    resp = api_client.get("/api/v1/growth/my-referral")
    assert resp.status_code == 200, resp.data
    assert resp.data["code"]
    assert resp.data["referrer_reward_minor"] == 5000
    assert resp.data["referee_reward_minor"] == 2500


def test_no_customer_profile_means_no_code_yet(api_client, operator_user):
    api_client.force_authenticate(user=operator_user)
    assert api_client.get("/api/v1/growth/my-referral").status_code == 404


def test_my_referral_needs_sign_in(api_client):
    assert api_client.get("/api/v1/growth/my-referral").status_code in (401, 403)


def test_founder_changes_programme_admin_reads_operator_neither(
    api_client, founder_user, admin_user, operator_user, hub
):
    url = f"/api/v1/growth/referral-program?hub={hub.id}"
    api_client.force_authenticate(user=operator_user)
    assert api_client.get(url).status_code == 403

    api_client.force_authenticate(user=admin_user)
    assert api_client.get(url).status_code == 200
    assert api_client.patch(url, {"referrer_reward_minor": 7500}, format="json").status_code == 403

    api_client.force_authenticate(user=founder_user)
    resp = api_client.patch(url, {"referrer_reward_minor": 7500}, format="json")
    assert resp.status_code == 200, resp.data
    assert resp.data["referrer_reward_minor"] == 7500


def test_rewards_list_is_admin_and_founder_only(api_client, admin_user, field_user):
    api_client.force_authenticate(user=field_user)
    assert api_client.get("/api/v1/growth/customer-referral-rewards/").status_code == 403
    api_client.force_authenticate(user=admin_user)
    assert api_client.get("/api/v1/growth/customer-referral-rewards/").status_code == 200
