"""docs/08 batches 5.3/5.4: commission rules, accrual on delivered orders,
payable balance and settlement runs. The reconciliation tests are the
phase's exit criterion: commission payable reconciles to accruals exactly."""

from __future__ import annotations

from datetime import date, timedelta

import pytest
from django.utils import timezone

from billing.models import OrderCost
from common.errors import ApiError
from customers.models import Customer
from growth import commission, services
from growth.models import (
    AccrualStatus,
    CommissionAppliesTo,
    CommissionBasis,
    PartnerKind,
    PartnerStatus,
    SettlementStatus,
)
from identity.models import AuditEvent
from ordering.models import Order, OrderStatus

pytestmark = pytest.mark.django_db


@pytest.fixture
def partner(hub, admin_user):
    return services.onboard_partner(
        hub=hub, kind=PartnerKind.WATCHMAN, name="Ramesh", phone="9876500001", actor=admin_user
    )


@pytest.fixture
def code(hub, partner, admin_user):
    return services.create_referral_code(hub=hub, owner_partner=partner, actor=admin_user)


def _rule(hub, founder_user, **kw):
    terms = {
        "name": "Watchman standard",
        "basis": CommissionBasis.PER_ORDER,
        "value": 3000,
        "applies_to": CommissionAppliesTo.FIRST_ORDER_ONLY,
        "effective_from": date(2026, 1, 1),
        "is_default": True,
    } | kw
    return commission.create_rule(hub=hub, actor=founder_user, **terms)


def _delivered(hub, customer, service, *, code="", total=5000, qty=4, when=None):
    order = Order.objects.create(
        hub=hub,
        customer=customer,
        service=service,
        status=OrderStatus.SCHEDULED,
        referral_code=code,
        declared_total_qty=qty,
        verified_total_qty=qty,
        total_minor=total,
    )
    services.capture_attribution(order)
    order.status = OrderStatus.DELIVERED
    order.delivered_at = when or timezone.now()
    order.save(update_fields=["status", "delivered_at"])
    return order


# ---------------------------------------------------------------- rules


def test_first_order_only_pays_once_per_referred_customer(
    hub, customer, service, code, founder_user
):
    _rule(hub, founder_user)
    first = _delivered(hub, customer, service, code=code.code)
    second = _delivered(hub, customer, service)

    accrual = commission.accrue_for_order(first)
    assert accrual.amount_minor == 3000
    assert accrual.partner_id == code.owner_partner_id
    assert accrual.rule_terms["basis"] == CommissionBasis.PER_ORDER
    assert commission.accrue_for_order(second) is None


def test_all_orders_rule_pays_on_every_order_of_the_referred_customer(
    hub, customer, service, code, founder_user
):
    _rule(hub, founder_user, applies_to=CommissionAppliesTo.ALL_ORDERS)
    orders = [
        _delivered(hub, customer, service, code=code.code if i == 0 else "") for i in range(3)
    ]
    amounts = [commission.accrue_for_order(o).amount_minor for o in orders]
    assert amounts == [3000, 3000, 3000]


def test_first_n_orders_stops_after_n(hub, customer, service, code, founder_user):
    _rule(hub, founder_user, applies_to=CommissionAppliesTo.FIRST_N_ORDERS, first_n=2)
    orders = [
        _delivered(hub, customer, service, code=code.code if i == 0 else "") for i in range(3)
    ]
    results = [commission.accrue_for_order(o) for o in orders]
    assert [r.amount_minor if r else None for r in results] == [3000, 3000, None]


def test_percent_of_order_uses_basis_points_with_half_up_rounding(
    hub, customer, service, code, founder_user
):
    # 12.5% of ₹50.05 = 625.625p → 626p
    _rule(hub, founder_user, basis=CommissionBasis.PERCENT_OF_ORDER, value=1250)
    order = _delivered(hub, customer, service, code=code.code, total=5005)
    assert commission.accrue_for_order(order).amount_minor == 626


def test_per_item_with_a_cap(hub, customer, service, code, founder_user):
    _rule(hub, founder_user, basis=CommissionBasis.PER_ITEM, value=300, cap_minor=1000)
    order = _delivered(hub, customer, service, code=code.code, qty=5)
    assert commission.accrue_for_order(order).amount_minor == 1000  # 5 × ₹3 capped at ₹10


def test_partner_rule_overrides_the_hub_default(hub, customer, service, code, founder_user):
    _rule(hub, founder_user)
    special = _rule(hub, founder_user, name="Top watchman", value=5000, is_default=False)
    commission.assign_rule(code.owner_partner, special, actor=founder_user)
    order = _delivered(hub, customer, service, code=code.code)
    assert commission.accrue_for_order(order).amount_minor == 5000


def test_an_expired_partner_rule_falls_back_to_the_default(
    hub, customer, service, code, founder_user
):
    _rule(hub, founder_user)
    old = _rule(
        hub,
        founder_user,
        name="Launch bonus",
        value=9000,
        is_default=False,
        effective_to=date(2026, 1, 31),
    )
    commission.assign_rule(code.owner_partner, old, actor=founder_user)
    order = _delivered(hub, customer, service, code=code.code)
    assert commission.accrue_for_order(order).amount_minor == 3000


def test_no_rule_no_commission(hub, customer, service, code):
    order = _delivered(hub, customer, service, code=code.code)
    assert commission.accrue_for_order(order) is None


def test_unreferred_customer_earns_nobody_anything(hub, customer, service, founder_user):
    _rule(hub, founder_user)
    assert commission.accrue_for_order(_delivered(hub, customer, service)) is None


def test_deactivated_partner_earns_nothing_new(hub, customer, service, code, founder_user):
    _rule(hub, founder_user)
    order = _delivered(hub, customer, service, code=code.code)
    services.set_partner_status(code.owner_partner, status=PartnerStatus.INACTIVE)
    assert commission.accrue_for_order(order) is None


def test_accrual_is_idempotent_and_writes_one_commission_cost(
    hub, customer, service, code, founder_user
):
    _rule(hub, founder_user)
    order = _delivered(hub, customer, service, code=code.code)
    a = commission.accrue_for_order(order)
    b = commission.accrue_for_order(order)
    assert a.id == b.id
    costs = OrderCost.objects.filter(order=order, kind="COMMISSION")
    assert [c.amount_minor for c in costs] == [3000]


def test_rule_terms_are_frozen_once_it_has_earned(hub, customer, service, code, founder_user):
    rule = _rule(hub, founder_user)
    commission.accrue_for_order(_delivered(hub, customer, service, code=code.code))
    with pytest.raises(ApiError) as exc:
        commission.update_rule(rule, changes={"value": 5000}, actor=founder_user)
    assert exc.value.status_code == 409
    # Ending it (or renaming it) is still allowed.
    commission.update_rule(rule, changes={"effective_to": date(2026, 12, 31)}, actor=founder_user)


def test_only_one_default_rule_per_hub(hub, founder_user):
    a = _rule(hub, founder_user)
    b = _rule(hub, founder_user, name="New default")
    a.refresh_from_db()
    assert not a.is_default and b.is_default


@pytest.mark.parametrize(
    "terms",
    [
        {"basis": CommissionBasis.PERCENT_OF_ORDER, "value": 10001},
        {"applies_to": CommissionAppliesTo.FIRST_N_ORDERS, "first_n": None},
        {"effective_from": date(2026, 5, 1), "effective_to": date(2026, 4, 1)},
    ],
)
def test_invalid_rules_are_rejected(hub, founder_user, terms):
    with pytest.raises(ApiError):
        _rule(hub, founder_user, **terms)


def test_backfill_accrues_orders_delivered_before_the_rule_existed(
    hub, customer, service, code, founder_user
):
    order = _delivered(hub, customer, service, code=code.code)
    assert commission.accrue_for_order(order) is None  # no rule yet
    _rule(hub, founder_user)
    assert commission.backfill_accruals(hub) == 1
    assert commission.backfill_accruals(hub) == 0


# ------------------------------------------------- balance & settlement


@pytest.fixture
def three_accruals(hub, service, code, founder_user):
    _rule(hub, founder_user)
    accruals = []
    for i in range(3):
        cust = Customer.objects.create(hub=hub, name=f"Cust {i}", phone=f"+9198555000{i:02d}")
        accruals.append(commission.accrue_for_order(_delivered(hub, cust, service, code=code.code)))
    return accruals


def test_balance_reconciles_to_accruals_through_a_full_settlement_cycle(
    code, three_accruals, founder_user
):
    partner = code.owner_partner
    assert commission.partner_balance(partner)["payable_minor"] == 9000

    settlement = commission.create_settlement(partner, actor=founder_user)
    assert settlement.total_minor == 9000
    assert settlement.accruals.count() == 3
    balance = commission.partner_balance(partner)
    assert balance["accrued_minor"] == 0
    assert balance["in_settlement_minor"] == 9000
    assert balance["payable_minor"] == 9000

    commission.mark_settlement_paid(
        settlement, payment_ref="UPI123456", payment_method="UPI", actor=founder_user
    )
    balance = commission.partner_balance(partner)
    assert balance["payable_minor"] == 0
    assert balance["paid_minor"] == sum(a.amount_minor for a in three_accruals)
    assert set(settlement.accruals.values_list("status", flat=True)) == {AccrualStatus.SETTLED}
    assert AuditEvent.objects.filter(action="growth.settlement.paid").exists()


def test_settlement_only_claims_accruals_up_to_period_end(hub, code, three_accruals, founder_user):
    from growth.models import CommissionAccrual

    old = three_accruals[0]
    CommissionAccrual.objects.filter(pk=old.pk).update(
        accrued_at=timezone.now() - timedelta(days=40)
    )
    settlement = commission.create_settlement(
        code.owner_partner,
        period_end=timezone.localdate() - timedelta(days=30),
        actor=founder_user,
    )
    assert list(settlement.accruals.values_list("id", flat=True)) == [old.id]
    assert settlement.total_minor == old.amount_minor


def test_an_accrual_is_never_claimed_by_two_settlements(code, three_accruals, founder_user):
    commission.create_settlement(code.owner_partner, actor=founder_user)
    with pytest.raises(ApiError):
        commission.create_settlement(code.owner_partner, actor=founder_user)


def test_cancelling_a_settlement_returns_its_accruals_to_the_balance(
    code, three_accruals, founder_user
):
    settlement = commission.create_settlement(code.owner_partner, actor=founder_user)
    commission.cancel_settlement(settlement, actor=founder_user)
    settlement.refresh_from_db()
    assert settlement.status == SettlementStatus.CANCELLED
    assert commission.partner_balance(code.owner_partner)["accrued_minor"] == 9000
    again = commission.create_settlement(code.owner_partner, actor=founder_user)
    assert again.total_minor == 9000


def test_a_paid_settlement_cannot_be_paid_twice_or_cancelled(code, three_accruals, founder_user):
    settlement = commission.create_settlement(code.owner_partner, actor=founder_user)
    commission.mark_settlement_paid(settlement, payment_ref="", payment_method="CASH")
    with pytest.raises(ApiError):
        commission.mark_settlement_paid(settlement, payment_ref="X", payment_method="UPI")
    with pytest.raises(ApiError):
        commission.cancel_settlement(settlement)


def test_upi_payout_needs_a_reference(code, three_accruals, founder_user):
    settlement = commission.create_settlement(code.owner_partner, actor=founder_user)
    with pytest.raises(ApiError):
        commission.mark_settlement_paid(settlement, payment_ref=" ", payment_method="UPI")


def test_voiding_an_accrual_removes_it_from_the_balance_and_the_margin(
    code, three_accruals, founder_user
):
    accrual = three_accruals[0]
    commission.void_accrual(accrual, reason="Watchman referred his own flat", actor=founder_user)
    assert commission.partner_balance(code.owner_partner)["payable_minor"] == 6000
    net = sum(
        OrderCost.objects.filter(order=accrual.order, kind="COMMISSION").values_list(
            "amount_minor", flat=True
        )
    )
    assert net == 0


def test_a_settled_accrual_cannot_be_voided(code, three_accruals, founder_user):
    commission.create_settlement(code.owner_partner, actor=founder_user)
    three_accruals[0].refresh_from_db()
    with pytest.raises(ApiError):
        commission.void_accrual(three_accruals[0], reason="mistake", actor=founder_user)


def test_statement_pdf_renders_with_every_line(code, three_accruals, founder_user):
    from growth.pdf import render_statement_bytes, statement_context

    settlement = commission.create_settlement(code.owner_partner, actor=founder_user)
    assert settlement.statement_pdf  # stored on creation
    context = statement_context(settlement)
    assert len(context["lines"]) == 3
    assert context["total_display"] == "₹90.00"
    assert render_statement_bytes(settlement).startswith(b"%PDF")
