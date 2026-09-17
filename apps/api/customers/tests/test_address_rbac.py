"""`AddressViewSet` (docs/08 batch 4.4's account area) was `IsOpsStaff`-only
with no customer access at all until now — these tests hold the ownership
line a customer-facing endpoint needs: a customer manages only their own
addresses, never another customer's, and can't reassign whose address one
is even on their own row."""

import pytest

from customers.models import Address, Customer
from identity.models import Role, RoleCode, User, UserRole

pytestmark = pytest.mark.django_db


def _make_role(code):
    role, _ = Role.objects.get_or_create(code=code, defaults={"name": code})
    return role


def test_customer_can_create_and_list_their_own_address(api_client, customer_user, customer):
    api_client.force_authenticate(user=customer_user)
    resp = api_client.post(
        "/api/v1/customer-addresses/",
        {"flat_no": "301", "label": "Home"},
        format="json",
    )
    assert resp.status_code == 201, resp.data
    assert resp.data["customer"] == customer.id

    listed = api_client.get("/api/v1/customer-addresses/")
    assert listed.status_code == 200
    assert [row["id"] for row in listed.data["results"]] == [resp.data["id"]]


def test_customer_cannot_see_or_edit_another_customers_address(
    api_client, customer_user, hub, apartment
):
    victim = Customer.objects.create(hub=hub, phone="+919000000097", name="Victim")
    victims_address = Address.objects.create(customer=victim, apartment=apartment, flat_no="101")

    api_client.force_authenticate(user=customer_user)
    listed = api_client.get("/api/v1/customer-addresses/")
    assert victims_address.id not in {row["id"] for row in listed.data["results"]}

    detail = api_client.get(f"/api/v1/customer-addresses/{victims_address.id}/")
    assert detail.status_code == 404

    patched = api_client.patch(
        f"/api/v1/customer-addresses/{victims_address.id}/", {"flat_no": "999"}, format="json"
    )
    assert patched.status_code == 404
    victims_address.refresh_from_db()
    assert victims_address.flat_no == "101"


def test_customer_cannot_reassign_their_own_address_to_another_customer(
    api_client, customer_user, customer, address, hub
):
    victim = Customer.objects.create(hub=hub, phone="+919000000096", name="Victim")

    api_client.force_authenticate(user=customer_user)
    resp = api_client.patch(
        f"/api/v1/customer-addresses/{address.id}/",
        {"customer": str(victim.id), "flat_no": "202"},
        format="json",
    )
    assert resp.status_code == 200, resp.data

    address.refresh_from_db()
    assert address.customer_id == customer.id
    assert address.flat_no == "202"


def test_a_customer_with_no_profile_yet_gets_a_clear_error(api_client, hub):
    user = User.objects.create_user(phone="+919888800002")
    UserRole.objects.create(user=user, role=_make_role(RoleCode.CUSTOMER), hub=None)

    api_client.force_authenticate(user=user)
    resp = api_client.post("/api/v1/customer-addresses/", {"flat_no": "1"}, format="json")
    assert resp.status_code == 400
    assert resp.data["error"]["code"] == "no_customer_profile"


def test_staff_can_manage_any_customers_address(api_client, operator_user, customer):
    api_client.force_authenticate(user=operator_user)
    resp = api_client.post(
        "/api/v1/customer-addresses/",
        {"customer": str(customer.id), "flat_no": "701"},
        format="json",
    )
    assert resp.status_code == 201, resp.data
    assert resp.data["customer"] == customer.id


def test_field_staff_sees_no_addresses(api_client, field_user, address):
    api_client.force_authenticate(user=field_user)
    resp = api_client.get("/api/v1/customer-addresses/")
    assert resp.status_code == 200
    assert resp.data["results"] == []
