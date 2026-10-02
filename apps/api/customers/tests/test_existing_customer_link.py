"""A customer who already exists without a login — added at the counter, or
in the demo data — and later signs in with their phone must get *that*
customer record, not a second one. Before the fix, sign-in created a User
with no customer attached; their order history was invisible, and their
first online booking tried to create a duplicate customer for the same
(hub, phone) and failed on the unique constraint."""

import pytest

from customers.models import Customer
from identity.models import User
from ordering.models import Order, OrderStatus

pytestmark = pytest.mark.django_db


def _sign_in(api_client, phone: str) -> str:
    api_client.post("/api/v1/auth/otp/request", {"phone": phone}, format="json")
    code = api_client.get("/api/v1/auth/otp/debug", {"phone": phone}).data["code"]
    verify = api_client.post(
        "/api/v1/auth/otp/verify", {"phone": phone, "code": code}, format="json"
    )
    assert verify.status_code == 200, verify.data
    return verify.data["access"]


@pytest.fixture
def counter_customer(hub):
    """A customer added at the counter, with no login. Its own phone, so the
    sign-in codes these tests cache (Redis, 5 minutes) never collide with
    other tests' phones."""
    return Customer.objects.create(hub=hub, phone="+919844400001", name="Counter Customer")


def test_signing_in_attaches_the_existing_customer_and_shows_their_history(
    api_client, hub, counter_customer, service
):
    customer = counter_customer
    order = Order.objects.create(
        hub=hub, customer=customer, service=service, channel="COUNTER", status=OrderStatus.READY
    )
    token = _sign_in(api_client, customer.phone)

    customer.refresh_from_db()
    assert customer.user is not None and customer.user.phone == customer.phone

    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    resp = api_client.get("/api/v1/orders/")
    assert resp.status_code == 200
    assert [r["ref"] for r in resp.data["results"]] == [order.ref]


def test_first_online_booking_reuses_the_existing_customer(
    api_client, hub, counter_customer, service, garment_type, active_price_list
):
    customer = counter_customer
    from territory.models import ServiceArea

    ServiceArea.objects.get_or_create(hub=hub, pincode="500027", defaults={"is_active": True})
    token = _sign_in(api_client, customer.phone)
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

    resp = api_client.post(
        "/api/v1/orders/",
        {
            "hub": str(hub.id),
            "service": str(service.id),
            "channel": "WEB",
            "free_text_address": "12 Test Lane",
            "lines": [{"garment_type": str(garment_type.id), "qty": 2}],
        },
        format="json",
    )
    assert resp.status_code == 201, resp.data
    assert Customer.objects.filter(phone=customer.phone).count() == 1
    assert Order.objects.get(ref=resp.data["ref"]).customer_id == customer.id


def test_a_customer_already_linked_to_someone_else_is_never_taken_over(api_client, hub):
    owner = User.objects.create(phone="+919844400002", full_name="Owner")
    linked = Customer.objects.create(hub=hub, phone="+919844400003", name="Linked", user=owner)

    _sign_in(api_client, "+919844400003")

    linked.refresh_from_db()
    assert linked.user_id == owner.id


def test_a_brand_new_phone_still_gets_a_fresh_customer_on_first_booking(
    api_client, hub, service, garment_type, active_price_list
):
    token = _sign_in(api_client, "+919844400004")
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    resp = api_client.post(
        "/api/v1/orders/",
        {
            "hub": str(hub.id),
            "service": str(service.id),
            "channel": "WEB",
            "free_text_address": "1 New Road",
            "lines": [{"garment_type": str(garment_type.id), "qty": 1}],
        },
        format="json",
    )
    assert resp.status_code == 201, resp.data
    assert Customer.objects.filter(phone="+919844400004").count() == 1
