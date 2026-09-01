"""The quote engine is the single source of pricing truth (docs/04 §3.3) —
every test here exercises `catalog.services.quote`, exactly as the
booking UI, counter POS and intake re-quote flow all do."""

import pytest
from django.utils import timezone

from catalog import services
from catalog.models import Offer
from common.errors import ApiError

pytestmark = pytest.mark.django_db


def test_quote_computes_line_totals(
    hub, service, garment_type, garment_type_trouser, active_price_list
):
    result = services.quote(
        hub_id=hub.id,
        service_id=service.id,
        lines=[
            {"garment_type": garment_type.id, "qty": 3},
            {"garment_type": garment_type_trouser.id, "qty": 2},
        ],
    )
    assert result.subtotal_minor == 3 * 1500 + 2 * 1800
    assert result.total_minor == result.subtotal_minor
    assert result.price_list_version == 1


def test_quote_rejects_unpriced_garment(hub, service, garment_type, active_price_list):
    from catalog.models import GarmentType

    unpriced = GarmentType.objects.create(service=service, code="SAREE", name="Saree")
    with pytest.raises(ApiError) as exc:
        services.quote(
            hub_id=hub.id, service_id=service.id, lines=[{"garment_type": unpriced.id, "qty": 1}]
        )
    assert exc.value.code == "unpriced_garment_type"


def test_quote_with_no_active_price_list_raises(hub, service):
    with pytest.raises(ApiError) as exc:
        services.quote(hub_id=hub.id, service_id=service.id, lines=[])
    assert exc.value.code == "no_active_price_list"


def test_first_order_discount_applies(hub, service, garment_type, active_price_list):
    Offer.objects.create(
        code="FIRST20",
        kind=Offer.Kind.FIRST_ORDER,
        value_bps=0,
        value_minor=500,
        effective_from=timezone.now() - timezone.timedelta(days=1),
        is_active=True,
    )
    result = services.quote(
        hub_id=hub.id,
        service_id=service.id,
        lines=[{"garment_type": garment_type.id, "qty": 1}],
        is_first_order=True,
    )
    assert result.discount_minor == 500
    assert result.total_minor == 1500 - 500
    assert "FIRST20" in result.offers_applied


def test_first_order_discount_does_not_apply_to_repeat_customer(
    hub, service, garment_type, active_price_list
):
    Offer.objects.create(
        code="FIRST20",
        kind=Offer.Kind.FIRST_ORDER,
        value_bps=0,
        value_minor=500,
        effective_from=timezone.now() - timezone.timedelta(days=1),
        is_active=True,
    )
    result = services.quote(
        hub_id=hub.id,
        service_id=service.id,
        lines=[{"garment_type": garment_type.id, "qty": 1}],
        is_first_order=False,
    )
    assert result.discount_minor == 0
    assert result.total_minor == 1500


def test_percent_offer_rounds_half_up(hub, service, garment_type, active_price_list):
    """ADR-004: a ₹15 shirt is exactly the case the client used as their
    own example — rounding must be exact, not approximate."""
    Offer.objects.create(
        code="APT10",
        kind=Offer.Kind.PERCENT,
        value_bps=1000,  # 10%
        effective_from=timezone.now() - timezone.timedelta(days=1),
        is_active=True,
    )
    result = services.quote(
        hub_id=hub.id,
        service_id=service.id,
        lines=[{"garment_type": garment_type.id, "qty": 1}],  # 1500 paise
    )
    assert result.discount_minor == 150  # exactly 10% of 1500
    assert result.total_minor == 1350


def test_discount_never_exceeds_subtotal(hub, service, garment_type, active_price_list):
    Offer.objects.create(
        code="HUGE",
        kind=Offer.Kind.FLAT,
        value_minor=100_000,
        effective_from=timezone.now() - timezone.timedelta(days=1),
        is_active=True,
    )
    result = services.quote(
        hub_id=hub.id,
        service_id=service.id,
        lines=[{"garment_type": garment_type.id, "qty": 1}],
        offer_codes=["HUGE"],
    )
    assert result.total_minor == 0
    assert result.discount_minor == 1500


def test_expired_offer_does_not_apply(hub, service, garment_type, active_price_list):
    Offer.objects.create(
        code="EXPIRED",
        kind=Offer.Kind.PERCENT,
        value_bps=5000,
        effective_from=timezone.now() - timezone.timedelta(days=30),
        effective_to=timezone.now() - timezone.timedelta(days=1),
        is_active=True,
    )
    result = services.quote(
        hub_id=hub.id, service_id=service.id, lines=[{"garment_type": garment_type.id, "qty": 1}]
    )
    assert result.discount_minor == 0


def test_zero_qty_lines_are_skipped(hub, service, garment_type, active_price_list):
    result = services.quote(
        hub_id=hub.id, service_id=service.id, lines=[{"garment_type": garment_type.id, "qty": 0}]
    )
    assert result.lines == []
    assert result.total_minor == 0
