"""Billing (docs/02 §3.8, batch 3.1). `Invoice` is created already `ISSUED`
— there is no draft-editing workflow in this batch, `services.issue_invoice`
snapshots the order's (verified-quantity-derived) totals plus tax computed
at issue time and writes the row once. `DRAFT`/`PAID`/`CANCELLED` are kept
in the status enum because the domain model (`docs/02 §3.8`) specifies them
and a later batch (payments, `docs/08` 3.2) needs `PAID` to be reachable —
neither is wired to an endpoint here.

`docs/02 §2` invariant: "`Invoice.status = ISSUED` ⟹ row immutable (trigger
blocking `UPDATE` of money columns)." `Invoice.save()` enforces this at the
application layer, mirroring `catalog.PriceLine`'s guard for `PriceList`.
Corrections are `CreditNote` rows, never edits — append-only like
`custody.StageEvent` / `supplies.StockMovement`.
"""

from __future__ import annotations

from django.db import models
from django.utils import timezone

from common.models import AppendOnlyModel, BaseModel


class InvoiceStatus(models.TextChoices):
    DRAFT = "DRAFT", "Draft"
    ISSUED = "ISSUED", "Issued"
    PAID = "PAID", "Paid"
    CANCELLED = "CANCELLED", "Cancelled"


def _invoice_ref() -> str:
    now = timezone.localtime()
    seq = Invoice.objects.filter(created_at__year=now.year, created_at__month=now.month).count() + 1
    return f"INV-{now:%y%m}-{seq:04d}"


def _invoice_pdf_path(instance: "Invoice", filename: str) -> str:
    return f"billing/invoices/{instance.hub_id}/{instance.ref}.pdf"


def _credit_note_pdf_path(instance: "CreditNote", filename: str) -> str:
    return f"billing/credit-notes/{instance.hub_id}/{instance.invoice.ref}-{instance.id}.pdf"


class Invoice(BaseModel):
    # Not `HubScopedModel`: `hub` is set directly (from `order.hub`) rather
    # than through that mixin, since a handful of the fields below
    # (`ref`, `pdf_file` path) need it available before the parent
    # `__init__` machinery would otherwise provide it — plain `BaseModel` +
    # an explicit FK reads the same either way.
    hub = models.ForeignKey("territory.Hub", on_delete=models.PROTECT, related_name="+")
    ref = models.CharField(max_length=24, unique=True, editable=False, default=_invoice_ref)
    order = models.OneToOneField("ordering.Order", on_delete=models.PROTECT, related_name="invoice")
    customer = models.ForeignKey(
        "customers.Customer", on_delete=models.PROTECT, related_name="invoices"
    )
    status = models.CharField(
        max_length=16, choices=InvoiceStatus.choices, default=InvoiceStatus.DRAFT
    )
    issued_at = models.DateTimeField(null=True, blank=True)

    subtotal_minor = models.BigIntegerField(default=0)
    discount_minor = models.BigIntegerField(default=0)
    tax_minor = models.BigIntegerField(default=0)
    total_minor = models.BigIntegerField(default=0)
    gst_applied = models.BooleanField(default=False)
    gstin_snapshot = models.CharField(max_length=15, blank=True)
    price_list_version = models.PositiveIntegerField(null=True, blank=True)

    # Order lines (garment type, verified qty, unit price, line total) at
    # issue time — so a reprint months later still reproduces the exact
    # invoice even if the price list or garment catalogue has since
    # changed (mirrors `PriceList`'s own immutability reasoning).
    snapshot = models.JSONField(default=list, blank=True)

    pdf_file = models.FileField(upload_to=_invoice_pdf_path, null=True, blank=True)

    # Fields frozen once the row exists — an update may only touch
    # `status`, `pdf_file` (attached in the same call that creates the
    # row, in practice) and the inherited audit columns.
    _FROZEN_FIELDS = (
        "hub_id",
        "ref",
        "order_id",
        "customer_id",
        "issued_at",
        "subtotal_minor",
        "discount_minor",
        "tax_minor",
        "total_minor",
        "gst_applied",
        "gstin_snapshot",
        "price_list_version",
        "snapshot",
    )

    class Meta:
        db_table = "billing_invoice"
        indexes = [models.Index(fields=["hub", "-issued_at"])]

    def __str__(self) -> str:
        return f"{self.ref} — {self.order.ref}"

    def save(self, *args, **kwargs):
        prior = Invoice.objects.filter(pk=self.pk).first()
        if prior:
            changed = [f for f in self._FROZEN_FIELDS if getattr(prior, f) != getattr(self, f)]
            if changed:
                raise RuntimeError(
                    f"{prior.ref} is issued and immutable; cannot change {', '.join(changed)}. "
                    "Issue a credit note instead."
                )
        super().save(*args, **kwargs)


class CreditNote(AppendOnlyModel):
    invoice = models.ForeignKey(Invoice, on_delete=models.PROTECT, related_name="credit_notes")
    hub = models.ForeignKey("territory.Hub", on_delete=models.PROTECT, related_name="+")
    reason = models.CharField(max_length=255)
    amount_minor = models.PositiveIntegerField()
    issued_by = models.ForeignKey(
        "identity.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    at = models.DateTimeField(default=timezone.now)
    pdf_file = models.FileField(upload_to=_credit_note_pdf_path, null=True, blank=True)

    class Meta:
        db_table = "billing_credit_note"
        indexes = [models.Index(fields=["invoice", "-at"])]

    def __str__(self) -> str:
        return f"Credit note — {self.invoice.ref} ({self.amount_minor}p)"
