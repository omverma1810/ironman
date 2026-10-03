"""The hub lock serializes money writes without blocking foreign-key checks
from other transactions (the cause of the counter-order deadlock)."""

from __future__ import annotations

import threading

import pytest
from django.db import connection, connections, transaction

from billing import services

pytestmark = pytest.mark.django_db(transaction=True)


def _in_other_connection(sql, params) -> str:
    outcome = {}

    def run():
        try:
            with connections["default"].cursor() as cursor:
                cursor.execute("SET lock_timeout = '2s'")
                cursor.execute(sql, params)
            outcome["result"] = "ok"
        except Exception as exc:  # noqa: BLE001
            outcome["result"] = "timeout" if "lock timeout" in str(exc) else repr(exc)
        finally:
            connections.close_all()

    thread = threading.Thread(target=run)
    thread.start()
    thread.join(10)
    return outcome.get("result", "hung")


def test_hub_lock_lets_fk_checks_through_but_queues_other_lockers(hub):
    with transaction.atomic():
        services.lock_hub(hub.id)
        assert connection.in_atomic_block
        key_share = "SELECT 1 FROM territory_hub WHERE id = %s FOR KEY SHARE"
        assert _in_other_connection(key_share, [hub.id]) == "ok"
        no_key = "SELECT 1 FROM territory_hub WHERE id = %s FOR NO KEY UPDATE"
        assert _in_other_connection(no_key, [hub.id]) == "timeout"
