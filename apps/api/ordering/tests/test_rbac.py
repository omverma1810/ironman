"""docs/06 §3.1: the permission matrix is only real if it is tested code,
not a table in a document. Each case here is one cell of that matrix,
asserted as an actual API call."""

import pytest

pytestmark = pytest.mark.django_db


def _login(api_client, email, password="testpass1234"):
    resp = api_client.post(
        "/api/v1/auth/login", {"email": email, "password": password}, format="json"
    )
    return resp


def test_operator_can_create_counter_order(
    api_client, operator_user, hub, customer, service, garment_type, active_price_list
):
    _login(api_client, operator_user.email)
    resp = api_client.post(
        "/api/v1/orders/counter",
        {
            "hub": str(hub.id),
            "customer": str(customer.id),
            "service": str(service.id),
            "lines": [{"garment_type": str(garment_type.id), "qty": 1}],
        },
        format="json",
    )
    assert resp.status_code == 201, resp.data


def test_field_staff_cannot_create_counter_order(
    api_client, field_user, hub, customer, service, garment_type, active_price_list
):
    _login(api_client, field_user.email)
    resp = api_client.post(
        "/api/v1/orders/counter",
        {
            "hub": str(hub.id),
            "customer": str(customer.id),
            "service": str(service.id),
            "lines": [{"garment_type": str(garment_type.id), "qty": 1}],
        },
        format="json",
    )
    assert resp.status_code == 403


def test_anonymous_cannot_create_counter_order(api_client, hub, customer, service, garment_type):
    resp = api_client.post(
        "/api/v1/orders/counter",
        {
            "hub": str(hub.id),
            "customer": str(customer.id),
            "service": str(service.id),
            "lines": [{"garment_type": str(garment_type.id), "qty": 1}],
        },
        format="json",
    )
    assert resp.status_code in (401, 403)


def test_customer_sees_only_own_orders(
    api_client,
    customer_user,
    customer,
    hub,
    service,
    garment_type,
    active_price_list,
    address,
    apartment,
):
    from ordering import services as ordering_services

    own_order = ordering_services.create_order(
        hub=hub,
        customer=customer,
        service=service,
        lines=[{"garment_type": garment_type.id, "qty": 1}],
        channel="WEB",
        address=address,
        apartment=apartment,
    )
    from customers.models import Customer

    other_customer = Customer.objects.create(hub=hub, phone="+919000000000", name="Someone Else")
    other_order = ordering_services.create_order(
        hub=hub,
        customer=other_customer,
        service=service,
        lines=[{"garment_type": garment_type.id, "qty": 1}],
        channel="WEB",
    )

    api_client.force_authenticate(user=customer_user)
    resp = api_client.get("/api/v1/orders/")
    refs = {o["ref"] for o in resp.data["results"]}
    assert own_order.ref in refs
    assert other_order.ref not in refs


def test_operator_only_sees_own_hub_orders(
    api_client,
    operator_user,
    hub,
    service,
    garment_type,
    active_price_list,
    address,
    apartment,
    customer,
):
    from ordering import services as ordering_services
    from territory.models import Hub

    other_hub = Hub.objects.create(code="OTHER-HUB", name="Other Hub")
    from django.utils import timezone

    from catalog.models import GarmentType, PriceLine, PriceList, Service

    other_service = Service.objects.create(code="IRONING2", name="Ironing 2")
    other_gt = GarmentType.objects.create(service=other_service, code="SHIRT2", name="Shirt")
    other_pl = PriceList.objects.create(
        hub=other_hub,
        service=other_service,
        version=1,
        status=PriceList.Status.ACTIVE,
        effective_from=timezone.now(),
    )
    PriceLine.objects.create(price_list=other_pl, garment_type=other_gt, unit_price_minor=1000)
    from customers.models import Customer

    other_customer = Customer.objects.create(
        hub=other_hub, phone="+919111111111", name="Other Hub Customer"
    )

    own_order = ordering_services.create_order(
        hub=hub,
        customer=customer,
        service=service,
        lines=[{"garment_type": garment_type.id, "qty": 1}],
        channel="WEB",
        address=address,
        apartment=apartment,
    )
    other_order = ordering_services.create_order(
        hub=other_hub,
        customer=other_customer,
        service=other_service,
        lines=[{"garment_type": other_gt.id, "qty": 1}],
        channel="WEB",
    )

    api_client.force_authenticate(user=operator_user)
    resp = api_client.get("/api/v1/orders/")
    refs = {o["ref"] for o in resp.data["results"]}
    assert own_order.ref in refs
    assert other_order.ref not in refs


def test_founder_sees_all_hubs(
    api_client,
    founder_user,
    hub,
    service,
    garment_type,
    active_price_list,
    address,
    apartment,
    customer,
):
    from ordering import services as ordering_services

    order = ordering_services.create_order(
        hub=hub,
        customer=customer,
        service=service,
        lines=[{"garment_type": garment_type.id, "qty": 1}],
        channel="WEB",
        address=address,
        apartment=apartment,
    )
    api_client.force_authenticate(user=founder_user)
    resp = api_client.get("/api/v1/orders/")
    refs = {o["ref"] for o in resp.data["results"]}
    assert order.ref in refs


def test_only_founder_can_create_price_list(api_client, admin_user, founder_user, hub, service):
    api_client.force_authenticate(user=admin_user)
    resp = api_client.post(
        "/api/v1/catalog/price-lists/",
        {"hub": str(hub.id), "service": str(service.id)},
        format="json",
    )
    assert resp.status_code == 403

    api_client.force_authenticate(user=founder_user)
    resp = api_client.post(
        "/api/v1/catalog/price-lists/",
        {"hub": str(hub.id), "service": str(service.id)},
        format="json",
    )
    assert resp.status_code == 201


def test_admin_login_without_mfa_setup_is_blocked(api_client, admin_user):
    """docs/06 §2.2: TOTP is mandatory for ADMIN/FOUNDER."""
    resp = _login(api_client, admin_user.email)
    assert resp.status_code == 403
    assert resp.data["error"]["code"] == "mfa_setup_required"


def test_operator_login_without_mfa_succeeds(api_client, operator_user):
    resp = _login(api_client, operator_user.email)
    assert resp.status_code == 200


def test_unverified_email_cannot_login(api_client, hub):
    from identity.models import Role, RoleCode, User, UserRole

    user = User.objects.create_user(email="unverified@test.local", password="testpass1234")
    role, _ = Role.objects.get_or_create(code=RoleCode.OPERATOR, defaults={"name": "Operator"})
    UserRole.objects.create(user=user, role=role, hub=hub)
    resp = _login(api_client, user.email)
    assert resp.status_code == 403
    assert resp.data["error"]["code"] == "email_not_verified"
