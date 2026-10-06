"""Account deletion (docs/06 §6, R-806).

    request  → blockers checked, fresh OTP verified, login deactivated,
               sessions revoked, a restore link sent
    grace    → signing in again, or the restore link, cancels it
    expiry   → `complete_deletion` anonymises the personal data and keeps
               every order, invoice and payment, pointing at a tombstone

Staff accounts are not deleted here: they are deactivated by an admin and
kept for cash and audit accountability (docs/06 §6, last paragraph).
"""

from __future__ import annotations

import hashlib
import hmac
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken

from billing import services as billing_services
from billing.models import Invoice, InvoiceStatus
from common import audit
from common.errors import ApiError
from customers.models import Address, ConsentRecord, Customer, CustomerNote
from fulfilment.models import Proof
from identity.models import OtpChallenge, RoleCode, User
from notifications import services as notifications_services
from notifications.models import NotificationRequest, RecipientKind
from ordering.models import Order, OrderException, OrderStatus
from privacy.models import DeletionRequest, DeletionStatus

TEMPLATE_CODE = "privacy.deletion_scheduled"
TEMPLATE_BODY = (
    "Your IronMan account will be deleted on {delete_on}. Changed your mind? "
    "Keep it here: {restore_link} — or just sign in again before then. — IronMan"
)
DELETED_NAME = "Deleted customer"

# Orders in these states are finished, so they never block a deletion.
_SETTLED = [OrderStatus.DELIVERED, OrderStatus.CLOSED, OrderStatus.CANCELLED, OrderStatus.DRAFT]
_OPEN_EXCEPTION = [OrderException.Status.OPEN, OrderException.Status.INVESTIGATING]


def phone_hmac(phone: str) -> str:
    """A keyed hash of the phone number: lets a re-registration be matched
    to a deleted account without keeping the number. Keyed with the
    Django secret, so rotating it forgets old matches — acceptable, since
    the only use is spotting referral self-dealing."""
    key = f"privacy.phone:{settings.SECRET_KEY}".encode()
    return hmac.new(key, phone.encode(), hashlib.sha256).hexdigest()


def was_deleted(phone: str) -> bool:
    """True when this phone belonged to an account that has been deleted."""
    if not phone:
        return False
    return DeletionRequest.objects.filter(
        phone_hmac=phone_hmac(phone), status=DeletionStatus.COMPLETED
    ).exists()


def customer_for(user: User) -> Customer | None:
    return Customer.objects.filter(user=user, deleted_at__isnull=True).first()


def ensure_customer_account(user: User) -> None:
    staff_roles = user.role_codes - {RoleCode.CUSTOMER}
    if staff_roles or user.is_staff:
        raise ApiError(
            "Staff accounts are closed by an admin, so your records stay with the cash "
            "and audit history. Ask your admin to deactivate it.",
            code="staff_account",
            status_code=403,
        )


def deletion_blockers(customer: Customer | None) -> list[dict]:
    """Everything that has to be settled first, each with a message the
    customer can act on (docs/06 §6 step 2)."""
    if customer is None:
        return []
    blockers: list[dict] = []

    in_flight = list(
        Order.objects.filter(customer=customer)
        .exclude(status__in=_SETTLED)
        .order_by("created_at")
        .values_list("ref", flat=True)
    )
    if in_flight:
        blockers.append(
            {
                "code": "order_in_progress",
                "message": (
                    f"{_count(len(in_flight), 'order')} still in progress ({', '.join(in_flight)}). "
                    "Wait until it's delivered, or cancel it first."
                ),
                "refs": in_flight,
            }
        )

    unpaid = []
    total_owed = 0
    for invoice in Invoice.objects.filter(customer=customer, status=InvoiceStatus.ISSUED):
        owed = billing_services.invoice_balance(invoice)
        if owed > 0:
            unpaid.append(invoice.ref)
            total_owed += owed
    if unpaid:
        blockers.append(
            {
                "code": "invoice_unpaid",
                "message": (
                    f"₹{total_owed / 100:,.2f} is still due on {', '.join(unpaid)}. "
                    "Pay it first, then delete your account."
                ),
                "refs": unpaid,
            }
        )

    open_issues = list(
        OrderException.objects.filter(order__customer=customer, status__in=_OPEN_EXCEPTION)
        .values_list("order__ref", flat=True)
        .distinct()
    )
    if open_issues:
        blockers.append(
            {
                "code": "issue_open",
                "message": (
                    f"We're still resolving an issue on {', '.join(open_issues)}. "
                    "We'll close it with you first so nothing is lost."
                ),
                "refs": open_issues,
            }
        )
    return blockers


def _count(n: int, noun: str) -> str:
    return f"{n} {noun}" if n == 1 else f"{n} {noun}s"


def pending_request(user: User) -> DeletionRequest | None:
    return DeletionRequest.objects.filter(user=user, status=DeletionStatus.PENDING).first()


def _verify_fresh_otp(user: User, code: str) -> None:
    challenge = (
        OtpChallenge.objects.filter(phone=user.phone, consumed_at__isnull=True)
        .order_by("-created_at")
        .first()
    )
    if not code or not challenge or not challenge.verify(code):
        raise ApiError(
            "That code is incorrect or has expired. Request a new one.",
            code="invalid_otp",
            status_code=400,
        )


def revoke_sessions(user: User) -> int:
    """Blacklist every refresh token; access tokens die with `is_active`."""
    revoked = 0
    for token in OutstandingToken.objects.filter(user=user):
        _, created = BlacklistedToken.objects.get_or_create(token=token)
        revoked += int(created)
    return revoked


@transaction.atomic
def request_deletion(user: User, *, code: str, reason: str = "") -> DeletionRequest:
    ensure_customer_account(user)
    existing = pending_request(user)
    if existing:
        return existing

    customer = customer_for(user)
    blockers = deletion_blockers(customer)
    if blockers:
        raise ApiError(
            " ".join(b["message"] for b in blockers),
            code="deletion_blocked",
            status_code=409,
            field_errors={"blockers": [b["code"] for b in blockers]},
        )
    _verify_fresh_otp(user, code)

    now = timezone.now()
    request = DeletionRequest.objects.create(
        user=user,
        customer=customer,
        requested_at=now,
        scheduled_for=now + timedelta(days=settings.IRONMAN["DELETION_GRACE_DAYS"]),
        phone_hmac=phone_hmac(user.phone or ""),
        reason=reason.strip()[:500],
        created_by=user,
    )
    user.is_active = False
    user.save(update_fields=["is_active"])
    revoke_sessions(user)
    # No more pushes to a closed account's phone (the restore link goes by SMS).
    notifications_services.forget_devices(user)
    audit.record(
        action="customer.deletion_requested",
        object_type="DeletionRequest",
        object_id=str(request.id),
        hub=customer.hub if customer else None,
        actor=user,
        after={"scheduled_for": request.scheduled_for.isoformat()},
    )
    if customer:
        _send_restore_link(request, customer)
    return request


def restore_link(request: DeletionRequest) -> str:
    base = settings.IRONMAN["PUBLIC_SITE_URL"].rstrip("/")
    return f"{base}/account/restore?token={request.restore_token}"


def _send_restore_link(request: DeletionRequest, customer: Customer) -> None:
    notifications_services.ensure_template(
        TEMPLATE_CODE, TEMPLATE_BODY, ["delete_on", "restore_link"]
    )
    delete_on = timezone.localtime(request.scheduled_for).strftime("%d %b %Y")
    notifications_services.notify_customer(
        TEMPLATE_CODE,
        customer,
        context={"delete_on": delete_on, "restore_link": restore_link(request)},
        dedupe_key=f"deletion:{request.id}",
    )


@transaction.atomic
def cancel_deletion(request: DeletionRequest, *, via: str) -> DeletionRequest:
    request = DeletionRequest.objects.select_for_update().get(pk=request.pk)
    if request.status != DeletionStatus.PENDING:
        raise ApiError(
            "This account has already been deleted and can't be restored.",
            code="deletion_not_pending",
            status_code=409,
        )
    request.status = DeletionStatus.CANCELLED
    request.cancelled_at = timezone.now()
    request.save(update_fields=["status", "cancelled_at", "updated_at"])
    if request.user_id:
        User.objects.filter(pk=request.user_id).update(is_active=True)
    audit.record(
        action="customer.deletion_cancelled",
        object_type="DeletionRequest",
        object_id=str(request.id),
        hub=request.customer.hub if request.customer_id else None,
        actor=request.user,
        after={"via": via},
    )
    return request


def restore_by_token(token: str) -> DeletionRequest:
    request = DeletionRequest.objects.filter(restore_token=token or "").first()
    if not request:
        raise ApiError("That link isn't valid.", code="not_found", status_code=404)
    return cancel_deletion(request, via="link")


# ------------------------------------------------------------- anonymise


@transaction.atomic
def complete_deletion(request: DeletionRequest) -> DeletionRequest:
    """docs/06 §6 step 4. Financial and operational rows stay; what
    identifies a person goes."""
    request = DeletionRequest.objects.select_for_update().get(pk=request.pk)
    if request.status != DeletionStatus.PENDING:
        return request
    now = timezone.now()
    customer = request.customer
    user = request.user
    summary: dict[str, int] = {}

    if customer:
        orders = Order.objects.filter(customer=customer)
        summary["addresses"] = Address.all_objects.filter(customer=customer).update(
            flat_no="", block="", landmark="", free_text_address="", deleted_at=now
        )
        summary["notes"] = CustomerNote.all_objects.filter(customer=customer).update(
            body="[removed when the customer deleted their account]"
        )
        ConsentRecord.all_objects.filter(customer=customer).update(ip=None)
        orders.update(special_instructions="")
        summary["proof_photos"] = delete_proof_files(Proof.objects.filter(job__order__in=orders))
        summary["messages"] = (
            NotificationRequest.objects.filter(
                recipient_kind=RecipientKind.CUSTOMER, recipient_id=customer.id
            )
            .exclude(payload={})
            .update(payload={})
        )
        customer.name = DELETED_NAME
        customer.phone = f"DEL-{customer.id.hex[:12]}"
        customer.email = ""
        customer.status = Customer.Status.DELETED
        customer.user = None
        customer.deleted_at = now
        customer.save(
            update_fields=["name", "phone", "email", "status", "user", "deleted_at", "updated_at"]
        )

    if user:
        OtpChallenge.objects.filter(phone=user.phone).delete()
        user.phone = None
        user.email = None
        user.full_name = ""
        user.is_active = False
        user.set_unusable_password()
        user.save(update_fields=["phone", "email", "full_name", "is_active", "password"])
        revoke_sessions(user)

    request.status = DeletionStatus.COMPLETED
    request.completed_at = now
    request.save(update_fields=["status", "completed_at", "updated_at"])
    audit.record(
        action="customer.deleted",
        object_type="DeletionRequest",
        object_id=str(request.id),
        hub=customer.hub if customer else None,
        actor=None,
        after=summary,
    )
    return request


def delete_proof_files(proofs) -> int:
    """Remove the photo files (and any location) but keep the proof row, so
    "delivered with photo proof" stays true in the history."""
    removed = 0
    for proof in proofs.exclude(Q(file="") | Q(file__isnull=True)):
        proof.file.delete(save=False)
        proof.file = None
        proof.geo_lat = None
        proof.geo_lng = None
        proof.save(update_fields=["file", "geo_lat", "geo_lng", "updated_at"])
        removed += 1
    return removed


def process_due_deletions(*, now=None, limit: int = 50) -> int:
    now = now or timezone.now()
    due = DeletionRequest.objects.filter(
        status=DeletionStatus.PENDING, scheduled_for__lte=now
    ).order_by("scheduled_for")[:limit]
    done = 0
    for request in due:
        complete_deletion(request)
        done += 1
    return done
