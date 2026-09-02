"""GET /identity/staff — a minimal staff picker for route-day assignment
(docs/06 §3.1 "Manage users & roles": Admin/Founder only)."""

import pytest

pytestmark = pytest.mark.django_db


def test_admin_can_list_field_staff(api_client, admin_user, field_user, hub):
    api_client.force_authenticate(user=admin_user)
    resp = api_client.get("/api/v1/identity/staff", {"role": "FIELD"})
    assert resp.status_code == 200, resp.data
    emails = {u["email"] for u in resp.data}
    assert field_user.email in emails


def test_admin_only_sees_own_hub_staff(api_client, admin_user, field_user):
    from identity.models import Role, RoleCode, User, UserRole
    from territory.models import Hub

    other_hub = Hub.objects.create(code="OTHER-HUB-STAFF", name="Other Hub Staff")
    role, _ = Role.objects.get_or_create(code=RoleCode.FIELD, defaults={"name": "FIELD"})
    other_field = User.objects.create_user(
        email="other-hub-field@test.local", password="testpass1234"
    )
    UserRole.objects.create(user=other_field, role=role, hub=other_hub)

    api_client.force_authenticate(user=admin_user)
    resp = api_client.get("/api/v1/identity/staff", {"role": "FIELD"})
    emails = {u["email"] for u in resp.data}
    assert field_user.email in emails
    assert other_field.email not in emails


def test_founder_sees_staff_across_hubs(api_client, founder_user, field_user):
    from identity.models import Role, RoleCode, User, UserRole
    from territory.models import Hub

    other_hub = Hub.objects.create(code="OTHER-HUB-STAFF2", name="Other Hub Staff 2")
    role, _ = Role.objects.get_or_create(code=RoleCode.FIELD, defaults={"name": "FIELD"})
    other_field = User.objects.create_user(
        email="other-hub-field2@test.local", password="testpass1234"
    )
    UserRole.objects.create(user=other_field, role=role, hub=other_hub)

    api_client.force_authenticate(user=founder_user)
    resp = api_client.get("/api/v1/identity/staff", {"role": "FIELD"})
    emails = {u["email"] for u in resp.data}
    assert field_user.email in emails
    assert other_field.email in emails


def test_operator_cannot_list_staff(api_client, operator_user):
    api_client.force_authenticate(user=operator_user)
    resp = api_client.get("/api/v1/identity/staff")
    assert resp.status_code == 403


def test_field_cannot_list_staff(api_client, field_user):
    api_client.force_authenticate(user=field_user)
    resp = api_client.get("/api/v1/identity/staff")
    assert resp.status_code == 403


def test_anonymous_cannot_list_staff(api_client):
    resp = api_client.get("/api/v1/identity/staff")
    assert resp.status_code in (401, 403)
