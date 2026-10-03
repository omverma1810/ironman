"""docs/06 §3.3: the audit log is viewable, filterable and exportable by
Admin (own hubs) and Founder (everything)."""

from __future__ import annotations

import pytest

from common import audit
from territory.models import Hub

pytestmark = pytest.mark.django_db


@pytest.fixture
def events(hub, admin_user):
    other = Hub.objects.create(code="HUB-B", name="Other", daily_pressing_capacity=10)
    audit.record(
        action="pricelist.activated",
        object_type="PriceList",
        object_id="pl-1",
        hub=hub,
        actor=admin_user,
    )
    audit.record(action="order.cancelled", object_type="Order", object_id="ord-9", hub=other)
    audit.record(action="user.registered", object_type="User", object_id="u-1")


def test_admin_sees_own_hub_founder_sees_all(api_client, admin_user, founder_user, events):
    api_client.force_authenticate(user=admin_user)
    rows = api_client.get("/api/v1/identity/audit").data["results"]
    assert [r["action"] for r in rows] == ["pricelist.activated"]
    assert rows[0]["actor_name"] == "admin@test.local"

    api_client.force_authenticate(user=founder_user)
    actions = {r["action"] for r in api_client.get("/api/v1/identity/audit").data["results"]}
    assert actions == {"pricelist.activated", "order.cancelled", "user.registered"}


def test_filters_and_export(api_client, founder_user, events):
    api_client.force_authenticate(user=founder_user)
    by_object = api_client.get("/api/v1/identity/audit?object_type=Order&object_id=ord-9")
    assert [r["action"] for r in by_object.data["results"]] == ["order.cancelled"]
    by_action = api_client.get("/api/v1/identity/audit?action=pricelist")
    assert len(by_action.data["results"]) == 1
    assert api_client.get("/api/v1/identity/audit?from=nope").status_code == 400

    csv = api_client.get("/api/v1/identity/audit/export.csv?object_type=PriceList")
    assert csv.status_code == 200
    lines = csv.content.decode().splitlines()
    assert lines[0].startswith("when,who,role,action")
    assert len(lines) == 2 and "pricelist.activated" in lines[1]


def test_operator_and_customer_are_refused(api_client, operator_user, customer_user):
    for user in (operator_user, customer_user):
        api_client.force_authenticate(user=user)
        assert api_client.get("/api/v1/identity/audit").status_code == 403
        assert api_client.get("/api/v1/identity/audit/export.csv").status_code == 403
