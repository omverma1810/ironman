"""docs/02 §3.8 batch 3.1: issuing snapshots the order's already-verified
totals, computes tax fresh (nothing upstream ever sets `Order.tax_minor`),
and the row becomes immutable once written. Batch 3.2 adds `Payment`:
idempotent recording, partial payments, and the invoice/order status
transitions a full payment triggers."""

import pytest

from billing.models import CreditNote, Invoice, Payment
from billing.services import (
    cash_balance,
    cash_reconciliation,
    compute_delivery_labour_cost,
    confirm_handover,
    hub_cash_on_hand,
    initiate_handover,
    issue_credit_note,
    issue_invoice,
    order_contribution_margin,
    paid_minor,
    record_deposit,
    record_order_cost,
    record_payment,
)
from common.errors import ApiError

pytestmark = pytest.mark.django_db


def test_issue_invoice_snapshots_order_totals(verified_order):
    invoice = issue_invoice(verified_order)
    assert invoice.status == "ISSUED"
    assert invoice.subtotal_minor == verified_order.subtotal_minor == 4800
    assert invoice.total_minor == 4800
    assert invoice.tax_minor == 0
    assert invoice.gst_applied is False
    assert invoice.order_id == verified_order.id
    assert invoice.customer_id == verified_order.customer_id
    assert len(invoice.snapshot) == 2
    assert invoice.pdf_file
    assert invoice.pdf_file.size > 0


def test_issue_invoice_applies_gst_when_hub_enables_it(verified_order, gst_hub):
    invoice = issue_invoice(verified_order)
    assert invoice.gst_applied is True
    assert invoice.gstin_snapshot == "29AAAAA0000A1Z5"
    # 4800 * 1800bps / 10000 = 864
    assert invoice.tax_minor == 864
    assert invoice.total_minor == 4800 + 864


def test_issue_invoice_can_override_gst_off_per_invoice(verified_order, gst_hub):
    invoice = issue_invoice(verified_order, apply_gst=False)
    assert invoice.gst_applied is False
    assert invoice.tax_minor == 0
    assert invoice.total_minor == 4800


def test_issue_invoice_can_override_gst_on_per_invoice(verified_order):
    invoice = issue_invoice(verified_order, apply_gst=True)
    # hub has no TaxSettings row at all here — override alone doesn't
    # invent a rate, so gst_applied is honoured but there's no rate to tax.
    assert invoice.gst_applied is True
    assert invoice.tax_minor == 0


def test_cannot_double_invoice_an_order(verified_order):
    issue_invoice(verified_order)
    with pytest.raises(ApiError):
        issue_invoice(verified_order)
    assert Invoice.objects.filter(order=verified_order).count() == 1


def test_cannot_invoice_without_verified_quantities(hub, customer, service):
    from ordering.models import Order, OrderStatus

    order = Order.objects.create(
        hub=hub, customer=customer, service=service, channel="COUNTER", status=OrderStatus.AT_HUB
    )
    with pytest.raises(ApiError):
        issue_invoice(order)


def test_issue_invoice_retries_past_a_ref_collision(
    monkeypatch, verified_order, hub, customer, service
):
    """`_invoice_ref()` picks the next sequence number from a plain
    `count()` — two concurrent issuances can both compute the same ref
    before either commits, and the loser hits `Invoice.ref`'s unique
    constraint. Caught this for real in CI when the `chromium` and
    `mobile` E2E projects both issued an invoice at once against the same
    seeded backend.

    `_issue_invoice_once` now locks the order's hub row before computing a
    ref, which serializes same-hub issuances and was verified (a script
    outside this suite, not committed here) to hold under real concurrent
    threads. That leaves only a same-instant, cross-hub collision — refs
    aren't hub-scoped — for the retry below to actually cover; forcing one
    here is the only way to exercise that retry path at all.
    """
    from ordering.models import Order, OrderStatus

    first = issue_invoice(verified_order)

    second_order = Order.objects.create(
        hub=hub,
        customer=customer,
        service=service,
        channel="COUNTER",
        status=OrderStatus.INTAKE_VERIFIED,
        declared_total_qty=1,
        verified_total_qty=1,
        subtotal_minor=1000,
        total_minor=1000,
        price_list_version=1,
    )

    import billing.services as billing_services

    real_invoice_ref = billing_services._invoice_ref
    calls = {"n": 0}

    def colliding_once():
        calls["n"] += 1
        return first.ref if calls["n"] == 1 else real_invoice_ref()

    monkeypatch.setattr(billing_services, "_invoice_ref", colliding_once)

    second = issue_invoice(second_order)
    assert calls["n"] == 2
    assert second.ref != first.ref
    assert second.order_id == second_order.id


def test_cannot_invoice_a_cancelled_order(verified_order):
    verified_order.status = "CANCELLED"
    verified_order.save(update_fields=["status"])
    with pytest.raises(ApiError):
        issue_invoice(verified_order)


def test_invoice_row_is_immutable_once_issued(verified_order):
    invoice = issue_invoice(verified_order)
    invoice.total_minor = 1
    with pytest.raises(RuntimeError):
        invoice.save()


def test_invoice_status_and_pdf_file_may_still_be_updated(verified_order):
    invoice = issue_invoice(verified_order)
    invoice.status = "PAID"
    invoice.save()  # must not raise — status is not a frozen field
    assert Invoice.objects.get(pk=invoice.pk).status == "PAID"


def test_issue_credit_note_reduces_creditable_balance(verified_order):
    invoice = issue_invoice(verified_order)
    cn = issue_credit_note(invoice, reason="damaged item", amount_minor=1000)
    assert cn.amount_minor == 1000
    assert cn.invoice_id == invoice.id
    assert cn.pdf_file
    assert CreditNote.objects.filter(invoice=invoice).count() == 1


def test_credit_note_cannot_exceed_remaining_invoice_value(verified_order):
    invoice = issue_invoice(verified_order)
    issue_credit_note(invoice, reason="first", amount_minor=4000)
    with pytest.raises(ApiError):
        issue_credit_note(invoice, reason="second", amount_minor=1000)


def test_credit_note_requires_positive_amount(verified_order):
    invoice = issue_invoice(verified_order)
    with pytest.raises(ApiError):
        issue_credit_note(invoice, reason="oops", amount_minor=0)


def test_credit_note_is_append_only(verified_order):
    invoice = issue_invoice(verified_order)
    cn = issue_credit_note(invoice, reason="damaged item", amount_minor=500)
    cn.amount_minor = 1
    with pytest.raises(RuntimeError):
        cn.save()


# ── Payments (batch 3.2) ────────────────────────────────────────────────


def test_record_payment_in_full_marks_invoice_and_order_paid(verified_order):
    invoice = issue_invoice(verified_order)
    payment = record_payment(invoice, method="CASH", amount_minor=4800, idempotency_key="k-full")
    assert payment.amount_minor == 4800
    assert payment.status == "SUCCEEDED"

    invoice.refresh_from_db()
    assert invoice.status == "PAID"
    verified_order.refresh_from_db()
    assert verified_order.payment_status == "PAID"
    assert paid_minor(invoice) == 4800


def test_record_partial_payment_marks_order_partially_paid(verified_order):
    invoice = issue_invoice(verified_order)
    record_payment(invoice, method="CASH", amount_minor=2000, idempotency_key="k-partial")

    invoice.refresh_from_db()
    assert invoice.status == "ISSUED"  # not fully paid yet
    verified_order.refresh_from_db()
    assert verified_order.payment_status == "PARTIALLY_PAID"


def test_two_partial_payments_sum_to_paid(verified_order):
    invoice = issue_invoice(verified_order)
    record_payment(invoice, method="CASH", amount_minor=2000, idempotency_key="k-1")
    record_payment(invoice, method="UPI_QR", amount_minor=2800, idempotency_key="k-2")

    invoice.refresh_from_db()
    assert invoice.status == "PAID"
    assert Payment.objects.filter(invoice=invoice).count() == 2


def test_record_payment_is_idempotent(verified_order):
    invoice = issue_invoice(verified_order)
    first = record_payment(invoice, method="CASH", amount_minor=2000, idempotency_key="k-replay")
    replay = record_payment(invoice, method="CASH", amount_minor=2000, idempotency_key="k-replay")

    assert first.id == replay.id
    assert Payment.objects.filter(invoice=invoice).count() == 1
    verified_order.refresh_from_db()
    assert verified_order.payment_status == "PARTIALLY_PAID"  # only counted once


def test_record_payment_rejects_overpay(verified_order):
    invoice = issue_invoice(verified_order)
    with pytest.raises(ApiError):
        record_payment(invoice, method="CASH", amount_minor=5000, idempotency_key="k-over")


def test_record_payment_requires_positive_amount(verified_order):
    invoice = issue_invoice(verified_order)
    with pytest.raises(ApiError):
        record_payment(invoice, method="CASH", amount_minor=0, idempotency_key="k-zero")


def test_record_payment_requires_an_issued_invoice(verified_order):
    invoice = issue_invoice(verified_order)
    invoice.status = "CANCELLED"
    invoice.save(update_fields=["status"])  # status isn't frozen

    with pytest.raises(ApiError):
        record_payment(invoice, method="CASH", amount_minor=4800, idempotency_key="k-cancelled")


def test_record_payment_is_append_only(verified_order):
    invoice = issue_invoice(verified_order)
    payment = record_payment(invoice, method="CASH", amount_minor=4800, idempotency_key="k-ao")
    payment.amount_minor = 1
    with pytest.raises(RuntimeError):
        payment.save()


# ── Cash custody (batch 3.3) ───────────────────────────────────────────


def test_cash_balance_is_zero_with_no_activity(field_user):
    assert cash_balance(field_user) == 0


def test_cash_balance_reflects_collected_cash(field_user, verified_order):
    invoice = issue_invoice(verified_order)
    record_payment(
        invoice, method="CASH", amount_minor=4800, idempotency_key="k-1", actor=field_user
    )
    assert cash_balance(field_user) == 4800


def test_cash_balance_ignores_upi_payments(field_user, verified_order):
    # Only CASH is a physical liability the rider is carrying — UPI money
    # never touches their hands.
    invoice = issue_invoice(verified_order)
    record_payment(
        invoice, method="UPI_QR", amount_minor=4800, idempotency_key="k-upi", actor=field_user
    )
    assert cash_balance(field_user) == 0


def test_pending_handover_does_not_reduce_balance(field_user, operator_user, verified_order):
    invoice = issue_invoice(verified_order)
    record_payment(
        invoice, method="CASH", amount_minor=4800, idempotency_key="k-1", actor=field_user
    )
    initiate_handover(from_user=field_user, to_user=operator_user, amount_minor=2000)
    # Still carrying it all — only a *confirmed* handover relieves the rider.
    assert cash_balance(field_user) == 4800


def test_confirmed_handover_reduces_balance_by_received_amount(
    field_user, operator_user, verified_order
):
    invoice = issue_invoice(verified_order)
    record_payment(
        invoice, method="CASH", amount_minor=4800, idempotency_key="k-1", actor=field_user
    )
    handover = initiate_handover(from_user=field_user, to_user=operator_user, amount_minor=2000)
    confirm_handover(handover, received_amount_minor=1800, actor=operator_user)
    # Only the *received* 1800 is relieved — the 200p shortfall stays the
    # rider's liability until someone resolves it, per `cash_balance`'s docstring.
    assert cash_balance(field_user) == 4800 - 1800
    handover.refresh_from_db()
    assert handover.variance_minor == -200
    assert handover.status == "CONFIRMED"


def test_initiate_handover_rejects_amount_exceeding_balance(
    field_user, operator_user, verified_order
):
    invoice = issue_invoice(verified_order)
    record_payment(
        invoice, method="CASH", amount_minor=1000, idempotency_key="k-1", actor=field_user
    )
    with pytest.raises(ApiError):
        initiate_handover(from_user=field_user, to_user=operator_user, amount_minor=2000)


def test_initiate_handover_rejects_non_positive_amount(field_user, operator_user):
    with pytest.raises(ApiError):
        initiate_handover(from_user=field_user, to_user=operator_user, amount_minor=0)


def test_initiate_handover_rejects_self_handover(field_user):
    with pytest.raises(ApiError):
        initiate_handover(from_user=field_user, to_user=field_user, amount_minor=100)


def test_initiate_handover_rejects_non_ops_recipient(field_user, customer_user):
    with pytest.raises(ApiError):
        initiate_handover(from_user=field_user, to_user=customer_user, amount_minor=100)


def test_confirm_handover_rejects_already_confirmed(field_user, operator_user, verified_order):
    invoice = issue_invoice(verified_order)
    record_payment(
        invoice, method="CASH", amount_minor=4800, idempotency_key="k-1", actor=field_user
    )
    handover = initiate_handover(from_user=field_user, to_user=operator_user, amount_minor=2000)
    confirm_handover(handover, received_amount_minor=2000, actor=operator_user)
    with pytest.raises(ApiError):
        confirm_handover(handover, received_amount_minor=2000, actor=operator_user)


def test_confirm_handover_rejects_negative_received_amount(
    field_user, operator_user, verified_order
):
    invoice = issue_invoice(verified_order)
    record_payment(
        invoice, method="CASH", amount_minor=4800, idempotency_key="k-1", actor=field_user
    )
    handover = initiate_handover(from_user=field_user, to_user=operator_user, amount_minor=2000)
    with pytest.raises(ApiError):
        confirm_handover(handover, received_amount_minor=-1, actor=operator_user)


def test_hub_cash_on_hand_nets_confirmed_handovers_against_deposits(
    hub, field_user, operator_user, verified_order
):
    invoice = issue_invoice(verified_order)
    record_payment(
        invoice, method="CASH", amount_minor=4800, idempotency_key="k-1", actor=field_user
    )
    handover = initiate_handover(from_user=field_user, to_user=operator_user, amount_minor=4800)
    confirm_handover(handover, received_amount_minor=4800, actor=operator_user)
    assert hub_cash_on_hand(hub) == 4800

    record_deposit(hub, amount_minor=3000, actor=operator_user)
    assert hub_cash_on_hand(hub) == 1800


def test_record_deposit_rejects_amount_exceeding_available(
    hub, field_user, operator_user, verified_order
):
    invoice = issue_invoice(verified_order)
    record_payment(
        invoice, method="CASH", amount_minor=1000, idempotency_key="k-1", actor=field_user
    )
    handover = initiate_handover(from_user=field_user, to_user=operator_user, amount_minor=1000)
    confirm_handover(handover, received_amount_minor=1000, actor=operator_user)
    with pytest.raises(ApiError):
        record_deposit(hub, amount_minor=2000, actor=operator_user)


def test_record_deposit_rejects_non_positive_amount(hub, operator_user):
    with pytest.raises(ApiError):
        record_deposit(hub, amount_minor=0, actor=operator_user)


def test_deposit_is_append_only(hub, field_user, operator_user, verified_order):
    invoice = issue_invoice(verified_order)
    record_payment(
        invoice, method="CASH", amount_minor=1000, idempotency_key="k-1", actor=field_user
    )
    handover = initiate_handover(from_user=field_user, to_user=operator_user, amount_minor=1000)
    confirm_handover(handover, received_amount_minor=1000, actor=operator_user)
    deposit = record_deposit(hub, amount_minor=500, actor=operator_user)
    deposit.amount_minor = 1
    with pytest.raises(RuntimeError):
        deposit.save()


def test_cash_reconciliation_aggregates_one_row_per_rider(
    hub, field_user, operator_user, verified_order
):
    invoice = issue_invoice(verified_order)
    record_payment(
        invoice, method="CASH", amount_minor=4800, idempotency_key="k-1", actor=field_user
    )
    handover = initiate_handover(from_user=field_user, to_user=operator_user, amount_minor=2000)
    confirm_handover(handover, received_amount_minor=1900, actor=operator_user)

    from django.utils import timezone

    rows = cash_reconciliation([hub.id], date=timezone.localdate())
    assert len(rows) == 1
    row = rows[0]
    assert row["rider_id"] == field_user.id
    assert row["collected_minor"] == 4800
    assert row["declared_minor"] == 2000
    assert row["received_minor"] == 1900
    assert row["variance_minor"] == -100
    assert row["outstanding_minor"] == 4800 - 1900
    assert row["pending_handovers"] == 0


def test_cash_reconciliation_scoped_to_requested_hubs(field_user, operator_user, verified_order):
    invoice = issue_invoice(verified_order)
    record_payment(
        invoice, method="CASH", amount_minor=4800, idempotency_key="k-1", actor=field_user
    )
    from django.utils import timezone

    from territory.models import Hub

    other_hub = Hub.objects.create(code="OTH", name="Other Hub")
    rows = cash_reconciliation([other_hub.id], date=timezone.localdate())
    assert rows == []


# ── Order cost model (docs/08 batch 3.4) ──────────────────────────────────


def test_record_order_cost_skips_non_positive_amount(verified_order):
    assert record_order_cost(verified_order, kind="CONSUMABLE", amount_minor=0) is None
    assert record_order_cost(verified_order, kind="CONSUMABLE", amount_minor=-5) is None


def test_record_order_cost_creates_a_row(verified_order):
    cost = record_order_cost(verified_order, kind="LABOUR", amount_minor=120, source_ref="test")
    assert cost.kind == "LABOUR"
    assert cost.amount_minor == 120
    assert cost.source_ref == "test"


def test_order_contribution_margin_nets_costs_against_revenue(verified_order):
    issue_invoice(verified_order)
    record_order_cost(verified_order, kind="CONSUMABLE", amount_minor=100)
    record_order_cost(verified_order, kind="LABOUR", amount_minor=200)

    margin = order_contribution_margin(verified_order)
    assert margin["revenue_minor"] == 4800
    assert margin["consumable_minor"] == 100
    assert margin["labour_minor"] == 200
    assert margin["delivery_minor"] == 0
    assert margin["contribution_minor"] == 4800 - 300
    assert margin["contribution_pct"] == round((4800 - 300) * 100 / 4800, 1)


def test_order_contribution_margin_nets_credit_notes_out_of_revenue(admin_user, verified_order):
    invoice = issue_invoice(verified_order)
    issue_credit_note(invoice, reason="Damaged item", amount_minor=500, actor=admin_user)

    margin = order_contribution_margin(verified_order)
    assert margin["revenue_minor"] == 4800 - 500


def test_order_contribution_margin_with_no_invoice_is_zero_revenue(verified_order):
    margin = order_contribution_margin(verified_order)
    assert margin["revenue_minor"] == 0
    assert margin["contribution_minor"] == 0
    assert margin["contribution_pct"] is None


def _make_done_job(*, hub, order, kind, started_minutes_ago, duration_minutes):
    from django.utils import timezone

    from fulfilment.models import Job, JobStatus, RouteDay
    from territory.models import Cluster

    cluster = Cluster.objects.create(hub=hub, name=f"Cluster-{order.id}-{kind}")
    route_day = RouteDay.objects.create(hub=hub, cluster=cluster, date=timezone.localdate())
    now = timezone.now()
    started_at = now - timezone.timedelta(minutes=started_minutes_ago)
    return Job.objects.create(
        hub=hub,
        route_day=route_day,
        order=order,
        kind=kind,
        status=JobStatus.DONE,
        started_at=started_at,
        completed_at=started_at + timezone.timedelta(minutes=duration_minutes),
    )


def test_compute_delivery_labour_cost_allocates_rider_minutes_and_delivery_allowance(
    hub, verified_order
):
    from territory.models import OrderCostSettings

    OrderCostSettings.objects.create(
        hub=hub,
        labour_rate_minor_per_minute=10,
        press_minutes_per_garment=0,
        delivery_allowance_minor_per_job=50,
    )
    _make_done_job(
        hub=hub, order=verified_order, kind="PICKUP", started_minutes_ago=60, duration_minutes=20
    )
    _make_done_job(
        hub=hub, order=verified_order, kind="DELIVERY", started_minutes_ago=30, duration_minutes=30
    )

    costs = compute_delivery_labour_cost(verified_order)
    by_kind = {c.kind: c.amount_minor for c in costs}
    assert by_kind["LABOUR"] == 500  # (20 + 30) minutes * 10
    assert by_kind["DELIVERY"] == 100  # 2 jobs * 50


def test_compute_delivery_labour_cost_includes_press_minutes_per_garment(hub, verified_order):
    from territory.models import OrderCostSettings

    OrderCostSettings.objects.create(
        hub=hub,
        labour_rate_minor_per_minute=10,
        press_minutes_per_garment="2.0",
        delivery_allowance_minor_per_job=0,
    )
    bag = _make_bag_with_garment_lines(hub, verified_order)
    assert bag.garment_lines.count() == 3  # verified_order's 2 shirts + 1 trouser

    costs = compute_delivery_labour_cost(verified_order)
    labour = next(c for c in costs if c.kind == "LABOUR")
    assert labour.amount_minor == 60  # 3 garments * 2 minutes * 10/minute, no jobs


def test_compute_delivery_labour_cost_is_idempotent(hub, verified_order):
    from territory.models import OrderCostSettings

    OrderCostSettings.objects.create(hub=hub, labour_rate_minor_per_minute=10)
    _make_done_job(
        hub=hub, order=verified_order, kind="DELIVERY", started_minutes_ago=10, duration_minutes=10
    )

    first = compute_delivery_labour_cost(verified_order)
    assert len(first) >= 1
    second = compute_delivery_labour_cost(verified_order)
    assert second == []


def test_compute_delivery_labour_cost_noop_without_settings(hub, verified_order):
    _make_done_job(
        hub=hub, order=verified_order, kind="DELIVERY", started_minutes_ago=10, duration_minutes=10
    )
    assert compute_delivery_labour_cost(verified_order) == []


def _make_bag_with_garment_lines(hub, order):
    from custody.services import create_bag_for_order

    return create_bag_for_order(order)
