"""Invoice generation and credit notes (docs/02 §3.8, batch 3.1). An order's
own `subtotal_minor`/`discount_minor`/`total_minor` are already correct by
the time this runs — `ordering.services.record_intake` recomputes them from
verified quantities the moment intake happens (`docs/02 §3.5`: "billing
derives from verified_qty only"). `issue_invoice` doesn't re-quote; it
snapshots those figures plus tax computed fresh at issue time, since
nothing upstream has ever computed `Order.tax_minor`."""

from __future__ import annotations

from django.db import IntegrityError, models, transaction
from django.utils import timezone

from billing.models import (
    CashDeposit,
    CashHandover,
    CreditNote,
    HandoverStatus,
    Invoice,
    InvoiceStatus,
    Payment,
    PaymentMethod,
    PaymentStatus,
    _invoice_ref,
)
from billing.pdf import render_credit_note_pdf, render_invoice_pdf
from common.errors import ApiError
from identity.models import User
from ordering.models import OrderStatus
from ordering.models import PaymentStatus as OrderPaymentStatus
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


def paid_minor(invoice: Invoice) -> int:
    return sum(
        invoice.payments.filter(status=PaymentStatus.SUCCEEDED).values_list(
            "amount_minor", flat=True
        )
    )


@transaction.atomic
def record_payment(
    invoice: Invoice,
    *,
    method: str,
    amount_minor: int,
    idempotency_key: str,
    gateway_ref: str = "",
    actor=None,
) -> Payment:
    """COD / UPI-QR-at-door recording (docs/08 3.2) — every method this
    batch supports is settled at the point of recording (see
    `PaymentStatus`'s docstring), so there's no async confirmation step:
    this either records the whole payment now or rejects it.

    `idempotency_key` is checked *before* the row lock below: a genuine
    replay of an already-applied submit (network retry after a dropped
    response) must return the original payment unconditionally, even if
    the invoice has since been fully paid by other means and a fresh
    payment for the same amount would now be rejected as an overpay.
    """
    existing = Payment.objects.filter(idempotency_key=idempotency_key).first()
    if existing:
        return existing
    if amount_minor <= 0:
        raise ApiError("Payment amount must be positive.", code="validation_error")

    # Locks the invoice row so two concurrent payments against it can't
    # both read the same "remaining" balance and together overpay — same
    # reasoning as `issue_invoice`'s hub lock, applied to the row that's
    # actually contended here instead.
    locked = Invoice.objects.select_for_update().get(pk=invoice.pk)

    if locked.status not in (InvoiceStatus.ISSUED, InvoiceStatus.PAID):
        raise ApiError(
            f"{locked.ref} must be issued before a payment can be recorded.",
            code="validation_error",
        )
    already_paid = paid_minor(locked)
    already_credited = sum(locked.credit_notes.values_list("amount_minor", flat=True))
    remaining = locked.total_minor - already_credited - already_paid
    if amount_minor > remaining:
        raise ApiError(
            f"Only {remaining}p of {locked.ref} remains payable.", code="validation_error"
        )

    try:
        # Nested atomic (a savepoint): a bare IntegrityError inside the
        # outer block would leave the whole transaction — including the
        # invoice lock above — unusable for the recovery query below.
        with transaction.atomic():
            payment = Payment.objects.create(
                invoice=locked,
                hub=locked.hub,
                method=method,
                amount_minor=amount_minor,
                idempotency_key=idempotency_key,
                gateway_ref=gateway_ref,
                collected_by=actor,
            )
    except IntegrityError:
        # Lost a race on the same idempotency_key to a request this one's
        # own upfront check missed (submitted between that check and the
        # lock above) — the winner's row is the answer either way.
        return Payment.objects.get(idempotency_key=idempotency_key)

    if amount_minor == remaining:
        locked.status = InvoiceStatus.PAID
        locked.save(update_fields=["status"])
        locked.order.payment_status = OrderPaymentStatus.PAID
    else:
        locked.order.payment_status = OrderPaymentStatus.PARTIALLY_PAID
    locked.order.save(update_fields=["payment_status"])

    return payment


# ── Cash custody (docs/00 G-5 / R-405, batch 3.3) ─────────────────────────


def cash_balance(user) -> int:
    """A rider's running cash-in-hand: every CASH `Payment` they've
    collected, minus what confirmed handovers say actually left their
    hands. Deliberately reads `received_amount_minor`, not
    `declared_amount_minor` — a `PENDING` handover (declared but not yet
    counted at the hub) still counts as cash the rider is carrying, and
    once confirmed, any shortfall the count turns up (`variance_minor`)
    stays their liability rather than silently vanishing from the balance."""
    collected = (
        Payment.objects.filter(
            collected_by=user, method=PaymentMethod.CASH, status=PaymentStatus.SUCCEEDED
        ).aggregate(total=models.Sum("amount_minor"))["total"]
        or 0
    )
    handed_over = (
        CashHandover.objects.filter(from_user=user, status=HandoverStatus.CONFIRMED).aggregate(
            total=models.Sum("received_amount_minor")
        )["total"]
        or 0
    )
    return collected - handed_over


def hub_cash_on_hand(hub) -> int:
    """The hub-side counterpart to `cash_balance`: cash that has actually
    arrived (confirmed handovers) minus what's already been banked
    (`CashDeposit`). This is the number `record_deposit` won't let a
    deposit exceed."""
    received = (
        CashHandover.objects.filter(hub=hub, status=HandoverStatus.CONFIRMED).aggregate(
            total=models.Sum("received_amount_minor")
        )["total"]
        or 0
    )
    deposited = (
        CashDeposit.objects.filter(hub=hub).aggregate(total=models.Sum("amount_minor"))["total"]
        or 0
    )
    return received - deposited


@transaction.atomic
def initiate_handover(*, from_user, to_user, amount_minor: int) -> CashHandover:
    if amount_minor <= 0:
        raise ApiError("Handover amount must be positive.", code="validation_error")
    if to_user.id == from_user.id:
        raise ApiError("Cannot hand cash over to yourself.", code="validation_error")
    if not (to_user.role_codes & {"OPERATOR", "ADMIN", "FOUNDER"}):
        raise ApiError("Cash can only be handed over to ops staff.", code="validation_error")
    hub_ids = from_user.hub_scope
    if not hub_ids:
        raise ApiError(
            "Your account has no hub assigned — ask an admin to fix your staff record.",
            code="validation_error",
        )
    # Locks the rider's own hub row (same technique as `issue_invoice`'s
    # hub lock) so two concurrent handover-initiations from the same rider
    # can't both read the same pre-handover balance and together declare
    # more cash than the rider actually has.
    hub = Hub.objects.select_for_update().get(pk=hub_ids[0])

    if amount_minor > cash_balance(from_user):
        raise ApiError(
            "You're declaring more cash than your current balance.", code="validation_error"
        )

    return CashHandover.objects.create(
        hub=hub,
        from_user=from_user,
        to_user=to_user,
        declared_amount_minor=amount_minor,
        created_by=from_user,
    )


@transaction.atomic
def confirm_handover(
    handover: CashHandover, *, received_amount_minor: int, actor, note: str = ""
) -> CashHandover:
    """The hub side counting what actually arrived. Not restricted to the
    exact `to_user` named at initiation — any ops staff scoped to the
    handover's hub may confirm, same "whoever's on duty can act" scoping
    `custody.scan` already uses, rather than requiring one specific person
    to be present."""
    locked = CashHandover.objects.select_for_update().get(pk=handover.pk)
    if locked.status != HandoverStatus.PENDING:
        raise ApiError(f"Handover is already {locked.status.lower()}.", code="validation_error")
    if received_amount_minor < 0:
        raise ApiError("Received amount cannot be negative.", code="validation_error")

    locked.received_amount_minor = received_amount_minor
    locked.variance_minor = received_amount_minor - locked.declared_amount_minor
    locked.variance_note = note
    locked.status = HandoverStatus.CONFIRMED
    locked.confirmed_by = actor
    locked.confirmed_at = timezone.now()
    locked.updated_by = actor
    locked.save(
        update_fields=[
            "received_amount_minor",
            "variance_minor",
            "variance_note",
            "status",
            "confirmed_by",
            "confirmed_at",
            "updated_by",
            "updated_at",
        ]
    )
    return locked


@transaction.atomic
def record_deposit(
    hub, *, amount_minor: int, actor, reference: str = "", notes: str = ""
) -> CashDeposit:
    if amount_minor <= 0:
        raise ApiError("Deposit amount must be positive.", code="validation_error")
    # Same hub-row-lock reasoning as everywhere else in this file: two
    # concurrent deposits for the same hub can't both read the same
    # pre-deposit available balance and together overdraw it.
    locked_hub = Hub.objects.select_for_update().get(pk=hub.pk)
    available = hub_cash_on_hand(locked_hub)
    if amount_minor > available:
        raise ApiError(
            f"Only {available}p is available to deposit for this hub.", code="validation_error"
        )
    return CashDeposit.objects.create(
        hub=locked_hub,
        amount_minor=amount_minor,
        deposited_by=actor,
        reference=reference,
        notes=notes,
    )


def cash_reconciliation(hub_ids: list | None, *, date) -> list[dict]:
    """One row per rider with cash activity that day (docs/04 §3.7
    `GET /billing/cash/reconciliation?date=`), scoped to the caller's
    hub(s) — `views.CashReconciliationView` passes `request.user.hub_scope`
    straight through, same idiom `ScopedQuerysetMixin` uses everywhere
    else, just not expressible as a single queryset filter here since the
    result mixes two models grouped by `from_user`. `hub_ids=None` means
    unrestricted (a founder), matching `ScopedQuerysetMixin.scope_to_hub`'s
    own founder/superuser bypass rather than `filter(hub_id__in=None)`,
    which Django would reject outright."""
    day_handovers = CashHandover.objects.filter(created_at__date=date)
    day_payments = Payment.objects.filter(
        method=PaymentMethod.CASH,
        status=PaymentStatus.SUCCEEDED,
        at__date=date,
    )
    if hub_ids is not None:
        day_handovers = day_handovers.filter(hub_id__in=hub_ids)
        day_payments = day_payments.filter(hub_id__in=hub_ids)

    rider_ids = set(day_handovers.values_list("from_user_id", flat=True)) | set(
        day_payments.values_list("collected_by_id", flat=True)
    )
    rider_ids.discard(None)

    names = dict(User.objects.filter(id__in=rider_ids).values_list("id", "full_name"))

    rows = []
    for rider_id in rider_ids:
        collected = (
            day_payments.filter(collected_by_id=rider_id).aggregate(
                total=models.Sum("amount_minor")
            )["total"]
            or 0
        )
        rider_handovers = day_handovers.filter(from_user_id=rider_id)
        confirmed = rider_handovers.filter(status=HandoverStatus.CONFIRMED)
        declared_minor = (
            rider_handovers.aggregate(total=models.Sum("declared_amount_minor"))["total"] or 0
        )
        received_minor = (
            confirmed.aggregate(total=models.Sum("received_amount_minor"))["total"] or 0
        )
        variance_minor = confirmed.aggregate(total=models.Sum("variance_minor"))["total"] or 0
        rows.append(
            {
                "rider_id": rider_id,
                "rider_name": names.get(rider_id, ""),
                "collected_minor": collected,
                "declared_minor": declared_minor,
                "received_minor": received_minor,
                "variance_minor": variance_minor,
                "outstanding_minor": collected - received_minor,
                "pending_handovers": rider_handovers.filter(status=HandoverStatus.PENDING).count(),
            }
        )
    return rows
