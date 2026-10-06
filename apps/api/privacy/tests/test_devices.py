"""A customer's phones leave with their account, and the export lists them
without the push token (a credential for messaging the device)."""

from __future__ import annotations

import pytest

from identity.models import OtpChallenge
from notifications import services as notifications_services
from notifications.models import DeviceToken

pytestmark = pytest.mark.django_db

TOKEN = "ExponentPushToken[abcdefghijklmnopqrstuv]"


def test_deleting_an_account_removes_its_devices(api_client, customer, customer_user):
    notifications_services.register_device(customer_user, token=TOKEN, platform="ios")
    _, code = OtpChallenge.issue(phone=customer_user.phone, purpose="VERIFY")

    api_client.force_authenticate(user=customer_user)
    response = api_client.delete("/api/v1/me", {"code": code}, format="json")

    assert response.status_code == 202
    assert not DeviceToken.objects.filter(user=customer_user).exists()


def test_the_export_lists_devices_but_not_their_tokens(api_client, customer, customer_user):
    notifications_services.register_device(
        customer_user, token=TOKEN, platform="android", app_version="1.0.0"
    )
    api_client.force_authenticate(user=customer_user)

    body = api_client.get("/api/v1/me/export").content.decode()
    data = api_client.get("/api/v1/me/export").json()

    assert data["devices"][0]["platform"] == "android"
    assert data["devices"][0]["app_version"] == "1.0.0"
    assert TOKEN not in body
