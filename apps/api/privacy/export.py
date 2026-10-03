"""`GET /me/export` (docs/06 §5, access & portability): everything we hold
about the signed-in customer, as one JSON document they can keep.

Staff notes and internal cost data are the business's own records, not
the customer's, so they are left out; everything the customer gave us or
was charged is in."""

from __future__ import annotations

from django.utils import timezone

from billing import services as billing_services
from billing.models import Invoice
from customers.models import Address, ConsentRecord, Customer
from growth.models import Feedback, ReferralCode
from identity.models import User
from ordering.models import Order


def _iso(value):
    return value.isoformat() if value else None


def build(user: User) -> dict:
    customer = Customer.objects.filter(user=user, deleted_at__isnull=True).first()
    data: dict = {
        "exported_at": timezone.now().isoformat(),
        "format": "IronMan customer data export v1",
        "account": {
            "phone": user.phone,
            "email": user.email,
            "name": user.full_name,
            "preferred_language": user.preferred_language,
            "created_at": _iso(user.created_at),
            "phone_verified_at": _iso(user.phone_verified_at),
        },
        "customer": None,
        "addresses": [],
        "consents": [],
        "orders": [],
        "invoices": [],
        "credit": [],
        "feedback": [],
        "referral_code": None,
    }
    if customer is None:
        return data

    data["customer"] = {
        "name": customer.name,
        "phone": customer.phone,
        "email": customer.email,
        "first_order_at": _iso(customer.first_order_at),
        "last_order_at": _iso(customer.last_order_at),
        "lifetime_orders": customer.lifetime_orders,
        "how_you_found_us": customer.acquisition_channel,
    }
    data["addresses"] = [
        {
            "label": a.label,
            "flat_no": a.flat_no,
            "block": a.block,
            "apartment": a.apartment.name if a.apartment else None,
            "landmark": a.landmark,
            "address": a.free_text_address,
            "is_default": a.is_default,
        }
        for a in Address.objects.filter(customer=customer).select_related("apartment")
    ]
    data["consents"] = [
        {
            "purpose": c.purpose,
            "granted": c.granted,
            "source": c.source,
            "recorded_at": _iso(c.created_at),
        }
        for c in ConsentRecord.objects.filter(customer=customer).order_by("created_at")
    ]
    orders = (
        Order.objects.filter(customer=customer)
        .select_related("service")
        .prefetch_related("lines__garment_type")
        .order_by("created_at")
    )
    data["orders"] = [
        {
            "ref": o.ref,
            "service": o.service.name,
            "status": o.status,
            "booked_at": _iso(o.created_at),
            "pickup_slot": [_iso(o.pickup_slot_start), _iso(o.pickup_slot_end)],
            "picked_up_at": _iso(o.picked_up_at),
            "delivered_at": _iso(o.delivered_at),
            "special_instructions": o.special_instructions,
            "total_minor": o.total_minor,
            "items": [
                {
                    "garment": line.garment_type.name,
                    "quantity": (
                        line.verified_qty if line.verified_qty is not None else line.declared_qty
                    ),
                    "unit_price_minor": line.unit_price_minor,
                    "line_total_minor": line.line_total_minor,
                }
                for line in o.lines.all()
            ],
        }
        for o in orders
    ]
    data["invoices"] = [
        {
            "ref": inv.ref,
            "order": inv.order.ref,
            "status": inv.status,
            "issued_at": _iso(inv.issued_at),
            "total_minor": inv.total_minor,
            "balance_minor": billing_services.invoice_balance(inv),
            "payments": [
                {
                    "method": p.method,
                    "status": p.status,
                    "amount_minor": p.amount_minor,
                    "at": _iso(p.created_at),
                }
                for p in inv.payments.all()
            ],
        }
        for inv in Invoice.objects.filter(customer=customer)
        .select_related("order")
        .prefetch_related("payments")
        .order_by("created_at")
    ]
    data["credit"] = [
        {
            "delta_minor": e.delta_minor,
            "reason": e.reason,
            "note": e.note,
            "at": _iso(e.created_at),
        }
        for e in billing_services.credit_entries(customer).order_by("created_at")
    ]
    data["feedback"] = [
        {"order": f.order.ref, "rating": f.rating, "comment": f.comment, "at": _iso(f.created_at)}
        for f in Feedback.objects.filter(customer=customer).select_related("order")
    ]
    code = ReferralCode.objects.filter(owner_customer=customer).first()
    data["referral_code"] = code.code if code else None
    return data
