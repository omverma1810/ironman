"""docs/06 §7 security sweep, run on every PR:

1. Every API route refuses an anonymous caller, except an explicit list of
   public routes, each with the reason it is public. A new endpoint that
   forgets its permission class fails here, not in production.
2. Nothing answers an anonymous caller with a server error.
"""

from __future__ import annotations

import re
import uuid

import pytest
from django.urls import URLResolver, get_resolver

pytestmark = pytest.mark.django_db

# Route (as Django prints it, with params as <name>) → why anyone may call it.
PUBLIC = {
    "api/v1/healthz": "Cloud Run liveness probe",
    "api/v1/readyz": "readiness probe",
    "api/v1/platform/config": "feature flags the signed-out booking page needs",
    "api/v1/schema/": "OpenAPI contract; the same file is in the public repo",
    "api/v1/docs/": "Swagger UI for the contract above",
    "api/v1/auth/otp/request": "customer sign-in starts signed out (throttled)",
    "api/v1/auth/otp/verify": "customer sign-in (throttled, 5 attempts per code)",
    "api/v1/auth/login": "staff sign-in (throttled)",
    "api/v1/auth/staff/token": "field app sign-in: same checks as staff sign-in, field staff only (throttled)",
    "api/v1/auth/refresh": "exchanges a refresh token, which is itself the credential",
    "api/v1/auth/password/reset/request": "forgotten password; same reply for any email",
    "api/v1/auth/password/reset/confirm": "needs the single-use reset token",
    "api/v1/auth/email/verify/confirm": "needs the single-use email token",
    "api/v1/auth/invite/accept": "needs the single-use invite token",
    "api/v1/auth/otp/debug": "registered only under test settings (E2E)",
    "api/v1/catalog/services/": "public price list for the booking page",
    "api/v1/catalog/garment-types/": "public price list for the booking page",
    "api/v1/catalog/quote": "price estimate on the booking page",
    "api/v1/territory/serviceability": "'do you serve my pincode?' before sign-in",
    "api/v1/territory/apartments": "apartment picker on the booking page",
    "api/v1/territory/capacity": "slot picker on the booking page",
    "api/v1/growth/referral-codes/validate": "checks a code typed on the booking page",
    "api/v1/track/<token>/": "order tracking link; the 32-byte token is the credential",
    "api/v1/privacy/restore": "account-restore link; the 32-byte token is the credential",
    "api/v1/internal/maintenance": "nightly job; refuses without today's HMAC signature",
}

REFUSED = {401, 403, 404, 405}

_REGEX_GROUP = re.compile(r"\(\?P<(\w+)>[^)]*\)")
_CONVERTER = re.compile(r"<(?:\w+:)?(\w+)>")


def api_routes() -> list[str]:
    routes: set[str] = set()

    def walk(patterns, prefix=""):
        for entry in patterns:
            if isinstance(entry, URLResolver):
                walk(entry.url_patterns, prefix + str(entry.pattern))
            else:
                routes.add(prefix + str(entry.pattern))

    walk(get_resolver().url_patterns)
    cleaned = set()
    for route in routes:
        if not route.startswith("api/v1/") or "format" in route:
            continue
        route = _REGEX_GROUP.sub(lambda m: f"<{m.group(1)}>", route)
        route = _CONVERTER.sub(lambda m: f"<{m.group(1)}>", route)
        route = route.replace("^", "").replace("$", "").replace("\\.", ".")
        cleaned.add(route)
    return sorted(cleaned)


def concrete(route: str) -> str:
    return "/" + _CONVERTER.sub(lambda m: str(uuid.uuid4()), route)


def test_the_public_list_is_current():
    """A route removed or renamed must leave this list too, so it never
    silently grants access to whatever takes the name next."""
    routes = set(api_routes())
    assert not set(PUBLIC) - routes, set(PUBLIC) - routes


@pytest.mark.parametrize("route", [r for r in api_routes() if r not in PUBLIC])
def test_anonymous_callers_are_refused(api_client, route):
    url = concrete(route)
    for method in ("get", "post", "patch", "delete"):
        status = getattr(api_client, method)(url, {}, format="json").status_code
        assert status in REFUSED, f"{method.upper()} {url} → {status}"


@pytest.mark.parametrize("route", sorted(PUBLIC))
def test_public_routes_never_error(api_client, route):
    url = concrete(route)
    for method in ("get", "post"):
        status = getattr(api_client, method)(url, {}, format="json").status_code
        assert status < 500, f"{method.upper()} {url} → {status}"
