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

from django.conf import settings

from notifications.models import (
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


def _notify(event_key: str, order) -> NotificationRequest | None:
    customer = order.customer
    context = _order_context(order)

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
) -> NotificationRequest:
    dedupe_key = f"{order.id}:{template.code}:{channel}:{recipient_id}"

    request, created = NotificationRequest.objects.get_or_create(
        dedupe_key=dedupe_key,
        defaults=dict(
            hub=order.hub,
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
