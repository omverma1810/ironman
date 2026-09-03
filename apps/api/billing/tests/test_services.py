"""docs/02 §3.8 batch 3.1: issuing snapshots the order's already-verified
totals, computes tax fresh (nothing upstream ever sets `Order.tax_minor`),
and the row becomes immutable once written."""

import pytest

from billing.models import CreditNote, Invoice
from billing.services import issue_credit_note, issue_invoice
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
