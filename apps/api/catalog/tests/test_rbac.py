"""docs/04 §3.3: price lists and offers are pricing-and-discount
configuration, the same tier as commission rules and unit economics
(docs/06 §3.1's bold rows) — Founder-only, not day-to-day Ops-staff
territory. Batch 3.7 fixed `OfferViewSet` to match (it was previously
`IsOpsStaff`, inconsistent with `PriceListViewSet`/`PackageViewSet`)."""

import pytest

pytestmark = pytest.mark.django_db


def test_founder_can_create_and_activate_a_price_list(api_client, founder_user, hub, service):
    api_client.force_authenticate(user=founder_user)
    resp = api_client.post(
        "/api/v1/catalog/price-lists/",
        {"hub": str(hub.id), "service": str(service.id)},
        format="json",
    )
    assert resp.status_code == 201, resp.data
    assert resp.data["status"] == "DRAFT"
    assert resp.data["version"] == 1

    activate = api_client.post(
        f"/api/v1/catalog/price-lists/{resp.data['id']}/activate/", {}, format="json"
    )
    assert activate.status_code == 200, activate.data
    assert activate.data["status"] == "ACTIVE"


def test_founder_can_set_price_lines_on_a_draft_price_list(
    api_client, founder_user, hub, service, garment_type
):
    api_client.force_authenticate(user=founder_user)
    created = api_client.post(
        "/api/v1/catalog/price-lists/",
        {"hub": str(hub.id), "service": str(service.id)},
        format="json",
    )
    assert created.status_code == 201, created.data

    resp = api_client.put(
        f"/api/v1/catalog/price-lists/{created.data['id']}/lines/",
        {"lines": [{"garment_type": str(garment_type.id), "unit_price_minor": 1500}]},
        format="json",
    )
    assert resp.status_code == 200, resp.data
    assert len(resp.data["lines"]) == 1
    assert resp.data["lines"][0]["unit_price_minor"] == 1500


def test_price_lines_cannot_be_set_on_an_active_price_list(
    api_client, founder_user, hub, service, garment_type
):
    api_client.force_authenticate(user=founder_user)
    created = api_client.post(
        "/api/v1/catalog/price-lists/",
        {"hub": str(hub.id), "service": str(service.id)},
        format="json",
    )
    api_client.put(
        f"/api/v1/catalog/price-lists/{created.data['id']}/lines/",
        {"lines": [{"garment_type": str(garment_type.id), "unit_price_minor": 1500}]},
        format="json",
    )
    api_client.post(
        f"/api/v1/catalog/price-lists/{created.data['id']}/activate/", {}, format="json"
    )

    resp = api_client.put(
        f"/api/v1/catalog/price-lists/{created.data['id']}/lines/",
        {"lines": [{"garment_type": str(garment_type.id), "unit_price_minor": 2000}]},
        format="json",
    )
    assert resp.status_code == 409


def test_admin_cannot_create_a_price_list(api_client, admin_user, hub, service):
    api_client.force_authenticate(user=admin_user)
    resp = api_client.post(
        "/api/v1/catalog/price-lists/",
        {"hub": str(hub.id), "service": str(service.id)},
        format="json",
    )
    assert resp.status_code == 403


def test_operator_cannot_create_a_price_list(api_client, operator_user, hub, service):
    api_client.force_authenticate(user=operator_user)
    resp = api_client.post(
        "/api/v1/catalog/price-lists/",
        {"hub": str(hub.id), "service": str(service.id)},
        format="json",
    )
    assert resp.status_code == 403


def test_customer_cannot_list_price_lists(api_client, customer_user):
    api_client.force_authenticate(user=customer_user)
    resp = api_client.get("/api/v1/catalog/price-lists/")
    assert resp.status_code == 403


def test_anonymous_cannot_list_price_lists(api_client):
    resp = api_client.get("/api/v1/catalog/price-lists/")
    assert resp.status_code in (401, 403)


def _offer_payload(**overrides):
    from django.utils import timezone

    payload = {
        "code": "WELCOME10",
        "kind": "PERCENT",
        "value_bps": 1000,
        "effective_from": timezone.now().isoformat(),
    }
    payload.update(overrides)
    return payload


def test_founder_can_create_list_and_deactivate_an_offer(api_client, founder_user):
    api_client.force_authenticate(user=founder_user)
    resp = api_client.post("/api/v1/catalog/offers/", _offer_payload(), format="json")
    assert resp.status_code == 201, resp.data
    assert resp.data["is_active"] is True

    listing = api_client.get("/api/v1/catalog/offers/")
    assert listing.status_code == 200
    assert len(listing.data["results"]) == 1

    patched = api_client.patch(
        f"/api/v1/catalog/offers/{resp.data['id']}/", {"is_active": False}, format="json"
    )
    assert patched.status_code == 200, patched.data
    assert patched.data["is_active"] is False


def test_admin_cannot_create_an_offer(api_client, admin_user):
    api_client.force_authenticate(user=admin_user)
    resp = api_client.post("/api/v1/catalog/offers/", _offer_payload(), format="json")
    assert resp.status_code == 403


def test_operator_cannot_list_or_create_offers(api_client, operator_user):
    api_client.force_authenticate(user=operator_user)
    assert api_client.get("/api/v1/catalog/offers/").status_code == 403
    assert (
        api_client.post("/api/v1/catalog/offers/", _offer_payload(), format="json").status_code
        == 403
    )


def test_field_cannot_create_an_offer(api_client, field_user):
    api_client.force_authenticate(user=field_user)
    resp = api_client.post("/api/v1/catalog/offers/", _offer_payload(), format="json")
    assert resp.status_code == 403


def test_customer_cannot_create_an_offer(api_client, customer_user):
    api_client.force_authenticate(user=customer_user)
    resp = api_client.post("/api/v1/catalog/offers/", _offer_payload(), format="json")
    assert resp.status_code == 403


def test_anonymous_cannot_create_an_offer(api_client):
    resp = api_client.post("/api/v1/catalog/offers/", _offer_payload(), format="json")
    assert resp.status_code in (401, 403)


# ── Services / garment types (read is public, write is Founder-only) ──────


def test_anyone_can_list_services_and_garment_types(api_client, service, garment_type):
    resp = api_client.get("/api/v1/catalog/services/")
    assert resp.status_code == 200
    resp = api_client.get("/api/v1/catalog/garment-types/")
    assert resp.status_code == 200


def test_operator_cannot_create_a_service(api_client, operator_user):
    api_client.force_authenticate(user=operator_user)
    resp = api_client.post(
        "/api/v1/catalog/services/",
        {"code": "DRY_CLEAN", "name": "Dry cleaning", "unit": "PER_ITEM", "sla_hours": 24},
        format="json",
    )
    assert resp.status_code == 403


def test_founder_can_create_a_service(api_client, founder_user):
    api_client.force_authenticate(user=founder_user)
    resp = api_client.post(
        "/api/v1/catalog/services/",
        {"code": "DRY_CLEAN", "name": "Dry cleaning", "unit": "PER_ITEM", "sla_hours": 24},
        format="json",
    )
    assert resp.status_code == 201, resp.data
