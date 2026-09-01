"""Shared pytest fixtures. Factories build a minimal, valid graph for each
test — a hub with an active price list is the baseline almost everything
needs, so it lives here rather than being copy-pasted into every module."""

from __future__ import annotations

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from catalog.models import GarmentType, PriceLine, PriceList, Service
from customers.models import Address, Customer
from identity.models import Role, RoleCode, User, UserRole
from territory.models import Apartment, Cluster, Hub, RouteDayCapacity


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def hub(db):
    return Hub.objects.create(code="TEST-HUB", name="Test Hub", daily_pressing_capacity=100)


@pytest.fixture
def cluster(hub):
    return Cluster.objects.create(hub=hub, name="Test Cluster")


@pytest.fixture
def apartment(cluster):
    return Apartment.objects.create(
        cluster=cluster, name="Test Towers", pincode="560001", launched_on=timezone.localdate()
    )


@pytest.fixture
def service(db):
    return Service.objects.create(code="IRONING", name="Ironing")


@pytest.fixture
def garment_type(service):
    return GarmentType.objects.create(service=service, code="SHIRT", name="Shirt")


@pytest.fixture
def garment_type_trouser(service):
    return GarmentType.objects.create(service=service, code="TROUSER", name="Trouser")


@pytest.fixture
def active_price_list(hub, service, garment_type, garment_type_trouser):
    pl = PriceList.objects.create(
        hub=hub,
        service=service,
        version=1,
        status=PriceList.Status.ACTIVE,
        effective_from=timezone.now(),
    )
    PriceLine.objects.create(price_list=pl, garment_type=garment_type, unit_price_minor=1500)
    PriceLine.objects.create(
        price_list=pl, garment_type=garment_type_trouser, unit_price_minor=1800
    )
    return pl


@pytest.fixture
def customer(hub):
    return Customer.objects.create(hub=hub, phone="+919999999999", name="Test Customer")


@pytest.fixture
def address(customer, apartment):
    return Address.objects.create(
        customer=customer, apartment=apartment, flat_no="101", is_default=True
    )


@pytest.fixture
def capacity(hub, cluster):
    return RouteDayCapacity.objects.create(
        hub=hub,
        cluster=cluster,
        date=timezone.localdate() + timezone.timedelta(days=1),
        window_start="08:00",
        window_end="10:00",
        kind=RouteDayCapacity.Kind.PICKUP,
        capacity=2,
    )


def _make_role(code):
    role, _ = Role.objects.get_or_create(code=code, defaults={"name": code})
    return role


@pytest.fixture
def admin_user(hub):
    user = User.objects.create_user(email="admin@test.local", password="testpass1234")
    user.email_verified_at = timezone.now()
    user.save(update_fields=["email_verified_at"])
    UserRole.objects.create(user=user, role=_make_role(RoleCode.ADMIN), hub=hub)
    return user


@pytest.fixture
def operator_user(hub):
    user = User.objects.create_user(email="operator@test.local", password="testpass1234")
    user.email_verified_at = timezone.now()
    user.save(update_fields=["email_verified_at"])
    UserRole.objects.create(user=user, role=_make_role(RoleCode.OPERATOR), hub=hub)
    return user


@pytest.fixture
def founder_user(hub):
    user = User.objects.create_user(email="founder@test.local", password="testpass1234")
    user.email_verified_at = timezone.now()
    user.save(update_fields=["email_verified_at"])
    UserRole.objects.create(user=user, role=_make_role(RoleCode.FOUNDER), hub=hub)
    return user


@pytest.fixture
def field_user(hub):
    user = User.objects.create_user(email="field@test.local", password="testpass1234")
    user.email_verified_at = timezone.now()
    user.save(update_fields=["email_verified_at"])
    UserRole.objects.create(user=user, role=_make_role(RoleCode.FIELD), hub=hub)
    return user


@pytest.fixture
def customer_user(customer):
    user = User.objects.create_user(phone=customer.phone)
    UserRole.objects.create(user=user, role=_make_role(RoleCode.CUSTOMER), hub=None)
    customer.user = user
    customer.save(update_fields=["user"])
    return user
