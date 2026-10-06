"""The channel router (docs/02 §3.11): one call site — `notify(event_key,
order)` — every order-lifecycle transition fires through. It derives the
recipient, hub and template variables from `order` itself so a call site
never builds a payload by hand, picks WhatsApp if the customer is opted in
and an approved template exists, falls back to SMS, records exactly one
`NotificationRequest` per (order, event, channel, recipient) via
`dedupe_key` so a retried caller never double-sends, and refuses to send
to anyone outside a configured allowlist outside production (docs/03
§3.3)."""

from __future__ import annotations

import logging
import re

from django.conf import settings
from django.utils import timezone

from notifications import push
from notifications.models import (
    ApprovalStatus,
    DeviceToken,
    NotificationChannel,
    NotificationDelivery,
    NotificationPref,
    NotificationRequest,
    NotificationTemplate,
    RecipientKind,
)

logger = logging.getLogger("ironman.notifications")

_CHANNEL_PRIORITY = [NotificationChannel.WHATSAPP, NotificationChannel.SMS]


class NotificationSender:
    def send(self, *, recipient: str, body: str) -> str | None:
        """Returns a provider message id, or None."""
        raise NotImplementedError


class LogSender(NotificationSender):
    """Dev/test/staging default — logs instead of calling a real BSP/SMS
    provider, exactly like `identity.notify.LogOtpSender`. A real
    WhatsApp Business API / SMS (DLT) provider needs its own account and
    per-template approval (docs/00 §5 D-05 — 1-3 week onboarding lead
    time that no amount of code can shorten, same reason batch 3.5's
    Razorpay integration is paused) — wiring one in is a `get_*_sender`
    swap, not a change to anything that calls `notify()`."""

    def __init__(self, provider_name: str):
        self.provider_name = provider_name

    def send(self, *, recipient: str, body: str) -> str | None:
        logger.info("[%s] to %s: %s", self.provider_name, recipient, body)
        return None


def get_whatsapp_sender() -> NotificationSender:
    return LogSender("whatsapp")


def get_sms_sender() -> NotificationSender:
    return LogSender("sms")


def _sender_for(channel: str) -> NotificationSender:
    return get_whatsapp_sender() if channel == NotificationChannel.WHATSAPP else get_sms_sender()


# ── Devices (docs/08 batch 8.4) ─────────────────────────────────────────────

# Expo's own token shape; refusing anything else keeps junk out of the table
# and stops one customer registering a URL for the server to call.
_EXPO_TOKEN = re.compile(r"^Expo(nent)?PushToken\[[A-Za-z0-9_\-]{10,100}\]$")


def register_device(user, *, token: str, platform: str, app_version: str = "") -> DeviceToken:
    """Record this phone as one of the customer's devices. A token belongs to
    one phone: if it was registered under someone else (a phone handed on, a
    second account on the same device), it moves to whoever is signed in now."""
    if not _EXPO_TOKEN.match(token):
        raise ValueError("That isn't a push token.")
    device, _ = DeviceToken.objects.update_or_create(
        token=token,
        defaults={
            "user": user,
            "platform": platform,
            "app_version": app_version[:32],
            "is_active": True,
            "last_seen_at": timezone.now(),
        },
    )
    return device


def unregister_device(user, token: str) -> None:
    DeviceToken.objects.filter(user=user, token=token).delete()


def forget_devices(user) -> int:
    """Every device of this user, gone: signing out everywhere, deleting an account."""
    deleted, _ = DeviceToken.objects.filter(user=user).delete()
    return deleted


def device_summaries(user) -> list[dict]:
    """What we hold about a customer's phones, without the token itself
    (a credential for sending to the device): for the data export."""
    return [
        {
            "platform": d.platform,
            "app_version": d.app_version,
            "registered_at": d.created_at.isoformat(),
        }
        for d in DeviceToken.objects.filter(user=user).order_by("created_at")
    ]


def active_device_tokens(user) -> list[str]:
    if user is None:
        return []
    return list(
        DeviceToken.objects.filter(user=user, is_active=True).values_list("token", flat=True)
    )


def _is_allowed_recipient(phone: str) -> bool:
    cfg = settings.IRONMAN
    if not cfg["NOTIFICATIONS_ENFORCE_RECIPIENT_ALLOWLIST"]:
        return True
    return phone in cfg["NOTIFICATION_RECIPIENT_ALLOWLIST"]


def is_opted_in(*, recipient_kind: str, recipient_id, channel: str) -> bool:
    """No `NotificationPref` row means the default: opted in."""
    pref = NotificationPref.objects.filter(
        recipient_kind=recipient_kind, recipient_id=recipient_id, channel=channel
    ).first()
    return pref.opted_in if pref else True


def _select_template(
    event_key: str, channel: str, locale: str = "en"
) -> NotificationTemplate | None:
    return NotificationTemplate.objects.filter(
        code=event_key, channel=channel, locale=locale
    ).first()


def _fmt_money(minor: int | None) -> str:
    return f"₹{minor / 100:,.2f}" if minor else ""


def _fmt_dt(dt) -> str:
    return dt.strftime("%d %b, %I:%M %p") if dt else ""


def _order_context(order) -> dict:
    return {
        "customer_name": order.customer.name or "there",
        "order_ref": order.ref,
        "service_name": order.service.name,
        "pickup_time": _fmt_dt(order.pickup_promised_at or order.pickup_slot_start),
        "delivery_time": _fmt_dt(order.delivery_promised_at or order.delivery_slot_start),
        "total": _fmt_money(order.total_minor),
    }


def notify(event_key: str, order) -> NotificationRequest | None:
    """Never raises — every call site sits inside a `@transaction.atomic`
    order-lifecycle transition (docs/00 §3.3 M-3: order status is its own
    concern), and a bug in the messaging side must never roll back or
    fail a real pickup/delivery/order-status update."""
    try:
        return _notify(event_key, order)
    except Exception:
        logger.exception("notify(%s, %s) failed", event_key, order.ref)
        return None


def _push_template(event_key: str) -> NotificationTemplate | None:
    """Push has its own template if one was written; otherwise it says what
    the SMS says, which is already short and in the customer's words."""
    for channel in (NotificationChannel.PUSH, NotificationChannel.SMS):
        template = _select_template(event_key, channel)
        if template and template.is_usable:
            return template
    return None


def _try_push(
    event_key: str, customer, *, order, hub, context: dict, dedupe_key: str
) -> NotificationRequest | None:
    """The customer's phone first: it's free, instant, and the one channel
    that needs no business-messaging approval. Returns the request when a
    push went out; None when there was nothing to send to or it didn't get
    through, so the caller carries on to WhatsApp and SMS."""
    tokens = active_device_tokens(customer.user)
    if not tokens or not is_opted_in(
        recipient_kind=RecipientKind.CUSTOMER,
        recipient_id=customer.id,
        channel=NotificationChannel.PUSH,
    ):
        return None
    template = _push_template(event_key)
    if template is None or not _is_allowed_recipient(customer.phone):
        return None

    request, created = NotificationRequest.objects.get_or_create(
        dedupe_key=dedupe_key,
        defaults=dict(
            hub=hub,
            order=order,
            template=template,
            channel=NotificationChannel.PUSH,
            recipient_kind=RecipientKind.CUSTOMER,
            recipient_id=customer.id,
            payload=context,
        ),
    )
    if not created:
        return request if request.status == NotificationRequest.Status.SENT else None

    data = {"event": event_key}
    if order is not None:
        data["orderId"] = str(order.id)
    results = push.get_push_sender().send(
        tokens, title="IronMan", body=template.body.format(**context), data=data
    )
    for result in results:
        if result.unregistered:
            DeviceToken.objects.filter(token=result.token).update(is_active=False)
    delivered = [r for r in results if r.ok]
    request.status = (
        NotificationRequest.Status.SENT if delivered else NotificationRequest.Status.FAILED
    )
    request.save(update_fields=["status"])
    for result in results:
        NotificationDelivery.objects.create(
            request=request,
            provider="expo",
            provider_message_id=result.ticket_id,
            status=(
                NotificationDelivery.Status.SENT
                if result.ok
                else NotificationDelivery.Status.FAILED
            ),
            error=result.error,
        )
    return request if delivered else None


def _notify(event_key: str, order) -> NotificationRequest | None:
    customer = order.customer
    context = _order_context(order)

    pushed = _try_push(
        event_key,
        customer,
        order=order,
        hub=order.hub,
        context=context,
        dedupe_key=f"{order.id}:{event_key}:{NotificationChannel.PUSH}:{customer.id}",
    )
    if pushed:
        return pushed

    for channel in _CHANNEL_PRIORITY:
        if not is_opted_in(
            recipient_kind=RecipientKind.CUSTOMER, recipient_id=customer.id, channel=channel
        ):
            continue
        template = _select_template(event_key, channel)
        if not template or not template.is_usable:
            continue
        return _dispatch(
            template=template,
            channel=channel,
            order=order,
            recipient_id=customer.id,
            recipient_phone=customer.phone,
            context=context,
        )

    logger.info("notify(%s, %s): no usable channel for this recipient", event_key, order.ref)
    return None


def _dispatch(
    *,
    template: NotificationTemplate,
    channel: str,
    order,
    recipient_id,
    recipient_phone: str,
    context: dict,
    hub=None,
    dedupe_key: str | None = None,
) -> NotificationRequest:
    dedupe_key = dedupe_key or f"{order.id}:{template.code}:{channel}:{recipient_id}"

    request, created = NotificationRequest.objects.get_or_create(
        dedupe_key=dedupe_key,
        defaults=dict(
            hub=hub or order.hub,
            order=order,
            template=template,
            channel=channel,
            recipient_kind=RecipientKind.CUSTOMER,
            recipient_id=recipient_id,
            payload=context,
        ),
    )
    if not created:
        return request  # already requested — the whole point of dedupe_key

    if not _is_allowed_recipient(recipient_phone):
        request.status = NotificationRequest.Status.SKIPPED
        request.skipped_reason = "recipient_not_allowlisted"
        request.save(update_fields=["status", "skipped_reason"])
        NotificationDelivery.objects.create(
            request=request,
            provider="none",
            status=NotificationDelivery.Status.FAILED,
            error="Recipient is not on the non-prod allowlist.",
        )
        return request

    body = template.body.format(**context)
    sender = _sender_for(channel)
    try:
        provider_message_id = sender.send(recipient=recipient_phone, body=body)
    except Exception as exc:  # a real provider call — genuinely anything can go wrong here
        request.status = NotificationRequest.Status.FAILED
        request.save(update_fields=["status"])
        NotificationDelivery.objects.create(
            request=request,
            provider=channel.lower(),
            status=NotificationDelivery.Status.FAILED,
            error=str(exc),
        )
        return request

    request.status = NotificationRequest.Status.SENT
    request.save(update_fields=["status"])
    NotificationDelivery.objects.create(
        request=request,
        provider=channel.lower(),
        provider_message_id=provider_message_id or "",
        status=NotificationDelivery.Status.SENT,
    )
    return request


def ensure_template(code: str, body: str, variables: list[str]) -> None:
    """Make sure a non-order message (re-engagement, docs/08 batch 5.7) has
    templates to send with: SMS usable at once, WhatsApp pending approval
    — the same split `seed_demo` uses for the order templates. Never
    overwrites a template staff have already edited."""
    NotificationTemplate.objects.get_or_create(
        code=code,
        channel=NotificationChannel.SMS,
        locale="en",
        defaults=dict(body=body, variables=variables),
    )
    NotificationTemplate.objects.get_or_create(
        code=code,
        channel=NotificationChannel.WHATSAPP,
        locale="en",
        defaults=dict(body=body, variables=variables, approval_status=ApprovalStatus.PENDING),
    )


def notify_customer(
    event_key: str, customer, *, context: dict, dedupe_key: str
) -> tuple[NotificationRequest | None, str]:
    """Message a customer outside any order. Returns the request (if one
    was made) and an outcome: "sent", "duplicate", "opted_out",
    "no_template", "skipped" or "failed". Never raises."""
    try:
        pushed = _try_push(
            event_key,
            customer,
            order=None,
            hub=customer.hub,
            context=context,
            dedupe_key=f"{dedupe_key}:{NotificationChannel.PUSH}",
        )
        if pushed:
            return pushed, "sent"
        opted_out = True
        for channel in _CHANNEL_PRIORITY:
            if not is_opted_in(
                recipient_kind=RecipientKind.CUSTOMER, recipient_id=customer.id, channel=channel
            ):
                continue
            opted_out = False
            template = _select_template(event_key, channel)
            if not template or not template.is_usable:
                continue
            key = f"{dedupe_key}:{channel}"
            if NotificationRequest.objects.filter(dedupe_key=key).exists():
                return None, "duplicate"
            request = _dispatch(
                template=template,
                channel=channel,
                order=None,
                hub=customer.hub,
                recipient_id=customer.id,
                recipient_phone=customer.phone,
                context=context,
                dedupe_key=key,
            )
            outcome = {
                NotificationRequest.Status.SENT: "sent",
                NotificationRequest.Status.SKIPPED: "skipped",
            }.get(request.status, "failed")
            return request, outcome
        return None, "opted_out" if opted_out else "no_template"
    except Exception:
        logger.exception("notify_customer(%s, %s) failed", event_key, customer.id)
        return None, "failed"
