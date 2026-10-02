"""Settlement accounting, write-off authority, the receivables list/CSV and
the uninvoiced-deliveries safety net."""

import csv
import io

import pytest

from billing.models import InvoiceStatus
from billing.services import invoice_balance, issue_credit_note, issue_invoice, record_payment
from ordering.models import OrderStatus
from ordering.models import PaymentStatus as OrderPaymentStatus

pytestmark = pytest.mark.django_db

URL = "/api/v1/billing/invoices/"


def _pay(invoice, amount, key, method="CASH"):
    return record_payment(invoice, method=method, amount_minor=amount, idempotency_key=key)


# ── settlement ───────────────────────────────────────────────────────────


def test_credit_note_covering_the_remainder_settles_the_invoice(verified_order):
    invoice = issue_invoice(verified_order)  # 4800
    _pay(invoice, 3000, "k1")
    issue_credit_note(invoice, reason="damage", amount_minor=1800)

    invoice.refresh_from_db()
    verified_order.refresh_from_db()
    assert invoice_balance(invoice) == 0
    assert invoice.status == InvoiceStatus.PAID
    assert verified_order.payment_status == OrderPaymentStatus.PAID


def test_credit_note_alone_leaves_a_balance_and_marks_partially_paid(verified_order):
    invoice = issue_invoice(verified_order)
    issue_credit_note(invoice, reason="goodwill", amount_minor=800)

    invoice.refresh_from_db()
    verified_order.refresh_from_db()
    assert invoice_balance(invoice) == 4000
    assert invoice.status == InvoiceStatus.ISSUED
    assert verified_order.payment_status == OrderPaymentStatus.PARTIALLY_PAID


def test_paying_the_reduced_balance_after_a_credit_note_settles(verified_order):
    invoice = issue_invoice(verified_order)
    issue_credit_note(invoice, reason="goodwill", amount_minor=800)
    _pay(invoice, 4000, "k1")

    invoice.refresh_from_db()
    assert invoice.status == InvoiceStatus.PAID
    assert invoice_balance(invoice) == 0


def test_credit_after_full_payment_shows_a_refund_due(verified_order):
    invoice = issue_invoice(verified_order)
    _pay(invoice, 4800, "k1")
    issue_credit_note(invoice, reason="late complaint", amount_minor=500)

    invoice.refresh_from_db()
    assert invoice.status == InvoiceStatus.PAID
    assert invoice_balance(invoice) == -500


def test_api_exposes_credited_and_balance(api_client, operator_user, verified_order):
    invoice = issue_invoice(verified_order)
    _pay(invoice, 1000, "k1")
    issue_credit_note(invoice, reason="goodwill", amount_minor=800)

    api_client.force_authenticate(user=operator_user)
    row = api_client.get(URL).data["results"][0]
    assert (row["paid_minor"], row["credited_minor"], row["balance_minor"]) == (1000, 800, 3000)
    detail = api_client.get(f"{URL}{invoice.ref}/").data
    assert detail["balance_minor"] == 3000


# ── write-off authority ──────────────────────────────────────────────────


def test_operator_cannot_write_off_a_balance(api_client, operator_user, verified_order):
    invoice = issue_invoice(verified_order)
    api_client.force_authenticate(user=operator_user)
    resp = api_client.post(
        f"{URL}{invoice.ref}/payments/",
        {"method": "ADJUSTMENT", "amount": 4800, "idempotency_key": "wo-1"},
        format="json",
    )
    assert resp.status_code == 403
    invoice.refresh_from_db()
    assert invoice.status == InvoiceStatus.ISSUED


def test_admin_can_write_off_a_balance(api_client, admin_user, verified_order):
    invoice = issue_invoice(verified_order)
    api_client.force_authenticate(user=admin_user)
    resp = api_client.post(
        f"{URL}{invoice.ref}/payments/",
        {"method": "ADJUSTMENT", "amount": 4800, "idempotency_key": "wo-2"},
        format="json",
    )
    assert resp.status_code == 201
    invoice.refresh_from_db()
    assert invoice.status == InvoiceStatus.PAID


# ── receivables list + CSV ───────────────────────────────────────────────


def test_outstanding_filter_excludes_settled_invoices(api_client, operator_user, verified_order):
    invoice = issue_invoice(verified_order)
    api_client.force_authenticate(user=operator_user)
    assert len(api_client.get(f"{URL}?outstanding=true").data["results"]) == 1

    _pay(invoice, 4800, "k1")
    assert api_client.get(f"{URL}?outstanding=true").data["results"] == []


def test_outstanding_filter_accounts_for_credit_notes_and_payments_together(
    api_client, operator_user, verified_order
):
    """Payments and credit notes must not multiply each other in the
    balance (the classic double-join aggregate bug)."""
    invoice = issue_invoice(verified_order)
    _pay(invoice, 1000, "k1")
    _pay(invoice, 1000, "k2")
    issue_credit_note(invoice, reason="a", amount_minor=500)
    issue_credit_note(invoice, reason="b", amount_minor=500)
    api_client.force_authenticate(user=operator_user)
    resp = api_client.get(f"{URL}?outstanding=true")
    assert [r["balance_minor"] for r in resp.data["results"]] == [1800]

    # The SQL-side balance (what `outstanding` and the CSV use) agrees with
    # the Python-side one.
    from billing.models import Invoice
    from billing.views import InvoiceViewSet

    view = InvoiceViewSet()
    view.request = type("R", (), {"query_params": {}})()
    row = view._apply_receivable_filters(Invoice.objects.all()).get(pk=invoice.pk)
    assert (row.paid_sum, row.credited_sum, row.balance_sum) == (2000, 1000, 1800)


def test_search_and_date_filters(api_client, operator_user, verified_order, customer):
    issue_invoice(verified_order)
    api_client.force_authenticate(user=operator_user)
    assert len(api_client.get(f"{URL}?search={customer.name[:3]}").data["results"]) == 1
    assert api_client.get(f"{URL}?search=zzzz-no-such").data["results"] == []
    assert api_client.get(f"{URL}?issued_from=2999-01-01").data["results"] == []
    assert len(api_client.get(f"{URL}?issued_to=2999-01-01").data["results"]) == 1


def test_csv_export_is_admin_only(api_client, operator_user, admin_user, verified_order):
    invoice = issue_invoice(verified_order)
    _pay(invoice, 1000, "k1")

    api_client.force_authenticate(user=operator_user)
    assert api_client.get(f"{URL}export/").status_code == 403

    api_client.force_authenticate(user=admin_user)
    resp = api_client.get(f"{URL}export/")
    assert resp.status_code == 200
    assert resp["Content-Type"].startswith("text/csv")
    rows = list(csv.DictReader(io.StringIO(resp.content.decode())))
    assert len(rows) == 1
    assert rows[0]["Invoice"] == invoice.ref
    assert rows[0]["Total"] == "48.00"
    assert rows[0]["Paid"] == "10.00"
    assert rows[0]["Balance"] == "38.00"


def test_csv_export_neutralises_spreadsheet_formulas(
    api_client, admin_user, verified_order, customer
):
    customer.name = '=HYPERLINK("http://evil")'
    customer.save(update_fields=["name"])
    issue_invoice(verified_order)
    api_client.force_authenticate(user=admin_user)
    rows = list(csv.DictReader(io.StringIO(api_client.get(f"{URL}export/").content.decode())))
    assert rows[0]["Customer"].startswith("'=")


# ── uninvoiced deliveries ────────────────────────────────────────────────


def test_uninvoiced_deliveries_lists_delivered_orders_without_an_invoice(
    api_client, operator_user, verified_order
):
    verified_order.status = OrderStatus.DELIVERED
    verified_order.save(update_fields=["status"])
    api_client.force_authenticate(user=operator_user)
    resp = api_client.get("/api/v1/billing/uninvoiced-deliveries")
    assert resp.status_code == 200
    assert [r["ref"] for r in resp.data] == [verified_order.ref]

    issue_invoice(verified_order)
    assert api_client.get("/api/v1/billing/uninvoiced-deliveries").data == []


def test_uninvoiced_deliveries_is_not_open_to_field_staff(api_client, field_user):
    api_client.force_authenticate(user=field_user)
    assert api_client.get("/api/v1/billing/uninvoiced-deliveries").status_code == 403
