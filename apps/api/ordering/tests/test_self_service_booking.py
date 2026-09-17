"""`POST /orders` is `[C][A][O]` (docs/04 §3.4) — a customer's own JWT
session authenticates them, but nothing proves they own whatever
`customer` id they might put in the request body. These tests hold that
line: a customer booking never trusts the body for their own identity,
gets a real Customer row created on their first order (identity.OtpVerifyView
never creates one — docs/04 §3.1), and reuses it on every order after."""

import pytest

from customers.models import Customer
from identity.models import Role, RoleCode, User, UserRole
from ordering.models import Order

pytestmark = pytest.mark.django_db


def _make_role(code):
    role, _ = Role.objects.get_or_create(code=code, defaults={"name": code})
    return role


def test_a_first_time_customer_booking_creates_their_customer_row(
    api_client, hub, service, garment_type, active_price_list
):
    # A user of their own, deliberately *not* the shared `customer_user`
    # fixture — that one is pre-linked to the `customer` fixture's row by
    # design (other tests rely on the pairing). This one has no Customer
    # row at all, matching a genuine first-time booker straight out of
    # `identity.OtpVerifyView` (docs/04 §3.1: it never creates one).
    user = User.objects.create_user(phone="+919888800001")
    UserRole.objects.create(user=user, role=_make_role(RoleCode.CUSTOMER), hub=None)
    assert not hasattr(user, "customer_profile") or user.customer_profile is None

    api_client.force_authenticate(user=user)
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

    user.refresh_from_db()
    customer = user.customer_profile
    assert customer is not None
    assert customer.phone == user.phone
    order = Order.objects.get(ref=resp.data["ref"])
    assert order.customer_id == customer.id


def test_a_returning_customers_second_order_reuses_the_same_customer_row(
    api_client, customer_user, customer, hub, service, garment_type, active_price_list
):
    # The `customer` fixture is already linked to `customer_user` by the
    # `customer_user` fixture itself.
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
    assert Customer.objects.filter(user=customer_user).count() == 1
    order = Order.objects.get(ref=resp.data["ref"])
    assert order.customer_id == customer.id


def test_a_customer_cannot_book_under_another_customers_id(
    api_client, customer_user, hub, service, garment_type, active_price_list
):
    """The actual vulnerability this closes: a `customer`-role caller
    used to be trusted at face value for *whichever* customer id they
    put in the request body — meaning any customer could create an
    order (and, downstream, be invoiced/charged) as someone else
    entirely, just by knowing their id."""
    victim = Customer.objects.create(hub=hub, phone="+919000000099", name="Victim")

    api_client.force_authenticate(user=customer_user)
    resp = api_client.post(
        "/api/v1/orders/",
        {
            "hub": str(hub.id),
            "customer": str(victim.id),
            "service": str(service.id),
            "channel": "WEB",
            "lines": [{"garment_type": str(garment_type.id), "qty": 1}],
        },
        format="json",
    )
    assert resp.status_code == 201, resp.data

    order = Order.objects.get(ref=resp.data["ref"])
    assert order.customer_id != victim.id
    assert order.customer.user_id == customer_user.id


def test_staff_must_still_supply_a_customer_id(
    api_client, operator_user, hub, service, garment_type, active_price_list
):
    api_client.force_authenticate(user=operator_user)
    resp = api_client.post(
        "/api/v1/orders/",
        {
            "hub": str(hub.id),
            "service": str(service.id),
            "channel": "COUNTER",
            "lines": [{"garment_type": str(garment_type.id), "qty": 1}],
        },
        format="json",
    )
    assert resp.status_code == 400


def test_staff_booking_on_a_customers_behalf_still_works(
    api_client, operator_user, customer, hub, service, garment_type, active_price_list
):
    api_client.force_authenticate(user=operator_user)
    resp = api_client.post(
        "/api/v1/orders/",
        {
            "hub": str(hub.id),
            "customer": str(customer.id),
            "service": str(service.id),
            "channel": "PHONE",
            "lines": [{"garment_type": str(garment_type.id), "qty": 1}],
        },
        format="json",
    )
    assert resp.status_code == 201, resp.data
    order = Order.objects.get(ref=resp.data["ref"])
    assert order.customer_id == customer.id
