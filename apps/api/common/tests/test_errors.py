"""A real (not force_authenticate'd) session + a POST with no/stale
X-CSRFToken header exercises DRF's actual SessionAuthentication.enforce_csrf
path — the one place `common.errors.exception_handler` has to rewrite a
raw Django/DRF message before it reaches a user (docs/06 §2: a user should
never see internal jargon like "CSRF Failed: CSRF token missing.")."""

from rest_framework.test import APIClient


def test_csrf_failure_on_an_authenticated_post_is_a_friendly_message(operator_user):
    # enforce_csrf_checks=True is what makes this client behave like a real
    # browser for CSRF purposes — the default APIClient() skips the check
    # entirely, which is why every other test in this suite uses
    # force_authenticate instead of a real login.
    client = APIClient(enforce_csrf_checks=True)
    assert client.login(email=operator_user.email, password="testpass1234")

    resp = client.post("/api/v1/auth/logout")

    assert resp.status_code == 403
    assert resp.data["error"]["code"] == "csrf_failed"
    assert "CSRF Failed" not in resp.data["error"]["message"]
    assert resp.data["error"]["retryable"] is True
