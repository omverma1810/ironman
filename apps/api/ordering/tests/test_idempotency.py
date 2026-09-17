"""`POST /orders`/`POST /orders/counter` are `Idempotency-Key` required
(docs/04 §3.4) — the web client already sends a fresh key on every create
call, but until now the header was silently ignored server-side, so a
customer's flaky-network retry (or a booking-wizard "confirm" that fires
twice) created two separate orders and, for a slot booking, double-booked
capacity."""

import pytest

import ordering.models as ordering_models
from ordering.models import Order, OrderStatus

pytestmark = pytest.mark.django_db


def test_a_replayed_key_returns_the_same_order_not_a_duplicate(
    api_client, customer_user, hub, service, garment_type, active_price_list
):
    api_client.force_authenticate(user=customer_user)
    body = {
        "hub": str(hub.id),
        "service": str(service.id),
        "channel": "WEB",
        "lines": [{"garment_type": str(garment_type.id), "qty": 1}],
    }
    key = "wizard-confirm-abc123"

    first = api_client.post("/api/v1/orders/", body, format="json", HTTP_IDEMPOTENCY_KEY=key)
    assert first.status_code == 201, first.data
    second = api_client.post("/api/v1/orders/", body, format="json", HTTP_IDEMPOTENCY_KEY=key)
    assert second.status_code == 201, second.data

    assert first.data["ref"] == second.data["ref"]
    assert Order.objects.filter(idempotency_key=key).count() == 1


def test_a_replayed_key_does_not_double_book_the_same_slot(
    api_client, customer_user, hub, cluster, capacity, service, garment_type, active_price_list
):
    api_client.force_authenticate(user=customer_user)
    body = {
        "hub": str(hub.id),
        "service": str(service.id),
        "channel": "WEB",
        "pickup_capacity": str(capacity.id),
        "lines": [{"garment_type": str(garment_type.id), "qty": 1}],
    }
    key = "wizard-confirm-slot-1"

    api_client.post("/api/v1/orders/", body, format="json", HTTP_IDEMPOTENCY_KEY=key)
    api_client.post("/api/v1/orders/", body, format="json", HTTP_IDEMPOTENCY_KEY=key)

    capacity.refresh_from_db()
    assert capacity.booked_count == 1


def test_different_keys_create_genuinely_separate_orders(
    api_client, customer_user, hub, service, garment_type, active_price_list
):
    api_client.force_authenticate(user=customer_user)
    body = {
        "hub": str(hub.id),
        "service": str(service.id),
        "channel": "WEB",
        "lines": [{"garment_type": str(garment_type.id), "qty": 1}],
    }
    first = api_client.post("/api/v1/orders/", body, format="json", HTTP_IDEMPOTENCY_KEY="key-a")
    second = api_client.post("/api/v1/orders/", body, format="json", HTTP_IDEMPOTENCY_KEY="key-b")
    assert first.data["ref"] != second.data["ref"]


def test_no_key_at_all_still_works(
    api_client, customer_user, hub, service, garment_type, active_price_list
):
    api_client.force_authenticate(user=customer_user)
    resp = api_client.post(
        "/api/v1/orders/",
        {
            "hub": str(hub.id),
            "service": str(service.id),
            "channel": "WEB",
            "lines": [{"garment_type": str(garment_type.id), "qty": 1}],
        },
        format="json",
    )
    assert resp.status_code == 201, resp.data


def test_a_replayed_counter_order_key_does_not_re_run_the_at_hub_transition(
    api_client, operator_user, customer, hub, service, garment_type, active_price_list
):
    """`CounterOrderView` transitions every fresh order to AT_HUB itself,
    on top of what `create_order` already does — a naive replay would try
    to run that same transition twice and hit an invalid AT_HUB->AT_HUB
    state-machine error."""
    api_client.force_authenticate(user=operator_user)
    body = {
        "hub": str(hub.id),
        "customer": str(customer.id),
        "service": str(service.id),
        "lines": [{"garment_type": str(garment_type.id), "qty": 1}],
    }
    key = "counter-walkin-1"

    first = api_client.post("/api/v1/orders/counter", body, format="json", HTTP_IDEMPOTENCY_KEY=key)
    assert first.status_code == 201, first.data
    second = api_client.post(
        "/api/v1/orders/counter", body, format="json", HTTP_IDEMPOTENCY_KEY=key
    )
    assert second.status_code == 201, second.data
    assert first.data["ref"] == second.data["ref"]

    order = Order.objects.get(ref=first.data["ref"])
    assert order.status == OrderStatus.AT_HUB


def test_a_ref_collision_from_concurrent_bookings_retries_instead_of_500ing(
    api_client, customer_user, customer, hub, service, garment_type, active_price_list
):
    """`Order.ref` (`_order_ref`, ordering/models.py) is generated from a
    count-based sequence with the exact same race an `Idempotency-Key`
    collision would raise — a naive except-block that assumes every
    `IntegrityError` here is a replay would 500 with `Order.DoesNotExist`
    on a `ref` collision instead of retrying it. Found via a real parallel
    E2E run (two browser projects booking at once), not a hunch."""
    taken_ref = "ORD-COLLIDE-0001"
    Order.objects.create(hub=hub, customer=customer, service=service, channel="WEB", ref=taken_ref)

    real_order_ref = ordering_models._order_ref
    calls = {"n": 0}

    def colliding_once(*args, **kwargs):
        calls["n"] += 1
        return taken_ref if calls["n"] == 1 else real_order_ref(*args, **kwargs)

    ordering_models._order_ref = colliding_once
    try:
        api_client.force_authenticate(user=customer_user)
        resp = api_client.post(
            "/api/v1/orders/",
            {
                "hub": str(hub.id),
                "service": str(service.id),
                "channel": "WEB",
                "lines": [{"garment_type": str(garment_type.id), "qty": 1}],
            },
            format="json",
        )
    finally:
        ordering_models._order_ref = real_order_ref

    assert resp.status_code == 201, resp.data
    assert resp.data["ref"] != taken_ref
    assert calls["n"] == 2
