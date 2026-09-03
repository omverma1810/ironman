"""
Base settings shared by every environment. Environment-specific files
(dev/test/prod) import from here and override only what genuinely differs.
"""

from datetime import timedelta
from pathlib import Path

import environ
from corsheaders.defaults import default_headers

BASE_DIR = Path(__file__).resolve().parent.parent.parent

env = environ.Env()
env_file = BASE_DIR / ".env"
if env_file.exists():
    environ.Env.read_env(str(env_file))

SECRET_KEY = env("DJANGO_SECRET_KEY", default="dev-secret-change-me")
DEBUG = env.bool("DJANGO_DEBUG", default=False)
ALLOWED_HOSTS = env.list("DJANGO_ALLOWED_HOSTS", default=["localhost", "127.0.0.1"])

# ── Applications ─────────────────────────────────────────────────────────
DJANGO_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
]

THIRD_PARTY_APPS = [
    "rest_framework",
    "rest_framework_simplejwt",
    "rest_framework_simplejwt.token_blacklist",
    "corsheaders",
    "django_filters",
    "drf_spectacular",
]

# One Django app per bounded context (docs/02 §1). Views never import
# another context's models directly — see setup.cfg [importlinter].
LOCAL_APPS = [
    "common",
    "identity",
    "platform_core",
    "territory",
    "catalog",
    "customers",
    "ordering",
    "custody",
    "fulfilment",
    "supplies",
    "billing",
]

INSTALLED_APPS = DJANGO_APPS + THIRD_PARTY_APPS + LOCAL_APPS

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "common.middleware.RequestIdMiddleware",
    "common.middleware.AuditContextMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

# ── Database ─────────────────────────────────────────────────────────────
DATABASES = {
    "default": env.db("DATABASE_URL", default="postgres://ironman:ironman@localhost:5432/ironman")
}
DATABASES["default"]["ATOMIC_REQUESTS"] = True

AUTH_USER_MODEL = "identity.User"

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
        "OPTIONS": {"min_length": 10},
    },
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

PASSWORD_HASHERS = [
    "django.contrib.auth.hashers.Argon2PasswordHasher",
    "django.contrib.auth.hashers.PBKDF2PasswordHasher",
]

# ── i18n ─────────────────────────────────────────────────────────────────
LANGUAGE_CODE = "en-in"
TIME_ZONE = "Asia/Kolkata"
USE_I18N = True
USE_TZ = True

# ── Static / media ───────────────────────────────────────────────────────
STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
MEDIA_URL = "media/"
MEDIA_ROOT = BASE_DIR / "media"

# Private object storage for proof-of-delivery photos (fulfilment.Proof —
# docs/06 §3: "stored private, served via short-lived signed URLs", never
# a public URL — these are pictures of people's front doors). S3-compatible
# so the same code path works against MinIO locally (docker-compose) and a
# real bucket in prod. `STORAGES["default"]` always exists; environments
# (prod.py) override `STORAGES["staticfiles"]` on top without touching this.
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
}
AWS_STORAGE_BUCKET_NAME = env("AWS_STORAGE_BUCKET_NAME", default="")
if AWS_STORAGE_BUCKET_NAME:
    AWS_ACCESS_KEY_ID = env("AWS_ACCESS_KEY_ID", default="")
    AWS_SECRET_ACCESS_KEY = env("AWS_SECRET_ACCESS_KEY", default="")
    AWS_S3_ENDPOINT_URL = env("AWS_S3_ENDPOINT_URL", default="")  # MinIO locally; unset for AWS S3
    AWS_S3_REGION_NAME = env("AWS_S3_REGION_NAME", default="ap-south-1")
    AWS_DEFAULT_ACL = None
    AWS_QUERYSTRING_AUTH = True  # signed URLs, never a public object URL
    AWS_QUERYSTRING_EXPIRE = 300  # 5 min — "short-lived" per docs/06 §3
    AWS_S3_FILE_OVERWRITE = False
    STORAGES["default"] = {"BACKEND": "storages.backends.s3boto3.S3Boto3Storage"}

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# ── DRF ──────────────────────────────────────────────────────────────────
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework_simplejwt.authentication.JWTAuthentication",
        "rest_framework.authentication.SessionAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "DEFAULT_PAGINATION_CLASS": "common.pagination.CursorPagination",
    "PAGE_SIZE": 25,
    "DEFAULT_FILTER_BACKENDS": ["django_filters.rest_framework.DjangoFilterBackend"],
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "EXCEPTION_HANDLER": "common.errors.exception_handler",
    "DEFAULT_THROTTLE_CLASSES": [
        "common.throttles.ScopedRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "otp_request": "3/10min",
        "otp_verify": "10/10min",
        "login": "10/min",
        "booking": "5/hour",
        "authenticated": "120/min",
    },
    "TEST_REQUEST_DEFAULT_FORMAT": "json",
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=15),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=30),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "SIGNING_KEY": env("JWT_SIGNING_KEY", default=SECRET_KEY),
    "AUTH_HEADER_TYPES": ("Bearer",),
    "USER_ID_FIELD": "id",
    "USER_ID_CLAIM": "user_id",
}

SPECTACULAR_SETTINGS = {
    "TITLE": "IronMan API",
    "DESCRIPTION": "Inventory, order, billing and growth platform for IronMan.",
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
    "COMPONENT_SPLIT_REQUEST": True,
    "ENUM_NAME_OVERRIDES": {
        "OrderStatusEnum": "ordering.models.OrderStatus",
        "CustomerStatusEnum": "customers.models.Customer.Status",
        "GarmentStageEnum": "custody.models.GarmentStage",
        "JobKindEnum": "fulfilment.models.JobKind",
        "ProofKindEnum": "fulfilment.models.ProofKind",
        "JobStatusEnum": "fulfilment.models.JobStatus",
        "RouteDayStatusEnum": "fulfilment.models.RouteDayStatus",
        "OfflineOpStatusEnum": "fulfilment.models.OfflineOpStatus",
        "InvoiceStatusEnum": "billing.models.InvoiceStatus",
    },
}

CORS_ALLOWED_ORIGINS = env.list("CORS_ALLOWED_ORIGINS", default=["http://localhost:3000"])
CORS_ALLOW_CREDENTIALS = True
# django-cors-headers' own default allow-list doesn't know about our
# custom headers — a preflight that rejects `Idempotency-Key` silently
# blocks every order/payment creation from the browser with no server-side
# log line at all (docs/04 §1, §3.4/§3.7 idempotent endpoints). Found via
# the E2E "create a counter order" test, not a unit test.
CORS_ALLOW_HEADERS = [
    *default_headers,
    "idempotency-key",
]

CSRF_TRUSTED_ORIGINS = env.list("CORS_ALLOWED_ORIGINS", default=["http://localhost:3000"])

# ── Sessions / cookies (console auth — docs/06 §2.2) ───────────────────
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
SESSION_COOKIE_AGE = 60 * 60 * 12  # 12h idle
CSRF_COOKIE_HTTPONLY = False  # JS needs to read it to set X-CSRFToken
CSRF_COOKIE_SAMESITE = "Lax"

# ── Cache / Celery ───────────────────────────────────────────────────────
CACHES = {
    "default": {
        "BACKEND": "django_redis.cache.RedisCache",
        "LOCATION": env("REDIS_URL", default="redis://localhost:6379/0"),
        "OPTIONS": {"CLIENT_CLASS": "django_redis.client.DefaultClient"},
    }
}

CELERY_BROKER_URL = env("CELERY_BROKER_URL", default="redis://localhost:6379/1")
CELERY_RESULT_BACKEND = env("CELERY_BROKER_URL", default="redis://localhost:6379/1")
CELERY_TASK_SERIALIZER = "json"
CELERY_ACCEPT_CONTENT = ["json"]
CELERY_TIMEZONE = TIME_ZONE
CELERY_TASK_DEFAULT_QUEUE = "default"

# ── Business constants (docs/09 open decisions) ─────────────────────────
IRONMAN = {
    # D-17: not a fixed number — an admin-tunable starting point, raised
    # week over week during the pilot as real throughput is proven out.
    "DEFAULT_DAILY_PRESSING_CAPACITY": 150,
    # ADR-008 / M-1: variance beyond which a re-quote is required.
    "REQUOTE_VARIANCE_QTY": 2,
    "REQUOTE_VARIANCE_PCT": 0.15,
    # 07 §2⑨: grace period before a job counts as late.
    "ON_TIME_GRACE_MINUTES": 15,
    # 07 §2②: days within which a second order counts as "repeat".
    "REPEAT_CUSTOMER_WINDOW_DAYS": 30,
}

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "console": {"format": "%(levelname)s %(name)s: %(message)s"},
    },
    "handlers": {
        "console": {"class": "logging.StreamHandler", "formatter": "console"},
    },
    "root": {"handlers": ["console"], "level": "WARNING"},
    "loggers": {
        "django": {"handlers": ["console"], "level": "INFO", "propagate": False},
        "ironman": {"handlers": ["console"], "level": "INFO", "propagate": False},
    },
}

SENTRY_DSN = env("SENTRY_DSN", default="")
if SENTRY_DSN:
    import sentry_sdk
    from sentry_sdk.integrations.django import DjangoIntegration

    sentry_sdk.init(
        dsn=SENTRY_DSN,
        integrations=[DjangoIntegration()],
        traces_sample_rate=0.1,
        send_default_pii=False,
    )
