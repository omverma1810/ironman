"""`/auth/otp/debug` only exists because `OtpChallenge.code_hash` is
hashed at rest and the booking wizard's E2E spec has no other way to read
a code it just triggered (docs/08 batch 4.3). It must never leak beyond
`config.settings.test` — see `EXPOSE_OTP_DEBUG_ENDPOINT` in
config/settings/base.py and identity/urls.py, which only registers this
route when that flag is on."""

import pytest

pytestmark = pytest.mark.django_db


def test_the_debug_endpoint_returns_the_code_a_request_just_issued(api_client):
    resp = api_client.post("/api/v1/auth/otp/request", {"phone": "+919812345678"}, format="json")
    assert resp.status_code == 200, resp.data

    debug = api_client.get("/api/v1/auth/otp/debug", {"phone": "+919812345678"})
    assert debug.status_code == 200, debug.data
    code = debug.data["code"]
    assert len(code) == 6 and code.isdigit()

    verify = api_client.post(
        "/api/v1/auth/otp/verify", {"phone": "+919812345678", "code": code}, format="json"
    )
    assert verify.status_code == 200, verify.data


def test_an_unknown_phone_404s_instead_of_leaking_a_stale_code(api_client):
    resp = api_client.get("/api/v1/auth/otp/debug", {"phone": "+919999999999"})
    assert resp.status_code == 404
