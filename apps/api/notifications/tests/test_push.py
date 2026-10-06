"""Push to the customer app (docs/08 batch 8.4)."""

from __future__ import annotations

import json
from unittest import mock

import pytest

from notifications import push, services
from notifications.models import (
    DeviceToken,
    NotificationChannel,
    NotificationDelivery,
    NotificationPref,
    NotificationRequest,
    NotificationTemplate,
    RecipientKind,
)
from ordering.models import Order, OrderStatus

TOKEN = "ExponentPushToken[abcdefghijklmnopqrstuv]"


@pytest.fixture
def order(hub, customer, customer_user, service):
    return Order.objects.create(
        hub=hub, customer=customer, service=service, status=OrderStatus.SCHEDULED
    )


@pytest.fixture(autouse=True)
def templates(db):
    for channel in (NotificationChannel.SMS,):
        NotificationTemplate.objects.create(
            code="order.picked_up",
            channel=channel,
            body="Hi {customer_name}, {order_ref} is picked up.",
        )


@pytest.fixture(autouse=True)
def open_recipient_list(settings):
    settings.IRONMAN = {**settings.IRONMAN, "NOTIFICATIONS_ENFORCE_RECIPIENT_ALLOWLIST": False}


class Recorder(push.PushSender):
    def __init__(self, results=None):
        self.sent = []
        self.results = results

    def send(self, tokens, *, title, body, data):
        self.sent.append({"tokens": tokens, "title": title, "body": body, "data": data})
        return self.results or [push.PushResult(token=t, ok=True, ticket_id="t1") for t in tokens]


def use(sender):
    return mock.patch("notifications.push.get_push_sender", return_value=sender)


def test_a_customer_with_the_app_gets_a_push_not_an_sms(order, customer_user):
    services.register_device(customer_user, token=TOKEN, platform="android")
    recorder = Recorder()
    with use(recorder):
        request = services.notify("order.picked_up", order)

    assert request.channel == NotificationChannel.PUSH
    assert request.status == NotificationRequest.Status.SENT
    assert recorder.sent[0]["tokens"] == [TOKEN]
    assert order.ref in recorder.sent[0]["body"]
    assert recorder.sent[0]["data"] == {"event": "order.picked_up", "orderId": str(order.id)}
    # One message, not one per channel.
    assert NotificationRequest.objects.filter(order=order).count() == 1


def test_no_app_means_the_old_channels(order):
    request = services.notify("order.picked_up", order)
    assert request.channel == NotificationChannel.SMS


def test_opting_out_of_push_falls_back(order, customer_user, customer):
    services.register_device(customer_user, token=TOKEN, platform="ios")
    NotificationPref.objects.create(
        recipient_kind=RecipientKind.CUSTOMER,
        recipient_id=customer.id,
        channel="PUSH",
        opted_in=False,
    )
    recorder = Recorder()
    with use(recorder):
        request = services.notify("order.picked_up", order)
    assert request.channel == NotificationChannel.SMS
    assert recorder.sent == []


def test_a_push_that_doesnt_get_through_falls_back_to_sms(order, customer_user):
    services.register_device(customer_user, token=TOKEN, platform="ios")
    failing = Recorder([push.PushResult(token=TOKEN, ok=False, error="MessageRateExceeded")])
    with use(failing):
        request = services.notify("order.picked_up", order)
    assert request.channel == NotificationChannel.SMS
    failed = NotificationRequest.objects.get(order=order, channel=NotificationChannel.PUSH)
    assert failed.status == NotificationRequest.Status.FAILED
    assert NotificationDelivery.objects.get(request=failed).error == "MessageRateExceeded"


def test_a_device_the_service_says_is_gone_is_no_longer_sent_to(order, customer_user):
    services.register_device(customer_user, token=TOKEN, platform="ios")
    gone = Recorder(
        [push.PushResult(token=TOKEN, ok=False, error="DeviceNotRegistered", unregistered=True)]
    )
    with use(gone):
        services.notify("order.picked_up", order)
    assert DeviceToken.objects.get(token=TOKEN).is_active is False
    assert services.active_device_tokens(customer_user) == []


def test_retrying_the_same_event_never_sends_twice(order, customer_user):
    services.register_device(customer_user, token=TOKEN, platform="android")
    recorder = Recorder()
    with use(recorder):
        services.notify("order.picked_up", order)
        services.notify("order.picked_up", order)
    assert len(recorder.sent) == 1


def test_non_production_only_pushes_to_allowlisted_customers(
    order, customer_user, customer, settings
):
    settings.IRONMAN = {
        **settings.IRONMAN,
        "NOTIFICATIONS_ENFORCE_RECIPIENT_ALLOWLIST": True,
        "NOTIFICATION_RECIPIENT_ALLOWLIST": [],
    }
    services.register_device(customer_user, token=TOKEN, platform="android")
    recorder = Recorder()
    with use(recorder):
        services.notify("order.picked_up", order)
    assert recorder.sent == []


# ── registration ─────────────────────────────────────────────────────────


def test_a_token_belongs_to_whoever_is_signed_in_on_that_phone(customer_user, field_user):
    services.register_device(customer_user, token=TOKEN, platform="ios")
    services.register_device(field_user, token=TOKEN, platform="ios")
    assert DeviceToken.objects.get(token=TOKEN).user_id == field_user.id
    assert services.active_device_tokens(customer_user) == []


def test_only_real_push_tokens_are_accepted(customer_user):
    for bad in ["", "https://evil.example/hook", "ExponentPushToken[]", "fcm-token-123"]:
        with pytest.raises(ValueError):
            services.register_device(customer_user, token=bad, platform="android")


def test_register_and_remove_through_the_api(api_client, customer_user):
    api_client.force_authenticate(customer_user)
    body = {"token": TOKEN, "platform": "android", "app_version": "1.0.0"}
    assert api_client.post("/api/v1/notifications/devices", body, format="json").status_code == 204
    assert services.active_device_tokens(customer_user) == [TOKEN]

    assert (
        api_client.post(
            "/api/v1/notifications/devices", {**body, "token": "nope"}, format="json"
        ).status_code
        == 400
    )
    assert (
        api_client.delete(
            "/api/v1/notifications/devices", {"token": TOKEN}, format="json"
        ).status_code
        == 204
    )
    assert services.active_device_tokens(customer_user) == []


def test_staff_cannot_register_devices(api_client, operator_user):
    api_client.force_authenticate(operator_user)
    response = api_client.post(
        "/api/v1/notifications/devices", {"token": TOKEN, "platform": "ios"}, format="json"
    )
    assert response.status_code == 403


def test_one_customers_remove_cannot_remove_anothers_device(api_client, customer_user, field_user):
    services.register_device(field_user, token=TOKEN, platform="ios")
    api_client.force_authenticate(customer_user)
    api_client.delete("/api/v1/notifications/devices", {"token": TOKEN}, format="json")
    assert DeviceToken.objects.filter(token=TOKEN).exists()


# ── the Expo sender ──────────────────────────────────────────────────────


class _Response:
    def __init__(self, payload):
        self.payload = payload

    def read(self):
        return json.dumps(self.payload).encode()

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


def test_expo_sender_maps_tickets_to_results():
    tickets = {
        "data": [
            {"status": "ok", "id": "abc"},
            {"status": "error", "message": "x", "details": {"error": "DeviceNotRegistered"}},
        ]
    }
    with mock.patch("urllib.request.urlopen", return_value=_Response(tickets)) as opened:
        results = push.ExpoPushSender().send(["a", "b"], title="T", body="B", data={"k": 1})
    assert [(r.ok, r.unregistered) for r in results] == [(True, False), (False, True)]
    sent = json.loads(opened.call_args.args[0].data)
    assert [m["to"] for m in sent] == ["a", "b"]
    assert sent[0]["title"] == "T"


def test_expo_sender_reports_a_failed_call_as_failed_not_gone():
    with mock.patch("urllib.request.urlopen", side_effect=TimeoutError("slow")):
        results = push.ExpoPushSender().send(["a"], title="T", body="B", data={})
    assert [(r.ok, r.unregistered) for r in results] == [(False, False)]


def test_only_the_expo_setting_turns_on_real_sending(settings):
    assert isinstance(push.get_push_sender(), push.LogPushSender)
    settings.IRONMAN = {**settings.IRONMAN, "PUSH_PROVIDER": "expo"}
    assert isinstance(push.get_push_sender(), push.ExpoPushSender)
