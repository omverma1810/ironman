"""docs/07 §"Customer Feedback": average rating, response rate and trend
all read from here eventually (Phase 6) — this module is just the write
path, batch 4.6's actual scope. Batch 5.1 (docs/08) adds partner
onboarding and referral-code issuance/validation below."""

from __future__ import annotations

import random
import string

from django.db import transaction
from django.utils import timezone

from common.errors import ApiError
from customers.models import Customer
from growth.models import Feedback, PartnerStatus, ReferralCode, ReferralPartner
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


# ── Referral partners & codes (docs/02 §3.10, docs/08 batch 5.1) ─────────


def get_partner(partner_id) -> ReferralPartner:
    try:
        return ReferralPartner.objects.get(pk=partner_id)
    except ReferralPartner.DoesNotExist as exc:
        raise ApiError("Referral partner not found.", code="not_found") from exc


def onboard_partner(
    *,
    hub,
    kind: str,
    name: str,
    phone: str,
    apartment=None,
    upi_id: str = "",
    notes: str = "",
    actor=None,
) -> ReferralPartner:
    name = name.strip()
    phone = phone.strip()
    if not name:
        raise ApiError("Partner name is required.", code="validation_error")
    if not phone:
        raise ApiError("Partner phone is required.", code="validation_error")
    return ReferralPartner.objects.create(
        hub=hub,
        kind=kind,
        name=name,
        phone=phone,
        apartment=apartment,
        upi_id=upi_id,
        notes=notes,
        status=PartnerStatus.ACTIVE,
        onboarded_by=actor,
        created_by=actor,
    )


def set_partner_status(partner: ReferralPartner, *, status: str, actor=None) -> ReferralPartner:
    if status not in PartnerStatus.values:
        raise ApiError(f"'{status}' is not a valid partner status.", code="validation_error")
    partner.status = status
    partner.updated_by = actor
    partner.save(update_fields=["status", "updated_by", "updated_at"])
    return partner


def _generate_referral_code(seed: str) -> str:
    """A human-sayable code (docs/02 §3.10) — an alnum slug of the owner's
    own name plus a short random suffix, not a UUID a watchman could never
    read out over a phone call."""
    slug = "".join(ch for ch in seed.upper() if ch.isalnum())[:8] or "PARTNER"
    suffix = "".join(random.choices(string.digits, k=3))
    return f"{slug}{suffix}"


def get_referral_code(code: str) -> ReferralCode:
    try:
        return ReferralCode.objects.get(code=code.strip().upper())
    except ReferralCode.DoesNotExist as exc:
        raise ApiError("Referral code not found.", code="not_found") from exc


@transaction.atomic
def create_referral_code(
    *,
    hub,
    owner_partner: ReferralPartner | None = None,
    owner_customer: Customer | None = None,
    apartment=None,
    code: str | None = None,
    actor=None,
) -> ReferralCode:
    if bool(owner_partner) == bool(owner_customer):
        raise ApiError(
            "A referral code needs exactly one owner — a partner or a customer.",
            code="validation_error",
        )
    seed = owner_partner.name if owner_partner else owner_customer.name
    if code:
        code = code.strip().upper()
        if ReferralCode.objects.filter(code=code).exists():
            raise ApiError(f"Referral code '{code}' is already in use.", code="validation_error")
    else:
        for _ in range(5):
            candidate = _generate_referral_code(seed)
            if not ReferralCode.objects.filter(code=candidate).exists():
                code = candidate
                break
        else:
            raise ApiError("Couldn't generate a unique referral code — try again.", code="conflict")

    return ReferralCode.objects.create(
        hub=hub,
        code=code,
        owner_partner=owner_partner,
        owner_customer=owner_customer,
        apartment=apartment,
        created_by=actor,
    )


def set_referral_code_active(
    referral_code: ReferralCode, *, is_active: bool, actor=None
) -> ReferralCode:
    referral_code.is_active = is_active
    referral_code.updated_by = actor
    referral_code.save(update_fields=["is_active", "updated_by", "updated_at"])
    return referral_code


def validate_referral_code(code: str) -> ReferralCode:
    """Public — used at booking (docs/04 §3.9) to check a code before
    it's attached to an order, the same "cheap pre-check, no side effects"
    shape as `catalog.quote`. Deliberately read-only: an unauthenticated
    endpoint a customer's browser can call on every keystroke must not
    move `uses_count` — batch 5.2's attribution capture increments it
    once, when a code is actually attached to a placed order."""
    try:
        referral_code = ReferralCode.objects.get(code=code.strip().upper())
    except ReferralCode.DoesNotExist as exc:
        raise ApiError("Referral code not found.", code="not_found") from exc
    if not referral_code.is_active:
        raise ApiError("This referral code is no longer active.", code="validation_error")
    return referral_code
