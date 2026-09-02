"""docs/08 batch 2.8: apartments/clusters master-data CRUD, exercised for
the first time through the console — previously only reachable via
Django Admin or seed_demo, so this is the first real test coverage for
ClusterViewSet/ApartmentViewSet/ApartmentContactViewSet."""

import pytest

pytestmark = pytest.mark.django_db


def test_operator_can_create_a_cluster(api_client, operator_user, hub):
    api_client.force_authenticate(user=operator_user)
    resp = api_client.post(
        "/api/v1/territory/clusters/", {"hub": str(hub.id), "name": "New Cluster"}, format="json"
    )
    assert resp.status_code == 201, resp.data
    assert resp.data["name"] == "New Cluster"


def test_field_staff_cannot_create_a_cluster(api_client, field_user, hub):
    api_client.force_authenticate(user=field_user)
    resp = api_client.post(
        "/api/v1/territory/clusters/", {"hub": str(hub.id), "name": "New Cluster"}, format="json"
    )
    assert resp.status_code == 403


def test_operator_can_create_and_update_an_apartment(api_client, operator_user, cluster):
    api_client.force_authenticate(user=operator_user)
    resp = api_client.post(
        "/api/v1/territory/apartments-admin/",
        {"cluster": str(cluster.id), "name": "New Towers", "pincode": "560095"},
        format="json",
    )
    assert resp.status_code == 201, resp.data
    apartment_id = resp.data["id"]

    resp = api_client.patch(
        f"/api/v1/territory/apartments-admin/{apartment_id}/",
        {"gate_notes": "Ring the bell twice"},
        format="json",
    )
    assert resp.status_code == 200, resp.data
    assert resp.data["gate_notes"] == "Ring the bell twice"


def test_operator_can_add_update_and_remove_an_apartment_contact(
    api_client, operator_user, apartment
):
    api_client.force_authenticate(user=operator_user)
    resp = api_client.post(
        "/api/v1/territory/apartment-contacts/",
        {
            "apartment": str(apartment.id),
            "kind": "WATCHMAN",
            "name": "Ramesh",
            "phone": "9999999999",
        },
        format="json",
    )
    assert resp.status_code == 201, resp.data
    contact_id = resp.data["id"]

    resp = api_client.get(f"/api/v1/territory/apartments-admin/{apartment.id}/")
    assert any(c["id"] == contact_id for c in resp.data["contacts"])

    resp = api_client.patch(
        f"/api/v1/territory/apartment-contacts/{contact_id}/", {"name": "Suresh"}, format="json"
    )
    assert resp.status_code == 200, resp.data
    assert resp.data["name"] == "Suresh"

    resp = api_client.delete(f"/api/v1/territory/apartment-contacts/{contact_id}/")
    assert resp.status_code == 204

    resp = api_client.get(f"/api/v1/territory/apartments-admin/{apartment.id}/")
    assert not any(c["id"] == contact_id for c in resp.data["contacts"])


def test_field_staff_cannot_manage_apartment_contacts(api_client, field_user, apartment):
    api_client.force_authenticate(user=field_user)
    resp = api_client.post(
        "/api/v1/territory/apartment-contacts/",
        {"apartment": str(apartment.id), "kind": "WATCHMAN", "name": "Ramesh"},
        format="json",
    )
    assert resp.status_code == 403


def test_operator_only_sees_own_hub_apartment_contacts(api_client, operator_user, apartment):
    from territory.models import Apartment, ApartmentContact, Cluster, Hub

    other_hub = Hub.objects.create(code="OTHER-HUB-MD", name="Other Hub Master Data")
    other_cluster = Cluster.objects.create(hub=other_hub, name="Other Cluster")
    other_apartment = Apartment.objects.create(cluster=other_cluster, name="Other Towers")
    other_contact = ApartmentContact.objects.create(
        apartment=other_apartment, kind="WATCHMAN", name="Not mine"
    )
    mine = ApartmentContact.objects.create(apartment=apartment, kind="WATCHMAN", name="Mine")

    api_client.force_authenticate(user=operator_user)
    resp = api_client.get("/api/v1/territory/apartment-contacts/")
    ids = {row["id"] for row in resp.data["results"]}
    assert str(mine.id) in ids
    assert str(other_contact.id) not in ids
