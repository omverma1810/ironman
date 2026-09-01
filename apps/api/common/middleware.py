"""Cross-cutting request middleware: a request id for error correlation
(docs/04 §2) and an actor context so model-layer audit writes never need
the request object threaded through every service call."""

from __future__ import annotations

import contextvars
import uuid

_current_actor: contextvars.ContextVar = contextvars.ContextVar("current_actor", default=None)
_current_request_meta: contextvars.ContextVar = contextvars.ContextVar(
    "current_request_meta", default=None
)


def get_current_actor():
    return _current_actor.get()


def get_current_request_meta() -> dict:
    return _current_request_meta.get() or {}


class RequestIdMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        request.request_id = request.headers.get("X-Request-Id") or str(uuid.uuid4())[:10]
        response = self.get_response(request)
        response["X-Request-Id"] = request.request_id
        return response


class AuditContextMiddleware:
    """Stashes the current actor + request metadata in a contextvar so
    `common.audit.record()` can attach them without every call site
    passing `request` around (docs/06 §3.3)."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        user = getattr(request, "user", None)
        actor = user if user and getattr(user, "is_authenticated", False) else None
        token = _current_actor.set(actor)
        meta_token = _current_request_meta.set(
            {
                "ip": request.META.get("REMOTE_ADDR"),
                "user_agent": request.META.get("HTTP_USER_AGENT", "")[:255],
                "request_id": getattr(request, "request_id", None),
            }
        )
        try:
            return self.get_response(request)
        finally:
            _current_actor.reset(token)
            _current_request_meta.reset(meta_token)
