"""Branded PDF rendering (docs/08 batch 3.1) — a Django template rendered
to HTML, then WeasyPrint turns that into the PDF bytes. Keeping the layout
in an HTML/CSS template (rather than building the page with a PDF drawing
API) means the same brand styling the console already uses is legible
here without a second design pass."""

from __future__ import annotations

from django.core.files.base import ContentFile
from django.template.loader import render_to_string
from django.utils import timezone
from weasyprint import HTML

from common.money import Money


def _line_display(minor: int) -> str:
    return str(Money(minor))


def render_invoice_pdf(invoice) -> ContentFile:
    snapshot_display = [
        {
            **line,
            "unit_price_display": _line_display(line["unit_price_minor"]),
            "line_total_display": _line_display(line["line_total_minor"]),
        }
        for line in invoice.snapshot
    ]
    html = render_to_string(
        "billing/invoice.html",
        {
            "invoice": invoice,
            "issued_date": timezone.localtime(invoice.issued_at).strftime("%d %b %Y"),
            "subtotal_display": _line_display(invoice.subtotal_minor),
            "discount_display": _line_display(invoice.discount_minor),
            "tax_display": _line_display(invoice.tax_minor),
            "total_display": _line_display(invoice.total_minor),
            "snapshot_display": snapshot_display,
        },
    )
    pdf_bytes = HTML(string=html).write_pdf()
    return ContentFile(pdf_bytes, name=f"{invoice.ref}.pdf")


def render_credit_note_pdf(credit_note) -> ContentFile:
    html = render_to_string(
        "billing/credit_note.html",
        {
            "credit_note": credit_note,
            "issued_date": timezone.localtime(credit_note.at).strftime("%d %b %Y"),
            "amount_display": _line_display(credit_note.amount_minor),
        },
    )
    pdf_bytes = HTML(string=html).write_pdf()
    return ContentFile(pdf_bytes, name=f"{credit_note.invoice.ref}-credit.pdf")
