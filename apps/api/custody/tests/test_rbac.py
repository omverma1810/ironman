"""docs/06 §3.1: custody's rows on the permission matrix — "Scan stage
transitions" and "Intake verification" are both Operator/Admin/Founder
only. Field staff's own/assigned scan capability belongs to fulfilment
(pickup/delivery), not the in-hub production stages tracked here — see
custody/views.py's module docstring."""

import pytest

pytestmark = pytest.mark.django_db


def test_operator_can_create_bag(api_client, operator_user, verified_order):
    api_client.force_authenticate(user=operator_user)
    resp = api_client.post(f"/api/v1/orders/{verified_order.id}/bags", {}, format="json")
    assert resp.status_code == 201, resp.data
    assert resp.data["garment_count"] == 3


def test_field_staff_cannot_create_bag(api_client, field_user, verified_order):
    api_client.force_authenticate(user=field_user)
    resp = api_client.post(f"/api/v1/orders/{verified_order.id}/bags", {}, format="json")
    assert resp.status_code == 403


def test_customer_cannot_create_bag(api_client, customer_user, verified_order):
    api_client.force_authenticate(user=customer_user)
    resp = api_client.post(f"/api/v1/orders/{verified_order.id}/bags", {}, format="json")
    assert resp.status_code == 403


def test_anonymous_cannot_create_bag(api_client, verified_order):
    resp = api_client.post(f"/api/v1/orders/{verified_order.id}/bags", {}, format="json")
    assert resp.status_code in (401, 403)


def test_operator_can_scan_bag_forward(api_client, operator_user, bag):
    api_client.force_authenticate(user=operator_user)
    resp = api_client.post(
        "/api/v1/custody/scan", {"code": bag.code, "to_stage": "SORTED"}, format="json"
    )
    assert resp.status_code == 200, resp.data
    assert resp.data["moved_count"] == bag.garment_lines.count()


def test_field_staff_cannot_scan(api_client, field_user, bag):
    api_client.force_authenticate(user=field_user)
    resp = api_client.post(
        "/api/v1/custody/scan", {"code": bag.code, "to_stage": "SORTED"}, format="json"
    )
    assert resp.status_code == 403


def test_scan_unknown_code_is_not_found(api_client, operator_user, bag):
    api_client.force_authenticate(user=operator_user)
    resp = api_client.post(
        "/api/v1/custody/scan", {"code": "BAG-DOESNOTEXIST", "to_stage": "SORTED"}, format="json"
    )
    assert resp.status_code == 404


def test_operator_only_sees_own_hub_bags(api_client, operator_user, bag, hub):
    from territory.models import Hub

    other_hub = Hub.objects.create(code="OTHER-HUB-2", name="Other Hub 2")
    from custody.models import Bag

    other_bag = Bag.objects.create(hub=other_hub, order=bag.order, garment_count=1)

    api_client.force_authenticate(user=operator_user)
    resp = api_client.get("/api/v1/custody/bags/")
    codes = {b["code"] for b in resp.data["results"]}
    assert bag.code in codes
    assert other_bag.code not in codes


def test_founder_sees_all_hub_bags(api_client, founder_user, bag, hub):
    from territory.models import Hub

    other_hub = Hub.objects.create(code="OTHER-HUB-3", name="Other Hub 3")
    from custody.models import Bag

    other_bag = Bag.objects.create(hub=other_hub, order=bag.order, garment_count=1)

    api_client.force_authenticate(user=founder_user)
    resp = api_client.get("/api/v1/custody/bags/")
    codes = {b["code"] for b in resp.data["results"]}
    assert bag.code in codes
    assert other_bag.code in codes


def test_operator_can_record_qc(api_client, operator_user, bag):
    from custody.state_machine import transition_garment_line

    line = bag.garment_lines.first()
    for stage in ("SORTED", "PRESSING", "PRESSED", "QC"):
        line = transition_garment_line(line, stage)

    api_client.force_authenticate(user=operator_user)
    resp = api_client.post(
        f"/api/v1/custody/garment-lines/{line.id}/qc/", {"result": "PASS"}, format="json"
    )
    assert resp.status_code == 200, resp.data
    assert resp.data["stage"] == "PACKED"


def test_operator_can_print_and_reprint_bag_tag(api_client, operator_user, bag):
    api_client.force_authenticate(user=operator_user)
    resp = api_client.post(f"/api/v1/custody/bags/{bag.id}/print_tag/")
    assert resp.status_code == 200, resp.data
    first_printed_at = resp.data["printed_at"]
    assert first_printed_at is not None

    resp = api_client.post(f"/api/v1/custody/bags/{bag.id}/print_tag/")
    assert resp.status_code == 200
    assert resp.data["printed_at"] != first_printed_at  # reprint bumps the timestamp


def test_bag_stage_events_lists_the_scan_history(api_client, operator_user, bag):
    api_client.force_authenticate(user=operator_user)
    api_client.post("/api/v1/custody/scan", {"code": bag.code, "to_stage": "SORTED"}, format="json")

    resp = api_client.get(f"/api/v1/custody/bags/{bag.id}/stage_events/")
    assert resp.status_code == 200
    assert len(resp.data) == bag.garment_lines.count()
    assert all(e["to_stage"] == "SORTED" for e in resp.data)


def test_operator_can_transition_single_garment_line(api_client, operator_user, bag):
    line = bag.garment_lines.first()
    api_client.force_authenticate(user=operator_user)
    resp = api_client.post(
        f"/api/v1/custody/garment-lines/{line.id}/transition/",
        {"to_stage": "HELD"},
        format="json",
    )
    assert resp.status_code == 200, resp.data
    assert resp.data["stage"] == "HELD"

    # the rest of the bag is untouched by a single-garment transition
    other_line = bag.garment_lines.exclude(id=line.id).first()
    assert other_line.stage == "RECEIVED"


def test_field_staff_cannot_record_qc(api_client, field_user, bag):
    from custody.state_machine import transition_garment_line

    line = bag.garment_lines.first()
    for stage in ("SORTED", "PRESSING", "PRESSED", "QC"):
        line = transition_garment_line(line, stage)

    api_client.force_authenticate(user=field_user)
    resp = api_client.post(
        f"/api/v1/custody/garment-lines/{line.id}/qc/", {"result": "PASS"}, format="json"
    )
    assert resp.status_code == 403
