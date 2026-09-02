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
# The console (Vercel) and API (Cloud Run) live on different registrable
# domains, so this is cross-site from the browser's point of view.
# base.py's SameSite=Lax is right for same-site local dev, but a browser
# withholds a Lax cookie on any cross-site fetch/XHR subrequest — only
# login's own Set-Cookie response lands, every request after it goes out
# with no cookie at all and 401s. None (paired with Secure, set above)
# is required for a cross-site cookie to be sent at all.
SESSION_COOKIE_SAMESITE = "None"
CSRF_COOKIE_SAMESITE = "None"
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "strict-origin-when-cross-origin"
X_FRAME_OPTIONS = "DENY"

# Cloud Run's own *.run.app domain plus whatever custom domain is fronting
# it (docs/03 §5) — both come from env so a domain change is a redeploy,
# not a code change.
ALLOWED_HOSTS = env.list("DJANGO_ALLOWED_HOSTS", default=[".run.app"])  # noqa: F405

# ── Static files ─────────────────────────────────────────────────────────
# WhiteNoise for static assets regardless — Django Admin's own CSS/JS,
# served straight from the container with no extra service to provision.
# Media (`STORAGES["default"]`) is a different question: fulfilment.Proof
# (proof-of-delivery photos) is the first real upload feature, and Cloud
# Run's container disk is ephemeral — FileSystemStorage there silently
# loses every photo on the next scale event. base.py already switches
# `STORAGES["default"]` to S3-compatible storage when AWS_STORAGE_BUCKET_NAME
# is set (see DEPLOYMENT.md); only override staticfiles here so that
# decision isn't clobbered. Deploying without a bucket configured still
# boots — proofs just won't survive a restart — for a demo where nobody's
# provisioned one yet.
MIDDLEWARE.insert(1, "whitenoise.middleware.WhiteNoiseMiddleware")  # noqa: F405
STORAGES["staticfiles"] = {  # noqa: F405
    "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage",
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
