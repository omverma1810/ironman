"""Customer referrals (docs/08 batch 5.5): every customer gets a code to
share, and when a friend they referred has their first order delivered,
both earn store credit on the hub's `ReferralProgram` terms.

The reward follows the same rules as partner commission: it is decided by
the friend's first-touch attribution (written once, at their first booking,
by `services.capture_attribution`), paid at most once per friend, and runs
best-effort on delivery so a rider's completion never fails over it.
"""

from __future__ import annotations

import logging

from django.db import models, transaction

import billing.services as billing_services
from common import audit
from common.errors import ApiError
from growth import services
from growth.commission import order_value_minor, prior_order_count
from growth.models import (
    Attribution,
    CustomerReferralReward,
    ReferralCode,
    ReferralProgram,
)

logger = logging.getLogger("ironman.growth")


def get_program(hub) -> ReferralProgram:
    """The hub's terms, created with the defaults on first use (₹50 to the
    referrer, ₹25 welcome credit to the friend)."""
    program, _ = ReferralProgram.objects.get_or_create(hub=hub)
    return program


_PROGRAM_FIELDS = ("is_active", "referrer_reward_minor", "referee_reward_minor", "min_order_minor")


@transaction.atomic
def update_program(program: ReferralProgram, *, changes: dict, actor=None) -> ReferralProgram:
    program = ReferralProgram.objects.select_for_update().get(pk=program.pk)
    before = {f: getattr(program, f) for f in _PROGRAM_FIELDS}
    for field, value in changes.items():
        if field in _PROGRAM_FIELDS:
            setattr(program, field, value)
    if program.is_active and program.referrer_reward_minor <= 0:
        raise ApiError(
            "An active programme needs a reward for the customer who refers.",
            code="validation_error",
        )
    program.updated_by = actor
    program.save()
    audit.record(
        action="growth.referral_program.updated",
        object_type="ReferralProgram",
        object_id=program.id,
        hub=program.hub,
        before=before,
        after={f: getattr(program, f) for f in _PROGRAM_FIELDS},
        actor=actor,
    )
    return program


def customer_code(customer) -> ReferralCode:
    """The customer's own share code, issued the first time they ask."""
    existing = (
        ReferralCode.objects.filter(owner_customer=customer, deleted_at__isnull=True)
        .order_by("-is_active", "created_at")
        .first()
    )
    if existing:
        return existing
    return services.create_referral_code(hub=customer.hub, owner_customer=customer)


def summary(customer) -> dict:
    code = customer_code(customer)
    program = get_program(customer.hub)
    rewards = CustomerReferralReward.objects.filter(referrer=customer)
    earned = rewards.aggregate(total=models.Sum("referrer_credit_minor"))["total"] or 0
    friends_joined = (
        Attribution.objects.filter(referral_code=code, is_first_touch=True)
        .values("customer")
        .distinct()
        .count()
    )
    return {
        "code": code.code,
        "is_active": code.is_active and program.is_active,
        "friends_joined": friends_joined,
        "rewards_count": rewards.count(),
        "rewards_earned_minor": earned,
        "referrer_reward_minor": program.referrer_reward_minor,
        "referee_reward_minor": program.referee_reward_minor,
        "min_order_minor": program.min_order_minor,
        "credit_balance_minor": billing_services.customer_credit_balance(customer),
    }


@transaction.atomic
def reward_for_order(order, *, actor=None) -> CustomerReferralReward | None:
    """Pay the referral reward if this delivered order is a referred
    friend's first. Idempotent: a friend rewards at most once, ever."""
    if CustomerReferralReward.objects.filter(referee_id=order.customer_id).exists():
        return None
    attribution = (
        Attribution.objects.filter(
            customer_id=order.customer_id,
            is_first_touch=True,
            referral_code__owner_customer__isnull=False,
        )
        .select_related("referral_code__owner_customer", "customer")
        .first()
    )
    if attribution is None:
        return None
    code = attribution.referral_code
    referrer = code.owner_customer
    referee = attribution.customer
    if referrer.id == referee.id or referrer.deleted_at is not None:
        return None
    if prior_order_count(order) != 0:
        return None  # only the friend's first order qualifies
    from privacy import services as privacy_services

    if privacy_services.was_deleted(referee.phone):
        return None  # deleted and re-registered: not a new friend (docs/06 §6)
    program = get_program(order.hub)
    if not program.is_active or order_value_minor(order) < program.min_order_minor:
        return None

    reward = CustomerReferralReward.objects.create(
        hub=order.hub,
        referrer=referrer,
        referee=referee,
        referral_code=code,
        order=order,
        referrer_credit_minor=program.referrer_reward_minor,
        referee_credit_minor=program.referee_reward_minor,
        created_by=actor,
    )
    first_name = (referee.name or "your friend").split(" ")[0]
    billing_services.record_credit(
        referrer,
        delta_minor=program.referrer_reward_minor,
        reason="REFERRAL",
        order=order,
        actor=actor,
        note=f"Referral reward — {first_name}'s first order ({order.ref})",
    )
    if program.referee_reward_minor > 0:
        billing_services.record_credit(
            referee,
            delta_minor=program.referee_reward_minor,
            reason="REFERRAL",
            order=order,
            actor=actor,
            note=f"Welcome credit — referred with code {code.code}",
        )
    return reward


def reward_on_delivery(order, *, actor=None) -> CustomerReferralReward | None:
    """Best-effort, like commission accrual: never fails a delivery."""
    try:
        with transaction.atomic():
            return reward_for_order(order, actor=actor)
    except Exception:
        logger.exception("Referral reward failed for order %s", order.ref)
        return None
