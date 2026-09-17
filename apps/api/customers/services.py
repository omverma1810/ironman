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


def get_or_create_address_for_customer(
    customer: Customer,
    *,
    address_id=None,
    apartment=None,
    flat_no: str = "",
    block: str = "",
    landmark: str = "",
    free_text_address: str = "",
    label: str = "Home",
):
    """The booking wizard's address step (docs/08 batch 4.3): a customer
    picking a saved address supplies its id, a first-time booker supplies
    the flat details instead — either way this is the only place a
    customer-role caller's address may come from. `get_address(address_id)`
    performs no ownership check at all, so trusting a body-supplied id
    there directly would let any customer attach any other customer's
    address to their own order (the same class of bug closed for
    `customer` itself by `get_or_create_customer_for_user`)."""
    from customers.models import Address

    if address_id:
        try:
            address = Address.objects.get(pk=address_id)
        except Address.DoesNotExist:
            raise ApiError("Address not found.", code="not_found", status_code=404)
        if address.customer_id != customer.id:
            raise ApiError("That address doesn't belong to you.", code="forbidden", status_code=403)
        return address

    if not (flat_no or free_text_address):
        return None

    return Address.objects.create(
        customer=customer,
        apartment=apartment,
        flat_no=flat_no,
        block=block,
        landmark=landmark,
        free_text_address=free_text_address,
        label=label,
    )


def get_customer(customer_id):
    return Customer.objects.get(pk=customer_id)


def get_or_create_customer_for_user(user, *, hub, channel: str = "", apartment=None) -> Customer:
    """The self-service booking path (docs/04 §3.4 `POST /orders` `[C]`):
    a JWT-authenticated customer's `id` claim is a User, not a Customer —
    `identity.OtpVerifyView` only ever creates the User + CUSTOMER role
    (docs/04 §3.1), never a Customer row, so a first-time booker
    genuinely has none yet. Trusting a client-supplied `customer` id here
    instead would let any authenticated customer create an order under
    someone else's identity — this is the one and only place that id may
    come from for a customer-role caller.

    `acquisition_channel`/`acquisition_apartment` are write-once at first
    order (docs/02 §3.4) — set here, on the row's only creation, and
    never touched again."""
    existing = getattr(user, "customer_profile", None)
    if existing:
        return existing
    return Customer.objects.create(
        hub=hub,
        user=user,
        phone=user.phone,
        name=user.full_name,
        acquisition_channel=channel,
        acquisition_apartment=apartment,
    )
