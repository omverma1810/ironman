"""Capacity locking (ADR-009). `book_slot` takes a row lock so concurrent
bookings can never oversell a slot — this is the service `ordering` calls;
it never touches `RouteDayCapacity` rows directly (docs/03 §3.1 boundary
rule)."""

from __future__ import annotations

from django.db import transaction

from common.errors import SlotUnavailable
from territory.models import Apartment, Cluster, Hub, RouteDayCapacity


@transaction.atomic
def book_slot(capacity_id) -> RouteDayCapacity:
    capacity = RouteDayCapacity.objects.select_for_update().get(pk=capacity_id)
    if capacity.booked_count >= capacity.capacity:
        raise SlotUnavailable(
            f"That slot is fully booked for {capacity.cluster.name} on " f"{capacity.date:%d %b}.",
            detail=f"{capacity.booked_count} of {capacity.capacity} taken.",
        )
    capacity.booked_count += 1
    capacity.save(update_fields=["booked_count"])
    return capacity


@transaction.atomic
def release_slot(capacity_id) -> RouteDayCapacity:
    capacity = RouteDayCapacity.objects.select_for_update().get(pk=capacity_id)
    if capacity.booked_count > 0:
        capacity.booked_count -= 1
        capacity.save(update_fields=["booked_count"])
    return capacity


def check_serviceability(*, pincode: str | None = None) -> dict:
    from territory.models import ServiceArea

    if not pincode:
        return {"serviceable": False, "hub": None, "clusters": []}

    area = ServiceArea.objects.filter(pincode=pincode, is_active=True).select_related("hub").first()
    if not area:
        return {"serviceable": False, "hub": None, "clusters": []}

    clusters = list(area.hub.clusters.filter(is_active=True).values("id", "name"))
    return {
        "serviceable": True,
        "hub": {"id": str(area.hub_id), "code": area.hub.code, "name": area.hub.name},
        "clusters": clusters,
    }


def get_hub(hub_id):
    return Hub.objects.get(pk=hub_id)


def get_apartment(apartment_id):
    return Apartment.objects.get(pk=apartment_id) if apartment_id else None


def get_capacity(capacity_id):
    return RouteDayCapacity.objects.get(pk=capacity_id) if capacity_id else None


def get_cluster(cluster_id):
    return Cluster.objects.get(pk=cluster_id)
