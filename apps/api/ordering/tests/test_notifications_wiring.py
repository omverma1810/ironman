"""Batch 4.2: the three lifecycle points that actually call
`notifications.services.notify()` — the router's own behaviour (channel
selection, dedupe, the allowlist guard) is covered in
`notifications/tests/test_services.py`; this just holds the wiring itself
accountable so a refactor of `ordering.services` can't quietly drop it."""

import pytest

from notifications.models import NotificationChannel, NotificationRequest, NotificationTemplate
from ordering import services as ordering_services
from ordering.models import OrderStatus

pytestmark = pytest.mark.django_db


@pytest.fixture
def sms_templates(settings, customer):
    settings.IRONMAN = {**settings.IRONMAN, "NOTIFICATION_RECIPIENT_ALLOWLIST": [customer.phone]}
    for code in ("order.scheduled", "order.out_for_delivery", "order.delivered"):
        NotificationTemplate.objects.create(
            code=code, channel=NotificationChannel.SMS, body="Hi {customer_name}, {order_ref}."
        )


def test_create_order_fires_a_scheduled_notification(
    hub, customer, service, garment_type, active_price_list, address, apartment, sms_templates
):
    order = ordering_services.create_order(
        hub=hub,
        customer=customer,
        service=service,
        lines=[{"garment_type": garment_type.id, "qty": 2}],
        channel="WEB",
        address=address,
        apartment=apartment,
    )
    request = NotificationRequest.objects.get(order=order)
    assert request.template.code == "order.scheduled"
    assert request.status == NotificationRequest.Status.SENT


def test_out_for_delivery_and_delivered_each_fire_their_own_notification(
    hub, customer, service, garment_type, active_price_list, address, apartment, sms_templates
):
    order = ordering_services.create_order(
        hub=hub,
        customer=customer,
        service=service,
        lines=[{"garment_type": garment_type.id, "qty": 2}],
        channel="WEB",
        address=address,
        apartment=apartment,
    )
    # `mark_out_for_delivery` only accepts DELIVERY_ASSIGNED -> OUT_FOR_DELIVERY
    # (`ordering.state_machine.ALLOWED_TRANSITIONS`) — skipping straight there
    # via the ORM, same reasoning `billing.tests.conftest.verified_order`
    # documents, since the intermediate pickup/hub stages aren't this test's
    # concern.
    order.status = OrderStatus.DELIVERY_ASSIGNED
    order.save(update_fields=["status"])
    order = ordering_services.mark_out_for_delivery(order)
    order = ordering_services.mark_delivered(order)

    codes = set(
        NotificationRequest.objects.filter(order=order).values_list("template__code", flat=True)
    )
    assert codes == {"order.scheduled", "order.out_for_delivery", "order.delivered"}
