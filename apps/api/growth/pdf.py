"""Partner commission statement (docs/08 batch 5.4): the page a watchman
is paid from. Same HTML-template-to-WeasyPrint approach as
`billing.pdf`, so it carries the invoice's brand styling."""

from __future__ import annotations

from django.core.files.base import ContentFile
from django.template.loader import render_to_string
from django.utils import timezone
from weasyprint import HTML

from common.money import Money
from growth.models import CommissionBasis

_BASIS_LABEL = {
    CommissionBasis.PER_ORDER: "Referred order",
    CommissionBasis.PER_ITEM: "Items in order",
    CommissionBasis.PERCENT_OF_ORDER: "Share of order value",
    CommissionBasis.FLAT_FIRST_ORDER: "First order",
}


def _first_name(name: str) -> str:
    # A statement goes to the partner, so it names customers only as far
    # as they'd recognise them.
    return (name or "").split(" ")[0] or "Customer"


def statement_context(settlement) -> dict:
    from growth.commission import statement_lines

    lines = [
        {
            "date": timezone.localtime(a.accrued_at).strftime("%d %b %Y"),
            "order_ref": a.order.ref,
            "customer": _first_name(a.order.customer.name),
            "basis": _BASIS_LABEL.get(a.rule_terms.get("basis"), "Referral"),
            "amount": str(Money(a.amount_minor)),
        }
        for a in statement_lines(settlement)
    ]
    end = settlement.period_end.strftime("%d %b %Y")
    period = (
        f"{settlement.period_start:%d %b %Y} – {end}" if settlement.period_start else f"up to {end}"
    )
    return {
        "settlement": settlement,
        "lines": lines,
        "partner_kind": settlement.partner.get_kind_display().lower(),
        "period": period,
        "generated_date": timezone.localtime().strftime("%d %b %Y"),
        "paid_date": (
            timezone.localtime(settlement.paid_at).strftime("%d %b %Y")
            if settlement.paid_at
            else ""
        ),
        "status_label": settlement.get_status_display(),
        "status_class": settlement.status.lower(),
        "total_display": str(Money(settlement.total_minor)),
    }


def render_statement_bytes(settlement) -> bytes:
    html = render_to_string("growth/statement.html", statement_context(settlement))
    return HTML(string=html).write_pdf()


def render_statement_pdf(settlement) -> ContentFile:
    return ContentFile(render_statement_bytes(settlement), name=f"{settlement.ref}.pdf")
