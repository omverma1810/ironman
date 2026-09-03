"""docs/02 §3.8 batch 3.1: issuing snapshots the order's already-verified
totals, computes tax fresh (nothing upstream ever sets `Order.tax_minor`),
and the row becomes immutable once written. Batch 3.2 adds `Payment`:
idempotent recording, partial payments, and the invoice/order status
transitions a full payment triggers."""

import pytest

from billing.models import CreditNote, Invoice, Payment
from billing.services import issue_credit_note, issue_invoice, paid_minor, record_payment
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
