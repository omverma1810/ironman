"""Write-side helper for the append-only audit log (docs/06 §3.3). Services
call `record(...)` after a sensitive mutation; the AuditEvent model itself
lives in `identity` (docs/02 §3.1) — imported lazily here so `common` never
depends on any domain app."""

from __future__ import annotations

from typing import Any

from common.middleware import get_current_actor, get_current_request_meta


def record(
    *,
    action: str,
    object_type: str,
    object_id: str,
    hub=None,
    before: dict[str, Any] | None = None,
    after: dict[str, Any] | None = None,
    actor=None,
) -> None:
    from identity.models import AuditEvent

    actor = actor or get_current_actor()
    meta = get_current_request_meta()
    AuditEvent.objects.create(
        actor=actor if actor and getattr(actor, "pk", None) else None,
        actor_role=getattr(actor, "primary_role_code", "") if actor else "",
        action=action,
        object_type=object_type,
        object_id=str(object_id),
        hub=hub,
        before=before or {},
        after=after or {},
        ip=meta.get("ip"),
        user_agent=meta.get("user_agent", ""),
    )
