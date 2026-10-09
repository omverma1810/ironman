"""Every amount a customer sees is in rupees (₹), never dollars. Invoices
are rendered to HTML first, so the symbol can be asserted without a PDF
reader; the Dockerfile test below guards the font the PDF needs to draw it."""

from pathlib import Path

import pytest
from django.template.loader import render_to_string

from billing.services import issue_invoice
from common.money import Money

pytestmark = pytest.mark.django_db


def test_money_always_renders_with_the_rupee_sign():
    assert str(Money(129900)) == "₹1299.00"
    assert str(Money(0)) == "₹0.00"


def test_invoice_template_shows_rupees_and_no_dollar_amounts(verified_order):
    invoice = issue_invoice(verified_order)
    html = render_to_string(
        "billing/invoice.html",
        {
            "invoice": invoice,
            "issued_date": "01 Jan 2026",
            "subtotal_display": str(Money(invoice.subtotal_minor)),
            "discount_display": str(Money(invoice.discount_minor)),
            "tax_display": str(Money(invoice.tax_minor)),
            "total_display": str(Money(invoice.total_minor)),
            "snapshot_display": [
                {
                    **line,
                    "unit_price_display": str(Money(line["unit_price_minor"])),
                    "line_total_display": str(Money(line["line_total_minor"])),
                }
                for line in invoice.snapshot
            ],
        },
    )
    assert "₹48.00" in html
    assert "$" not in html


def test_runtime_image_installs_a_font_that_can_draw_the_rupee_sign():
    """python:3.12-slim has no fonts, so without this package ₹ on a PDF
    renders as an empty box in production while looking fine on a dev
    machine. DejaVu has had the glyph since 2.33."""
    dockerfile = (Path(__file__).resolve().parents[2] / "Dockerfile").read_text()
    runtime = dockerfile.split("AS runtime", 1)[1]
    assert "fonts-dejavu-core" in runtime
