"""
The quote engine — the single source of pricing truth (docs/04 §3.3). The
booking UI, the counter POS, the intake re-quote and the invoice all call
`quote()`; there is no second place a total can be computed differently.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal

from catalog.models import GarmentType, Offer, PriceList, Service
from common.errors import ApiError
from common.money import Money


@dataclass
class QuoteLine:
    garment_type_id: str
    garment_type_name: str
    qty: int
    unit_price_minor: int
    line_total_minor: int


@dataclass
class QuoteResult:
    price_list_id: str
    price_list_version: int
    lines: list[QuoteLine] = field(default_factory=list)
    subtotal_minor: int = 0
    discount_minor: int = 0
    total_minor: int = 0
    offers_applied: list[str] = field(default_factory=list)
    currency: str = "INR"

    def to_dict(self) -> dict:
        return {
            "price_list_id": self.price_list_id,
            "price_list_version": self.price_list_version,
            "lines": [
                {
                    "garment_type": line.garment_type_id,
                    "garment_type_name": line.garment_type_name,
                    "qty": line.qty,
                    "unit_price": Money(line.unit_price_minor, self.currency).to_dict(),
                    "line_total": Money(line.line_total_minor, self.currency).to_dict(),
                }
                for line in self.lines
            ],
            "subtotal": Money(self.subtotal_minor, self.currency).to_dict(),
            "discount": Money(self.discount_minor, self.currency).to_dict(),
            "total": Money(self.total_minor, self.currency).to_dict(),
            "offers_applied": self.offers_applied,
        }


def get_active_price_list(*, hub_id, service_id) -> PriceList:
    price_list = (
        PriceList.objects.filter(
            hub_id=hub_id, service_id=service_id, status=PriceList.Status.ACTIVE
        )
        .order_by("-version")
        .first()
    )
    if not price_list:
        raise ApiError(
            "There's no active price list for this service yet. An admin needs to "
            "activate one before bookings can be quoted.",
            code="no_active_price_list",
            status_code=422,
        )
    return price_list


def quote(
    *,
    hub_id,
    service_id,
    lines: list[dict],
    apartment_id=None,
    is_first_order: bool = False,
    offer_codes: list[str] | None = None,
) -> QuoteResult:
    """`lines` is `[{"garment_type": id, "qty": int}, ...]`. Pure function
    of its inputs plus the currently ACTIVE price list — no order-specific
    state is read, so it is safe to call from booking, counter intake and
    the re-quote flow alike."""
    # `lines` arrives from JSON (a plain DRF DictField) when called over
    # HTTP, so `garment_type` values are strings there — but callers that
    # invoke quote() directly in Python (seed data, other services) pass
    # real UUID objects from model instances. Normalise everything to str
    # so the two call shapes look up the same dict correctly either way.
    price_list = get_active_price_list(hub_id=hub_id, service_id=service_id)
    price_by_garment = {
        str(pl.garment_type_id): pl.unit_price_minor
        for pl in price_list.lines.select_related("garment_type")
    }
    garment_types = {
        str(gt.id): gt
        for gt in GarmentType.objects.filter(id__in=[entry["garment_type"] for entry in lines])
    }

    result = QuoteResult(price_list_id=str(price_list.id), price_list_version=price_list.version)
    subtotal = 0
    for entry in lines:
        gt_id = str(entry["garment_type"])
        qty = int(entry["qty"])
        if qty <= 0:
            continue
        if gt_id not in price_by_garment:
            gt_name = garment_types.get(gt_id)
            raise ApiError(
                f"{gt_name.name if gt_name else 'That item'} isn't priced for this service yet.",
                code="unpriced_garment_type",
                status_code=422,
            )
        unit_price = price_by_garment[gt_id]
        line_total = unit_price * qty
        subtotal += line_total
        result.lines.append(
            QuoteLine(
                garment_type_id=str(gt_id),
                garment_type_name=garment_types[gt_id].name if gt_id in garment_types else "",
                qty=qty,
                unit_price_minor=unit_price,
                line_total_minor=line_total,
            )
        )

    result.subtotal_minor = subtotal
    discount = 0

    candidate_offers = list(
        Offer.objects.filter(is_active=True).filter(models_q_first_order_or_general(is_first_order))
    )
    if offer_codes:
        candidate_offers += list(Offer.objects.filter(code__in=offer_codes, is_active=True))

    for offer in candidate_offers:
        if not offer.is_valid_now():
            continue
        if offer.apartment_id and str(offer.apartment_id) != str(apartment_id):
            continue
        line_discount = 0
        if offer.kind == Offer.Kind.PERCENT:
            line_discount = Money(subtotal).percent(Decimal(offer.value_bps) / 100).minor
        elif offer.kind in (Offer.Kind.FLAT, Offer.Kind.FIRST_ORDER, Offer.Kind.APARTMENT_PROMO):
            line_discount = offer.value_minor
        if offer.cap_minor is not None:
            line_discount = min(line_discount, offer.cap_minor)
        line_discount = min(line_discount, subtotal - discount)
        if line_discount > 0:
            discount += line_discount
            result.offers_applied.append(offer.code)

    result.discount_minor = discount
    result.total_minor = max(subtotal - discount, 0)
    return result


def models_q_first_order_or_general(is_first_order: bool):
    """FIRST_ORDER offers only ever match a customer's first order.
    APARTMENT_PROMO/FLAT/PERCENT are general-purpose and auto-apply to any
    matching order once activated. REFERRAL_CREDIT is deliberately
    excluded — it is issued to a customer's credit ledger (Phase 5,
    `growth`), not subtracted from an order total at quote time."""
    from django.db.models import Q

    from catalog.models import Offer as _Offer

    if is_first_order:
        return Q(kind=_Offer.Kind.FIRST_ORDER)
    return Q(kind__in=[_Offer.Kind.APARTMENT_PROMO, _Offer.Kind.FLAT, _Offer.Kind.PERCENT])


def get_service(service_id):
    return Service.objects.get(pk=service_id)
