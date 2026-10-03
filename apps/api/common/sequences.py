"""Gap-tolerant, collision-free reference numbers (ORD-2610-0042).

The counter is bumped with a single INSERT ... ON CONFLICT DO UPDATE, so two
transactions can never read the same value; the row lock it takes lasts
until the caller's transaction ends, so numbers come out in commit order. A
rolled-back transaction rolls its increment back too.

The first number of a series continues from the highest ref already stored
with that prefix (soft-deleted rows included), so switching an existing
database over to this never reissues a ref.
"""

from __future__ import annotations

from django.db import connection
from django.db.models import Max
from django.utils import timezone


def next_ref(prefix: str, model, *, width: int = 4) -> str:
    """`prefix` is e.g. "ORD"; the series is per calendar month (IST)."""
    key = f"{prefix}-{timezone.localtime():%y%m}"
    manager = getattr(model, "all_objects", model.objects)
    highest = manager.filter(ref__startswith=f"{key}-").aggregate(top=Max("ref"))["top"]
    seed = int(highest.rsplit("-", 1)[1]) + 1 if highest else 1
    with connection.cursor() as cursor:
        cursor.execute(
            "INSERT INTO common_ref_sequence (key, value) VALUES (%s, %s) "
            "ON CONFLICT (key) DO UPDATE SET value = common_ref_sequence.value + 1 "
            "RETURNING value",
            [key, seed],
        )
        value = cursor.fetchone()[0]
    return f"{key}-{value:0{width}d}"
