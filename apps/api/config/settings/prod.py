"""
Production settings — Cloud Run. Deliberately minimal-dependency for the
pilot: Postgres (Supabase) is required, everything else degrades
gracefully so the container never crashes at import time over an
integration that isn't wired up yet.
"""

from .base import *  # noqa: F401,F403

DEBUG = False

# Cloud Run terminates TLS at the load balancer and forwards plain HTTP
# with X-Forwarded-Proto — without this, Django thinks every request is
# insecure and redirect-loops on SECURE_SSL_REDIRECT.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
USE_X_FORWARDED_HOST = True

SECURE_SSL_REDIRECT = True
SECURE_HSTS_SECONDS = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "strict-origin-when-cross-origin"
X_FRAME_OPTIONS = "DENY"

# Cloud Run's own *.run.app domain plus whatever custom domain is fronting
# it (docs/03 §5) — both come from env so a domain change is a redeploy,
# not a code change.
ALLOWED_HOSTS = env.list("DJANGO_ALLOWED_HOSTS", default=[".run.app"])  # noqa: F405

# ── Static files ─────────────────────────────────────────────────────────
# WhiteNoise, not S3/R2: nothing in the API yet accepts a file upload
# (custody proof photos, invoice PDFs — all later phases per docs/08), so
# object storage would be a dependency with nothing depending on it.
# Django Admin's own static assets are the only static files that exist
# today, and WhiteNoise serves those straight from the container with no
# extra service to provision. Revisit when the first upload feature ships.
MIDDLEWARE.insert(1, "whitenoise.middleware.WhiteNoiseMiddleware")  # noqa: F405
STORAGES = {
    "default": {
        "BACKEND": "django.core.files.storage.FileSystemStorage",
    },
    "staticfiles": {
        "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage",
    },
}

# ── Cache / throttling ──────────────────────────────────────────────────
# Redis is optional for the pilot: nothing here dispatches a Celery task
# yet (docs/03 §3.3's queues are all future-phase work), and with
# min-instances effectively 0-1 (docs/03 deployment topology) a shared
# cache for rate-limit counters matters less than not requiring a third
# external service on day one. Set REDIS_URL to switch this on later
# without a code change.
REDIS_URL = env("REDIS_URL", default="")  # noqa: F405
if REDIS_URL:
    CACHES = {
        "default": {
            "BACKEND": "django_redis.cache.RedisCache",
            "LOCATION": REDIS_URL,
            "OPTIONS": {"CLIENT_CLASS": "django_redis.client.DefaultClient"},
        }
    }
else:
    CACHES = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}
