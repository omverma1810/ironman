"""Duplicate detection and merge (docs/02 §3.4 — phone typos are
inevitable). Merge preserves the surviving customer's stats and moves
addresses/notes across; the merge itself is logged, not silently applied."""

from __future__ import annotations

from django.db import transaction

from common.errors import ApiError
from customers.models import Customer, CustomerMergeLog


def find_possible_duplicates(customer: Customer, *, limit: int = 5):
    """Same hub, similar phone (last 8 digits) or exact name match — a
    lightweight heuristic, not a fuzzy-matching pipeline."""
    tail = customer.phone[-8:] if len(customer.phone) >= 8 else customer.phone
    return Customer.objects.filter(hub=customer.hub, phone__endswith=tail).exclude(id=customer.id)[
        :limit
    ]


@transaction.atomic
def merge_customers(*, surviving: Customer, merged: Customer, actor=None) -> Customer:
    if surviving.id == merged.id:
        raise ApiError("Can't merge a customer into themself.", code="invalid_merge")

    payload = {
        "phone": merged.phone,
        "name": merged.name,
        "email": merged.email,
        "lifetime_orders": merged.lifetime_orders,
        "lifetime_gross_minor": merged.lifetime_gross_minor,
    }

    merged.addresses.update(customer=surviving)
    merged.notes.update(customer=surviving)
    merged.consents.update(customer=surviving)

    surviving.lifetime_orders += merged.lifetime_orders
    surviving.lifetime_gross_minor += merged.lifetime_gross_minor
    if merged.first_order_at and (
        not surviving.first_order_at or merged.first_order_at < surviving.first_order_at
    ):
        surviving.first_order_at = merged.first_order_at
    surviving.save(update_fields=["lifetime_orders", "lifetime_gross_minor", "first_order_at"])

    CustomerMergeLog.objects.create(
        surviving=surviving, merged_id=merged.id, payload=payload, created_by=actor
    )
    merged.soft_delete(by=actor)

    from common import audit

    audit.record(
        action="customer.merged",
        object_type="Customer",
        object_id=str(surviving.id),
        hub=surviving.hub,
        actor=actor,
        after={"merged_id": str(merged.id)},
    )

    return surviving


def get_address(address_id):
    from customers.models import Address

    return Address.objects.get(pk=address_id) if address_id else None


def get_customer(customer_id):
    return Customer.objects.get(pk=customer_id)
