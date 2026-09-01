"""ADR-009: slots are inventory. `book_slot` takes a row lock so two
customers can never take the last slot — the property-style stress test
below is the one that actually proves it."""

import threading

import pytest
from django.db import connection

from common.errors import SlotUnavailable
from territory import services

pytestmark = pytest.mark.django_db


def test_book_slot_decrements_available(capacity):
    assert capacity.available == 2
    services.book_slot(capacity.id)
    capacity.refresh_from_db()
    assert capacity.booked_count == 1
    assert capacity.available == 1


def test_book_slot_raises_when_full(capacity):
    services.book_slot(capacity.id)
    services.book_slot(capacity.id)
    with pytest.raises(SlotUnavailable):
        services.book_slot(capacity.id)


def test_release_slot_increments_available(capacity):
    services.book_slot(capacity.id)
    services.release_slot(capacity.id)
    capacity.refresh_from_db()
    assert capacity.booked_count == 0


@pytest.mark.django_db(transaction=True)
def test_concurrent_bookings_never_oversell(capacity):
    """Fires more concurrent booking attempts than capacity allows and
    asserts booked_count never exceeds capacity — the row lock in
    `book_slot` (SELECT ... FOR UPDATE) is what this actually tests."""
    capacity_id = capacity.id
    results = []
    lock = threading.Lock()

    def attempt():
        try:
            services.book_slot(capacity_id)
            with lock:
                results.append("ok")
        except SlotUnavailable:
            with lock:
                results.append("full")
        finally:
            connection.close()

    threads = [threading.Thread(target=attempt) for _ in range(6)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert results.count("ok") == 2  # capacity == 2
    assert results.count("full") == 4

    from territory.models import RouteDayCapacity

    final = RouteDayCapacity.objects.get(pk=capacity_id)
    assert final.booked_count == 2
