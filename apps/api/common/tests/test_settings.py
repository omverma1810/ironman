"""next.config.ts's API proxy (docs/06 cross-site-cookie fix) forwards the
browser's original Host header unchanged when it relays /api/v1/* to Cloud
Run, so every proxied request arrives at Django as Host: <console domain>,
not the Cloud Run hostname. Without deriving ALLOWED_HOSTS from the
already-configured CORS_ALLOWED_ORIGINS, prod.py's narrow `.run.app` default
rejects every one of those requests with DisallowedHost before routing or
auth ever runs — indistinguishable, from the outside, from login itself
being broken."""

from urllib.parse import urlparse

from config.settings.prod import ALLOWED_HOSTS, CORS_ALLOWED_ORIGINS


def test_allowed_hosts_includes_every_cors_origin_hostname():
    for origin in CORS_ALLOWED_ORIGINS:
        assert urlparse(origin).hostname in ALLOWED_HOSTS
