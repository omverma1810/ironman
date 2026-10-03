"""docs/06 §3.1 "Manage users & roles": invite, change role, deactivate —
with the founder above admins, and admins confined to their own hub."""

from __future__ import annotations

import pytest
from rest_framework_simplejwt.tokens import RefreshToken

from identity.models import AuditEvent, Role, RoleCode, StaffInvite, User, UserRole
from territory.models import Hub

pytestmark = pytest.mark.django_db

URL = "/api/v1/identity/team"


def _role(code):
    return Role.objects.get_or_create(code=code, defaults={"name": code})[0]


@pytest.fixture
def other_hub(db):
    return Hub.objects.create(code="HUB-B", name="Other", daily_pressing_capacity=10)


@pytest.fixture
def other_admin(other_hub):
    user = User.objects.create_user(email="admin-b@test.local", password="testpass1234")
    UserRole.objects.create(user=user, role=_role(RoleCode.ADMIN), hub=other_hub)
    return user


def test_admin_sees_own_hub_founder_sees_all(
    api_client, admin_user, founder_user, operator_user, other_admin
):
    api_client.force_authenticate(user=admin_user)
    emails = {m["email"] for m in api_client.get(URL).data["members"]}
    assert "operator@test.local" in emails and "admin-b@test.local" not in emails

    api_client.force_authenticate(user=founder_user)
    emails = {m["email"] for m in api_client.get(URL).data["members"]}
    assert {"operator@test.local", "admin-b@test.local", "founder@test.local"} <= emails


def test_invite_then_accept(api_client, admin_user, hub):
    api_client.force_authenticate(user=admin_user)
    resp = api_client.post(
        f"{URL}/invites", {"email": "New.Rider@test.local", "role": "FIELD", "hub": str(hub.id)}
    )
    assert resp.status_code == 201 and resp.data["token"]
    assert api_client.get(URL).data["invites"][0]["email"] == "new.rider@test.local"
    assert "token" not in api_client.get(URL).data["invites"][0]

    api_client.force_authenticate(user=None)
    accepted = api_client.post(
        "/api/v1/auth/invite/accept",
        {"token": resp.data["token"], "full_name": "Ravi Rider", "password": "a-strong-pass-123"},
    )
    assert accepted.status_code == 201
    rider = User.objects.get(email="new.rider@test.local")
    assert rider.role_codes == {RoleCode.FIELD}


def test_admin_cannot_mint_admins_or_reach_other_hubs(
    api_client, admin_user, operator_user, hub, other_hub
):
    api_client.force_authenticate(user=admin_user)
    as_admin = {"email": "x@test.local", "role": "ADMIN", "hub": str(hub.id)}
    assert api_client.post(f"{URL}/invites", as_admin).status_code == 403
    other = {"email": "y@test.local", "role": "OPERATOR", "hub": str(other_hub.id)}
    assert api_client.post(f"{URL}/invites", other).status_code == 403
    no_hub = {"email": "z@test.local", "role": "OPERATOR"}
    assert api_client.post(f"{URL}/invites", no_hub).status_code == 400
    taken = {"email": "operator@test.local", "role": "OPERATOR", "hub": str(hub.id)}
    assert api_client.post(f"{URL}/invites", taken).status_code == 409


def test_deactivate_signs_out_and_reactivate(api_client, admin_user, operator_user):
    refresh = RefreshToken.for_user(operator_user)
    api_client.force_authenticate(user=admin_user)
    resp = api_client.post(f"{URL}/{operator_user.id}/deactivate", {"reason": "Left the job"})
    assert resp.status_code == 200 and resp.data["is_active"] is False
    assert AuditEvent.objects.filter(action="staff.deactivated").exists()

    api_client.force_authenticate(user=None)
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")
    assert api_client.get("/api/v1/me").status_code == 401
    api_client.credentials()
    login = api_client.post(
        "/api/v1/auth/login", {"email": "operator@test.local", "password": "testpass1234"}
    )
    assert login.status_code in (400, 401, 403)

    api_client.force_authenticate(user=admin_user)
    assert api_client.post(f"{URL}/{operator_user.id}/reactivate").data["is_active"] is True


def test_role_change_and_its_limits(
    api_client, admin_user, founder_user, operator_user, field_user, hub
):
    api_client.force_authenticate(user=admin_user)
    resp = api_client.post(f"{URL}/{field_user.id}/role", {"role": "OPERATOR", "hub": str(hub.id)})
    assert resp.status_code == 200
    assert [r["role"] for r in resp.data["roles"]] == ["OPERATOR"]
    # No promoting to admin, no touching the founder, no editing yourself.
    up = {"role": "ADMIN", "hub": str(hub.id)}
    assert api_client.post(f"{URL}/{operator_user.id}/role", up).status_code == 403
    assert api_client.post(f"{URL}/{founder_user.id}/deactivate").status_code in (403, 404)
    assert api_client.post(f"{URL}/{admin_user.id}/deactivate").status_code == 403

    api_client.force_authenticate(user=founder_user)
    assert api_client.post(f"{URL}/{operator_user.id}/role", up).status_code == 200
    assert api_client.post(f"{URL}/{founder_user.id}/deactivate").status_code == 403


def test_revoke_invite(api_client, admin_user, hub):
    api_client.force_authenticate(user=admin_user)
    created = api_client.post(
        f"{URL}/invites", {"email": "late@test.local", "role": "FIELD", "hub": str(hub.id)}
    ).data
    assert api_client.delete(f"{URL}/invites/{created['id']}").status_code == 204
    assert api_client.get(URL).data["invites"] == []
    assert not StaffInvite.objects.get(pk=created["id"]).is_valid()


def test_operators_and_field_staff_cannot_manage(api_client, operator_user, field_user):
    for user in (operator_user, field_user):
        api_client.force_authenticate(user=user)
        assert api_client.get(URL).status_code == 403


def test_django_admin_is_superuser_only(client, admin_user):
    """docs/06 §4 — a console admin (is_staff) can't use Django Admin."""
    admin_user.is_staff = True
    admin_user.save(update_fields=["is_staff"])
    client.force_login(admin_user)
    assert client.get("/admin/").status_code == 302  # bounced to the admin login
    admin_user.is_superuser = True
    admin_user.save(update_fields=["is_superuser"])
    assert client.get("/admin/").status_code == 200
