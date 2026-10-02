"""docs/08 batch 5.2: attribution capture at first order."""

from __future__ import annotations

import pytest

from customers.models import Customer
from growth import services
from growth.models import Attribution, AttributionBasis, ChannelCode, PartnerKind
from ordering import services as ordering_services
from ordering.models import Order, OrderStatus

pytestmark = pytest.mark.django_db


def _order(hub, customer, service, *, channel="WEB", code="", apartment=None):
    return Order.objects.create(
        hub=hub,
        customer=customer,
        service=service,
        channel=channel,
        status=OrderStatus.SCHEDULED,
        referral_code=code,
        apartment=apartment,
    )


@pytest.fixture
def watchman_code(hub, admin_user):
    partner = services.onboard_partner(
        hub=hub, kind=PartnerKind.WATCHMAN, name="Ramesh", phone="9876543210", actor=admin_user
    )
    return services.create_referral_code(hub=hub, owner_partner=partner, actor=admin_user)


def test_first_order_with_a_partner_code_attributes_to_that_partner(
    hub, customer, service, watchman_code
):
    order = _order(hub, customer, service, code=watchman_code.code)
    attribution = services.capture_attribution(order)

    assert attribution.is_first_touch
    assert attribution.channel.code == ChannelCode.WATCHMAN
    assert attribution.partner_id == watchman_code.owner_partner_id
    assert attribution.basis == AttributionBasis.CODE
    customer.refresh_from_db()
    assert customer.acquisition_channel == ChannelCode.WATCHMAN
    assert customer.acquisition_partner_id == watchman_code.owner_partner_id
    watchman_code.refresh_from_db()
    assert watchman_code.uses_count == 1


def test_code_is_matched_case_insensitively_and_whitespace_is_ignored(
    hub, customer, service, watchman_code
):
    order = _order(hub, customer, service, code=f"  {watchman_code.code.lower()} ")
    assert services.capture_attribution(order).partner_id == watchman_code.owner_partner_id


def test_a_bad_or_inactive_code_never_fails_it_just_falls_back(
    hub, customer, service, watchman_code
):
    services.set_referral_code_active(watchman_code, is_active=False)
    order = _order(hub, customer, service, code=watchman_code.code)
    attribution = services.capture_attribution(order)
    assert attribution.channel.code == ChannelCode.ORGANIC
    assert attribution.basis == AttributionBasis.DEFAULT
    assert attribution.partner_id is None
    watchman_code.refresh_from_db()
    assert watchman_code.uses_count == 0


def test_self_reported_source_beats_the_order_channel(hub, customer, service):
    order = _order(hub, customer, service, channel="WHATSAPP")
    attribution = services.capture_attribution(order, self_reported=ChannelCode.FLYER)
    assert attribution.channel.code == ChannelCode.FLYER
    assert attribution.basis == AttributionBasis.SELF_REPORTED


def test_unknown_self_reported_value_is_ignored(hub, customer, service):
    order = _order(hub, customer, service)
    attribution = services.capture_attribution(order, self_reported="MY-NEIGHBOUR")
    assert attribution.channel.code == ChannelCode.ORGANIC


@pytest.mark.parametrize(
    "order_channel, expected, basis",
    [
        ("WHATSAPP", ChannelCode.WHATSAPP, AttributionBasis.ORDER_CHANNEL),
        ("COUNTER", ChannelCode.WALK_IN, AttributionBasis.ORDER_CHANNEL),
        ("WEB", ChannelCode.ORGANIC, AttributionBasis.DEFAULT),
        ("PHONE", ChannelCode.ORGANIC, AttributionBasis.DEFAULT),
    ],
)
def test_every_first_order_gets_a_channel(hub, customer, service, order_channel, expected, basis):
    attribution = services.capture_attribution(
        _order(hub, customer, service, channel=order_channel)
    )
    assert attribution.channel.code == expected
    assert attribution.basis == basis


def test_customer_owned_code_attributes_to_customer_referral(hub, service, customer):
    friend = Customer.objects.create(hub=hub, phone="+919800000001", name="Friend")
    code = services.create_referral_code(hub=hub, owner_customer=customer)
    attribution = services.capture_attribution(_order(hub, friend, service, code=code.code))
    assert attribution.channel.code == ChannelCode.CUSTOMER_REFERRAL
    assert attribution.partner_id is None


def test_you_cannot_refer_yourself(hub, customer, service):
    code = services.create_referral_code(hub=hub, owner_customer=customer)
    attribution = services.capture_attribution(_order(hub, customer, service, code=code.code))
    assert attribution.channel.code == ChannelCode.ORGANIC


def test_first_touch_is_written_once_later_orders_add_nothing(hub, customer, service):
    services.capture_attribution(_order(hub, customer, service, channel="WHATSAPP"))
    second = services.capture_attribution(_order(hub, customer, service, channel="COUNTER"))
    assert second is None
    assert Attribution.objects.filter(customer=customer).count() == 1
    customer.refresh_from_db()
    assert customer.acquisition_channel == ChannelCode.WHATSAPP


def test_a_later_order_with_a_code_adds_a_non_first_touch_row(
    hub, customer, service, watchman_code
):
    services.capture_attribution(_order(hub, customer, service))
    later = services.capture_attribution(_order(hub, customer, service, code=watchman_code.code))
    assert later is not None and not later.is_first_touch
    assert later.partner_id == watchman_code.owner_partner_id
    # ...and the customer's recorded acquisition stays the original one.
    customer.refresh_from_db()
    assert customer.acquisition_channel == ChannelCode.ORGANIC
    assert Attribution.objects.filter(customer=customer, is_first_touch=True).count() == 1


def test_attribution_rows_are_append_only(hub, customer, service):
    attribution = services.capture_attribution(_order(hub, customer, service))
    attribution.basis = AttributionBasis.CODE
    with pytest.raises(RuntimeError):
        attribution.save()
    with pytest.raises(RuntimeError):
        attribution.delete()


def test_acquisition_apartment_is_taken_from_the_order(hub, customer, service, apartment):
    attribution = services.capture_attribution(_order(hub, customer, service, apartment=apartment))
    assert attribution.apartment_id == apartment.id
    customer.refresh_from_db()
    assert customer.acquisition_apartment_id == apartment.id


def test_create_order_captures_attribution_and_a_failure_never_blocks_booking(
    hub, customer, service, garment_type, active_price_list, monkeypatch
):
    lines = [{"garment_type": garment_type.id, "qty": 2}]
    order = ordering_services.create_order(
        hub=hub,
        customer=customer,
        service=service,
        lines=lines,
        channel="WHATSAPP",
        acquisition_source="",
    )
    assert Attribution.objects.get(customer=customer).channel.code == ChannelCode.WHATSAPP
    assert Attribution.objects.get(customer=customer).order_id == order.id

    def boom(*args, **kwargs):
        raise RuntimeError("attribution down")

    monkeypatch.setattr(services, "capture_attribution", boom)
    other = Customer.objects.create(hub=hub, phone="+919800000002", name="Other")
    booked = ordering_services.create_order(
        hub=hub, customer=other, service=service, lines=lines, channel="WEB"
    )
    assert booked.status != OrderStatus.DRAFT
    assert not Attribution.objects.filter(customer=other).exists()


def test_attributions_endpoint_is_ops_only_and_hub_scoped(
    api_client, operator_user, field_user, customer, hub, service
):
    services.capture_attribution(_order(hub, customer, service, channel="COUNTER"))
    api_client.force_authenticate(user=operator_user)
    resp = api_client.get(f"/api/v1/growth/attributions/?customer={customer.id}")
    assert resp.status_code == 200
    row = resp.data["results"][0]
    assert row["channel_code"] == "WALK_IN" and row["is_first_touch"] is True

    api_client.force_authenticate(user=field_user)
    assert api_client.get("/api/v1/growth/attributions/").status_code == 403


def test_an_emptied_channel_table_is_healed_rather_than_losing_attribution(hub, customer, service):
    """`manage.py flush` (and some restores) wipe migration-seeded rows."""
    from growth.models import Channel

    Channel.objects.all().delete()
    attribution = services.capture_attribution(_order(hub, customer, service, channel="COUNTER"))
    assert attribution.channel.code == ChannelCode.WALK_IN
    assert Channel.objects.filter(code=ChannelCode.WALK_IN).exists()
