from .base import *  # noqa: F401,F403

DEBUG = False
PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]  # fast tests
CELERY_TASK_ALWAYS_EAGER = True
CELERY_TASK_EAGER_PROPAGATES = True

# Tests never depend on MinIO/S3 being reachable, even if a developer's
# .env has AWS_STORAGE_BUCKET_NAME set for running the app locally —
# fulfilment.Proof file uploads write to local disk here instead.
STORAGES = {
    **STORAGES,  # noqa: F405
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
}

# Rate limits (docs/06 §2.1/§4) are a production concern; a parallel
# Playwright/pytest run against a single dev server is not the abuse
# pattern they exist to catch, and hitting them mid-suite produces
# confusing failures unrelated to the feature under test. Views bind
# their own `throttle_classes`/`throttle_scope` directly, so the scope
# must still resolve to *some* rate here — just a generous one — rather
# than being removed outright.
REST_FRAMEWORK = {
    **REST_FRAMEWORK,  # noqa: F405
    "DEFAULT_THROTTLE_RATES": {
        "otp_request": "1000/min",
        "otp_verify": "1000/min",
        "login": "1000/min",
        "booking": "1000/min",
        "authenticated": "10000/min",
    },
}
