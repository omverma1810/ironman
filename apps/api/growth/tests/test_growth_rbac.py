"""docs/04 §3.9 `[A][B]` on `/growth/partners` and `/growth/referral-codes`
— onboarding and referral-code issuance is founder/admin territory, the
same tier as pricing and commission config, not day-to-day ops. The
`validate` endpoint is the one deliberate exception: public, no auth,
called from the booking wizard."""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.django_db


def test_admin_can_onboard_partner(api_client, admin_user, hub):
    api_client.force_authenticate(user=admin_user)
    resp = api_client.post(
        "/api/v1/growth/partners/",
        {"hub": str(hub.id), "kind": "WATCHMAN", "name": "Ramesh", "phone": "9876543210"},
        format="json",
    )
    assert resp.status_code == 201, resp.data
    assert resp.data["status"] == "ACTIVE"


def test_operator_cannot_onboard_partner(api_client, operator_user, hub):
    api_client.force_authenticate(user=operator_user)
    resp = api_client.post(
        "/api/v1/growth/partners/",
        {"hub": str(hub.id), "kind": "WATCHMAN", "name": "Ramesh", "phone": "9876543210"},
        format="json",
    )
    assert resp.status_code == 403


def test_field_staff_cannot_list_partners(api_client, field_user):
    api_client.force_authenticate(user=field_user)
    resp = api_client.get("/api/v1/growth/partners/")
    assert resp.status_code == 403


def test_anonymous_cannot_list_partners(api_client):
    resp = api_client.get("/api/v1/growth/partners/")
    assert resp.status_code in (401, 403)


def test_founder_can_deactivate_partner(api_client, founder_user, hub):
    from growth import services
    from growth.models import PartnerKind

    partner = services.onboard_partner(hub=hub, kind=PartnerKind.WATCHMAN, name="R", phone="1")
    api_client.force_authenticate(user=founder_user)
    resp = api_client.post(
        f"/api/v1/growth/partners/{partner.id}/status/", {"status": "INACTIVE"}, format="json"
    )
    assert resp.status_code == 200, resp.data
    assert resp.data["status"] == "INACTIVE"


def test_admin_can_issue_referral_code(api_client, admin_user, hub, customer):
    api_client.force_authenticate(user=admin_user)
    resp = api_client.post(
        "/api/v1/growth/referral-codes/",
        {"hub": str(hub.id), "owner_customer": str(customer.id)},
        format="json",
    )
    assert resp.status_code == 201, resp.data
    assert resp.data["uses_count"] == 0


def test_operator_cannot_issue_referral_code(api_client, operator_user, hub, customer):
    api_client.force_authenticate(user=operator_user)
    resp = api_client.post(
        "/api/v1/growth/referral-codes/",
        {"hub": str(hub.id), "owner_customer": str(customer.id)},
        format="json",
    )
    assert resp.status_code == 403


def test_anyone_can_validate_referral_code(api_client, hub, customer):
    from growth import services

    services.create_referral_code(hub=hub, owner_customer=customer, code="OPENCODE")
    resp = api_client.post(
        "/api/v1/growth/referral-codes/validate", {"code": "opencode"}, format="json"
    )
    assert resp.status_code == 200, resp.data
    assert resp.data["code"] == "OPENCODE"


def test_validate_unknown_code_is_rejected(api_client):
    # `code="not_found"` defaults to a 400 in this codebase's `ApiError`
    # (same as `supplies.get_stock_item`/`billing.get_invoice`) unless a
    # caller overrides `status_code` explicitly — this one doesn't.
    resp = api_client.post(
        "/api/v1/growth/referral-codes/validate", {"code": "NOPE"}, format="json"
    )
    assert resp.status_code == 400
