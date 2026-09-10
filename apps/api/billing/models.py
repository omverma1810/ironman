"""Billing (docs/02 §3.8, batches 3.1-3.2). `Invoice` is created already
`ISSUED` — there is no draft-editing workflow, `services.issue_invoice`
snapshots the order's (verified-quantity-derived) totals plus tax computed
at issue time and writes the row once. `DRAFT`/`CANCELLED` stay in the
status enum because the domain model (`docs/02 §3.8`) specifies them, but
neither is wired to an endpoint yet; `PAID` is reachable as of 3.2, once
`Payment` rows recorded against an invoice sum to its `total_minor`.

`docs/02 §2` invariant: "`Invoice.status = ISSUED` ⟹ row immutable (trigger
blocking `UPDATE` of money columns)." `Invoice.save()` enforces this at the
application layer, mirroring `catalog.PriceLine`'s guard for `PriceList`.
Corrections are `CreditNote` rows, never edits — append-only like
`custody.StageEvent` / `supplies.StockMovement`. `Payment` is append-only
for the same reason: a bad entry gets reversed with an `ADJUSTMENT`, never
edited or deleted.
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


class PaymentMethod(models.TextChoices):
    CASH = "CASH", "Cash"
    UPI_QR = "UPI_QR", "UPI (QR at door)"
    GATEWAY = "GATEWAY", "Gateway"  # wired in a later batch (docs/08 3.5)
    CREDIT = "CREDIT", "Customer credit"  # wired in a later batch (docs/08 3.6)
    ADJUSTMENT = "ADJUSTMENT", "Adjustment"


class PaymentStatus(models.TextChoices):
    SUCCEEDED = "SUCCEEDED", "Succeeded"
    FAILED = "FAILED", "Failed"
    # No PENDING here: every method this batch actually records (CASH,
    # UPI_QR, ADJUSTMENT) is settled at the point of recording — cash or a
    # QR scan has already changed hands by the time staff enters it. An
    # async PENDING state belongs to the gateway batch (3.5).


class HandoverStatus(models.TextChoices):
    PENDING = "PENDING", "Pending"
    CONFIRMED = "CONFIRMED", "Confirmed"


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


class Payment(AppendOnlyModel):
    """docs/02 §3.8, batch 3.2. A record of money that has *already*
    changed hands (cash counted, UPI QR scanned) — never an intent or an
    authorization, so there is no state machine here, just an append-only
    ledger `services.record_payment` sums against `Invoice.total_minor` to
    derive `Order.payment_status`. `idempotency_key` is client-generated
    (same convention as `Order`'s own `Idempotency-Key` header) so a
    retried submit after a dropped response can't double-count a payment.
    """

    invoice = models.ForeignKey(Invoice, on_delete=models.PROTECT, related_name="payments")
    hub = models.ForeignKey("territory.Hub", on_delete=models.PROTECT, related_name="+")
    method = models.CharField(max_length=16, choices=PaymentMethod.choices)
    amount_minor = models.PositiveIntegerField()
    status = models.CharField(
        max_length=16, choices=PaymentStatus.choices, default=PaymentStatus.SUCCEEDED
    )
    gateway_ref = models.CharField(max_length=64, blank=True)
    idempotency_key = models.CharField(max_length=64, unique=True)
    collected_by = models.ForeignKey(
        "identity.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "billing_payment"
        indexes = [models.Index(fields=["invoice", "-at"])]

    def __str__(self) -> str:
        return f"Payment — {self.invoice.ref} ({self.amount_minor}p {self.method})"


class CashHandover(BaseModel):
    """docs/00 G-5 / R-405, batch 3.3: cash a field rider collects (COD
    `Payment` rows with `method=CASH`) is a liability until it physically
    reaches the hub. A handover is the one place this row is mutated —
    `services.initiate_handover` creates it `PENDING` with only what the
    rider *declares* they're carrying; `services.confirm_handover` is the
    hub side (operator/admin) counting what actually arrived and recording
    any shortfall/overage as `variance_minor`, same "declare now, confirm
    on the other end" shape as `fulfilment.OfflineOp`.

    `hub` is the rider's own hub at handover time (`from_user.hub_scope`),
    not the receiver's — reconciliation groups by where the cash actually
    originated, matching every other hub-scoped ledger row in this app.
    """

    hub = models.ForeignKey("territory.Hub", on_delete=models.PROTECT, related_name="+")
    from_user = models.ForeignKey(
        "identity.User", on_delete=models.PROTECT, related_name="cash_handovers_given"
    )
    to_user = models.ForeignKey(
        "identity.User", on_delete=models.PROTECT, related_name="cash_handovers_received"
    )
    declared_amount_minor = models.PositiveIntegerField()
    # Null until confirmed — `services.cash_balance` only ever reads
    # `received_amount_minor` (see its own docstring for why: a declared-
    # but-unconfirmed handover still counts as cash in the rider's hand).
    received_amount_minor = models.PositiveIntegerField(null=True, blank=True)
    variance_minor = models.IntegerField(
        default=0
    )  # received - declared; signed, 0 until confirmed
    status = models.CharField(
        max_length=16, choices=HandoverStatus.choices, default=HandoverStatus.PENDING
    )
    confirmed_by = models.ForeignKey(
        "identity.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    confirmed_at = models.DateTimeField(null=True, blank=True)
    variance_note = models.CharField(max_length=255, blank=True)

    class Meta:
        db_table = "billing_cash_handover"
        indexes = [
            models.Index(fields=["from_user", "-created_at"]),
            models.Index(fields=["hub", "-created_at"]),
            models.Index(fields=["status"]),
        ]

    def __str__(self) -> str:
        return f"Handover — {self.from_user} → {self.to_user} ({self.declared_amount_minor}p)"


class CashDeposit(AppendOnlyModel):
    """docs/00 G-5: the far end of the same liability chain — cash that
    has reached the hub (via confirmed handovers) eventually gets banked.
    Append-only like `Payment`/`StockMovement`: a bad entry gets reversed
    with a new row, never edited. `services.hub_cash_on_hand` is this
    row's own reconciliation counterpart on the handover side.
    """

    hub = models.ForeignKey("territory.Hub", on_delete=models.PROTECT, related_name="+")
    amount_minor = models.PositiveIntegerField()
    deposited_by = models.ForeignKey(
        "identity.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    reference = models.CharField(max_length=64, blank=True)
    notes = models.CharField(max_length=255, blank=True)
    at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "billing_cash_deposit"
        indexes = [models.Index(fields=["hub", "-at"])]

    def __str__(self) -> str:
        return f"Deposit — {self.hub} ({self.amount_minor}p)"


class OrderCostKind(models.TextChoices):
    CONSUMABLE = "CONSUMABLE", "Consumable"
    LABOUR = "LABOUR", "Labour"
    COMMISSION = "COMMISSION", "Commission"
    DELIVERY = "DELIVERY", "Delivery"
    OTHER = "OTHER", "Other"


class OrderCost(AppendOnlyModel):
    """docs/02 §3.8, docs/07 §2⑧ ("Money made per order") — one row per
    cost event feeding the contribution-margin waterfall: revenue minus
    consumables, commission, labour and delivery. Append-only like every
    other ledger in this app (`Payment`, `CreditEntry`): a correction is a
    new, signed-opposite row, never an edit.

    This batch (docs/08 3.4) only writes `CONSUMABLE` (on a garment's
    QC-pass to `PACKED` — `custody.state_machine.transition_garment_line`)
    and `LABOUR`/`DELIVERY` (on the order's final delivery —
    `fulfilment.services.complete_job`, via `billing.services`). `COMMISSION`
    rows are the growth app's to write once it ships (docs/08 Phase 5).
    """

    order = models.ForeignKey("ordering.Order", on_delete=models.CASCADE, related_name="costs")
    kind = models.CharField(max_length=16, choices=OrderCostKind.choices)
    amount_minor = models.PositiveIntegerField()
    source_ref = models.CharField(max_length=64, blank=True)
    at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "billing_order_cost"
        indexes = [
            models.Index(fields=["order", "-at"]),
            models.Index(fields=["kind"]),
        ]

    def __str__(self) -> str:
        return f"{self.order_id} {self.kind} {self.amount_minor}p"
