"""Order, invoice and settlement refs never repeat — not under concurrency
(the e2e run hit ORD-2610-0068 twice) and not after a soft delete (the old
count-based numbering reissued a deleted order's ref)."""

from __future__ import annotations

import threading

import pytest
from django.db import connections, transaction

from common.sequences import next_ref
from ordering.models import Order

pytestmark = pytest.mark.django_db


def test_continues_from_existing_refs_and_survives_soft_delete(hub, customer, service):
    first = Order.objects.create(hub=hub, customer=customer, service=service)
    second = Order.objects.create(hub=hub, customer=customer, service=service)
    second.soft_delete()
    third = Order.objects.create(hub=hub, customer=customer, service=service)
    numbers = [int(o.ref.rsplit("-", 1)[1]) for o in (first, second, third)]
    assert numbers == sorted(set(numbers)) and len(set(numbers)) == 3


@pytest.mark.django_db(transaction=True)
def test_concurrent_callers_never_share_a_number():
    refs: list[str] = []
    lock = threading.Lock()
    start = threading.Barrier(8)

    def take():
        try:
            start.wait()
            with transaction.atomic():
                ref = next_ref("TST", Order)
            with lock:
                refs.append(ref)
        finally:
            connections.close_all()

    threads = [threading.Thread(target=take) for _ in range(8)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(15)
    assert len(refs) == 8 and len(set(refs)) == 8
