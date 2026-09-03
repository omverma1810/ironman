"""Invoice generation and credit notes (docs/02 §3.8, batch 3.1). An order's
own `subtotal_minor`/`discount_minor`/`total_minor` are already correct by
the time this runs — `ordering.services.record_intake` recomputes them from
verified quantities the moment intake happens (`docs/02 §3.5`: "billing
derives from verified_qty only"). `issue_invoice` doesn't re-quote; it
snapshots those figures plus tax computed fresh at issue time, since
nothing upstream has ever computed `Order.tax_minor`."""

from __future__ import annotations

from django.db import IntegrityError, transaction
from django.utils import timezone

from billing.models import CreditNote, Invoice, InvoiceStatus, _invoice_ref
from billing.pdf import render_credit_note_pdf, render_invoice_pdf
from common.errors import ApiError
from ordering.models import OrderStatus
from territory.models import Hub, TaxSettings


def get_invoice(ref: str) -> Invoice:
    try:
        return Invoice.objects.get(ref=ref)
    except Invoice.DoesNotExist as exc:
        raise ApiError("Invoice not found.", code="not_found") from exc


def _build_snapshot(order) -> list[dict]:
    lines = []
    for line in order.lines.select_related("garment_type").all():
        qty = line.verified_qty if line.verified_qty is not None else line.declared_qty
        if qty <= 0:
            continue
        lines.append(
            {
                "garment_type_name": line.garment_type.name,
                "qty": qty,
                "unit_price_minor": line.unit_price_minor,
                "line_total_minor": line.line_total_minor,
            }
        )
    return lines


def issue_invoice(order, *, apply_gst: bool | None = None, actor=None) -> Invoice:
    """`apply_gst=None` (the default) follows the hub's `TaxSettings`; ops
    can pass `True`/`False` to override that for this one invoice — the
    per-invoice override `territory.TaxSettings`'s own docstring already
    calls out as a `billing`-phase feature.

    `_invoice_ref()` picks the next sequence number from a plain `count()`.
    `_issue_invoice_once` locks the order's hub row before computing it, so
    two concurrent issuances for the same hub serialize instead of both
    reading the same count and racing on `Invoice.ref`'s unique constraint
    (verified directly: 6 concurrent issuances via the ORM, no lock,
    collided; with the lock, none did). The lock doesn't cover two
    different hubs issuing in the same instant, since refs aren't
    hub-scoped — retrying covers that unlikely remainder without needing a
    second, cross-hub lock.
    """
    for attempt in range(3):
        try:
            return _issue_invoice_once(order, apply_gst=apply_gst, actor=actor)
        except IntegrityError:
            if attempt == 2:
                raise
            # Constructing the failed `Invoice(order=order, ...)` above
            # already set Django's reverse-cache for `order.invoice` on
            # this Python object, even though nothing was persisted — the
            # retry's own `hasattr(order, "invoice")` guard would
            # otherwise see that stale cache and wrongly refuse to issue.
            order.refresh_from_db()


@transaction.atomic
def _issue_invoice_once(order, *, apply_gst: bool | None, actor) -> Invoice:
    if hasattr(order, "invoice"):
        raise ApiError(f"{order.ref} already has an invoice.", code="validation_error")
    if order.status == OrderStatus.CANCELLED:
        raise ApiError("Cannot invoice a cancelled order.", code="validation_error")
    if order.verified_total_qty is None:
        raise ApiError(
            f"{order.ref} has no verified quantities yet — intake must run before invoicing.",
            code="validation_error",
        )

    # See `issue_invoice`'s docstring: serializes ref generation for this
    # hub against any other concurrent issuance for it.
    Hub.objects.select_for_update().get(pk=order.hub_id)

    tax_settings = TaxSettings.objects.filter(hub=order.hub).first()
    gst_enabled = tax_settings.gst_enabled if tax_settings else False
    gst_applied = gst_enabled if apply_gst is None else apply_gst

    tax_minor = 0
    gstin_snapshot = ""
    if gst_applied and tax_settings:
        tax_minor = order.total_minor * tax_settings.default_rate_bps // 10_000
        gstin_snapshot = tax_settings.gstin

    invoice = Invoice(
        ref=_invoice_ref(),
        hub=order.hub,
        order=order,
        customer=order.customer,
        status=InvoiceStatus.ISSUED,
        issued_at=timezone.now(),
        subtotal_minor=order.subtotal_minor,
        discount_minor=order.discount_minor,
        tax_minor=tax_minor,
        total_minor=order.total_minor + tax_minor,
        gst_applied=gst_applied,
        gstin_snapshot=gstin_snapshot,
        price_list_version=order.price_list_version,
        snapshot=_build_snapshot(order),
        created_by=actor,
    )
    invoice.pdf_file = render_invoice_pdf(invoice)
    invoice.save()
    return invoice


@transaction.atomic
def issue_credit_note(
    invoice: Invoice, *, reason: str, amount_minor: int, actor=None
) -> CreditNote:
    if invoice.status not in (InvoiceStatus.ISSUED, InvoiceStatus.PAID):
        raise ApiError(
            f"{invoice.ref} must be issued before it can carry a credit note.",
            code="validation_error",
        )
    if amount_minor <= 0:
        raise ApiError("Credit amount must be positive.", code="validation_error")
    already_credited = sum(invoice.credit_notes.values_list("amount_minor", flat=True))
    remaining = invoice.total_minor - already_credited
    if amount_minor > remaining:
        raise ApiError(
            f"Only {remaining}p of {invoice.ref} remains creditable.", code="validation_error"
        )

    credit_note = CreditNote(
        invoice=invoice,
        hub=invoice.hub,
        reason=reason,
        amount_minor=amount_minor,
        issued_by=actor,
    )
    credit_note.pdf_file = render_credit_note_pdf(credit_note)
    credit_note.save()
    return credit_note
