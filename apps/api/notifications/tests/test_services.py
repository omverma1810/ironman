"""docs/02 §3.11's channel router: WhatsApp when opted-in and approved,
SMS fallback otherwise, `dedupe_key` so a retried caller never
double-sends, and the non-prod recipient allowlist guard (docs/03 §3.3)."""

import pytest

from notifications.models import (
    ApprovalStatus,
    NotificationChannel,
    NotificationDelivery,
    NotificationPref,
    NotificationRequest,
    NotificationTemplate,
    RecipientKind,
)
from notifications.services import notify
from ordering.models import Order, OrderStatus

pytestmark = pytest.mark.django_db


@pytest.fixture
def order(hub, customer, service):
    return Order.objects.create(
        hub=hub,
        customer=customer,
        service=service,
        channel="WEB",
        status=OrderStatus.SCHEDULED,
        total_minor=3000,
    )


@pytest.fixture
def sms_template():
    return NotificationTemplate.objects.create(
        code="order.scheduled",
        channel=NotificationChannel.SMS,
        body="Hi {customer_name}, {order_ref} is scheduled.",
        variables=["customer_name", "order_ref"],
    )


@pytest.fixture
def approved_whatsapp_template():
    return NotificationTemplate.objects.create(
        code="order.scheduled",
        channel=NotificationChannel.WHATSAPP,
        body="Hi {customer_name}, {order_ref} is scheduled.",
        approval_status=ApprovalStatus.APPROVED,
    )


@pytest.fixture
def allow_recipient(settings, customer):
    settings.IRONMAN = {**settings.IRONMAN, "NOTIFICATION_RECIPIENT_ALLOWLIST": [customer.phone]}


def test_no_template_returns_none_and_creates_nothing(order):
    assert notify("order.scheduled", order) is None
    assert NotificationRequest.objects.count() == 0


def test_blocks_non_allowlisted_recipient_by_default(order, sms_template):
    request = notify("order.scheduled", order)
    assert request.status == NotificationRequest.Status.SKIPPED
    assert request.skipped_reason == "recipient_not_allowlisted"
    delivery = request.deliveries.get()
    assert delivery.status == NotificationDelivery.Status.FAILED


def test_sends_when_recipient_is_allowlisted(order, sms_template, allow_recipient):
    request = notify("order.scheduled", order)
    assert request.status == NotificationRequest.Status.SENT
    assert request.channel == NotificationChannel.SMS
    delivery = request.deliveries.get()
    assert delivery.status == NotificationDelivery.Status.SENT
    assert delivery.provider == "sms"


def test_allowlist_guard_disabled_outside_prod_flag_sends_to_anyone(order, sms_template, settings):
    settings.IRONMAN = {**settings.IRONMAN, "NOTIFICATIONS_ENFORCE_RECIPIENT_ALLOWLIST": False}
    request = notify("order.scheduled", order)
    assert request.status == NotificationRequest.Status.SENT


def test_repeated_calls_for_the_same_event_dedupe_to_one_request(
    order, sms_template, allow_recipient
):
    first = notify("order.scheduled", order)
    second = notify("order.scheduled", order)
    assert first.id == second.id
    assert NotificationRequest.objects.filter(order=order).count() == 1


def test_prefers_whatsapp_when_approved_over_sms(
    order, sms_template, approved_whatsapp_template, allow_recipient
):
    request = notify("order.scheduled", order)
    assert request.channel == NotificationChannel.WHATSAPP


def test_falls_back_to_sms_when_whatsapp_is_not_yet_approved(order, sms_template):
    NotificationTemplate.objects.create(
        code="order.scheduled",
        channel=NotificationChannel.WHATSAPP,
        body="pending template",
        approval_status=ApprovalStatus.PENDING,
    )
    request = notify("order.scheduled", order)
    assert request.channel == NotificationChannel.SMS


def test_skips_a_channel_the_customer_opted_out_of(
    order, sms_template, approved_whatsapp_template, allow_recipient
):
    NotificationPref.objects.create(
        recipient_kind=RecipientKind.CUSTOMER,
        recipient_id=order.customer_id,
        channel=NotificationChannel.WHATSAPP,
        opted_in=False,
    )
    request = notify("order.scheduled", order)
    assert request.channel == NotificationChannel.SMS


def test_opted_out_of_every_channel_sends_nothing(order, sms_template):
    NotificationPref.objects.create(
        recipient_kind=RecipientKind.CUSTOMER,
        recipient_id=order.customer_id,
        channel=NotificationChannel.SMS,
        opted_in=False,
    )
    assert notify("order.scheduled", order) is None
    assert NotificationRequest.objects.count() == 0


def test_never_raises_even_when_the_template_body_is_broken(order, allow_recipient):
    NotificationTemplate.objects.create(
        code="order.scheduled",
        channel=NotificationChannel.SMS,
        body="Hi {this_variable_does_not_exist}",
    )
    # `_order_context` never provides `this_variable_does_not_exist`, so
    # `.format(**context)` raises KeyError inside `_dispatch` — `notify()`
    # is called directly from inside `@transaction.atomic` order-lifecycle
    # transitions and must swallow this rather than propagate it.
    assert notify("order.scheduled", order) is None
