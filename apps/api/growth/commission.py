"""Partner commission (docs/08 batches 5.3 and 5.4): the rules, the accrual
when a referred customer's order is delivered, the payable balance, and
settlement runs that pay a partner from a generated statement.

Money flows one way through here: an accrual is written once with the
amount and the terms it was computed under, a settlement claims a set of
accruals and freezes their sum as its total, and paying the settlement
marks those accruals paid. Nothing is recomputed after the fact, which is
what lets "commission payable reconciles to accruals exactly" (SC-6) hold.
"""

from __future__ import annotations

import logging
from datetime import date

from django.db import models, transaction
from django.utils import timezone

import billing.services as billing_services
from common import audit
from common.errors import ApiError
from growth.models import (
    AccrualStatus,
    Attribution,
    CommissionAccrual,
    CommissionAppliesTo,
    CommissionBasis,
    CommissionRule,
    PartnerStatus,
    ReferralPartner,
    Settlement,
    SettlementStatus,
)
from ordering.models import Order, OrderStatus

logger = logging.getLogger("ironman.growth")

# Orders that never happened don't make a later order a customer's
# "second" one.
_NOT_COUNTED = [OrderStatus.DRAFT, OrderStatus.CANCELLED]

PAYMENT_METHODS = ("UPI", "CASH", "BANK")


# ---------------------------------------------------------------- rules


def _validate_terms(*, basis, value, applies_to, first_n, effective_from, effective_to) -> None:
    if basis not in CommissionBasis.values:
        raise ApiError(f"'{basis}' is not a commission basis.", code="validation_error")
    if applies_to not in CommissionAppliesTo.values:
        raise ApiError(f"'{applies_to}' is not a valid 'applies to'.", code="validation_error")
    if value <= 0:
        raise ApiError("Commission value must be positive.", code="validation_error")
    if basis == CommissionBasis.PERCENT_OF_ORDER and value > 10000:
        raise ApiError(
            "A percentage commission is in basis points and can't exceed 10000 (100%).",
            code="validation_error",
        )
    if applies_to == CommissionAppliesTo.FIRST_N_ORDERS and not first_n:
        raise ApiError("Say how many orders 'first N orders' covers.", code="validation_error")
    if effective_to and effective_from and effective_to < effective_from:
        raise ApiError("A rule can't end before it starts.", code="validation_error")


def rule_terms(rule: CommissionRule) -> dict:
    return {
        "name": rule.name,
        "basis": rule.basis,
        "value": rule.value,
        "applies_to": rule.applies_to,
        "first_n": rule.first_n,
        "cap_minor": rule.cap_minor,
    }


def _clear_other_defaults(rule: CommissionRule) -> None:
    CommissionRule.objects.filter(hub_id=rule.hub_id, is_default=True).exclude(pk=rule.pk).update(
        is_default=False
    )


def get_rule(rule_id) -> CommissionRule:
    try:
        return CommissionRule.objects.get(pk=rule_id, deleted_at__isnull=True)
    except (CommissionRule.DoesNotExist, ValueError, TypeError) as exc:
        raise ApiError("Commission rule not found.", code="not_found", status_code=404) from exc


@transaction.atomic
def create_rule(
    *,
    hub,
    name: str,
    basis: str,
    value: int,
    applies_to: str = CommissionAppliesTo.FIRST_ORDER_ONLY,
    first_n: int | None = None,
    cap_minor: int | None = None,
    effective_from: date | None = None,
    effective_to: date | None = None,
    is_default: bool = False,
    actor=None,
) -> CommissionRule:
    effective_from = effective_from or timezone.localdate()
    _validate_terms(
        basis=basis,
        value=value,
        applies_to=applies_to,
        first_n=first_n,
        effective_from=effective_from,
        effective_to=effective_to,
    )
    rule = CommissionRule.objects.create(
        hub=hub,
        name=name,
        basis=basis,
        value=value,
        applies_to=applies_to,
        first_n=first_n if applies_to == CommissionAppliesTo.FIRST_N_ORDERS else None,
        cap_minor=cap_minor or None,
        effective_from=effective_from,
        effective_to=effective_to,
        is_default=is_default,
        created_by=actor,
    )
    if is_default:
        _clear_other_defaults(rule)
    audit.record(
        action="growth.commission_rule.created",
        object_type="CommissionRule",
        object_id=rule.id,
        hub=hub,
        after=rule_terms(rule) | {"is_default": is_default},
        actor=actor,
    )
    return rule


# Terms a rule can't change once anything has accrued under it — changing
# them would silently re-price history.
_TERM_FIELDS = {"basis", "value", "applies_to", "first_n", "cap_minor", "effective_from"}


@transaction.atomic
def update_rule(rule: CommissionRule, *, changes: dict, actor=None) -> CommissionRule:
    rule = CommissionRule.objects.select_for_update().get(pk=rule.pk)
    touched_terms = _TERM_FIELDS & {k for k, v in changes.items() if getattr(rule, k) != v}
    if touched_terms and rule.accruals.exists():
        raise ApiError(
            "This rule has already earned commission, so its terms are fixed. "
            "End it and create a new rule instead.",
            code="conflict",
            status_code=409,
        )
    before = rule_terms(rule) | {
        "effective_to": str(rule.effective_to or ""),
        "is_default": rule.is_default,
    }
    for field, value in changes.items():
        setattr(rule, field, value)
    _validate_terms(
        basis=rule.basis,
        value=rule.value,
        applies_to=rule.applies_to,
        first_n=rule.first_n,
        effective_from=rule.effective_from,
        effective_to=rule.effective_to,
    )
    if rule.applies_to != CommissionAppliesTo.FIRST_N_ORDERS:
        rule.first_n = None
    rule.updated_by = actor
    rule.save()
    if rule.is_default:
        _clear_other_defaults(rule)
    audit.record(
        action="growth.commission_rule.updated",
        object_type="CommissionRule",
        object_id=rule.id,
        hub=rule.hub,
        before=before,
        after=rule_terms(rule)
        | {"effective_to": str(rule.effective_to or ""), "is_default": rule.is_default},
        actor=actor,
    )
    return rule


@transaction.atomic
def assign_rule(partner: ReferralPartner, rule: CommissionRule | None, *, actor=None):
    if rule is not None and rule.hub_id != partner.hub_id:
        raise ApiError(
            "That rule belongs to another hub.", code="validation_error", status_code=400
        )
    before = {"commission_rule": str(partner.commission_rule_id or "")}
    partner.commission_rule = rule
    partner.updated_by = actor
    partner.save(update_fields=["commission_rule", "updated_by", "updated_at"])
    audit.record(
        action="growth.partner.commission_rule_assigned",
        object_type="ReferralPartner",
        object_id=partner.id,
        hub=partner.hub,
        before=before,
        after={"commission_rule": str(rule.id) if rule else ""},
        actor=actor,
    )
    return partner


def _is_effective(rule: CommissionRule | None, on: date) -> bool:
    return (
        rule is not None
        and rule.deleted_at is None
        and rule.effective_from <= on
        and (rule.effective_to is None or on <= rule.effective_to)
    )


def resolve_rule(partner: ReferralPartner, on: date) -> CommissionRule | None:
    """The partner's own rule if it's in force that day, else their hub's
    default, else nothing (no rule means no commission — never a guess)."""
    if _is_effective(partner.commission_rule, on):
        return partner.commission_rule
    default = (
        CommissionRule.objects.filter(
            hub_id=partner.hub_id, is_default=True, deleted_at__isnull=True
        )
        .order_by("-effective_from")
        .first()
    )
    return default if _is_effective(default, on) else None


# -------------------------------------------------------------- accrual


def partner_for_order(order) -> ReferralPartner | None:
    """Who referred this order: a partner's code used on this very order
    wins, else whoever first brought the customer in. A partner who has
    since been deactivated earns nothing new."""
    attribution = (
        Attribution.objects.filter(order=order, partner__isnull=False)
        .select_related("partner")
        .order_by("-captured_at")
        .first()
    ) or (
        Attribution.objects.filter(
            customer_id=order.customer_id, is_first_touch=True, partner__isnull=False
        )
        .select_related("partner")
        .first()
    )
    if attribution is None or attribution.partner.status != PartnerStatus.ACTIVE:
        return None
    return attribution.partner


def prior_order_count(order) -> int:
    """How many real orders this customer placed before this one."""
    return (
        Order.objects.filter(customer_id=order.customer_id, created_at__lt=order.created_at)
        .exclude(pk=order.pk)
        .exclude(status__in=_NOT_COUNTED)
        .count()
    )


def order_value_minor(order) -> int:
    invoice = billing_services.get_invoice_for_order(order)
    return invoice.total_minor if invoice else order.total_minor


def compute_amount(rule: CommissionRule, order, *, prior_orders: int) -> int:
    if rule.basis == CommissionBasis.FLAT_FIRST_ORDER:
        qualifies = prior_orders == 0
    elif rule.applies_to == CommissionAppliesTo.FIRST_ORDER_ONLY:
        qualifies = prior_orders == 0
    elif rule.applies_to == CommissionAppliesTo.FIRST_N_ORDERS:
        qualifies = prior_orders < (rule.first_n or 0)
    else:
        qualifies = True
    if not qualifies:
        return 0

    if rule.basis == CommissionBasis.PER_ITEM:
        items = order.verified_total_qty or order.declared_total_qty or 0
        amount = rule.value * items
    elif rule.basis == CommissionBasis.PERCENT_OF_ORDER:
        # Basis points, rounded half-up in integer paise (ADR-004).
        amount = (order_value_minor(order) * rule.value + 5000) // 10000
    else:
        amount = rule.value
    if rule.cap_minor:
        amount = min(amount, rule.cap_minor)
    return max(amount, 0)


@transaction.atomic
def accrue_for_order(order, *, actor=None) -> CommissionAccrual | None:
    partner = partner_for_order(order)
    if partner is None:
        return None
    existing = CommissionAccrual.objects.filter(partner=partner, order=order).first()
    if existing:
        return existing
    on = timezone.localdate(order.delivered_at or timezone.now())
    rule = resolve_rule(partner, on)
    if rule is None:
        return None
    amount = compute_amount(rule, order, prior_orders=prior_order_count(order))
    if amount <= 0:
        return None
    accrual = CommissionAccrual.objects.create(
        hub=order.hub,
        partner=partner,
        order=order,
        rule=rule,
        rule_terms=rule_terms(rule),
        amount_minor=amount,
        created_by=actor,
    )
    billing_services.record_order_cost(
        order, kind="COMMISSION", amount_minor=amount, source_ref=f"accrual:{accrual.id}"
    )
    return accrual


def accrue_on_delivery(order, *, actor=None) -> CommissionAccrual | None:
    """Called as an order is delivered. Best-effort, like the invoice that
    follows a delivery: a rider's completion must never fail over
    commission bookkeeping, and `backfill_accruals` catches anything
    missed."""
    try:
        with transaction.atomic():
            return accrue_for_order(order, actor=actor)
    except Exception:
        logger.exception("Commission accrual failed for order %s", order.ref)
        return None


def backfill_accruals(hub=None, *, actor=None) -> int:
    """Accrue for every delivered order that should have earned commission
    but hasn't (an order delivered before a rule existed, or one whose
    accrual failed). Idempotent: an order already accrued is skipped."""
    orders = Order.objects.filter(status__in=[OrderStatus.DELIVERED, OrderStatus.CLOSED])
    if hub is not None:
        orders = orders.filter(hub=hub)
    accrued_order_ids = CommissionAccrual.objects.values_list("order_id", flat=True)
    created = 0
    for order in orders.exclude(pk__in=accrued_order_ids).order_by("created_at"):
        if accrue_for_order(order, actor=actor):
            created += 1
    return created


@transaction.atomic
def void_accrual(accrual: CommissionAccrual, *, reason: str, actor=None) -> CommissionAccrual:
    accrual = CommissionAccrual.objects.select_for_update().get(pk=accrual.pk)
    if accrual.status != AccrualStatus.ACCRUED:
        raise ApiError(
            "Only unsettled commission can be voided — cancel its settlement first.",
            code="conflict",
            status_code=409,
        )
    if not reason.strip():
        raise ApiError("Say why this commission is being voided.", code="validation_error")
    accrual.status = AccrualStatus.VOID
    accrual.void_reason = reason.strip()
    accrual.updated_by = actor
    accrual.save(update_fields=["status", "void_reason", "updated_by", "updated_at"])
    billing_services.reverse_order_cost(
        accrual.order,
        kind="COMMISSION",
        amount_minor=accrual.amount_minor,
        source_ref=f"accrual-void:{accrual.id}",
    )
    audit.record(
        action="growth.commission_accrual.voided",
        object_type="CommissionAccrual",
        object_id=accrual.id,
        hub=accrual.hub,
        before={"status": AccrualStatus.ACCRUED},
        after={"status": AccrualStatus.VOID, "reason": accrual.void_reason},
        actor=actor,
    )
    return accrual


def partner_balance(partner: ReferralPartner) -> dict:
    sums = dict(
        CommissionAccrual.objects.filter(partner=partner)
        .values_list("status")
        .annotate(total=models.Sum("amount_minor"))
        .values_list("status", "total")
    )
    accrued = sums.get(AccrualStatus.ACCRUED, 0)
    in_settlement = sums.get(AccrualStatus.APPROVED, 0)
    return {
        "partner": str(partner.id),
        "accrued_minor": accrued,
        "in_settlement_minor": in_settlement,
        "payable_minor": accrued + in_settlement,
        "paid_minor": sums.get(AccrualStatus.SETTLED, 0),
        "void_minor": sums.get(AccrualStatus.VOID, 0),
    }


# ----------------------------------------------------------- settlement


def get_settlement(settlement_id) -> Settlement:
    try:
        return Settlement.objects.select_related("partner").get(
            pk=settlement_id, deleted_at__isnull=True
        )
    except (Settlement.DoesNotExist, ValueError, TypeError) as exc:
        raise ApiError("Settlement not found.", code="not_found", status_code=404) from exc


def _render_statement(settlement: Settlement) -> None:
    """Best-effort: a renderer failure must not lose the payout record;
    the statement endpoint renders on demand if the stored file is
    missing."""
    from growth.pdf import render_statement_pdf

    try:
        settlement.statement_pdf = render_statement_pdf(settlement)
        settlement.save(update_fields=["statement_pdf", "updated_at"])
    except Exception:
        logger.exception("Statement PDF failed for settlement %s", settlement.ref)


@transaction.atomic
def create_settlement(
    partner: ReferralPartner,
    *,
    period_end: date | None = None,
    period_start: date | None = None,
    actor=None,
) -> Settlement:
    # Lock the partner so two settlement runs can't claim the same accruals.
    partner = ReferralPartner.objects.select_for_update().get(pk=partner.pk)
    period_end = period_end or timezone.localdate()
    if period_start and period_start > period_end:
        raise ApiError("The period can't start after it ends.", code="validation_error")
    accruals = CommissionAccrual.objects.filter(
        partner=partner,
        status=AccrualStatus.ACCRUED,
        settlement__isnull=True,
        accrued_at__date__lte=period_end,
    )
    if period_start:
        accruals = accruals.filter(accrued_at__date__gte=period_start)
    ids = list(accruals.values_list("id", flat=True))
    if not ids:
        raise ApiError(
            f"{partner.name} has no unpaid commission in that period.",
            code="validation_error",
        )
    total = (
        CommissionAccrual.objects.filter(pk__in=ids).aggregate(t=models.Sum("amount_minor"))["t"]
        or 0
    )
    settlement = Settlement.objects.create(
        hub=partner.hub,
        partner=partner,
        period_start=period_start,
        period_end=period_end,
        total_minor=total,
        approved_by=actor,
        created_by=actor,
    )
    CommissionAccrual.objects.filter(pk__in=ids).update(
        status=AccrualStatus.APPROVED, settlement=settlement, updated_at=timezone.now()
    )
    audit.record(
        action="growth.settlement.created",
        object_type="Settlement",
        object_id=settlement.id,
        hub=partner.hub,
        after={"ref": settlement.ref, "total_minor": total, "accruals": len(ids)},
        actor=actor,
    )
    _render_statement(settlement)
    return settlement


@transaction.atomic
def mark_settlement_paid(
    settlement: Settlement, *, payment_ref: str, payment_method: str = "UPI", actor=None
) -> Settlement:
    settlement = Settlement.objects.select_for_update().get(pk=settlement.pk)
    if settlement.status != SettlementStatus.PENDING:
        raise ApiError(
            f"{settlement.ref} is {settlement.get_status_display().lower()}, not awaiting payment.",
            code="conflict",
            status_code=409,
        )
    if payment_method not in PAYMENT_METHODS:
        raise ApiError(f"'{payment_method}' is not a payout method.", code="validation_error")
    if not payment_ref.strip() and payment_method != "CASH":
        raise ApiError("Enter the UPI or bank transaction reference.", code="validation_error")
    settlement.status = SettlementStatus.PAID
    settlement.paid_at = timezone.now()
    settlement.payment_method = payment_method
    settlement.payment_ref = payment_ref.strip()
    settlement.updated_by = actor
    settlement.save()
    settlement.accruals.update(status=AccrualStatus.SETTLED, updated_at=timezone.now())
    audit.record(
        action="growth.settlement.paid",
        object_type="Settlement",
        object_id=settlement.id,
        hub=settlement.hub,
        before={"status": SettlementStatus.PENDING},
        after={
            "status": SettlementStatus.PAID,
            "payment_method": payment_method,
            "payment_ref": settlement.payment_ref,
            "total_minor": settlement.total_minor,
        },
        actor=actor,
    )
    _render_statement(settlement)
    return settlement


@transaction.atomic
def cancel_settlement(settlement: Settlement, *, actor=None) -> Settlement:
    settlement = Settlement.objects.select_for_update().get(pk=settlement.pk)
    if settlement.status != SettlementStatus.PENDING:
        raise ApiError(
            "Only a settlement that hasn't been paid can be cancelled.",
            code="conflict",
            status_code=409,
        )
    settlement.accruals.update(
        status=AccrualStatus.ACCRUED, settlement=None, updated_at=timezone.now()
    )
    settlement.status = SettlementStatus.CANCELLED
    settlement.updated_by = actor
    settlement.save()
    audit.record(
        action="growth.settlement.cancelled",
        object_type="Settlement",
        object_id=settlement.id,
        hub=settlement.hub,
        before={"status": SettlementStatus.PENDING},
        after={"status": SettlementStatus.CANCELLED},
        actor=actor,
    )
    return settlement


def statement_lines(settlement: Settlement):
    """A cancelled settlement has released its accruals, so its statement
    is just the header and total."""
    return (
        settlement.accruals.select_related("order", "order__customer").order_by("accrued_at").all()
    )
