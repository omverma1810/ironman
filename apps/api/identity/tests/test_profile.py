"""PATCH /me: a customer's own name edit (docs/08 batch 8.2)."""

from __future__ import annotations

from customers.models import Customer


def test_changing_your_name_changes_it_for_staff_too(api_client, customer_user, customer):
    customer.user = customer_user
    customer.name = "Old Name"
    customer.save(update_fields=["name"])
    api_client.force_authenticate(customer_user)

    response = api_client.patch("/api/v1/me", {"full_name": "Asha Rao"}, format="json")

    assert response.status_code == 200
    assert response.json()["full_name"] == "Asha Rao"
    assert Customer.objects.get(pk=customer.pk).name == "Asha Rao"


def test_a_customer_with_no_orders_yet_can_set_their_name(api_client, customer_user):
    # No Customer row exists until the first booking; that must not be an error.
    Customer.objects.filter(user=customer_user).delete()
    # A fresh copy of the user: the fixture's has the deleted row cached.
    api_client.force_authenticate(type(customer_user).objects.get(pk=customer_user.pk))

    response = api_client.patch("/api/v1/me", {"full_name": "Asha Rao"}, format="json")

    assert response.status_code == 200
    assert response.json()["full_name"] == "Asha Rao"


def test_other_fields_are_not_editable(api_client, customer_user):
    api_client.force_authenticate(customer_user)
    response = api_client.patch(
        "/api/v1/me", {"phone": "+910000000000", "roles": ["FOUNDER"]}, format="json"
    )
    assert response.status_code == 200
    customer_user.refresh_from_db()
    assert customer_user.phone != "+910000000000"
    assert "FOUNDER" not in customer_user.role_codes
